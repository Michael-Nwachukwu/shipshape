import * as vscode from 'vscode';
import { LocusClient } from './lib/locus';
import { createStatusBar, dispose as disposeStatusBar } from './statusBar';
import { registerDeployCommand } from './commands/deploy';
import { registerRollbackCommand } from './commands/rollback';
import { registerOpenUrlCommand } from './commands/openUrl';
import { ServiceTreeProvider } from './providers/ServiceTreeProvider';
import { promptForAiKey, clearAiKey, findStoredAiKey } from './lib/credentials';

export function activate(context: vscode.ExtensionContext): void {
  const client = new LocusClient(context.secrets);

  // Status bar (Phase 1)
  createStatusBar();
  context.subscriptions.push({ dispose: disposeStatusBar });

  // ── Tier 1 commands ───────────────────────────────────────────────────────

  registerDeployCommand(context, client);

  context.subscriptions.push(
    vscode.commands.registerCommand('locus.openSettings', async () => {
      const existing = await context.secrets.get('locus.buildApiKey');
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
      await context.secrets.store('locus.buildApiKey', key);
      client.clearTokenCache();
      vscode.window.showInformationMessage('Locus API key saved.');
    })
  );

  // ── Tier 2 commands (stubs — implemented in Phase 3/4) ────────────────────

  registerRollbackCommand(context, client);
  registerOpenUrlCommand(context, client);

  context.subscriptions.push(
    vscode.commands.registerCommand('locus.viewLogs', () => {
      vscode.window.showInformationMessage(
        'Log streaming will be available after your first deployment.'
      );
    }),
    vscode.commands.registerCommand('locus.restart', () => {
      vscode.window.showInformationMessage(
        'Restart service — coming in Phase 3 (right-click a service in the sidebar).'
      );
    }),
    vscode.commands.registerCommand('locus.manageEnvVars', () => {
      vscode.window.showInformationMessage(
        'Environment variable manager — coming in Phase 4.'
      );
    })
  );

  // ── AI key management (Gemini, for failure diagnosis + auto-fix) ──────────

  context.subscriptions.push(
    vscode.commands.registerCommand('locus.configureAiApiKey', async () => {
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

  // ── Tier 3 commands (stubs) ───────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('locus.deployNL', () => {
      vscode.window.showInformationMessage(
        'AI-powered deploy — coming in Phase 6 (Tier 3 stretch).'
      );
    }),
    vscode.commands.registerCommand('locus.provisionTenant', () => {
      vscode.window.showInformationMessage(
        'Multi-tenant provisioner — coming in Phase 6 (Tier 3 stretch).'
      );
    })
  );

  // ── Service explorer sidebar (Phase 3 — stub for now) ────────────────────

  const treeProvider = new ServiceTreeProvider(client);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('locus.serviceExplorer', treeProvider),
    vscode.window.registerTreeDataProvider('locus.deploymentHistory', treeProvider),
    vscode.commands.registerCommand('locus.refreshServices', () => treeProvider.refresh())
  );
}

export function deactivate(): void {
  disposeStatusBar();
}
