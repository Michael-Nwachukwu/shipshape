import * as vscode from 'vscode';
import { LocusClient, LocusError, formatLogLine } from '../lib/locus';
import { ServiceNode, DeploymentNode } from '../providers/ServiceTreeProvider';

// Reuse output channels keyed by service/deployment so repeated views don't
// spawn a forest of channels.
const channels = new Map<string, vscode.OutputChannel>();

function getChannel(key: string, title: string): vscode.OutputChannel {
  const existing = channels.get(key);
  if (existing) { return existing; }
  const channel = vscode.window.createOutputChannel(`Locus: ${title}`);
  channels.set(key, channel);
  return channel;
}

export function registerViewLogsCommand(
  context: vscode.ExtensionContext,
  client: LocusClient
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'locus.viewLogs',
      async (node?: ServiceNode | DeploymentNode) => {
        if (node instanceof DeploymentNode) {
          return viewDeploymentLogs(client, node);
        }
        if (node instanceof ServiceNode) {
          return viewServiceLogs(client, node);
        }
        vscode.window.showInformationMessage(
          'Right-click a service or deployment in the Services sidebar to view logs.'
        );
      }
    )
  );

  context.subscriptions.push({
    dispose() {
      for (const ch of channels.values()) { ch.dispose(); }
      channels.clear();
    },
  });
}

async function viewDeploymentLogs(client: LocusClient, node: DeploymentNode): Promise<void> {
  const key = `dep:${node.deployment.id}`;
  const channel = getChannel(key, `Deploy #${node.deployment.version}`);
  channel.show(true);
  channel.appendLine(
    `── Deployment #${node.deployment.version} (${node.deployment.status}) ──`
  );

  try {
    const snapshot = await client.getDeploymentLogs(node.deployment.id);
    channel.appendLine(`Phase: ${snapshot.phase}  Status: ${snapshot.deploymentStatus}`);
    if (snapshot.reason) { channel.appendLine(`Reason: ${snapshot.reason}`); }
    channel.appendLine('──────────────────────────────────────────────');
    for (const line of snapshot.logs) {
      channel.appendLine(formatLogLine(line));
    }
  } catch (err) {
    const msg = err instanceof LocusError ? err.message : (err as Error).message;
    channel.appendLine(`⚠ Failed to fetch logs: ${msg}`);
  }
}

async function viewServiceLogs(client: LocusClient, node: ServiceNode): Promise<void> {
  const key = `svc:${node.service.id}`;
  const channel = getChannel(key, node.service.name);
  channel.show(true);
  channel.appendLine(`── Streaming logs for ${node.service.name} ──`);

  const controller = new AbortController();

  // Stop streaming when the channel is disposed by the user
  const stopToken = new vscode.CancellationTokenSource();
  stopToken.token.onCancellationRequested(() => controller.abort());

  try {
    await client.streamServiceLogs(
      node.service.id,
      (line) => channel.appendLine(line),
      controller.signal
    );
  } catch (err) {
    if ((err as Error).name === 'AbortError') { return; }
    const msg = err instanceof LocusError ? err.message : (err as Error).message;
    channel.appendLine(`⚠ Log stream ended: ${msg}`);
  }
}
