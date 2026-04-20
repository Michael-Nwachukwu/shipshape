import * as vscode from 'vscode';
import { LocusClient, LocusError, Domain, DomainValidationStatus } from '../lib/locus';
import { formatError } from '../lib/errorFormat';

// ─── Message protocol (extension ↔ webview) ──────────────────────────────────

type OutboundMessage =
  | { type: 'state'; domain?: Domain; step: 'empty' | 'dns-pending' | 'attached'; lastCheckedAt?: string }
  | { type: 'progress'; message: string }
  | { type: 'error'; message: string };

type InboundMessage =
  | { type: 'load' }
  | { type: 'create'; domain: string }
  | { type: 'check'; domainId: string }
  | { type: 'attach'; domainId: string }
  | { type: 'remove'; domainId: string }
  | { type: 'openExternal'; url: string }
  | { type: 'copy'; value: string };

// ─── Provider ────────────────────────────────────────────────────────────────

// Persists `{serviceId: domainId}` for in-flight (pending / unattached) domains
// so we can restore the DNS-pending UI state after VS Code reloads — the API
// doesn't associate unattached domains with a service, so we remember the link
// ourselves until `attachDomain` completes.
const PENDING_DOMAIN_MAP_KEY = 'shipshape.pendingDomains';

type PendingDomainMap = Record<string, string>; // serviceId → domainId

export class DomainProvider {
  // One panel per service, reused on re-open
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  constructor(
    private readonly client: LocusClient,
    private readonly extensionUri: vscode.Uri,
    private readonly globalState: vscode.Memento
  ) {}

  private getPendingMap(): PendingDomainMap {
    return this.globalState.get<PendingDomainMap>(PENDING_DOMAIN_MAP_KEY, {});
  }

  private async setPending(serviceId: string, domainId: string): Promise<void> {
    const map = this.getPendingMap();
    map[serviceId] = domainId;
    await this.globalState.update(PENDING_DOMAIN_MAP_KEY, map);
  }

  private async clearPending(serviceId: string): Promise<void> {
    const map = this.getPendingMap();
    if (map[serviceId]) {
      delete map[serviceId];
      await this.globalState.update(PENDING_DOMAIN_MAP_KEY, map);
    }
  }

  show(serviceId: string, serviceName: string, projectId: string): void {
    const existing = this.panels.get(serviceId);
    if (existing) {
      existing.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'shipshape.domains',
      `Domain — ${serviceName}`,
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
          await this.handleLoad(panel, serviceId, projectId);
        } else if (msg.type === 'create') {
          await this.handleCreate(panel, serviceId, projectId, msg.domain);
        } else if (msg.type === 'check') {
          await this.handleCheck(panel, serviceId, projectId, msg.domainId);
        } else if (msg.type === 'attach') {
          await this.handleAttach(panel, serviceId, projectId, msg.domainId);
        } else if (msg.type === 'remove') {
          await this.handleRemove(panel, serviceId, projectId, msg.domainId);
        } else if (msg.type === 'openExternal') {
          await vscode.env.openExternal(vscode.Uri.parse(msg.url));
        } else if (msg.type === 'copy') {
          await vscode.env.clipboard.writeText(msg.value);
          this.post(panel, { type: 'progress', message: 'Copied to clipboard.' });
        }
      } catch (err) {
        const { message } = formatError(err, 'Domain');
        this.post(panel, { type: 'error', message });
      }
    });
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private async handleLoad(
    panel: vscode.WebviewPanel,
    serviceId: string,
    projectId: string
  ): Promise<void> {
    const domain = await this.findDomainForService(serviceId, projectId);
    this.post(panel, { type: 'state', domain, step: stepForDomain(domain) });
  }

  private async handleCreate(
    panel: vscode.WebviewPanel,
    serviceId: string,
    projectId: string,
    rawDomain: string
  ): Promise<void> {
    const domain = rawDomain.trim().toLowerCase();
    if (!isValidFqdn(domain)) {
      this.post(panel, { type: 'error', message: 'Enter a valid domain, e.g. api.example.com (no protocol, no trailing dot).' });
      return;
    }
    // Enforce "one domain per service" at UX layer only.
    const existing = await this.findDomainForService(serviceId, projectId);
    if (existing) {
      this.post(panel, { type: 'error', message: 'This service already has a domain. Remove it first to add a new one.' });
      this.post(panel, { type: 'state', domain: existing, step: stepForDomain(existing) });
      return;
    }

    this.post(panel, { type: 'progress', message: 'Registering domain...' });
    const created = await this.client.createDomain(domain, projectId);
    await this.setPending(serviceId, created.id);
    this.post(panel, { type: 'state', domain: created, step: stepForDomain(created) });
  }

  private async handleCheck(
    panel: vscode.WebviewPanel,
    _serviceId: string,
    _projectId: string,
    domainId: string
  ): Promise<void> {
    this.post(panel, { type: 'progress', message: 'Checking DNS and SSL validation...' });
    // Trigger verify then fetch latest state.
    await this.client.verifyDomain(domainId);
    const latest = await this.client.getDomain(domainId);
    this.post(panel, {
      type: 'state',
      domain: latest,
      step: stepForDomain(latest),
      lastCheckedAt: new Date().toISOString(),
    });
  }

  private async handleAttach(
    panel: vscode.WebviewPanel,
    serviceId: string,
    _projectId: string,
    domainId: string
  ): Promise<void> {
    this.post(panel, { type: 'progress', message: 'Attaching domain to service...' });
    const attached = await this.client.attachDomain(domainId, serviceId);
    // Domain is now discoverable by its serviceId — we no longer need the
    // pending pointer.
    await this.clearPending(serviceId);
    this.post(panel, { type: 'state', domain: attached, step: stepForDomain(attached) });
    vscode.window.showInformationMessage(`Domain attached: ${attached.domain}`);
    vscode.commands.executeCommand('shipshape.refreshServices');
  }

  private async handleRemove(
    panel: vscode.WebviewPanel,
    serviceId: string,
    _projectId: string,
    domainId: string
  ): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      'Remove this domain? It will be detached from the service and deleted. You will need to re-add it to restore.',
      { modal: true },
      'Remove'
    );
    if (confirm !== 'Remove') {
      // Nothing changed; resend current state so UI re-enables buttons.
      this.post(panel, { type: 'progress', message: '' });
      return;
    }

    this.post(panel, { type: 'progress', message: 'Detaching...' });
    try {
      await this.client.detachDomain(domainId);
    } catch (err) {
      // If it's already detached or was never attached (pending state),
      // proceed to delete anyway. API returns 409 for "already detached"
      // and 400 for "not attached to any service".
      if (!(err instanceof LocusError && (err.statusCode === 409 || err.statusCode === 400))) {
        throw err;
      }
    }
    this.post(panel, { type: 'progress', message: 'Deleting...' });
    await this.client.deleteDomain(domainId);
    await this.clearPending(serviceId);
    this.post(panel, { type: 'state', domain: undefined, step: 'empty' });
    vscode.window.showInformationMessage('Domain removed.');
    vscode.commands.executeCommand('shipshape.refreshServices');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async findDomainForService(
    serviceId: string,
    projectId: string
  ): Promise<Domain | undefined> {
    const domains = await this.client.listDomainsByProject(projectId);

    // 1. Attached domain wins.
    const attached = domains.find((d) => d.serviceId === serviceId);
    if (attached) {
      return attached;
    }

    // 2. Fall back to any pending domain we previously registered for this
    //    service (tracked in globalState since the API can't associate an
    //    unattached domain with a service).
    const pendingId = this.getPendingMap()[serviceId];
    if (!pendingId) {
      return undefined;
    }
    const pending = domains.find((d) => d.id === pendingId);
    if (!pending) {
      // Domain was removed server-side — clear the stale pointer.
      await this.clearPending(serviceId);
      return undefined;
    }
    if (pending.serviceId && pending.serviceId !== serviceId) {
      // Domain got attached to a different service — also clear.
      await this.clearPending(serviceId);
      return undefined;
    }
    return pending;
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
  <title>Domain — ${escapeHtml(serviceName)}</title>
  <style>
    :root { color-scheme: var(--vscode-color-scheme); }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      margin: 0;
    }
    h1 { font-size: 1.15rem; font-weight: 600; margin: 0 0 4px 0; }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85rem;
      margin-bottom: 16px;
    }
    .section { margin-bottom: 20px; }
    .warning {
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder);
      color: var(--vscode-inputValidation-warningForeground);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 0.85rem;
      margin-bottom: 16px;
    }
    .row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
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
    button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
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
      padding: 2px 6px;
      border-color: transparent;
    }
    button.icon:hover:not(:disabled) {
      background: var(--vscode-toolbar-hoverBackground);
    }
    input[type="text"] {
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
    input:focus { outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder); }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th {
      text-align: left;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      padding: 6px 4px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    td {
      padding: 6px 4px;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.85rem;
      word-break: break-all;
    }
    td.actions { width: 48px; text-align: right; }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .pill.pending    { background: var(--vscode-charts-yellow, #cca700); color: #000; }
    .pill.validating { background: var(--vscode-charts-yellow, #cca700); color: #000; }
    .pill.validated  { background: var(--vscode-charts-green, #388a34); color: #fff; }
    .pill.failed     { background: var(--vscode-charts-red, #c72e0f); color: #fff; }
    .status {
      margin-top: 12px;
      font-size: 0.85rem;
      color: var(--vscode-descriptionForeground);
      min-height: 1.2em;
    }
    .status.error { color: var(--vscode-errorForeground); }
    .attached-badge {
      font-size: 1.4rem;
      color: var(--vscode-charts-green, #388a34);
      margin-right: 6px;
    }
    .link {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
    }
    .link:hover { text-decoration: underline; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 0.8rem; }
    .hidden { display: none !important; }
    .cell-value { white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>Custom Domain</h1>
  <div class="subtitle" id="subtitle">${escapeHtml(serviceName)}</div>

  <!-- Empty state: add a new domain -->
  <div id="state-empty" class="section hidden">
    <div class="row">
      <input type="text" id="domain-input" placeholder="api.example.com" spellcheck="false" autocapitalize="off" />
    </div>
    <div class="row">
      <button id="add-btn">Add Domain</button>
      <button id="purchase-btn" class="secondary">Purchase a new domain</button>
    </div>
    <div class="warning">
      ⚠ Already own this domain? Cloudflare users: set DNS to <strong>DNS-only (gray cloud)</strong> — orange-cloud proxying breaks SSL validation.
    </div>
  </div>

  <!-- DNS pending state -->
  <div id="state-pending" class="section hidden">
    <div class="row">
      <span id="pending-domain" style="font-weight:600;font-size:1rem;"></span>
      <span id="pending-pill" class="pill pending">Pending</span>
    </div>
    <p class="meta">Add these DNS records at your registrar, then click <strong>Check Now</strong>.</p>
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Name</th>
          <th>Value</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="dns-rows"></tbody>
    </table>
    <div class="row" style="margin-top: 12px;">
      <button id="check-btn">Check Now</button>
      <button id="attach-btn" class="secondary" disabled>Attach to Service</button>
      <button id="remove-pending-btn" class="secondary">Remove</button>
    </div>
    <div class="meta" id="last-checked"></div>
    <div class="warning" style="margin-top: 12px;">
      ⚠ Cloudflare users: set DNS to <strong>DNS-only (gray cloud)</strong> — orange-cloud proxying breaks SSL validation.
    </div>
  </div>

  <!-- Attached state -->
  <div id="state-attached" class="section hidden">
    <div class="row">
      <span class="attached-badge">✓</span>
      <a class="link" id="attached-link"></a>
      <span class="pill validated">Validated</span>
    </div>
    <p class="meta" id="attached-meta"></p>
    <div class="row">
      <button id="remove-btn" class="secondary">Remove Domain</button>
    </div>
  </div>

  <div id="status" class="status"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const statusEl = document.getElementById('status');

    const empty = document.getElementById('state-empty');
    const pending = document.getElementById('state-pending');
    const attached = document.getElementById('state-attached');

    const domainInput = document.getElementById('domain-input');
    const addBtn = document.getElementById('add-btn');
    const purchaseBtn = document.getElementById('purchase-btn');

    const pendingDomainEl = document.getElementById('pending-domain');
    const pendingPill = document.getElementById('pending-pill');
    const dnsRows = document.getElementById('dns-rows');
    const checkBtn = document.getElementById('check-btn');
    const attachBtn = document.getElementById('attach-btn');
    const removePendingBtn = document.getElementById('remove-pending-btn');
    const lastCheckedEl = document.getElementById('last-checked');

    const attachedLink = document.getElementById('attached-link');
    const attachedMeta = document.getElementById('attached-meta');
    const removeBtn = document.getElementById('remove-btn');

    let currentDomain = null;
    const FQDN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}$/;

    function show(which) {
      empty.classList.toggle('hidden', which !== 'empty');
      pending.classList.toggle('hidden', which !== 'dns-pending');
      attached.classList.toggle('hidden', which !== 'attached');
    }

    function setStatus(msg, isError) {
      statusEl.textContent = msg || '';
      statusEl.classList.toggle('error', !!isError);
    }

    function setButtonsDisabled(disabled) {
      [addBtn, purchaseBtn, checkBtn, attachBtn, removePendingBtn, removeBtn].forEach((b) => {
        if (!b) return;
        // attachBtn has its own gate — re-evaluated below
        b.disabled = disabled;
      });
    }

    function renderEmpty() {
      show('empty');
      domainInput.value = '';
      setStatus('');
    }

    function renderPending(domain, lastCheckedAt) {
      show('dns-pending');
      pendingDomainEl.textContent = domain.domain;
      const vs = domain.validationStatus || 'pending';
      pendingPill.className = 'pill ' + vs;
      pendingPill.textContent = vs.charAt(0).toUpperCase() + vs.slice(1);

      dnsRows.innerHTML = '';
      if (domain.cnameTarget) {
        addDnsRow('CNAME', domain.domain, domain.cnameTarget, 'Routing');
      }
      const records = domain.validationRecords || [];
      for (const r of records) {
        addDnsRow(r.type || 'CNAME', r.name, r.value, 'SSL validation');
      }

      attachBtn.disabled = vs !== 'validated';
      lastCheckedEl.textContent = lastCheckedAt
        ? 'Last checked: ' + new Date(lastCheckedAt).toLocaleString()
        : '';
    }

    function addDnsRow(type, name, value, label) {
      const tr = document.createElement('tr');
      const typeTd = document.createElement('td');
      typeTd.textContent = type;
      const nameTd = document.createElement('td');
      nameTd.className = 'cell-value';
      const nameSpan = document.createElement('div');
      nameSpan.textContent = name;
      const nameLabel = document.createElement('div');
      nameLabel.className = 'meta';
      nameLabel.textContent = label;
      nameTd.appendChild(nameSpan);
      nameTd.appendChild(nameLabel);
      const valueTd = document.createElement('td');
      valueTd.className = 'cell-value';
      valueTd.textContent = value;
      const actTd = document.createElement('td');
      actTd.className = 'actions';
      const copyBtn = document.createElement('button');
      copyBtn.className = 'icon';
      copyBtn.type = 'button';
      copyBtn.title = 'Copy value';
      copyBtn.textContent = '📋';
      copyBtn.onclick = () => vscode.postMessage({ type: 'copy', value });
      actTd.appendChild(copyBtn);
      tr.appendChild(typeTd);
      tr.appendChild(nameTd);
      tr.appendChild(valueTd);
      tr.appendChild(actTd);
      dnsRows.appendChild(tr);
    }

    function renderAttached(domain) {
      show('attached');
      const url = 'https://' + domain.domain;
      attachedLink.textContent = url;
      attachedLink.onclick = () => vscode.postMessage({ type: 'openExternal', url });
      attachedMeta.textContent = 'Domain is live and attached to this service.';
    }

    addBtn.onclick = () => {
      const v = (domainInput.value || '').trim().toLowerCase();
      if (!FQDN.test(v)) {
        setStatus('Enter a valid domain, e.g. api.example.com (lowercase, no protocol, no trailing dot).', true);
        return;
      }
      setButtonsDisabled(true);
      setStatus('Registering domain...');
      vscode.postMessage({ type: 'create', domain: v });
    };

    purchaseBtn.onclick = () => {
      vscode.postMessage({ type: 'openExternal', url: 'https://beta.buildwithlocus.com/domains' });
    };

    checkBtn.onclick = () => {
      if (!currentDomain) return;
      setButtonsDisabled(true);
      setStatus('Checking DNS...');
      vscode.postMessage({ type: 'check', domainId: currentDomain.id });
    };

    attachBtn.onclick = () => {
      if (!currentDomain) return;
      setButtonsDisabled(true);
      setStatus('Attaching...');
      vscode.postMessage({ type: 'attach', domainId: currentDomain.id });
    };

    removePendingBtn.onclick = () => {
      if (!currentDomain) return;
      setButtonsDisabled(true);
      setStatus('Removing...');
      vscode.postMessage({ type: 'remove', domainId: currentDomain.id });
    };

    removeBtn.onclick = () => {
      if (!currentDomain) return;
      setButtonsDisabled(true);
      setStatus('Removing...');
      vscode.postMessage({ type: 'remove', domainId: currentDomain.id });
    };

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'state') {
        currentDomain = msg.domain || null;
        setButtonsDisabled(false);
        if (msg.step === 'empty' || !currentDomain) {
          renderEmpty();
        } else if (msg.step === 'dns-pending') {
          renderPending(currentDomain, msg.lastCheckedAt);
        } else if (msg.step === 'attached') {
          renderAttached(currentDomain);
        }
        setStatus('');
      } else if (msg.type === 'progress') {
        setStatus(msg.message);
      } else if (msg.type === 'error') {
        setButtonsDisabled(false);
        setStatus(msg.message, true);
      }
    });

    // Initial load
    setStatus('Loading...');
    vscode.postMessage({ type: 'load' });
  </script>
</body>
</html>`;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stepForDomain(d: Domain | undefined): 'empty' | 'dns-pending' | 'attached' {
  if (!d) { return 'empty'; }
  // If the domain is attached to a service AND validated, show attached state.
  const validated: DomainValidationStatus = 'validated';
  if (d.serviceId && d.validationStatus === validated) {
    return 'attached';
  }
  return 'dns-pending';
}

function isValidFqdn(s: string): boolean {
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(s);
}

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
