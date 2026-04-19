import * as vscode from 'vscode';
import { LocusClient } from '../lib/locus';
import { DeploymentNode, ServiceNode } from '../providers/ServiceTreeProvider';
import { showError } from '../lib/errorFormat';

export function registerRollbackCommand(
  context: vscode.ExtensionContext,
  client: LocusClient
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'shipshape.rollback',
      async (node?: DeploymentNode | ServiceNode) => {
        let deploymentId: string | undefined;
        let label: string | undefined;

        if (node instanceof DeploymentNode) {
          deploymentId = node.deployment.id;
          label = `Deploy #${node.deployment.version}`;
        } else if (node instanceof ServiceNode) {
          // Rollback from a service node — pick the most recent healthy deployment before current
          try {
            const deployments = await client.listDeployments(node.service.id, 10);
            const target = deployments.find(
              (d) => d.status === 'healthy' && d.id !== node.service.lastDeploymentId
            );
            if (!target) {
              vscode.window.showWarningMessage(
                `No previous healthy deployment found for ${node.service.name}.`
              );
              return;
            }
            deploymentId = target.id;
            label = `Deploy #${target.version}`;
          } catch (err) {
            await showError(err, 'Failed to find previous deployment');
            return;
          }
        }

        if (!deploymentId) {
          vscode.window.showInformationMessage(
            'Right-click a deployment in the Services sidebar to roll back.'
          );
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          `Roll back to ${label}? This will redeploy the previous image.`,
          { modal: true },
          'Rollback'
        );
        if (confirm !== 'Rollback') { return; }

        const reason = await vscode.window.showInputBox({
          prompt: 'Rollback reason (optional)',
          placeHolder: 'e.g. "regression in latest deploy"',
        });

        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Rolling back to ${label}...`,
              cancellable: false,
            },
            async () => {
              await client.rollbackDeployment(deploymentId!, reason || undefined);
            }
          );
          vscode.window.showInformationMessage(
            `Rollback triggered. It may take a minute to apply.`
          );
          await vscode.commands.executeCommand('shipshape.refreshServices');
        } catch (err) {
          await showError(err, 'Rollback failed');
        }
      }
    )
  );
}
