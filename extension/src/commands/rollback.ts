import * as vscode from 'vscode';
import { LocusClient } from '../lib/locus';

// Phase 3 — implemented alongside the service explorer.

export function registerRollbackCommand(
  context: vscode.ExtensionContext,
  _client: LocusClient
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('locus.rollback', async (deploymentId?: string) => {
      if (!deploymentId) {
        vscode.window.showInformationMessage(
          'Rollback — right-click a deployment in the Services sidebar to use this.'
        );
        return;
      }
      // Full implementation in Phase 3
      vscode.window.showInformationMessage(`Rollback for ${deploymentId} — coming in Phase 3.`);
    })
  );
}
