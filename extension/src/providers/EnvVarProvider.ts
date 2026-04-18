import * as vscode from 'vscode';
import { LocusClient } from '../lib/locus';

// Phase 4 — full webview panel implemented here.
// Phase 1 stub: show placeholder message.

export class EnvVarProvider {
  constructor(private readonly _client: LocusClient) {}

  show(_serviceId: string, _serviceName: string): void {
    vscode.window.showInformationMessage(
      'Environment variable manager — coming in Phase 4.'
    );
  }
}
