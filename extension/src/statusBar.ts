import * as vscode from 'vscode';

export type StatusBarState =
  | 'idle'
  | 'detecting'
  | 'building'
  | 'deploying'
  | 'healthy'
  | 'failed';

const STATUS_BAR_CONFIGS: Record<StatusBarState, { text: string; tooltip: string }> = {
  idle:      { text: '$(shipshape-logo) ShipShape',           tooltip: 'Click to deploy' },
  detecting: { text: '$(search) ShipShape: Detecting...',     tooltip: 'Detecting project type' },
  building:  { text: '$(tools) ShipShape: Building...',       tooltip: 'Building Docker image (2-4 min)' },
  deploying: { text: '$(sync~spin) ShipShape: Deploying...',  tooltip: 'Starting container (1-3 min)' },
  healthy:   { text: '$(check) ShipShape: Live',              tooltip: 'Click to open live URL' },
  failed:    { text: '$(error) ShipShape: Failed',            tooltip: 'Click to view logs' },
};

let _item: vscode.StatusBarItem | undefined;

export function createStatusBar(): vscode.StatusBarItem {
  _item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  setState('idle');
  _item.show();
  return _item;
}

export function setState(state: StatusBarState, liveUrl?: string): void {
  if (!_item) {
    return;
  }
  const config = STATUS_BAR_CONFIGS[state];
  _item.text = config.text;

  if (state === 'healthy' && liveUrl) {
    _item.tooltip = `Live at ${liveUrl} — Click to open in browser`;
    _item.command = {
      command: 'vscode.open',
      arguments: [vscode.Uri.parse(liveUrl)],
      title: 'Open in Browser',
    };
  } else if (state === 'failed') {
    _item.tooltip = config.tooltip;
    _item.command = 'shipshape.viewLogs';
  } else {
    _item.tooltip = config.tooltip;
    _item.command = 'shipshape.deploy';
  }
}

export function dispose(): void {
  _item?.dispose();
  _item = undefined;
}
