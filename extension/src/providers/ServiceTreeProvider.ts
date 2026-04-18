import * as vscode from 'vscode';
import { LocusClient } from '../lib/locus';

// Phase 3 — full tree data provider implemented here.
// Phase 1 stub: returns empty tree so the sidebar view registers without errors.

export class ServiceTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly _client: LocusClient) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(_element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    // Phase 1: empty — Phase 3 will load projects/environments/services from API
    return [];
  }
}
