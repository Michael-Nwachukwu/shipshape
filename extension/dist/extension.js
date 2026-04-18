"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode14 = __toESM(require("vscode"));

// src/lib/credentials.ts
var os = __toESM(require("os"));
var path = __toESM(require("path"));
var vscode = __toESM(require("vscode"));
var CLI_CREDENTIALS_PATH = path.join(os.homedir(), ".config", "locus", "credentials.json");
async function findStoredApiKey(secrets) {
  const fromSecrets = await secrets.get("locus.buildApiKey");
  if (fromSecrets) {
    return { key: fromSecrets, source: "secrets" };
  }
  const fromCli = await readCliCredentials();
  if (fromCli) {
    return { key: fromCli, source: "cli-credentials" };
  }
  return void 0;
}
async function readCliCredentials() {
  try {
    const uri = vscode.Uri.file(CLI_CREDENTIALS_PATH);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof data.api_key === "string" && data.api_key.startsWith("claw_")) {
      return data.api_key;
    }
    return void 0;
  } catch {
    return void 0;
  }
}
var PAY_KEY_SECRET = "locus.payApiKey";
async function findStoredPayKey(secrets) {
  return secrets.get(PAY_KEY_SECRET);
}
async function promptForPayKey(secrets, reason) {
  const prompt = reason ? `${reason} \u2014 enter your Locus Pay API key` : "Enter your Locus Pay API key";
  const key = await vscode.window.showInputBox({
    prompt,
    password: true,
    placeHolder: "claw_...",
    ignoreFocusOut: true,
    validateInput: (v) => v && !v.startsWith("claw_") ? "Key must start with claw_" : null
  });
  if (!key) {
    return void 0;
  }
  await secrets.store(PAY_KEY_SECRET, key);
  return key;
}
async function clearPayKey(secrets) {
  await secrets.delete(PAY_KEY_SECRET);
}

// src/lib/locus.ts
var BASE_URL = "https://beta-api.buildwithlocus.com/v1";
var _cachedToken = null;
var TERMINAL_STATUSES = [
  "healthy",
  "failed",
  "cancelled",
  "rolled_back"
];
function formatLogLine(entry) {
  if (typeof entry === "string") {
    return entry;
  }
  if (entry === null || entry === void 0) {
    return "";
  }
  const msg = entry.message ?? entry["log"] ?? entry["text"] ?? entry["line"];
  if (typeof msg === "string") {
    const ts = entry.timestamp ? `[${entry.timestamp}] ` : "";
    return `${ts}${msg}`;
  }
  try {
    return JSON.stringify(entry);
  } catch {
    return String(entry);
  }
}
var LocusError = class extends Error {
  constructor(message, statusCode, details, creditBalance, requiredAmount) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.creditBalance = creditBalance;
    this.requiredAmount = requiredAmount;
    this.name = "LocusError";
  }
};
var LocusClient = class {
  constructor(secrets) {
    this.secrets = secrets;
  }
  // ── Token management ───────────────────────────────────────────────────────
  async getToken() {
    if (_cachedToken) {
      return _cachedToken;
    }
    const stored = await findStoredApiKey(this.secrets);
    if (!stored) {
      throw new LocusError(
        'No API key configured. Run "Locus: Configure API Key" first.',
        401
      );
    }
    _cachedToken = await this.exchangeApiKey(stored.key);
    return _cachedToken;
  }
  async exchangeApiKey(apiKey) {
    const res = await fetch(`${BASE_URL}/auth/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Token exchange failed" }));
      throw new LocusError(err.error ?? "Token exchange failed", res.status);
    }
    const data = await res.json();
    return data.token;
  }
  async verifyOrRefreshToken() {
    const token = await this.getToken();
    try {
      await this._request("GET", "/auth/whoami", void 0, token);
      return token;
    } catch (err) {
      if (!(err instanceof LocusError) || err.statusCode !== 401) {
        throw err;
      }
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          _cachedToken = data.token;
          return _cachedToken;
        }
      } catch {
      }
      _cachedToken = null;
      const stored = await findStoredApiKey(this.secrets);
      if (!stored) {
        throw new LocusError("Session expired. Please re-enter your API key.", 401);
      }
      _cachedToken = await this.exchangeApiKey(stored.key);
      return _cachedToken;
    }
  }
  clearTokenCache() {
    _cachedToken = null;
  }
  // ── Core request helper ────────────────────────────────────────────────────
  async _request(method, path8, body, tokenOverride) {
    const token = tokenOverride ?? await this.getToken();
    const res = await fetch(`${BASE_URL}${path8}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...body !== void 0 ? { "Content-Type": "application/json" } : {}
      },
      body: body !== void 0 ? JSON.stringify(body) : void 0
    });
    if (res.status === 204) {
      return void 0;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new LocusError(
        data["error"] ?? `${method} ${path8} failed (${res.status})`,
        res.status,
        data["details"],
        data["creditBalance"],
        data["requiredAmount"]
      );
    }
    return data;
  }
  // ── Auth ───────────────────────────────────────────────────────────────────
  async whoami() {
    return this._request("GET", "/auth/whoami");
  }
  // ── Billing ────────────────────────────────────────────────────────────────
  async getBillingBalance() {
    return this._request("GET", "/billing/balance");
  }
  // ── Projects ──────────────────────────────────────────────────────────────
  async createProject(name, region, description) {
    return this._request("POST", "/projects", { name, region, description });
  }
  async listProjects() {
    const data = await this._request("GET", "/projects");
    return data.projects;
  }
  async getProject(projectId) {
    return this._request("GET", `/projects/${projectId}`);
  }
  async fromRepo(repo, branch = "main", name, region) {
    return this._request("POST", "/projects/from-repo", {
      repo,
      branch,
      name,
      region
    });
  }
  async verifyLocusbuild(locusbuild) {
    return this._request("POST", "/projects/verify-locusbuild", {
      locusbuild
    });
  }
  // ── Environments ───────────────────────────────────────────────────────────
  async createEnvironment(projectId, name, type) {
    return this._request(`POST`, `/projects/${projectId}/environments`, {
      name,
      type
    });
  }
  async listEnvironments(projectId) {
    const data = await this._request(
      "GET",
      `/projects/${projectId}/environments`
    );
    return data.environments;
  }
  // ── Services ──────────────────────────────────────────────────────────────
  async createService(opts) {
    return this._request("POST", "/services", {
      ...opts,
      runtime: opts.runtime ?? { port: 8080 }
    });
  }
  async getService(serviceId, includeRuntime = false) {
    const qs = includeRuntime ? "?include=runtime" : "";
    return this._request("GET", `/services/${serviceId}${qs}`);
  }
  async listServices(environmentId) {
    const data = await this._request(
      "GET",
      `/services/environment/${environmentId}`
    );
    return data.services;
  }
  async updateService(serviceId, updates) {
    return this._request("PATCH", `/services/${serviceId}`, updates);
  }
  async restartService(serviceId) {
    return this._request("POST", `/services/${serviceId}/restart`);
  }
  async redeployService(serviceId) {
    return this._request("POST", `/services/${serviceId}/redeploy`);
  }
  async deleteService(serviceId) {
    return this._request("DELETE", `/services/${serviceId}`);
  }
  // ── Deployments ───────────────────────────────────────────────────────────
  async triggerDeployment(serviceId) {
    return this._request("POST", "/deployments", { serviceId });
  }
  async getDeployment(deploymentId) {
    return this._request("GET", `/deployments/${deploymentId}`);
  }
  async listDeployments(serviceId, limit = 10) {
    const data = await this._request(
      "GET",
      `/deployments/service/${serviceId}?limit=${limit}`
    );
    return data.deployments;
  }
  async cancelDeployment(deploymentId) {
    return this._request("POST", `/deployments/${deploymentId}/cancel`);
  }
  async rollbackDeployment(deploymentId, reason) {
    return this._request("POST", `/deployments/${deploymentId}/rollback`, { reason });
  }
  // ── Variables ─────────────────────────────────────────────────────────────
  async setVariables(serviceId, variables) {
    return this._request("PUT", `/variables/service/${serviceId}`, { variables });
  }
  async mergeVariables(serviceId, variables) {
    return this._request("PATCH", `/variables/service/${serviceId}`, { variables });
  }
  async getResolvedVariables(serviceId) {
    const data = await this._request(
      "GET",
      `/variables/service/${serviceId}/resolved`
    );
    return data.variables;
  }
  // ── Addons ────────────────────────────────────────────────────────────────
  async createAddon(projectId, environmentId, type, name) {
    return this._request("POST", "/addons", { projectId, environmentId, type, name });
  }
  async getAddon(addonId) {
    return this._request("GET", `/addons/${addonId}`);
  }
  async listAddons(environmentId) {
    const data = await this._request(
      "GET",
      `/addons/environment/${environmentId}`
    );
    return data.addons ?? [];
  }
  async deleteAddon(addonId) {
    return this._request("DELETE", `/addons/${addonId}`);
  }
  // ── Logs (non-streaming snapshot) ─────────────────────────────────────────
  /**
   * Fetch the full available log history for a deployment (non-streaming).
   * Unlike `lastLogs` on a Deployment object (capped at 20 lines), this returns
   * the complete log buffer from the API — useful for post-failure diagnosis.
   *
   * Note: log entries may be strings or structured objects. Use `formatLogLine`
   * to render them for display.
   */
  async getDeploymentLogs(deploymentId) {
    return this._request("GET", `/deployments/${deploymentId}/logs`);
  }
  // ── Logs (SSE streaming) ──────────────────────────────────────────────────
  async streamDeploymentLogs(deploymentId, onLine, signal) {
    const token = await this.getToken();
    const response = await fetch(
      `${BASE_URL}/deployments/${deploymentId}/logs?follow=true`,
      { headers: { Authorization: `Bearer ${token}` }, signal }
    );
    if (!response.body) {
      return;
    }
    await this._consumeSseStream(response.body, onLine);
  }
  async streamServiceLogs(serviceId, onLine, signal) {
    const token = await this.getToken();
    const response = await fetch(
      `${BASE_URL}/services/${serviceId}/logs?follow=true`,
      { headers: { Authorization: `Bearer ${token}` }, signal }
    );
    if (!response.body) {
      return;
    }
    await this._consumeSseStream(response.body, onLine);
  }
  async _consumeSseStream(body, onLine) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (line.startsWith("data:")) {
            onLine(line.replace(/^data:\s?/, ""));
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  // ── GitHub ────────────────────────────────────────────────────────────────
  async checkRepoAccess(repo) {
    return this._request("GET", `/github/repo-access?repo=${encodeURIComponent(repo)}`);
  }
  // ── Git push deploy ───────────────────────────────────────────────────────
  async getGitRemoteUrl() {
    return this._request("GET", "/git/remote-url");
  }
  // ── Webhooks ──────────────────────────────────────────────────────────────
  async createWebhook(projectId, url, events) {
    return this._request("POST", "/webhooks", { projectId, url, events });
  }
  async deleteWebhook(webhookId) {
    return this._request("DELETE", `/webhooks/${webhookId}`);
  }
};

// src/statusBar.ts
var vscode2 = __toESM(require("vscode"));
var STATUS_BAR_CONFIGS = {
  idle: { text: "$(rocket) Locus", tooltip: "Click to deploy" },
  detecting: { text: "$(search) Locus: Detecting...", tooltip: "Detecting project type" },
  building: { text: "$(tools) Locus: Building...", tooltip: "Building Docker image (2-4 min)" },
  deploying: { text: "$(sync~spin) Locus: Deploying...", tooltip: "Starting container (1-3 min)" },
  healthy: { text: "$(check) Locus: Live", tooltip: "Click to open live URL" },
  failed: { text: "$(error) Locus: Failed", tooltip: "Click to view logs" }
};
var _item;
function createStatusBar() {
  _item = vscode2.window.createStatusBarItem(vscode2.StatusBarAlignment.Left, 100);
  setState("idle");
  _item.show();
  return _item;
}
function setState(state, liveUrl) {
  if (!_item) {
    return;
  }
  const config = STATUS_BAR_CONFIGS[state];
  _item.text = config.text;
  if (state === "healthy" && liveUrl) {
    _item.tooltip = `Live at ${liveUrl} \u2014 Click to open in browser`;
    _item.command = {
      command: "vscode.open",
      arguments: [vscode2.Uri.parse(liveUrl)],
      title: "Open in Browser"
    };
  } else if (state === "failed") {
    _item.tooltip = config.tooltip;
    _item.command = "locus.viewLogs";
  } else {
    _item.tooltip = config.tooltip;
    _item.command = "locus.deploy";
  }
}
function dispose() {
  _item?.dispose();
  _item = void 0;
}

// src/commands/deploy.ts
var vscode10 = __toESM(require("vscode"));

// src/lib/detector.ts
var vscode3 = __toESM(require("vscode"));
var path2 = __toESM(require("path"));
var PROJECT_TYPE_LABELS = {
  "nextjs": "Next.js",
  "react-vite": "React + Vite",
  "express": "Express (Node.js)",
  "fastapi": "FastAPI (Python)",
  "django": "Django (Python)",
  "rails": "Ruby on Rails",
  "generic-node": "Generic Node.js",
  "generic-python": "Generic Python",
  "dockerfile": "Dockerfile (custom)",
  "unknown": "Unknown"
};
async function detectProjectType(workspaceRoot) {
  if (await fileExists(workspaceRoot, "Dockerfile")) {
    return "dockerfile";
  }
  const pkgJson = await readJsonFile(workspaceRoot, "package.json");
  if (pkgJson) {
    const deps = {
      ...pkgJson.dependencies ?? {},
      ...pkgJson.devDependencies ?? {}
    };
    if ("next" in deps) {
      return "nextjs";
    }
    if ("react" in deps && "vite" in deps) {
      return "react-vite";
    }
    if ("express" in deps) {
      return "express";
    }
    return "generic-node";
  }
  const requirements = await readTextFile(workspaceRoot, "requirements.txt");
  if (requirements !== null) {
    const lower = requirements.toLowerCase();
    if (/\bfastapi\b/.test(lower)) {
      return "fastapi";
    }
    if (/\bdjango\b/.test(lower)) {
      return "django";
    }
    return "generic-python";
  }
  const pyproject = await readTextFile(workspaceRoot, "pyproject.toml");
  if (pyproject !== null) {
    const lower = pyproject.toLowerCase();
    if (/fastapi/.test(lower)) {
      return "fastapi";
    }
    if (/django/.test(lower)) {
      return "django";
    }
    return "generic-python";
  }
  const gemfile = await readTextFile(workspaceRoot, "Gemfile");
  if (gemfile !== null) {
    if (/\brails\b/i.test(gemfile)) {
      return "rails";
    }
  }
  return "unknown";
}
async function fileExists(root, name) {
  try {
    const uri = vscode3.Uri.file(path2.join(root.fsPath, name));
    const stat = await vscode3.workspace.fs.stat(uri);
    return stat.type === vscode3.FileType.File;
  } catch {
    return false;
  }
}
async function readTextFile(root, name) {
  try {
    const uri = vscode3.Uri.file(path2.join(root.fsPath, name));
    const bytes = await vscode3.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
async function readJsonFile(root, name) {
  const text = await readTextFile(root, name);
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// src/lib/aiDiagnosis.ts
var vscode4 = __toESM(require("vscode"));
var path3 = __toESM(require("path"));

// src/lib/anthropic.ts
var WRAPPED_ENDPOINT = "https://api.paywithlocus.com/api/wrapped/anthropic/messages";
var DEFAULT_MODEL = "claude-sonnet-4-20250514";
var AnthropicError = class extends Error {
  constructor(message, statusCode, body) {
    super(message);
    this.statusCode = statusCode;
    this.body = body;
    this.name = "AnthropicError";
  }
};
async function complete(payApiKey, req) {
  const response = await fetch(WRAPPED_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${payApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: req.model ?? DEFAULT_MODEL,
      max_tokens: req.maxTokens ?? 2e3,
      system: req.system,
      messages: req.messages
    })
  });
  if (!response.ok) {
    let body;
    try {
      body = await response.json();
    } catch {
    }
    throw new AnthropicError(
      `Locus Pay wrapped Anthropic returned ${response.status}`,
      response.status,
      body
    );
  }
  const data = await response.json();
  const textBlock = data.content.find((c) => c.type === "text" && c.text);
  if (!textBlock?.text) {
    throw new AnthropicError("Empty response from Claude", 500, data);
  }
  return textBlock.text;
}
function extractJson(text) {
  let s = text.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) {
    s = fence[1].trim();
  }
  return JSON.parse(s);
}

// src/lib/aiDiagnosis.ts
var SYSTEM_PROMPT = `You are an expert deployment failure diagnostician for the Locus PaaS.
You will receive the failure phase, the tail of the build/runtime logs, and the project's current state (relevant files).

Your job: identify the ROOT CAUSE and, when safe, propose a concrete file-level fix.

Context about Locus:
- Containers MUST listen on port 8080 (platform injects PORT=8080)
- Base images are pulled from Locus's ECR mirror of Docker Hub (only "library/*" images, subset available \u2014 node:20-alpine works, caddy:2-alpine does NOT)
- Images MUST be linux/arm64
- \`.locusbuild\` uses Nixpacks auto-detection; does NOT support buildConfig \u2014 that only works on direct POST /v1/services
- Health checks: Locus proxies to the service at the configured healthCheck path on 8080 shortly after start

Output a single JSON object matching this schema EXACTLY. No prose, no markdown fences, no explanation.

{
  "summary": "one-sentence headline of what went wrong",
  "rootCause": "2-4 sentences explaining the actual cause, citing specific log lines if relevant",
  "owner": "user" | "platform" | "config" | "unknown",
  "confidence": "high" | "medium" | "low",
  "fix": null | {
    "description": "short label for the change",
    "file": "path/relative/to/workspace/root",
    "action": "replace",
    "content": "FULL new file content (we overwrite the existing file)",
    "commitMessage": "git commit message"
  }
}

Rules for proposing a fix:
- Only propose a fix when confidence is "high" and the change is SAFE and MINIMAL.
- "file" must be the path of an existing file in the workspace (Dockerfile, package.json, .locusbuild, etc.), relative to repo root.
- "content" must be the COMPLETE new file contents. The extension does a full replace, not a patch.
- If the fix would require changes to multiple files, or would delete/add files, set "fix": null and explain in rootCause.
- Prefer the smallest viable change. Don't refactor. Don't add comments. Don't change anything unrelated to the fix.
- If the failure is platform-side (owner: "platform"), set fix: null \u2014 user can't fix it, only retry.`;
function buildUserMessage(input, files) {
  const logs = input.logs.slice(-200).join("\n");
  const attachments = files.length > 0 ? files.map((f) => `
===== FILE: ${f.path} =====
${f.content}`).join("\n") : "\n(no project files attached)";
  return `Deployment failed.

Phase at failure: ${input.phase}
Project type: ${PROJECT_TYPE_LABELS[input.projectType]} (${input.projectType})
Repo: ${input.repoSlug}

---- LAST ${Math.min(input.logs.length, 200)} LOG LINES ----
${logs}

---- PROJECT FILES ----${attachments}`;
}
async function collectProjectFiles(workspaceRoot) {
  const candidates = [
    "Dockerfile",
    ".locusbuild",
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "Gemfile",
    "nixpacks.toml"
  ];
  const files = [];
  const MAX_BYTES_PER_FILE = 8e3;
  for (const name of candidates) {
    try {
      const uri = vscode4.Uri.file(path3.join(workspaceRoot.fsPath, name));
      const bytes = await vscode4.workspace.fs.readFile(uri);
      let content = new TextDecoder().decode(bytes);
      if (content.length > MAX_BYTES_PER_FILE) {
        content = content.slice(0, MAX_BYTES_PER_FILE) + `
... [truncated, file is ${bytes.byteLength} bytes total]`;
      }
      files.push({ path: name, content });
    } catch {
    }
  }
  return files;
}
async function diagnoseFailure(payApiKey, input) {
  const files = await collectProjectFiles(input.workspaceRoot);
  const userMessage = buildUserMessage(input, files);
  const response = await complete(payApiKey, {
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 2e3
  });
  let parsed;
  try {
    parsed = extractJson(response);
  } catch (err) {
    throw new AnthropicError(
      `Claude returned malformed JSON: ${err.message}`,
      500,
      { raw: response.slice(0, 500) }
    );
  }
  if (typeof parsed.summary !== "string" || typeof parsed.rootCause !== "string") {
    throw new AnthropicError("Diagnosis JSON missing required fields", 500, parsed);
  }
  return parsed;
}

// src/commands/deploy.ts
var path7 = __toESM(require("path"));

// src/lib/gitRemote.ts
var vscode5 = __toESM(require("vscode"));
var path4 = __toESM(require("path"));
var GITHUB_REMOTE_REGEX = /github\.com[/:]([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?$/;
async function detectGitHubRemote(workspaceRoot) {
  try {
    const gitConfigUri = vscode5.Uri.file(path4.join(workspaceRoot.fsPath, ".git", "config"));
    const bytes = await vscode5.workspace.fs.readFile(gitConfigUri);
    const text = new TextDecoder().decode(bytes);
    return parseGitHubRemote(text);
  } catch {
    return void 0;
  }
}
function parseGitHubRemote(gitConfig) {
  for (const line of gitConfig.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("url =")) {
      continue;
    }
    const url = trimmed.replace(/^url\s*=\s*/, "").trim();
    const match = url.match(GITHUB_REMOTE_REGEX);
    if (match) {
      return match[1];
    }
  }
  return void 0;
}
async function isGitRepo(workspaceRoot) {
  try {
    const gitDirUri = vscode5.Uri.file(path4.join(workspaceRoot.fsPath, ".git"));
    const stat = await vscode5.workspace.fs.stat(gitDirUri);
    return stat.type === vscode5.FileType.Directory;
  } catch {
    return false;
  }
}

// src/lib/locusbuild.ts
var vscode6 = __toESM(require("vscode"));
var path5 = __toESM(require("path"));
var TEMPLATES = {
  nextjs: { services: { web: { path: ".", port: 8080, healthCheck: "/" } } },
  "react-vite": { services: { web: { path: ".", port: 8080, healthCheck: "/" } } },
  express: { services: { api: { path: ".", port: 8080, healthCheck: "/" } } },
  fastapi: { services: { api: { path: ".", port: 8080, healthCheck: "/health" } } },
  django: { services: { api: { path: ".", port: 8080, healthCheck: "/" } } },
  rails: { services: { api: { path: ".", port: 8080, healthCheck: "/" } } },
  dockerfile: { services: { web: { path: ".", port: 8080, healthCheck: "/" } } },
  "generic-node": { services: { web: { path: ".", port: 8080, healthCheck: "/" } } },
  "generic-python": { services: { api: { path: ".", port: 8080, healthCheck: "/" } } },
  unknown: null
};
function generateLocusBuild(projectType) {
  return TEMPLATES[projectType];
}
async function locusBuildUri(workspaceRoot) {
  return vscode6.Uri.file(path5.join(workspaceRoot.fsPath, ".locusbuild"));
}
async function readLocusBuild(workspaceRoot) {
  try {
    const uri = await locusBuildUri(workspaceRoot);
    const bytes = await vscode6.workspace.fs.readFile(uri);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text);
  } catch {
    return null;
  }
}
async function writeLocusBuild(workspaceRoot, config) {
  const uri = await locusBuildUri(workspaceRoot);
  const content = new TextEncoder().encode(JSON.stringify(config, null, 2) + "\n");
  await vscode6.workspace.fs.writeFile(uri, content);
  return uri;
}
async function locusBuildExists(workspaceRoot) {
  try {
    const uri = await locusBuildUri(workspaceRoot);
    await vscode6.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

// src/lib/dockerfile.ts
var vscode7 = __toESM(require("vscode"));
var path6 = __toESM(require("path"));
var PROJECT_TYPES_NEEDING_DOCKERFILE = /* @__PURE__ */ new Set([
  "react-vite"
]);
function needsDockerfileFix(projectType) {
  return PROJECT_TYPES_NEEDING_DOCKERFILE.has(projectType);
}
var TEMPLATES2 = {
  // Pure-Node template — avoids base images Locus's ECR mirror may not carry
  // (caddy/nginx are not guaranteed to be mirrored; node is).
  // Uses \`serve -s\` which handles SPA routing (rewrites 404 → index.html).
  "react-vite": `# Auto-generated by Locus Deploy.
# Builds a Vite/React static site and serves it on port 8080.

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
`
};
function dockerfileTemplate(projectType) {
  return TEMPLATES2[projectType];
}
function dockerfileUri(workspaceRoot) {
  return vscode7.Uri.file(path6.join(workspaceRoot.fsPath, "Dockerfile"));
}
async function dockerfileExists(workspaceRoot) {
  try {
    await vscode7.workspace.fs.stat(dockerfileUri(workspaceRoot));
    return true;
  } catch {
    return false;
  }
}
async function writeDockerfile(workspaceRoot, content) {
  const uri = dockerfileUri(workspaceRoot);
  await vscode7.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
  return uri;
}

// src/lib/git.ts
var vscode8 = __toESM(require("vscode"));
async function getGitApi() {
  const ext = vscode8.extensions.getExtension("vscode.git");
  if (!ext) {
    return void 0;
  }
  const exports2 = ext.isActive ? ext.exports : await ext.activate();
  return exports2.getAPI(1);
}
async function findRepository(workspaceRoot) {
  const api = await getGitApi();
  if (!api) {
    return void 0;
  }
  return api.repositories.find((r) => r.rootUri.fsPath === workspaceRoot.fsPath);
}
async function commitAndPushFile(workspaceRoot, opts) {
  const repo = await findRepository(workspaceRoot);
  if (!repo) {
    return { ok: false, reason: "No git repository detected in this workspace." };
  }
  try {
    await repo.add([opts.filePath]);
    await repo.commit(opts.commitMessage);
  } catch (err) {
    return { ok: false, reason: `git commit failed: ${err.message}` };
  }
  const branch = repo.state.HEAD?.name;
  const hasUpstream = Boolean(repo.state.HEAD?.upstream);
  try {
    if (hasUpstream) {
      await repo.push();
    } else if (branch) {
      await repo.push("origin", branch, true);
    } else {
      return { ok: false, reason: "Commit created, but could not push \u2014 branch has no name." };
    }
  } catch (err) {
    return { ok: false, reason: `git push failed: ${err.message}` };
  }
  return { ok: true };
}

// src/providers/LogOutputProvider.ts
var vscode9 = __toESM(require("vscode"));
var LogOutputProvider = class {
  constructor(_client) {
    this._client = _client;
    this._channels = /* @__PURE__ */ new Map();
  }
  getOrCreateChannel(name) {
    const existing = this._channels.get(name);
    if (existing) {
      return existing;
    }
    const channel = vscode9.window.createOutputChannel(`Locus: ${name}`);
    this._channels.set(name, channel);
    return channel;
  }
  disposeChannel(name) {
    this._channels.get(name)?.dispose();
    this._channels.delete(name);
  }
  disposeAll() {
    for (const channel of this._channels.values()) {
      channel.dispose();
    }
    this._channels.clear();
  }
  // Phase 2: streams deployment build + runtime logs (phase-aware SSE)
  async streamDeploymentLogs(deploymentId, channel, signal) {
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
  async streamServiceLogs(serviceId, channel, signal) {
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
};

// src/commands/deploy.ts
var POLL_INTERVAL_MS = 6e4;
var POLL_TIMEOUT_MS = 15 * 6e4;
var SERVICE_DISCOVERY_DELAY_MS = 6e4;
var REPO_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
var GITHUB_URL_REGEX = /github\.com[/:]([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/;
function normaliseRepo(input) {
  const trimmed = input.trim();
  if (REPO_REGEX.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(GITHUB_URL_REGEX);
  return match ? match[1] : void 0;
}
function registerDeployCommand(context, client) {
  const logProvider = new LogOutputProvider(client);
  context.subscriptions.push(
    vscode10.commands.registerCommand("locus.deploy", async () => {
      try {
        await runDeploy(context, client, logProvider);
      } catch (err) {
        handleDeployError(err);
        setState("failed");
      }
    })
  );
  context.subscriptions.push({ dispose: () => logProvider.disposeAll() });
}
async function runDeploy(context, client, logProvider) {
  const apiKey = await ensureApiKey(context, client);
  if (!apiKey) {
    return;
  }
  await vscode10.window.withProgress(
    { location: vscode10.ProgressLocation.Notification, title: "Locus: Verifying credentials..." },
    async () => {
      await client.verifyOrRefreshToken();
    }
  );
  const balance = await client.getBillingBalance();
  if (balance.creditBalance < 0.25) {
    const action = await vscode10.window.showErrorMessage(
      `Insufficient Locus credits ($${balance.creditBalance.toFixed(2)}). Each service costs $0.25/month.`,
      "Add Credits"
    );
    if (action === "Add Credits") {
      vscode10.env.openExternal(vscode10.Uri.parse("https://beta.buildwithlocus.com/billing"));
    }
    return;
  }
  if (balance.warnings && balance.warnings.length > 0) {
    for (const w of balance.warnings) {
      vscode10.window.showWarningMessage(`Locus: ${w.message}`);
    }
  }
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode10.window.showErrorMessage("Open a folder first \u2014 deploy needs a workspace.");
    return;
  }
  setState("detecting");
  const detected = await detectProjectType(workspaceRoot);
  const projectType = await confirmProjectType(detected);
  if (!projectType) {
    setState("idle");
    return;
  }
  const dockerfileReady = await ensureDockerfileIfNeeded(workspaceRoot, projectType);
  if (!dockerfileReady) {
    setState("idle");
    return;
  }
  const hasLocusbuild = await locusBuildExists(workspaceRoot);
  if (!hasLocusbuild) {
    const template = generateLocusBuild(projectType);
    if (!template) {
      vscode10.window.showErrorMessage(
        "Could not auto-generate a .locusbuild for this project. Create one manually and retry."
      );
      setState("idle");
      return;
    }
    const uri = await writeLocusBuild(workspaceRoot, template);
    const doc = await vscode10.workspace.openTextDocument(uri);
    await vscode10.window.showTextDocument(doc, { preview: false });
    const confirm = await vscode10.window.showInformationMessage(
      "Generated .locusbuild \u2014 review it, then deploy.",
      { modal: false },
      "Deploy",
      "Cancel"
    );
    if (confirm !== "Deploy") {
      setState("idle");
      return;
    }
  }
  const locusbuild = await readLocusBuild(workspaceRoot);
  if (locusbuild) {
    try {
      const verify = await client.verifyLocusbuild(locusbuild);
      if (!verify.valid) {
        vscode10.window.showErrorMessage(
          `Invalid .locusbuild: ${verify.errors.join("; ")}`
        );
        setState("idle");
        return;
      }
    } catch (err) {
      console.warn("verify-locusbuild failed, continuing:", err);
    }
  }
  const repoSlug = await ensureGitHubRepo(workspaceRoot);
  if (!repoSlug) {
    setState("idle");
    return;
  }
  let result;
  const projects = await client.listProjects();
  const existing = projects.find((p) => p.name === repoSlug.split("/")[1] || p.name === repoSlug);
  if (existing) {
    const environments = await client.listEnvironments(existing.id);
    const env3 = environments[0];
    if (!env3) {
      vscode10.window.showErrorMessage(`Project exists but has no environments. Clean it up in the dashboard.`);
      setState("idle");
      return;
    }
    const services = await client.listServices(env3.id);
    const service2 = services[0];
    if (!service2) {
      result = await callFromRepo(client, repoSlug);
    } else {
      const deployment2 = await client.triggerDeployment(service2.id);
      result = {
        project: existing,
        environment: env3,
        services: [service2],
        deployments: [deployment2]
      };
      vscode10.window.showInformationMessage(
        `Redeploying existing project "${existing.name}"...`
      );
    }
  } else {
    result = await callFromRepo(client, repoSlug);
  }
  const service = result.services[0];
  const deployment = result.deployments[0];
  if (!service || !deployment) {
    vscode10.window.showErrorMessage("Deployment kicked off but response was malformed.");
    setState("failed");
    return;
  }
  const state = {
    projectId: result.project.id,
    environmentId: result.environment.id,
    serviceId: service.id,
    serviceName: service.name,
    serviceUrl: service.url,
    deploymentId: deployment.id,
    repoSlug
  };
  await context.globalState.update("locus.lastDeploy", state);
  const channel = logProvider.getOrCreateChannel(repoSlug);
  channel.show(true);
  channel.appendLine(`\u{1F680} Deployment started \u2014 ${(/* @__PURE__ */ new Date()).toISOString()}`);
  channel.appendLine(`   Project:    ${result.project.name} (${result.project.id})`);
  channel.appendLine(`   Service:    ${service.name} (${service.id})`);
  channel.appendLine(`   Deployment: ${deployment.id}`);
  channel.appendLine(`   Repo:       ${repoSlug}`);
  channel.appendLine("");
  setState("building");
  const logAbort = new AbortController();
  const logPromise = logProvider.streamDeploymentLogs(deployment.id, channel, logAbort.signal).catch((err) => {
    if (err?.name === "AbortError") {
      return;
    }
    channel.appendLine(`\u26A0 Log stream disconnected: ${err?.message ?? err}`);
  });
  try {
    const final = await pollDeployment(client, deployment.id, channel);
    if (final.status === "healthy") {
      channel.appendLine("");
      channel.appendLine(`\u2705 Deployment healthy. Waiting ${SERVICE_DISCOVERY_DELAY_MS / 1e3}s for service discovery...`);
      setState("deploying");
      await sleep(SERVICE_DISCOVERY_DELAY_MS);
      channel.appendLine(`\u{1F310} Live at: ${service.url}`);
      setState("healthy", service.url);
      const action = await vscode10.window.showInformationMessage(
        `Locus: ${service.name} is live at ${service.url}`,
        "Open in Browser",
        "View Logs"
      );
      if (action === "Open in Browser") {
        vscode10.env.openExternal(vscode10.Uri.parse(service.url));
      } else if (action === "View Logs") {
        channel.show();
      }
    } else if (final.status === "failed") {
      channel.appendLine("");
      channel.appendLine(`\u274C Deployment failed.`);
      logAbort.abort();
      await logPromise;
      await handleFailure({
        context,
        client,
        logProvider,
        channel,
        state,
        projectType,
        workspaceRoot
      });
    } else {
      channel.appendLine("");
      channel.appendLine(`\u26A0 Deployment ended with status: ${final.status}`);
      setState("idle");
    }
  } finally {
    logAbort.abort();
    await logPromise;
  }
}
async function ensureApiKey(context, client) {
  const stored = await findStoredApiKey(context.secrets);
  if (stored) {
    return stored.key;
  }
  const apiKey = await vscode10.window.showInputBox({
    prompt: "Enter your Locus Build API key",
    password: true,
    placeHolder: "claw_...",
    ignoreFocusOut: true,
    validateInput: (v) => v && !v.startsWith("claw_") ? "Key must start with claw_" : null
  });
  if (!apiKey) {
    return void 0;
  }
  await context.secrets.store("locus.buildApiKey", apiKey);
  client.clearTokenCache();
  return apiKey;
}
async function confirmProjectType(detected) {
  const detectedLabel = PROJECT_TYPE_LABELS[detected];
  if (detected === "unknown") {
    vscode10.window.showWarningMessage(
      "Could not auto-detect a framework. Pick one, or cancel and add a Dockerfile/.locusbuild manually."
    );
  }
  const choices = [
    {
      label: `$(check) Use detected: ${detectedLabel}`,
      description: detected,
      detail: "Generate a .locusbuild based on this detection"
    },
    { label: "", kind: vscode10.QuickPickItemKind.Separator },
    ...Object.entries(PROJECT_TYPE_LABELS).filter(([k]) => k !== detected && k !== "unknown").map(([k, label]) => ({ label, description: k })),
    { label: "$(close) Cancel", description: "cancel" }
  ];
  const pick = await vscode10.window.showQuickPick(choices, {
    title: "Locus: Confirm project type",
    placeHolder: `Detected: ${detectedLabel}`,
    ignoreFocusOut: true
  });
  if (!pick || pick.description === "cancel") {
    return void 0;
  }
  if (pick.description === detected || pick.label.startsWith("$(check)")) {
    return detected === "unknown" ? void 0 : detected;
  }
  return pick.description;
}
async function ensureDockerfileIfNeeded(workspaceRoot, projectType) {
  if (!needsDockerfileFix(projectType)) {
    return true;
  }
  if (await dockerfileExists(workspaceRoot)) {
    return true;
  }
  const template = dockerfileTemplate(projectType);
  if (!template) {
    return true;
  }
  const label = PROJECT_TYPE_LABELS[projectType];
  const choice = await vscode10.window.showWarningMessage(
    `Locus: ${label} projects need a Dockerfile to bind to port 8080. Nixpacks' default serves on port 80 and will fail health checks. Generate one now?`,
    { modal: true },
    "Generate Dockerfile",
    "Deploy anyway"
  );
  if (choice === "Deploy anyway") {
    vscode10.window.showWarningMessage(
      "Proceeding without a Dockerfile. Deployment is likely to fail at runtime health check."
    );
    return true;
  }
  if (choice !== "Generate Dockerfile") {
    return false;
  }
  const uri = await writeDockerfile(workspaceRoot, template);
  const doc = await vscode10.workspace.openTextDocument(uri);
  await vscode10.window.showTextDocument(doc, { preview: false });
  const commitChoice = await vscode10.window.showInformationMessage(
    "Dockerfile written. Locus builds from GitHub, so we need to commit + push before deploying.",
    { modal: true },
    "Commit & push",
    `I'll commit manually`,
    "Cancel"
  );
  if (commitChoice === "Cancel" || !commitChoice) {
    return false;
  }
  if (commitChoice === `I'll commit manually`) {
    vscode10.window.showInformationMessage(
      'Commit the Dockerfile and push to your default branch, then run "Locus: Deploy Workspace" again.'
    );
    return false;
  }
  const result = await vscode10.window.withProgress(
    { location: vscode10.ProgressLocation.Notification, title: "Locus: Committing Dockerfile..." },
    async () => commitAndPushFile(workspaceRoot, {
      filePath: dockerfileUri(workspaceRoot).fsPath,
      commitMessage: "Add Dockerfile for Locus deploy (port 8080)"
    })
  );
  if (!result.ok) {
    const action = await vscode10.window.showErrorMessage(
      `Could not commit + push automatically: ${result.reason}`,
      "Open terminal",
      "Cancel"
    );
    if (action === "Open terminal") {
      const terminal = vscode10.window.createTerminal("Locus");
      terminal.show();
      terminal.sendText('git add Dockerfile && git commit -m "Add Dockerfile for Locus deploy" && git push');
    }
    return false;
  }
  vscode10.window.showInformationMessage("Dockerfile committed and pushed. Continuing deploy...");
  return true;
}
async function ensureGitHubRepo(workspaceRoot) {
  const config = vscode10.workspace.getConfiguration("locus");
  const saved = config.get("githubRepo");
  if (saved && REPO_REGEX.test(saved)) {
    return saved;
  }
  const detected = await detectGitHubRemote(workspaceRoot);
  if (detected) {
    const confirm = await vscode10.window.showInformationMessage(
      `Locus: Deploy from GitHub repo "${detected}"?`,
      { modal: false },
      "Yes",
      "Use a different repo"
    );
    if (confirm === "Yes") {
      await config.update("githubRepo", detected, vscode10.ConfigurationTarget.Workspace);
      return detected;
    }
    if (!confirm) {
      return void 0;
    }
  } else {
    const notGit = !await isGitRepo(workspaceRoot);
    if (notGit) {
      const action = await vscode10.window.showWarningMessage(
        "This folder has no git repository. Push your code to GitHub first, then deploy.",
        "Enter repo manually"
      );
      if (action !== "Enter repo manually") {
        return void 0;
      }
    } else {
      const action = await vscode10.window.showWarningMessage(
        'No GitHub remote found. Add one with "git remote add origin https://github.com/owner/repo" and push, or enter the repo manually.',
        "Enter repo manually"
      );
      if (action !== "Enter repo manually") {
        return void 0;
      }
    }
  }
  const input = await vscode10.window.showInputBox({
    prompt: "GitHub repo \u2014 paste the URL or enter owner/repo",
    placeHolder: "e.g. https://github.com/owner/repo  or  owner/repo",
    ignoreFocusOut: true,
    validateInput: (v) => {
      if (!v) {
        return "Required";
      }
      return normaliseRepo(v) ? null : "Could not parse a GitHub repo from that input";
    }
  });
  if (!input) {
    return void 0;
  }
  const repo = normaliseRepo(input);
  await config.update("githubRepo", repo, vscode10.ConfigurationTarget.Workspace);
  return repo;
}
async function callFromRepo(client, repoSlug) {
  return vscode10.window.withProgress(
    { location: vscode10.ProgressLocation.Notification, title: `Locus: Creating project from ${repoSlug}...` },
    async () => {
      const region = vscode10.workspace.getConfiguration("locus").get("defaultRegion") ?? "us-east-1";
      const name = repoSlug.split("/")[1];
      return client.fromRepo(repoSlug, "main", name, region);
    }
  );
}
async function pollDeployment(client, deploymentId, channel) {
  const startTime = Date.now();
  let lastStatus = null;
  for (; ; ) {
    if (Date.now() - startTime > POLL_TIMEOUT_MS) {
      channel.appendLine(`\u26A0 Polling timed out after ${POLL_TIMEOUT_MS / 6e4} minutes.`);
      throw new Error("Deployment polling timeout");
    }
    const deployment = await client.getDeployment(deploymentId);
    if (deployment.status !== lastStatus) {
      channel.appendLine(`[${(/* @__PURE__ */ new Date()).toISOString()}] Status: ${deployment.status}`);
      updateStatusBarForStatus(deployment.status);
      lastStatus = deployment.status;
    }
    if (TERMINAL_STATUSES.includes(deployment.status)) {
      return deployment;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}
function updateStatusBarForStatus(status) {
  switch (status) {
    case "queued":
    case "building":
      setState("building");
      break;
    case "deploying":
      setState("deploying");
      break;
    case "healthy":
      break;
    case "failed":
    case "cancelled":
    case "rolled_back":
      setState("failed");
      break;
  }
}
async function fetchFullLogs(client, deploymentId, channel) {
  channel.appendLine("");
  channel.appendLine("\u2500\u2500\u2500 Fetching full deployment logs \u2500\u2500\u2500");
  let renderedLines = [];
  let phase = "unknown";
  try {
    const result = await client.getDeploymentLogs(deploymentId);
    const rawLogs = result.logs ?? [];
    phase = result.phase ?? "unknown";
    if (result.reason) {
      channel.appendLine(`Reason: ${result.reason}`);
    }
    channel.appendLine(`Phase at failure: ${phase}`);
    channel.appendLine(`Total log lines: ${rawLogs.length}`);
    channel.appendLine("");
    renderedLines = rawLogs.map(formatLogLine);
    const tail = renderedLines.slice(-100);
    for (const line of tail) {
      channel.appendLine(line);
    }
  } catch (err) {
    channel.appendLine(`\u26A0 Could not fetch full logs: ${err.message}`);
    try {
      const deployment = await client.getDeployment(deploymentId);
      if (deployment.lastLogs) {
        renderedLines = deployment.lastLogs.map(formatLogLine);
        for (const line of renderedLines) {
          channel.appendLine(line);
        }
      }
    } catch {
    }
  }
  return { phase, renderedLines };
}
async function handleFailure(args) {
  const { context, client, channel, state, projectType, workspaceRoot } = args;
  const { phase, renderedLines } = await fetchFullLogs(client, state.deploymentId, channel);
  setState("failed");
  const payKey = await findStoredPayKey(context.secrets);
  if (payKey) {
    try {
      channel.appendLine("");
      channel.appendLine("\u{1F916} Running AI diagnosis...");
      const diagnosis = await vscode10.window.withProgress(
        { location: vscode10.ProgressLocation.Notification, title: "Locus: AI diagnosing failure..." },
        () => diagnoseFailure(payKey, {
          phase,
          logs: renderedLines,
          projectType,
          workspaceRoot,
          repoSlug: state.repoSlug
        })
      );
      await presentAiDiagnosis(diagnosis, args);
      return;
    } catch (err) {
      const message = err instanceof AnthropicError ? `AI diagnosis failed (HTTP ${err.statusCode}): ${err.message}` : `AI diagnosis failed: ${err.message}`;
      channel.appendLine(`\u26A0 ${message}`);
      channel.appendLine("   Falling back to pattern-based diagnosis.");
    }
  } else {
    offerPayKeySetup(context);
  }
  const regex = classifyFailure(renderedLines, phase);
  await presentRegexDiagnosis(regex, channel);
}
function offerPayKeySetup(context) {
  vscode10.window.showInformationMessage(
    "Tip: Configure a Locus Pay key to get AI-powered failure diagnosis and auto-fix.",
    "Configure"
  ).then((action) => {
    if (action === "Configure") {
      vscode10.commands.executeCommand("locus.configurePayApiKey");
    }
  });
}
async function presentAiDiagnosis(diagnosis, args) {
  const { channel } = args;
  channel.appendLine("");
  channel.appendLine(`\u{1F916} AI Diagnosis (${diagnosis.confidence} confidence \xB7 owner: ${diagnosis.owner})`);
  channel.appendLine(`   ${diagnosis.summary}`);
  channel.appendLine("");
  for (const line of diagnosis.rootCause.split("\n")) {
    channel.appendLine(`   ${line}`);
  }
  if (diagnosis.fix) {
    channel.appendLine("");
    channel.appendLine(`   \u{1F4A1} Proposed fix: ${diagnosis.fix.description}`);
    channel.appendLine(`      File: ${diagnosis.fix.file}`);
  }
  const actions = [];
  if (diagnosis.fix) {
    actions.push("Apply & redeploy", "Preview fix", "View logs");
  } else {
    actions.push("View logs");
    if (diagnosis.owner === "user" || diagnosis.owner === "config") {
      actions.push("Retry");
    }
  }
  const action = await vscode10.window.showErrorMessage(diagnosis.summary, ...actions);
  if (action === "Apply & redeploy" && diagnosis.fix) {
    await applyFixAndRedeploy(diagnosis.fix, args);
  } else if (action === "Preview fix" && diagnosis.fix) {
    await previewFix(diagnosis.fix);
    const confirm = await vscode10.window.showInformationMessage(
      "Apply this fix, commit, push, and redeploy?",
      { modal: true },
      "Apply & redeploy",
      "Cancel"
    );
    if (confirm === "Apply & redeploy") {
      await applyFixAndRedeploy(diagnosis.fix, args);
    }
  } else if (action === "View logs") {
    channel.show();
  } else if (action === "Retry") {
    vscode10.commands.executeCommand("locus.deploy");
  }
}
async function previewFix(fix) {
  const language = inferLanguage(fix.file);
  const doc = await vscode10.workspace.openTextDocument({ content: fix.content, language });
  await vscode10.window.showTextDocument(doc, { preview: true });
}
function inferLanguage(filePath) {
  if (/\.json$/.test(filePath) || filePath === ".locusbuild") {
    return "json";
  }
  if (/Dockerfile$/.test(filePath)) {
    return "dockerfile";
  }
  if (/\.(ts|tsx)$/.test(filePath)) {
    return "typescript";
  }
  if (/\.(js|jsx|mjs|cjs)$/.test(filePath)) {
    return "javascript";
  }
  if (/\.ya?ml$/.test(filePath)) {
    return "yaml";
  }
  if (/\.toml$/.test(filePath)) {
    return "toml";
  }
  return void 0;
}
async function applyFixAndRedeploy(fix, args) {
  const { context, client, logProvider, channel, state, workspaceRoot } = args;
  const fileUri = vscode10.Uri.file(path7.join(workspaceRoot.fsPath, fix.file));
  channel.appendLine("");
  channel.appendLine(`\u{1F527} Applying fix: ${fix.description}`);
  channel.appendLine(`   File: ${fix.file}`);
  try {
    await vscode10.workspace.fs.writeFile(fileUri, new TextEncoder().encode(fix.content));
  } catch (err) {
    channel.appendLine(`\u274C Could not write file: ${err.message}`);
    vscode10.window.showErrorMessage(`Locus: Could not write ${fix.file} \u2014 ${err.message}`);
    return;
  }
  channel.appendLine(`   Committing: ${fix.commitMessage}`);
  const result = await vscode10.window.withProgress(
    { location: vscode10.ProgressLocation.Notification, title: "Locus: Committing + pushing fix..." },
    () => commitAndPushFile(workspaceRoot, {
      filePath: fileUri.fsPath,
      commitMessage: fix.commitMessage
    })
  );
  if (!result.ok) {
    channel.appendLine(`\u274C Could not commit + push: ${result.reason}`);
    vscode10.window.showErrorMessage(`Locus: Fix written but not pushed \u2014 ${result.reason}`);
    return;
  }
  channel.appendLine("\u2705 Pushed to GitHub. Triggering new deployment...");
  let newDeployment;
  try {
    newDeployment = await client.triggerDeployment(state.serviceId);
  } catch (err) {
    channel.appendLine(`\u274C Could not trigger deployment: ${err.message}`);
    vscode10.window.showErrorMessage(`Locus: Could not trigger redeploy \u2014 ${err.message}`);
    return;
  }
  const newState = { ...state, deploymentId: newDeployment.id };
  await context.globalState.update("locus.lastDeploy", newState);
  channel.appendLine(`\u{1F680} New deployment: ${newDeployment.id}`);
  channel.appendLine("");
  setState("building");
  const logAbort = new AbortController();
  const logPromise = logProvider.streamDeploymentLogs(newDeployment.id, channel, logAbort.signal).catch((err) => {
    if (err?.name === "AbortError") {
      return;
    }
    channel.appendLine(`\u26A0 Log stream disconnected: ${err?.message ?? err}`);
  });
  try {
    const final = await pollDeployment(client, newDeployment.id, channel);
    if (final.status === "healthy") {
      channel.appendLine("");
      channel.appendLine(`\u2705 Fix worked! Waiting ${SERVICE_DISCOVERY_DELAY_MS / 1e3}s for service discovery...`);
      setState("deploying");
      await sleep(SERVICE_DISCOVERY_DELAY_MS);
      channel.appendLine(`\u{1F310} Live at: ${state.serviceUrl}`);
      setState("healthy", state.serviceUrl);
      const a = await vscode10.window.showInformationMessage(
        `Locus: Fix applied \u2014 ${state.serviceName} is live at ${state.serviceUrl}`,
        "Open in Browser"
      );
      if (a === "Open in Browser") {
        vscode10.env.openExternal(vscode10.Uri.parse(state.serviceUrl));
      }
    } else if (final.status === "failed") {
      channel.appendLine("");
      channel.appendLine(`\u274C Fix did not resolve the issue. Re-diagnosing...`);
      logAbort.abort();
      await logPromise;
      await handleFailure({ ...args, state: newState });
    } else {
      channel.appendLine("");
      channel.appendLine(`\u26A0 Deployment ended with status: ${final.status}`);
      setState("idle");
    }
  } finally {
    logAbort.abort();
    await logPromise;
  }
}
async function presentRegexDiagnosis(diagnosis, channel) {
  const actions = [];
  if (diagnosis.kind === "platform") {
    actions.push("Retry", "View Logs");
  } else {
    actions.push("View Logs", "Retry");
  }
  const action = await vscode10.window.showErrorMessage(diagnosis.userMessage, ...actions);
  if (action === "View Logs") {
    channel.show();
  } else if (action === "Retry") {
    vscode10.commands.executeCommand("locus.deploy");
  }
}
function classifyFailure(logs, phase) {
  const tail = logs.slice(-200).join("\n");
  if (phase === "building" || phase === "build" || phase === "queued") {
    if (/failed to resolve source metadata|not found.*dockerhub\/library|manifest.*not found/i.test(tail)) {
      const match = tail.match(/dockerhub\/library\/([a-z0-9._-]+:[a-z0-9._-]+)/i);
      const imageName = match ? match[1] : "a base image";
      return {
        kind: "platform",
        userMessage: `Locus's image mirror does not carry \`${imageName}\`. Swap your Dockerfile's FROM line to a mirrored image \u2014 node:20-alpine and most official language images work.`
      };
    }
    if (/npm ERR!|Build failed|error TS\d+|Error: Cannot find module/i.test(tail)) {
      return {
        kind: "user-code",
        userMessage: "Build failed in your project code. Check the logs \u2014 likely a missing dependency, TypeScript error, or Node build error."
      };
    }
    if (/DATABASE_URL.*(?:not set|undefined|required)|AUTH_SECRET.*(?:not set|required)/i.test(tail)) {
      return {
        kind: "user-code",
        userMessage: "Build failed due to a missing environment variable. Add it via the env var manager and redeploy."
      };
    }
    if (/Nixpacks.*(?:failed|could not detect)/i.test(tail)) {
      return {
        kind: "user-code",
        userMessage: "Locus could not auto-detect how to build your project. Add a Dockerfile or a .locusbuild config."
      };
    }
    return {
      kind: "unknown",
      userMessage: "Build failed. Check the full logs below for the exact error."
    };
  }
  if (phase === "deploying" || phase === "runtime") {
    if (/SIGTERM/i.test(tail) && /exit_code":\s*0|shutdown complete/i.test(tail)) {
      return {
        kind: "user-code",
        userMessage: "Your container started and ran briefly, then was killed by Locus (SIGTERM). This is almost always a failed health check: the app is not responding on port 8080 at the configured healthCheck path. For Vite/React static sites, the server inside the container may be binding to the wrong port."
      };
    }
    if (/health.?check.*fail|unhealthy|task.*stopped.*health/i.test(tail)) {
      return {
        kind: "user-code",
        userMessage: "Health check failed. Your container needs to respond 200 OK on port 8080 at the healthCheck path in your .locusbuild."
      };
    }
    if (/Error:.*(?:ENOENT|EADDRINUSE|EACCES)|uncaught exception|fatal error/i.test(tail)) {
      return {
        kind: "user-code",
        userMessage: "Your container crashed at startup. Check the logs for the exception \u2014 typically a missing file, port in use, or permission issue."
      };
    }
    if (/caddy/i.test(tail) && /srv0/i.test(tail)) {
      return {
        kind: "user-code",
        userMessage: "Locus built your static site with Caddy. It started but failed health checks \u2014 typically because Caddy binds to port 80/443 inside the container, not 8080. Add a Dockerfile or .locusbuild buildConfig that serves on PORT=8080."
      };
    }
    return {
      kind: "user-code",
      userMessage: "Your container failed to stay healthy. Most common causes: (1) app not listening on port 8080, (2) app crashed at startup, (3) healthCheck path returns non-200. Check the logs below."
    };
  }
  if (/ECR.*unauthorized|registry.*timeout|rate.?limit/i.test(tail)) {
    return {
      kind: "platform",
      userMessage: "Locus platform error talking to their image registry. Retry usually works."
    };
  }
  return {
    kind: "unknown",
    userMessage: `Deployment failed in phase "${phase}". Check the full logs below for details.`
  };
}
function handleDeployError(err) {
  if (err instanceof LocusError) {
    if (err.statusCode === 402) {
      vscode10.window.showErrorMessage(
        `Locus: Insufficient credits (balance $${err.creditBalance ?? "?"}, need $${err.requiredAmount ?? "?"}).`,
        "Add Credits"
      ).then((action) => {
        if (action === "Add Credits") {
          vscode10.env.openExternal(vscode10.Uri.parse("https://beta.buildwithlocus.com/billing"));
        }
      });
      return;
    }
    if (err.statusCode === 401) {
      vscode10.window.showErrorMessage(
        'Locus: Authentication failed. Run "Locus: Configure API Key" to re-enter your key.'
      );
      return;
    }
    vscode10.window.showErrorMessage(`Locus: ${err.message}${err.details ? ` \u2014 ${err.details}` : ""}`);
    return;
  }
  if (err instanceof Error) {
    vscode10.window.showErrorMessage(`Locus: ${err.message}`);
    return;
  }
  vscode10.window.showErrorMessage(`Locus: Unknown error \u2014 ${String(err)}`);
}
function getWorkspaceRoot() {
  return vscode10.workspace.workspaceFolders?.[0]?.uri;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/commands/rollback.ts
var vscode11 = __toESM(require("vscode"));
function registerRollbackCommand(context, _client) {
  context.subscriptions.push(
    vscode11.commands.registerCommand("locus.rollback", async (deploymentId) => {
      if (!deploymentId) {
        vscode11.window.showInformationMessage(
          "Rollback \u2014 right-click a deployment in the Services sidebar to use this."
        );
        return;
      }
      vscode11.window.showInformationMessage(`Rollback for ${deploymentId} \u2014 coming in Phase 3.`);
    })
  );
}

// src/commands/openUrl.ts
var vscode12 = __toESM(require("vscode"));
function registerOpenUrlCommand(context, _client) {
  context.subscriptions.push(
    vscode12.commands.registerCommand("locus.openUrl", async (serviceUrl) => {
      if (serviceUrl) {
        await vscode12.env.openExternal(vscode12.Uri.parse(serviceUrl));
        return;
      }
      vscode12.window.showInformationMessage(
        'No live URL yet. Deploy your workspace first with "Locus: Deploy Workspace".'
      );
    })
  );
}

// src/providers/ServiceTreeProvider.ts
var vscode13 = __toESM(require("vscode"));
var ServiceTreeProvider = class {
  constructor(_client) {
    this._client = _client;
    this._onDidChangeTreeData = new vscode13.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }
  refresh() {
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(element) {
    return element;
  }
  getChildren(_element) {
    return [];
  }
};

// src/extension.ts
function activate(context) {
  const client = new LocusClient(context.secrets);
  createStatusBar();
  context.subscriptions.push({ dispose });
  registerDeployCommand(context, client);
  context.subscriptions.push(
    vscode14.commands.registerCommand("locus.openSettings", async () => {
      const existing = await context.secrets.get("locus.buildApiKey");
      const key = await vscode14.window.showInputBox({
        prompt: "Enter your Locus Build API key",
        password: true,
        placeHolder: "claw_...",
        value: existing ? "(already set \u2014 enter new key to replace)" : "",
        validateInput: (v) => {
          if (!v || v.startsWith("(already")) {
            return null;
          }
          return v.startsWith("claw_") ? null : "Key must start with claw_";
        }
      });
      if (!key || key.startsWith("(already")) {
        return;
      }
      await context.secrets.store("locus.buildApiKey", key);
      client.clearTokenCache();
      vscode14.window.showInformationMessage("Locus API key saved.");
    })
  );
  registerRollbackCommand(context, client);
  registerOpenUrlCommand(context, client);
  context.subscriptions.push(
    vscode14.commands.registerCommand("locus.viewLogs", () => {
      vscode14.window.showInformationMessage(
        "Log streaming will be available after your first deployment."
      );
    }),
    vscode14.commands.registerCommand("locus.restart", () => {
      vscode14.window.showInformationMessage(
        "Restart service \u2014 coming in Phase 3 (right-click a service in the sidebar)."
      );
    }),
    vscode14.commands.registerCommand("locus.manageEnvVars", () => {
      vscode14.window.showInformationMessage(
        "Environment variable manager \u2014 coming in Phase 4."
      );
    })
  );
  context.subscriptions.push(
    vscode14.commands.registerCommand("locus.configurePayApiKey", async () => {
      const existing = await findStoredPayKey(context.secrets);
      if (existing) {
        const action = await vscode14.window.showInformationMessage(
          "A Locus Pay API key is already saved. Replace it?",
          "Replace",
          "Clear",
          "Cancel"
        );
        if (action === "Clear") {
          await clearPayKey(context.secrets);
          vscode14.window.showInformationMessage("Locus Pay API key cleared.");
          return;
        }
        if (action !== "Replace") {
          return;
        }
      }
      const key = await promptForPayKey(context.secrets);
      if (key) {
        vscode14.window.showInformationMessage("Locus Pay API key saved.");
      }
    })
  );
  context.subscriptions.push(
    vscode14.commands.registerCommand("locus.deployNL", () => {
      vscode14.window.showInformationMessage(
        "AI-powered deploy \u2014 coming in Phase 6 (Tier 3 stretch)."
      );
    }),
    vscode14.commands.registerCommand("locus.provisionTenant", () => {
      vscode14.window.showInformationMessage(
        "Multi-tenant provisioner \u2014 coming in Phase 6 (Tier 3 stretch)."
      );
    })
  );
  const treeProvider = new ServiceTreeProvider(client);
  context.subscriptions.push(
    vscode14.window.registerTreeDataProvider("locus.serviceExplorer", treeProvider),
    vscode14.window.registerTreeDataProvider("locus.deploymentHistory", treeProvider),
    vscode14.commands.registerCommand("locus.refreshServices", () => treeProvider.refresh())
  );
}
function deactivate() {
  dispose();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
