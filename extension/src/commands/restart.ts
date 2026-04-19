import * as vscode from 'vscode';
import { LocusClient, LocusError } from '../lib/locus';
import { ServiceNode } from '../providers/ServiceTreeProvider';
import { showError } from '../lib/errorFormat';

export function registerRestartCommand(
  context: vscode.ExtensionContext,
  client: LocusClient
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('locus.restart', async (node?: ServiceNode) => {
      if (!(node instanceof ServiceNode)) {
        vscode.window.showInformationMessage(
          'Right-click a service in the Services sidebar to restart it.'
        );
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Restart ${node.service.name}?`,
        { modal: true },
        'Restart'
      );
      if (confirm !== 'Restart') { return; }

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Restarting ${node.service.name}...`,
            cancellable: false,
          },
          async () => {
            // restart requires running ECS instances. If there are none,
            // trigger a new deployment instead.
            try {
              await client.restartService(node.service.id);
            } catch (err) {
              if (err instanceof LocusError && err.statusCode === 409) {
                // Most common 409: no running tasks — redeploy instead
                await client.redeployService(node.service.id);
                return;
              }
              throw err;
            }
          }
        );
        vscode.window.showInformationMessage(
          `${node.service.name} is restarting. It may take a minute to come back up.`
        );
        await vscode.commands.executeCommand('locus.refreshServices');
      } catch (err) {
        await showError(err, 'Restart failed');
      }
    })
  );
}
