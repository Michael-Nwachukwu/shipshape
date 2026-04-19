import * as vscode from 'vscode';
import { LocusClient, LocusError } from '../lib/locus';

// ─── Message protocol (extension ↔ webview) ──────────────────────────────────

type OutboundMessage =
  | { type: 'loaded'; variables: Record<string, string> }
  | { type: 'saved'; success: boolean; error?: string }
  | { type: 'error'; message: string };

type InboundMessage =
  | { type: 'load' }
  | { type: 'save'; variables: Record<string, string> };

// ─── Provider ────────────────────────────────────────────────────────────────

export class EnvVarProvider {
  // One panel per service, reused on re-open
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  constructor(
    private readonly client: LocusClient,
    private readonly extensionUri: vscode.Uri
  ) {}

  show(serviceId: string, serviceName: string): void {
    const existing = this.panels.get(serviceId);
    if (existing) {
      existing.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'shipshape.envVars',
      `Env Vars — ${serviceName}`,
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'icons', 'shipshape.svg');
    panel.webview.html = this.renderHtml(panel.webview, serviceName);

    this.panels.set(serviceId, panel);
    panel.onDidDispose(() => this.panels.delete(serviceId));

    panel.webview.onDidReceiveMessage(async (msg: InboundMessage) => {
      try {
        if (msg.type === 'load') {
          await this.handleLoad(panel, serviceId);
        } else if (msg.type === 'save') {
          await this.handleSave(panel, serviceId, serviceName, msg.variables);
        }
      } catch (err) {
        const message = err instanceof LocusError ? err.message : (err as Error).message;
        this.post(panel, { type: 'error', message });
      }
    });
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private async handleLoad(panel: vscode.WebviewPanel, serviceId: string): Promise<void> {
    const variables = await this.client.getResolvedVariables(serviceId);
    this.post(panel, { type: 'loaded', variables });
  }

  private async handleSave(
    panel: vscode.WebviewPanel,
    serviceId: string,
    serviceName: string,
    variables: Record<string, string>
  ): Promise<void> {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Saving env vars for ${serviceName}...`,
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: 'Writing variables...' });
        // PUT replaces all — webview always posts the complete current set
        await this.client.setVariables(serviceId, variables);

        progress.report({ message: 'Triggering redeploy...' });
        // Per spec rule: vars require a redeploy to take effect
        await this.client.triggerDeployment(serviceId);
      }
    );
    this.post(panel, { type: 'saved', success: true });
    vscode.window.showInformationMessage(
      `Env vars saved. ${serviceName} is redeploying — watch the sidebar.`
    );
    vscode.commands.executeCommand('shipshape.refreshServices');
  }

  private post(panel: vscode.WebviewPanel, message: OutboundMessage): void {
    panel.webview.postMessage(message);
  }

  // ── HTML ──────────────────────────────────────────────────────────────────

  private renderHtml(webview: vscode.Webview, serviceName: string): string {
    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Env Vars — ${escapeHtml(serviceName)}</title>
  <style>
    :root {
      color-scheme: var(--vscode-color-scheme);
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      margin: 0;
    }
    h1 {
      font-size: 1.15rem;
      font-weight: 600;
      margin: 0 0 4px 0;
    }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85rem;
      margin-bottom: 16px;
    }
    .warning {
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
      color: var(--vscode-inputValidation-warningForeground);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 0.85rem;
      margin-bottom: 16px;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    button {
      font-family: inherit;
      font-size: 0.9rem;
      padding: 4px 12px;
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 2px;
      cursor: pointer;
    }
    button:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover:not(:disabled) {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    button.icon {
      background: transparent;
      color: var(--vscode-foreground);
      padding: 4px 8px;
    }
    button.icon:hover:not(:disabled) {
      background: var(--vscode-toolbar-hoverBackground);
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      text-align: left;
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      padding: 8px 4px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    td {
      padding: 4px;
      border-bottom: 1px solid var(--vscode-panel-border);
      vertical-align: top;
    }
    td.actions { width: 72px; text-align: right; }
    td.key    { width: 40%; }
    input[type="text"], input[type="password"] {
      width: 100%;
      box-sizing: border-box;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      padding: 4px 6px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9rem;
      border-radius: 2px;
    }
    input:focus {
      outline: 1px solid var(--vscode-focusBorder);
      border-color: var(--vscode-focusBorder);
    }
    .empty {
      text-align: center;
      padding: 32px 16px;
      color: var(--vscode-descriptionForeground);
    }
    .status {
      margin-top: 12px;
      font-size: 0.85rem;
      color: var(--vscode-descriptionForeground);
      min-height: 1.2em;
    }
    .status.error { color: var(--vscode-errorForeground); }
  </style>
</head>
<body>
  <h1>Environment Variables</h1>
  <div class="subtitle">${escapeHtml(serviceName)}</div>

  <div class="warning">
    ⚠ Values shown are <strong>resolved</strong>. Templates like
    <code>\${{db.DATABASE_URL}}</code> appear as their final values.
    Saving persists the literal values and triggers a redeploy.
  </div>

  <div class="toolbar">
    <button id="add">+ Add Variable</button>
    <button id="save">Save &amp; Deploy</button>
    <button id="reload" class="secondary">Reload</button>
  </div>

  <table>
    <thead>
      <tr>
        <th>Key</th>
        <th>Value</th>
        <th></th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>

  <div id="empty" class="empty" hidden>No variables yet. Click "+ Add Variable" to create one.</div>
  <div id="status" class="status"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const rowsEl = document.getElementById('rows');
    const emptyEl = document.getElementById('empty');
    const statusEl = document.getElementById('status');
    const addBtn = document.getElementById('add');
    const saveBtn = document.getElementById('save');
    const reloadBtn = document.getElementById('reload');

    let revealed = new Set();

    function status(msg, isError) {
      statusEl.textContent = msg;
      statusEl.classList.toggle('error', !!isError);
    }

    function render(vars) {
      rowsEl.innerHTML = '';
      const entries = Object.entries(vars);
      emptyEl.hidden = entries.length > 0;
      for (const [k, v] of entries) {
        addRow(k, v);
      }
    }

    function addRow(key, value) {
      const tr = document.createElement('tr');
      const keyTd = document.createElement('td');
      keyTd.className = 'key';
      const keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.placeholder = 'KEY';
      keyInput.value = key || '';
      keyInput.spellcheck = false;
      keyInput.autocapitalize = 'off';
      keyTd.appendChild(keyInput);

      const valTd = document.createElement('td');
      const valInput = document.createElement('input');
      const id = 'v_' + Math.random().toString(36).slice(2);
      valInput.dataset.id = id;
      valInput.type = revealed.has(id) ? 'text' : 'password';
      valInput.placeholder = 'value';
      valInput.value = value || '';
      valInput.spellcheck = false;
      valTd.appendChild(valInput);

      const actTd = document.createElement('td');
      actTd.className = 'actions';
      const revealBtn = document.createElement('button');
      revealBtn.className = 'icon';
      revealBtn.type = 'button';
      revealBtn.title = 'Reveal / hide';
      revealBtn.textContent = '👁';
      revealBtn.onclick = () => {
        if (revealed.has(id)) {
          revealed.delete(id);
          valInput.type = 'password';
        } else {
          revealed.add(id);
          valInput.type = 'text';
        }
      };
      const delBtn = document.createElement('button');
      delBtn.className = 'icon';
      delBtn.type = 'button';
      delBtn.title = 'Remove';
      delBtn.textContent = '✕';
      delBtn.onclick = () => {
        tr.remove();
        emptyEl.hidden = rowsEl.children.length > 0;
      };
      actTd.appendChild(revealBtn);
      actTd.appendChild(delBtn);

      tr.appendChild(keyTd);
      tr.appendChild(valTd);
      tr.appendChild(actTd);
      rowsEl.appendChild(tr);
      emptyEl.hidden = true;
    }

    function collect() {
      const out = {};
      const rows = rowsEl.querySelectorAll('tr');
      for (const tr of rows) {
        const inputs = tr.querySelectorAll('input');
        const key = inputs[0].value.trim();
        const val = inputs[1].value;
        if (!key) continue;
        out[key] = val;
      }
      return out;
    }

    addBtn.onclick = () => addRow('', '');
    reloadBtn.onclick = () => { status('Loading...'); vscode.postMessage({ type: 'load' }); };

    saveBtn.onclick = () => {
      const variables = collect();
      const keys = Object.keys(variables);
      const unique = new Set(keys);
      if (keys.length !== unique.size) {
        status('Duplicate keys — each variable must have a unique name.', true);
        return;
      }
      saveBtn.disabled = true;
      addBtn.disabled = true;
      reloadBtn.disabled = true;
      status('Saving and redeploying...');
      vscode.postMessage({ type: 'save', variables });
    };

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'loaded') {
        render(msg.variables || {});
        status('');
        saveBtn.disabled = false;
        addBtn.disabled = false;
        reloadBtn.disabled = false;
      } else if (msg.type === 'saved') {
        status(msg.success ? 'Saved. Redeploying...' : ('Save failed: ' + (msg.error || '')), !msg.success);
        saveBtn.disabled = false;
        addBtn.disabled = false;
        reloadBtn.disabled = false;
      } else if (msg.type === 'error') {
        status('Error: ' + msg.message, true);
        saveBtn.disabled = false;
        addBtn.disabled = false;
        reloadBtn.disabled = false;
      }
    });

    // Initial load
    status('Loading...');
    vscode.postMessage({ type: 'load' });
  </script>
</body>
</html>`;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
