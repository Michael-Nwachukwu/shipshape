import * as vscode from 'vscode';
import * as path from 'path';
import {
  LocusClient,
  FromRepoResult,
} from '../lib/locus';
import { showError } from '../lib/errorFormat';
import { findStoredApiKey, findStoredAiKey, promptForAiKey } from '../lib/credentials';
import { complete, extractJson, GeminiError } from '../lib/gemini';
import { detectGitHubRemote } from '../lib/gitRemote';
import { readLocusBuild, writeLocusBuild, locusBuildExists, locusBuildUri } from '../lib/locusbuild';
import { LogOutputProvider } from '../providers/LogOutputProvider';
import {
  pollDeployment,
  sleep,
  SERVICE_DISCOVERY_DELAY_MS,
} from '../lib/deployPolling';
import * as statusBar from '../statusBar';

// ─── Regexes for repo extraction from the user prompt ───────────────────────

// Full GitHub URL — captures (owner, repo)
const GITHUB_URL_IN_PROMPT = /github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[\/?#]|$)/i;
// Raw owner/repo form — only trusted as a fallback (may false-positive)
const RAW_OWNER_REPO = /(?:^|\s)([\w.-]+)\/([\w.-]+?)(?:\s|$)/;
// Validation regex used elsewhere
const REPO_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

interface ParsedRepo {
  repo: string;         // "owner/repo"
  source: 'url' | 'raw';
}

function parseRepoFromPrompt(prompt: string): ParsedRepo | undefined {
  const urlMatch = prompt.match(GITHUB_URL_IN_PROMPT);
  if (urlMatch) {
    return { repo: `${urlMatch[1]}/${urlMatch[2]}`, source: 'url' };
  }
  return undefined;
}

function parseRawRepoFallback(prompt: string): ParsedRepo | undefined {
  const rawMatch = prompt.match(RAW_OWNER_REPO);
  if (rawMatch && REPO_REGEX.test(`${rawMatch[1]}/${rawMatch[2]}`)) {
    return { repo: `${rawMatch[1]}/${rawMatch[2]}`, source: 'raw' };
  }
  return undefined;
}

// ─── Gemini schema for .locusbuild output ───────────────────────────────────

const LOCUSBUILD_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    services: {
      type: 'OBJECT',
      description:
        'Map from service name to config. Service names must be short, lowercase, alphanumeric.',
      additionalProperties: {
        type: 'OBJECT',
        properties: {
          path: { type: 'STRING' },
          port: { type: 'INTEGER' },
          healthCheck: { type: 'STRING' },
          env: {
            type: 'OBJECT',
            nullable: true,
            additionalProperties: { type: 'STRING' },
          },
        },
        required: ['path', 'port', 'healthCheck'],
      },
    },
    addons: {
      type: 'OBJECT',
      nullable: true,
      additionalProperties: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['postgres', 'redis'] },
        },
        required: ['type'],
      },
    },
  },
  required: ['services'],
};

const SYSTEM_PROMPT = `You are a Locus deployment config generator.
Output ONLY valid JSON in .locusbuild format. No explanation. No markdown fences.
Schema:
{
  "services": {
    "<name>": { "path": string, "port": 8080, "healthCheck": string, "env"?: {} }
  },
  "addons"?: {
    "<name>": { "type": "postgres" | "redis" }
  }
}
Rules:
- port is always 8080
- Use \${{addonName.DATABASE_URL}} for database connections
- Use \${{serviceName.URL}} for cross-service references
- healthCheck should be "/health" for APIs, "/" for frontends
- Do NOT include a "buildConfig" field — it's not supported in .locusbuild
- Service names must be short lowercase alphanumeric (e.g. "web", "api", "worker")`;

interface GeneratedLocusBuild {
  services: Record<string, {
    path: string;
    port: number;
    healthCheck: string;
    env?: Record<string, string>;
  }>;
  addons?: Record<string, { type: 'postgres' | 'redis' }>;
}

// ─── Repo enrichment from GitHub public API ─────────────────────────────────

interface RepoHints {
  language?: string;
  description?: string;
  defaultBranch?: string;
}

async function fetchRepoHints(repo: string): Promise<RepoHints | undefined> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      return undefined;
    }
    const data = await res.json() as {
      language?: string;
      description?: string;
      default_branch?: string;
    };
    return {
      language: data.language,
      description: data.description ?? undefined,
      defaultBranch: data.default_branch,
    };
  } catch {
    return undefined;
  }
}

function hintsAsSystemSuffix(hints: RepoHints): string {
  const parts: string[] = [];
  if (hints.language) { parts.push(`primary language = ${hints.language}`); }
  if (hints.defaultBranch) { parts.push(`default branch = ${hints.defaultBranch}`); }
  if (hints.description) { parts.push(`description = ${hints.description}`); }
  if (parts.length === 0) { return ''; }
  return `\n\nRepository hints: ${parts.join(', ')}. Use these to pick sensible service types and health check paths.`;
}

async function workspacePackageJsonHints(workspaceRoot: vscode.Uri): Promise<string> {
  try {
    const pkgUri = vscode.Uri.file(path.join(workspaceRoot.fsPath, 'package.json'));
    const bytes = await vscode.workspace.fs.readFile(pkgUri);
    const pkg = JSON.parse(new TextDecoder().decode(bytes)) as {
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const deps = pkg.dependencies ? Object.keys(pkg.dependencies).slice(0, 30).join(', ') : '';
    const scripts = pkg.scripts ? JSON.stringify(pkg.scripts) : '';
    if (!deps && !scripts) { return ''; }
    return `\n\nWorkspace package.json hints: dependencies = [${deps}], scripts = ${scripts}. Use these to pick sensible service types and health check paths.`;
  } catch {
    return '';
  }
}

// ─── Deploy state persisted in globalState (same key as deploy.ts) ──────────

interface DeployState {
  projectId: string;
  environmentId: string;
  serviceId: string;
  serviceName: string;
  serviceUrl: string;
  deploymentId: string;
  repoSlug: string;
  serviceIds: string[];
}

// ─── Sanitation: enforce port 8080, strip buildConfig ───────────────────────

function sanitizeGenerated(
  raw: GeneratedLocusBuild,
  channel: vscode.OutputChannel
): GeneratedLocusBuild {
  const clean: GeneratedLocusBuild = { services: {} };
  for (const [name, svc] of Object.entries(raw.services ?? {})) {
    // Strip any buildConfig the model may have sneaked in (Rule 17).
    const { path: svcPath, port, healthCheck, env } = svc as GeneratedLocusBuild['services'][string] & { buildConfig?: unknown };
    if ('buildConfig' in svc) {
      channel.appendLine(
        `⚠ Stripped unsupported "buildConfig" from service "${name}" (Rule 17).`
      );
    }
    let finalPort = port;
    if (finalPort !== 8080) {
      channel.appendLine(
        `⚠ AI emitted port ${finalPort} for service "${name}"; forcing to 8080 (Rule 6).`
      );
      finalPort = 8080;
    }
    clean.services[name] = {
      path: svcPath ?? '.',
      port: finalPort,
      healthCheck: healthCheck ?? '/',
      ...(env ? { env } : {}),
    };
  }
  if (raw.addons) {
    clean.addons = {};
    for (const [name, a] of Object.entries(raw.addons)) {
      if (a?.type === 'postgres' || a?.type === 'redis') {
        clean.addons[name] = { type: a.type };
      }
    }
  }
  return clean;
}

// ─── Main command ───────────────────────────────────────────────────────────

export function registerDeployNLCommand(
  context: vscode.ExtensionContext,
  client: LocusClient,
  logProvider: LogOutputProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('shipshape.deployNL', async () => {
      try {
        await runDeployNL(context, client, logProvider);
      } catch (err) {
        await showError(err, 'AI Deploy failed');
        statusBar.setState('failed');
      }
    })
  );
}

async function runDeployNL(
  context: vscode.ExtensionContext,
  client: LocusClient,
  logProvider: LogOutputProvider
): Promise<void> {
  // ── Step 0: ensure Locus API key + AI key ──────────────────────────────────
  const apiKey = await ensureApiKey(context, client);
  if (!apiKey) { return; }

  let aiKey = await findStoredAiKey(context.secrets);
  if (!aiKey) {
    aiKey = await promptForAiKey(context.secrets, 'AI deploy needs a Gemini API key');
    if (!aiKey) { return; }
  }

  // ── Step 1: prompt for description ─────────────────────────────────────────
  const description = await vscode.window.showInputBox({
    prompt: 'Describe what you want to deploy',
    placeHolder: 'e.g. Deploy github.com/me/my-next-app with a Postgres DB',
    ignoreFocusOut: true,
  });
  if (!description) { return; }

  // ── Step 2: verify token ───────────────────────────────────────────────────
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'ShipShape: Verifying credentials...' },
    async () => { await client.verifyOrRefreshToken(); }
  );

  // ── Step 3: billing preflight (mandatory) ──────────────────────────────────
  const balance = await client.getBillingBalance();
  if (balance.creditBalance < 0.25) {
    const action = await vscode.window.showErrorMessage(
      `Insufficient Locus credits ($${balance.creditBalance.toFixed(2)}). ` +
        'Each service costs $0.25/month.',
      'Add Credits'
    );
    if (action === 'Add Credits') {
      vscode.env.openExternal(vscode.Uri.parse('https://beta.buildwithlocus.com/billing'));
    }
    return;
  }

  // ── Step 4: mode detection ─────────────────────────────────────────────────
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  const workspaceRepo = workspaceRoot ? await detectGitHubRemote(workspaceRoot) : undefined;

  const fromUrl = parseRepoFromPrompt(description);
  // Only trust raw owner/repo when there's no workspace (per spec)
  const fromRaw = (!workspaceRoot && !fromUrl) ? parseRawRepoFallback(description) : undefined;
  const parsed = fromUrl ?? fromRaw;

  const isRemoteMode =
    !!parsed && (!workspaceRepo || parsed.repo.toLowerCase() !== workspaceRepo.toLowerCase());

  if (isRemoteMode && parsed) {
    await runRemoteMode(context, client, logProvider, {
      aiKey,
      description,
      repo: parsed.repo,
    });
    return;
  }

  if (!workspaceRoot) {
    // Workspace mode requires a workspace — fall back to asking for a repo URL
    const repoInput = await vscode.window.showInputBox({
      prompt: 'No workspace open. Paste a GitHub repo URL or owner/repo to deploy remotely.',
      placeHolder: 'https://github.com/owner/repo or owner/repo',
      ignoreFocusOut: true,
      validateInput: (v) => {
        if (!v) { return 'Required'; }
        const a = parseRepoFromPrompt(v) ?? parseRawRepoFallback(` ${v} `);
        return a ? null : 'Could not parse a GitHub repo';
      },
    });
    if (!repoInput) { return; }
    const repo = parseRepoFromPrompt(repoInput)?.repo
      ?? parseRawRepoFallback(` ${repoInput} `)?.repo;
    if (!repo) { return; }
    await runRemoteMode(context, client, logProvider, {
      aiKey,
      description,
      repo,
    });
    return;
  }

  await runWorkspaceMode(context, client, logProvider, {
    aiKey,
    description,
    workspaceRoot,
  });
}

// ─── Remote mode (no local file I/O) ────────────────────────────────────────

interface RemoteArgs {
  aiKey: string;
  description: string;
  repo: string;
}

async function runRemoteMode(
  context: vscode.ExtensionContext,
  client: LocusClient,
  logProvider: LogOutputProvider,
  args: RemoteArgs
): Promise<void> {
  const { aiKey, description, repo } = args;

  // Guardrail: repo must match REPO_REGEX before any API call (Rule 3)
  if (!REPO_REGEX.test(repo)) {
    vscode.window.showErrorMessage(
      `ShipShape: "${repo}" doesn't look like a valid GitHub owner/repo.`
    );
    return;
  }

  // 1. Check repo access
  const access = await client.checkRepoAccess(repo);
  if (!access.accessible) {
    const action = await vscode.window.showErrorMessage(
      `This repo isn't connected. Visit https://beta.buildwithlocus.com/integrations to connect GitHub.`,
      'Open integrations'
    );
    if (action === 'Open integrations') {
      vscode.env.openExternal(vscode.Uri.parse('https://beta.buildwithlocus.com/integrations'));
    }
    return;
  }

  // 2. Optional enrichment via public GitHub API
  const hints = await fetchRepoHints(repo);
  let systemPrompt = SYSTEM_PROMPT;
  if (hints) {
    systemPrompt += hintsAsSystemSuffix(hints);
  }

  // 3-4. Gemini call + parse
  const generated = await generateLocusbuildWithAi(aiKey, systemPrompt, description);
  if (!generated) { return; } // error already surfaced

  // Set up the output channel early so sanitation warnings have a home
  const repoSlug = repo.split('/')[1];
  const channel = logProvider.getOrCreateChannel(repoSlug);
  channel.show(true);
  channel.appendLine(`🤖 AI deploy — ${new Date().toISOString()}`);
  channel.appendLine(`   Repo: ${repo}`);
  if (hints?.language) {
    channel.appendLine(`   Language hint: ${hints.language}`);
  }
  channel.appendLine('');

  const cleaned = sanitizeGenerated(generated, channel);

  // 5. Verify with the server
  const verify = await safeVerify(client, cleaned, channel);
  if (!verify.ok) {
    await offerRetry(context, verify.errors);
    return;
  }

  // 6. Preview
  const previewDoc = await vscode.workspace.openTextDocument({
    content: JSON.stringify(cleaned, null, 2),
    language: 'json',
  });
  await vscode.window.showTextDocument(previewDoc, { preview: false });

  // 7. Confirm
  const confirm = await vscode.window.showInformationMessage(
    `Deploy ${repo} with this config?`,
    { modal: true },
    'Deploy',
    'Edit First',
    'Cancel'
  );
  if (confirm === 'Edit First') {
    vscode.window.showInformationMessage(
      'Edit the preview, then run "ShipShape: Deploy with AI" again (the config will be regenerated from your next prompt).'
    );
    return;
  }
  if (confirm !== 'Deploy') { return; }

  // 8. Deploy via from-locusbuild
  statusBar.setState('building');
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `ShipShape: Creating ${repoSlug}...` },
    async () => {
      const region = vscode.workspace.getConfiguration('shipshape').get<string>('defaultRegion') ?? 'us-east-1';
      // Pass region via locusbuild top-level field if desired — spec allows it
      const locusbuild = { ...cleaned, region } as object;
      return client.fromLocusbuild({
        name: repoSlug,
        repo,
        branch: hints?.defaultBranch ?? 'main',
        locusbuild,
      });
    }
  );

  await driveDeployment(context, client, logProvider, channel, result, repoSlug);
}

// ─── Workspace mode (writes .locusbuild locally) ────────────────────────────

interface WorkspaceArgs {
  aiKey: string;
  description: string;
  workspaceRoot: vscode.Uri;
}

async function runWorkspaceMode(
  context: vscode.ExtensionContext,
  client: LocusClient,
  logProvider: LogOutputProvider,
  args: WorkspaceArgs
): Promise<void> {
  const { aiKey, description, workspaceRoot } = args;

  // 1. Build system prompt with workspace hints (package.json)
  let systemPrompt = SYSTEM_PROMPT + (await workspacePackageJsonHints(workspaceRoot));

  // 2. Gemini call
  const generated = await generateLocusbuildWithAi(aiKey, systemPrompt, description);
  if (!generated) { return; }

  // Output channel: we don't know the repoSlug yet, use the workspace folder name
  const folderName = path.basename(workspaceRoot.fsPath);
  const channel = logProvider.getOrCreateChannel(folderName);
  channel.show(true);
  channel.appendLine(`🤖 AI deploy — ${new Date().toISOString()}`);
  channel.appendLine(`   Workspace: ${workspaceRoot.fsPath}`);
  channel.appendLine('');

  const cleaned = sanitizeGenerated(generated, channel);

  // 3. Verify
  const verify = await safeVerify(client, cleaned, channel);
  if (!verify.ok) {
    await offerRetry(context, verify.errors);
    return;
  }

  // 4. Show diff against existing .locusbuild (if any), else open the new one
  const hadLocusbuild = await locusBuildExists(workspaceRoot);
  if (hadLocusbuild) {
    const targetUri = await locusBuildUri(workspaceRoot);
    // Open the freshly generated one as an untitled doc; diff against the current file
    const newDoc = await vscode.workspace.openTextDocument({
      content: JSON.stringify(cleaned, null, 2),
      language: 'json',
    });
    await vscode.commands.executeCommand(
      'vscode.diff',
      targetUri,
      newDoc.uri,
      '.locusbuild — AI Generated'
    );
  } else {
    const previewDoc = await vscode.workspace.openTextDocument({
      content: JSON.stringify(cleaned, null, 2),
      language: 'json',
    });
    await vscode.window.showTextDocument(previewDoc, { preview: false });
  }

  // 5. Confirm
  const confirm = await vscode.window.showInformationMessage(
    'Use this AI-generated .locusbuild?',
    { modal: true },
    'Deploy',
    'Edit First',
    'Cancel'
  );
  if (confirm === 'Edit First') {
    vscode.window.showInformationMessage(
      'Adjust the config, then re-run "ShipShape: Deploy with AI" when ready.'
    );
    return;
  }
  if (confirm !== 'Deploy') { return; }

  // 6. Write .locusbuild to workspace so the user's repo eventually gets it
  try {
    await writeLocusBuild(workspaceRoot, cleaned as never);
    channel.appendLine('✔ Wrote .locusbuild to workspace root');
  } catch (err) {
    channel.appendLine(`⚠ Could not write .locusbuild: ${(err as Error).message}`);
    // non-fatal — we still deploy via fromLocusbuild with the body config
  }

  // 7. Resolve/prompt for GitHub repo (same logic as deploy.ts)
  const config = vscode.workspace.getConfiguration('shipshape');
  let repoSlug = config.get<string>('shipshape.githubRepo') ?? config.get<string>('githubRepo');
  if (!repoSlug || !REPO_REGEX.test(repoSlug)) {
    const detected = await detectGitHubRemote(workspaceRoot);
    if (detected) {
      const useIt = await vscode.window.showInformationMessage(
        `ShipShape: Deploy from GitHub repo "${detected}"?`,
        'Yes',
        'Use a different repo'
      );
      if (useIt === 'Yes') {
        repoSlug = detected;
        await config.update('githubRepo', detected, vscode.ConfigurationTarget.Workspace);
      }
    }
    if (!repoSlug) {
      const input = await vscode.window.showInputBox({
        prompt: 'GitHub repo — paste the URL or enter owner/repo',
        placeHolder: 'e.g. https://github.com/owner/repo  or  owner/repo',
        ignoreFocusOut: true,
        validateInput: (v) => {
          if (!v) { return 'Required'; }
          const a = parseRepoFromPrompt(v) ?? parseRawRepoFallback(` ${v} `);
          return a ? null : 'Could not parse a GitHub repo';
        },
      });
      if (!input) { return; }
      repoSlug = parseRepoFromPrompt(input)?.repo
        ?? parseRawRepoFallback(` ${input} `)?.repo;
      if (!repoSlug) { return; }
      await config.update('githubRepo', repoSlug, vscode.ConfigurationTarget.Workspace);
    }
  }

  // Guardrail: real GitHub repo only
  if (!REPO_REGEX.test(repoSlug)) {
    vscode.window.showErrorMessage(`ShipShape: "${repoSlug}" is not a valid GitHub owner/repo.`);
    return;
  }

  // 8. Check for existing project (Rule 11)
  const name = repoSlug.split('/')[1];
  const projects = await client.listProjects();
  const existing = projects.find(p => p.name === name || p.name === repoSlug);
  if (existing) {
    const action = await vscode.window.showWarningMessage(
      `A project named "${existing.name}" already exists. AI deploy always creates fresh via from-locusbuild — continue anyway? The backend may reject a duplicate name.`,
      { modal: true },
      'Continue',
      'Cancel'
    );
    if (action !== 'Continue') { return; }
  }

  // 9. Deploy via from-locusbuild (always, per spec option A)
  statusBar.setState('building');
  const region = config.get<string>('defaultRegion') ?? 'us-east-1';
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `ShipShape: Creating ${name}...` },
    async () => client.fromLocusbuild({
      name,
      repo: repoSlug!,
      branch: 'main',
      locusbuild: { ...cleaned, region } as object,
    })
  );

  await driveDeployment(context, client, logProvider, channel, result, name);
}

// ─── Shared: drive the post-create deployment (logs + polling) ──────────────

async function driveDeployment(
  context: vscode.ExtensionContext,
  client: LocusClient,
  logProvider: LogOutputProvider,
  channel: vscode.OutputChannel,
  result: FromRepoResult,
  repoSlug: string
): Promise<void> {
  const service = result.services[0];
  const deployment = result.deployments[0];
  if (!service || !deployment) {
    vscode.window.showErrorMessage('Deployment kicked off but response was malformed.');
    statusBar.setState('failed');
    return;
  }

  const state: DeployState = {
    projectId: result.project.id,
    environmentId: result.environment.id,
    serviceId: service.id,
    serviceName: service.name,
    serviceUrl: service.url,
    deploymentId: deployment.id,
    repoSlug,
    serviceIds: result.services.map((s) => s.id),
  };
  await context.globalState.update('shipshape.lastDeploy', state);

  channel.appendLine(`🚀 Deployment started`);
  channel.appendLine(`   Project:    ${result.project.name} (${result.project.id})`);
  channel.appendLine(`   Service:    ${service.name} (${service.id})`);
  channel.appendLine(`   Deployment: ${deployment.id}`);
  channel.appendLine('');

  statusBar.setState('building');

  const logAbort = new AbortController();
  const logPromise = logProvider
    .streamDeploymentLogs(deployment.id, channel, logAbort.signal)
    .catch((err) => {
      if ((err as Error)?.name === 'AbortError') { return; }
      channel.appendLine(`⚠ Log stream disconnected: ${(err as Error)?.message ?? err}`);
    });

  try {
    const final = await pollDeployment(client, deployment.id, channel);
    if (final.status === 'healthy') {
      channel.appendLine('');
      channel.appendLine(
        `✅ Deployment healthy. Waiting ${SERVICE_DISCOVERY_DELAY_MS / 1000}s for service discovery...`
      );
      statusBar.setState('deploying');
      await sleep(SERVICE_DISCOVERY_DELAY_MS);
      channel.appendLine(`🌐 Live at: ${service.url}`);
      statusBar.setState('healthy', service.url);
      vscode.commands.executeCommand('shipshape.refreshServices');

      const action = await vscode.window.showInformationMessage(
        `ShipShape: ${service.name} is live at ${service.url}`,
        'Open in Browser',
        'View Logs'
      );
      if (action === 'Open in Browser') {
        vscode.env.openExternal(vscode.Uri.parse(service.url));
      } else if (action === 'View Logs') {
        channel.show();
      }
    } else if (final.status === 'failed') {
      channel.appendLine('');
      channel.appendLine('❌ Deployment failed.');
      try {
        const full = await client.getDeploymentLogs(deployment.id);
        if (full.reason) { channel.appendLine(`Reason: ${full.reason}`); }
        for (const line of (full.logs ?? []).slice(-100)) {
          channel.appendLine(typeof line === 'string' ? line : JSON.stringify(line));
        }
      } catch {
        // swallow — already surfaced above
      }
      statusBar.setState('failed');
      vscode.window.showErrorMessage('ShipShape: AI deploy failed. See the output channel for logs.');
    } else {
      channel.appendLine(`⚠ Deployment ended with status: ${final.status}`);
      statusBar.setState('idle');
    }
  } finally {
    logAbort.abort();
    await logPromise;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function ensureApiKey(
  context: vscode.ExtensionContext,
  client: LocusClient
): Promise<string | undefined> {
  const stored = await findStoredApiKey(context.secrets);
  if (stored) { return stored.key; }

  const apiKey = await vscode.window.showInputBox({
    prompt: 'Enter your Locus Build API key',
    password: true,
    placeHolder: 'claw_...',
    ignoreFocusOut: true,
    validateInput: (v) => (v && !v.startsWith('claw_') ? 'Key must start with claw_' : null),
  });
  if (!apiKey) { return undefined; }
  await context.secrets.store('shipshape.buildApiKey', apiKey);
  client.clearTokenCache();
  return apiKey;
}

async function generateLocusbuildWithAi(
  aiKey: string,
  systemPrompt: string,
  description: string
): Promise<GeneratedLocusBuild | undefined> {
  let raw: string;
  try {
    raw = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'ShipShape: Generating config with Gemini...' },
      () => complete(aiKey, {
        system: systemPrompt,
        userMessage: description,
        maxTokens: 4000,
        jsonMode: true,
        responseSchema: LOCUSBUILD_SCHEMA,
      })
    );
  } catch (err) {
    if (err instanceof GeminiError) {
      vscode.window.showErrorMessage(`ShipShape: Gemini error (${err.statusCode}): ${err.message}`);
    } else {
      vscode.window.showErrorMessage(`ShipShape: Gemini error: ${(err as Error).message}`);
    }
    return undefined;
  }

  try {
    return extractJson<GeneratedLocusBuild>(raw);
  } catch (err) {
    vscode.window.showErrorMessage(
      `ShipShape: Could not parse AI response as JSON. ${(err as Error).message}. ` +
      `First 300 chars: ${raw.slice(0, 300)}`
    );
    return undefined;
  }
}

async function safeVerify(
  client: LocusClient,
  config: GeneratedLocusBuild,
  channel: vscode.OutputChannel
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  try {
    const verify = await client.verifyLocusbuild(config as never);
    if (!verify.valid) {
      channel.appendLine('❌ verify-locusbuild rejected the generated config:');
      for (const e of verify.errors) {
        channel.appendLine(`   • ${e}`);
      }
      return { ok: false, errors: verify.errors };
    }
    channel.appendLine('✔ verify-locusbuild passed.');
    return { ok: true };
  } catch (err) {
    // If the endpoint itself errors, don't fail the whole flow — log + continue.
    channel.appendLine(`⚠ verify-locusbuild call failed: ${(err as Error).message}. Continuing.`);
    return { ok: true };
  }
}

async function offerRetry(
  _context: vscode.ExtensionContext,
  errors: string[]
): Promise<void> {
  const action = await vscode.window.showErrorMessage(
    `ShipShape: The AI-generated config failed validation. Errors: ${errors.slice(0, 3).join('; ')}`,
    'Retry'
  );
  if (action === 'Retry') {
    vscode.commands.executeCommand('shipshape.deployNL');
  }
}
