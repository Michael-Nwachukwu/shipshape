import * as vscode from 'vscode';
import { LocusClient } from '../lib/locus';
import { ServiceNode } from '../providers/ServiceTreeProvider';

export function registerOpenUrlCommand(
  context: vscode.ExtensionContext,
  _client: LocusClient
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'locus.openUrl',
      async (arg?: string | ServiceNode) => {
        let url: string | undefined;

        if (typeof arg === 'string') {
          url = arg;
        } else if (arg instanceof ServiceNode) {
          url = arg.service.url;
        }

        if (!url) {
          vscode.window.showInformationMessage(
            'No live URL yet. Deploy your workspace first with "Locus: Deploy Workspace".'
          );
          return;
        }

        await vscode.env.openExternal(vscode.Uri.parse(url));
      }
    )
  );
}
