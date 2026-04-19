import * as vscode from 'vscode';
import { LocusClient } from '../lib/locus';

// Phase 2 — full SSE log streaming implemented here.
// Phase 1 stub: channel factory only.

export class LogOutputProvider {
  private readonly _channels = new Map<string, vscode.OutputChannel>();

  constructor(private readonly _client: LocusClient) {}

  getOrCreateChannel(name: string): vscode.OutputChannel {
    const existing = this._channels.get(name);
    if (existing) {
      return existing;
    }
    const channel = vscode.window.createOutputChannel(`ShipShape: ${name}`);
    this._channels.set(name, channel);
    return channel;
  }

  disposeChannel(name: string): void {
    this._channels.get(name)?.dispose();
    this._channels.delete(name);
  }

  disposeAll(): void {
    for (const channel of this._channels.values()) {
      channel.dispose();
    }
    this._channels.clear();
  }

  // Phase 2: streams deployment build + runtime logs (phase-aware SSE)
  async streamDeploymentLogs(
    deploymentId: string,
    channel: vscode.OutputChannel,
    signal?: AbortSignal
  ): Promise<void> {
    await this._client.streamDeploymentLogs(
      deploymentId,
      (line) => {
        if (line.trim()) {
          channel.appendLine(line);
        }
      },
      signal
    );
  }

  // Phase 2: streams live runtime logs for a running service
  async streamServiceLogs(
    serviceId: string,
    channel: vscode.OutputChannel,
    signal?: AbortSignal
  ): Promise<void> {
    await this._client.streamServiceLogs(
      serviceId,
      (line) => {
        if (line.trim()) {
          channel.appendLine(line);
        }
      },
      signal
    );
  }
}
