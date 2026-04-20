import * as vscode from 'vscode';
import { LocusClient } from './lib/locus';
import { createStatusBar, dispose as disposeStatusBar } from './statusBar';
import { registerDeployCommand } from './commands/deploy';
import { registerRollbackCommand } from './commands/rollback';
import { registerOpenUrlCommand } from './commands/openUrl';
import { registerRestartCommand } from './commands/restart';
import { registerViewLogsCommand } from './commands/viewLogs';
import { registerDeployNLCommand } from './commands/deployNL';
import { registerToggleAutoDeployCommand } from './commands/toggleAutoDeploy';
import { ServiceTreeProvider, ServiceNode } from './providers/ServiceTreeProvider';
import { EnvVarProvider } from './providers/EnvVarProvider';
import { DomainProvider } from './providers/DomainProvider';
import { LogOutputProvider } from './providers/LogOutputProvider';
import { runAddDomain } from './commands/addDomain';
import { runManageDomains } from './commands/manageDomains';
import { promptForAiKey, clearAiKey, findStoredAiKey } from './lib/credentials';

export function activate(context: vscode.ExtensionContext): void {
  const client = new LocusClient(context.secrets);

  // Status bar (Phase 1)
  createStatusBar();
  context.subscriptions.push({ dispose: disposeStatusBar });

  // ── Tier 1 commands ───────────────────────────────────────────────────────

  registerDeployCommand(context, client);

  context.subscriptions.push(
    vscode.commands.registerCommand('shipshape.openSettings', async () => {
      const existing = await context.secrets.get('shipshape.buildApiKey');
      const key = await vscode.window.showInputBox({
        prompt: 'Enter your Locus Build API key',
        password: true,
        placeHolder: 'claw_...',
        value: existing ? '(already set — enter new key to replace)' : '',
        validateInput: (v) => {
          if (!v || v.startsWith('(already')) { return null; }
          return v.startsWith('claw_') ? null : 'Key must start with claw_';
        },
      });
      if (!key || key.startsWith('(already')) {
        return;
      }
      await context.secrets.store('shipshape.buildApiKey', key);
      client.clearTokenCache();
      vscode.window.showInformationMessage('Locus API key saved.');
    })
  );

  // ── Tier 2 commands (Phase 3 — service explorer actions) ─────────────────

  registerRollbackCommand(context, client);
  registerOpenUrlCommand(context, client);
  registerRestartCommand(context, client);
  registerViewLogsCommand(context, client);

  const envVarProvider = new EnvVarProvider(client, context.extensionUri);
  context.subscriptions.push(
    vscode.commands.registerCommand('shipshape.manageEnvVars', async (node?: ServiceNode) => {
      if (node instanceof ServiceNode) {
        envVarProvider.show(node.service.id, node.service.name);
        return;
      }
      // No service passed — prompt user to pick one from the sidebar
      vscode.window.showInformationMessage(
        'Right-click a service in the Services sidebar and choose "Manage Env Vars".'
      );
    })
  );

  const domainProvider = new DomainProvider(client, context.extensionUri, context.globalState);
  context.subscriptions.push(
    vscode.commands.registerCommand('shipshape.addDomain', async (node?: ServiceNode) => {
      await runAddDomain(context, client, domainProvider, node);
    }),
    vscode.commands.registerCommand('shipshape.manageDomains', async () => {
      await runManageDomains(client);
    })
  );

  // ── AI key management (Gemini, for failure diagnosis + auto-fix) ──────────

  context.subscriptions.push(
    vscode.commands.registerCommand('shipshape.configureAiApiKey', async () => {
      const existing = await findStoredAiKey(context.secrets);
      if (existing) {
        const action = await vscode.window.showInformationMessage(
          'A Gemini API key is already saved. Replace it?',
          'Replace',
          'Clear',
          'Cancel'
        );
        if (action === 'Clear') {
          await clearAiKey(context.secrets);
          vscode.window.showInformationMessage('Gemini API key cleared.');
          return;
        }
        if (action !== 'Replace') { return; }
      }
      const key = await promptForAiKey(context.secrets);
      if (key) {
        vscode.window.showInformationMessage('Gemini API key saved.');
      }
    })
  );

  // ── Tier 3 commands ───────────────────────────────────────────────────────

  const nlLogProvider = new LogOutputProvider(client);
  context.subscriptions.push({ dispose: () => nlLogProvider.disposeAll() });
  registerDeployNLCommand(context, client, nlLogProvider);
  registerToggleAutoDeployCommand(context, client);

  context.subscriptions.push(
    vscode.commands.registerCommand('shipshape.provisionTenant', () => {
      vscode.window.showInformationMessage(
        'Multi-tenant provisioner — coming in Phase 6 (Tier 3 stretch).'
      );
    })
  );

  // ── Service explorer sidebar (Phase 3) ────────────────────────────────────

  const treeProvider = new ServiceTreeProvider(client);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('shipshape.serviceExplorer', treeProvider),
    vscode.window.registerTreeDataProvider('shipshape.deploymentHistory', treeProvider),
    vscode.commands.registerCommand('shipshape.refreshServices', () => treeProvider.refresh())
  );
}

export function deactivate(): void {
  disposeStatusBar();
}
