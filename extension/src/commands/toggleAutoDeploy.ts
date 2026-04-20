import * as vscode from 'vscode';
import { LocusClient } from '../lib/locus';
import { ServiceNode } from '../providers/ServiceTreeProvider';
import { showError } from '../lib/errorFormat';

export function registerToggleAutoDeployCommand(
  context: vscode.ExtensionContext,
  client: LocusClient
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'shipshape.toggleAutoDeploy',
      async (node?: ServiceNode) => {
        try {
          await runToggle(client, node);
        } catch (err) {
          await showError(err, 'Toggle auto-deploy failed');
        }
      }
    )
  );
}

async function runToggle(client: LocusClient, arg?: ServiceNode): Promise<void> {
  let target: { id: string; name: string; autoDeploy?: boolean } | undefined;

  if (arg instanceof ServiceNode) {
    target = arg.service;
  } else {
    // No arg — let user pick from all services across all projects
    target = await pickService(client);
    if (!target) { return; }
  }

  const current = !!target.autoDeploy;
  const prompt = current
    ? `Disable auto-deploy for ${target.name}?`
    : `Enable auto-deploy for ${target.name}? The service will redeploy automatically on every push to the configured branch.`;

  const confirm = await vscode.window.showInformationMessage(
    prompt,
    { modal: true },
    current ? 'Disable' : 'Enable'
  );
  if (!confirm) { return; }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `ShipShape: ${current ? 'Disabling' : 'Enabling'} auto-deploy...`,
    },
    async () => client.updateService(target!.id, { autoDeploy: !current })
  );

  await vscode.commands.executeCommand('shipshape.refreshServices');

  vscode.window.showInformationMessage(
    `Auto-deploy ${current ? 'disabled' : 'enabled'} for ${target.name}.`
  );
}

/** Fallback: list services across all projects/environments and let user pick one. */
async function pickService(
  client: LocusClient
): Promise<{ id: string; name: string; autoDeploy?: boolean } | undefined> {
  const projects = await client.listProjects();
  if (projects.length === 0) {
    vscode.window.showInformationMessage('No projects yet.');
    return undefined;
  }

  type Pick = vscode.QuickPickItem & { service: { id: string; name: string; autoDeploy?: boolean } };
  const items: Pick[] = [];

  for (const project of projects) {
    const envs = await client.listEnvironments(project.id);
    for (const env of envs) {
      const services = await client.listServices(env.id);
      for (const s of services) {
        items.push({
          label: s.name,
          description: `${project.name}/${env.name}`,
          detail: s.autoDeploy ? 'auto-deploy: on' : 'auto-deploy: off',
          service: { id: s.id, name: s.name, autoDeploy: s.autoDeploy },
        });
      }
    }
  }

  if (items.length === 0) {
    vscode.window.showInformationMessage('No services found.');
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: 'ShipShape: Toggle auto-deploy',
    placeHolder: 'Pick a service',
    ignoreFocusOut: true,
  });
  return picked?.service;
}
