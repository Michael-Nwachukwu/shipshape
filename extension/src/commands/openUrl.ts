import * as vscode from 'vscode';
import { LocusClient } from '../lib/locus';

// Phase 3 — implemented alongside the service explorer.

export function registerOpenUrlCommand(
  context: vscode.ExtensionContext,
  _client: LocusClient
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('locus.openUrl', async (serviceUrl?: string) => {
      if (serviceUrl) {
        await vscode.env.openExternal(vscode.Uri.parse(serviceUrl));
        return;
      }
      // No URL provided — check globalState for last deployed URL
      vscode.window.showInformationMessage(
        'No live URL yet. Deploy your workspace first with "Locus: Deploy Workspace".'
      );
    })
  );
}
