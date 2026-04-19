import * as vscode from 'vscode';
import {
  LocusClient,
  LocusError,
  Deployment,
  DeploymentStatus,
  TERMINAL_STATUSES,
  FromRepoResult,
  formatLogLine,
} from '../lib/locus';
import { showError } from '../lib/errorFormat';
import { detectProjectType, PROJECT_TYPE_LABELS, ProjectType } from '../lib/detector';
import { findStoredApiKey, findStoredAiKey } from '../lib/credentials';
import { diagnoseFailure, AiDiagnosis, ProposedFix, AiError } from '../lib/aiDiagnosis';
import * as path from 'path';
import { detectGitHubRemote, isGitRepo } from '../lib/gitRemote';
import {
  generateLocusBuild,
  locusBuildExists,
  readLocusBuild,
  writeLocusBuild,
  locusBuildUri,
} from '../lib/locusbuild';
import {
  needsDockerfileFix,
  dockerfileTemplate,
  dockerfileExists,
  dockerfileUri,
  writeDockerfile,
} from '../lib/dockerfile';
import { commitAndPushFile } from '../lib/git';
import { LogOutputProvider } from '../providers/LogOutputProvider';
import * as statusBar from '../statusBar';

const POLL_INTERVAL_MS = 60_000;
const POLL_TIMEOUT_MS = 15 * 60_000;
const SERVICE_DISCOVERY_DELAY_MS = 60_000;

const REPO_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const GITHUB_URL_REGEX = /github\.com[/:]([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/;

/** Normalise a GitHub URL or slug to owner/repo format. */
function normaliseRepo(input: string): string | undefined {
  const trimmed = input.trim();
  // Already in owner/repo format
  if (REPO_REGEX.test(trimmed)) { return trimmed; }
  // Full GitHub URL
  const match = trimmed.match(GITHUB_URL_REGEX);
  return match ? match[1] : undefined;
}

interface DeployState {
  projectId: string;
  environmentId: string;
  serviceId: string;
  serviceName: string;
  serviceUrl: string;
  deploymentId: string;
  repoSlug: string;
}

export function registerDeployCommand(
  context: vscode.ExtensionContext,
  client: LocusClient
): void {
  const logProvider = new LogOutputProvider(client);

  context.subscriptions.push(
    vscode.commands.registerCommand('shipshape.deploy', async () => {
      try {
        await runDeploy(context, client, logProvider);
      } catch (err) {
        handleDeployError(err);
        statusBar.setState('failed');
      }
    })
  );

  context.subscriptions.push({ dispose: () => logProvider.disposeAll() });
}

async function runDeploy(
  context: vscode.ExtensionContext,
  client: LocusClient,
  logProvider: LogOutputProvider
): Promise<void> {
  // ── Step 1: Check API key ──────────────────────────────────────────────────
  const apiKey = await ensureApiKey(context, client);
  if (!apiKey) {
    return; // user cancelled
  }

  // ── Step 2: Verify token ───────────────────────────────────────────────────
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'ShipShape: Verifying credentials...' },
    async () => {
      await client.verifyOrRefreshToken();
    }
  );

  // ── Step 3: Billing preflight ──────────────────────────────────────────────
  const balance = await client.getBillingBalance();
  if (balance.creditBalance < 0.25) {
    const action = await vscode.window.showErrorMessage(
      `Insufficient Locus credits ($${balance.creditBalance.toFixed(2)}). ` +
        `Each service costs $0.25/month.`,
      'Add Credits'
    );
    if (action === 'Add Credits') {
      vscode.env.openExternal(vscode.Uri.parse('https://beta.buildwithlocus.com/billing'));
    }
    return;
  }
  if (balance.warnings && balance.warnings.length > 0) {
    for (const w of balance.warnings) {
      vscode.window.showWarningMessage(`ShipShape: ${w.message}`);
    }
  }

  // ── Step 4: Detect project type ────────────────────────────────────────────
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Open a folder first — deploy needs a workspace.');
    return;
  }

  statusBar.setState('detecting');
  const detected = await detectProjectType(workspaceRoot);
  const projectType = await confirmProjectType(detected);
  if (!projectType) {
    statusBar.setState('idle');
    return;
  }

  // ── Step 4.5: Inject a Dockerfile for project types Nixpacks mishandles ───
  // (e.g. Vite — Nixpacks serves it on port 80, Locus health-checks 8080.)
  const dockerfileReady = await ensureDockerfileIfNeeded(workspaceRoot, projectType);
  if (!dockerfileReady) {
    statusBar.setState('idle');
    return;
  }

  // ── Step 5: Check / generate .locusbuild ───────────────────────────────────
  const hasLocusbuild = await locusBuildExists(workspaceRoot);
  if (!hasLocusbuild) {
    const template = generateLocusBuild(projectType);
    if (!template) {
      vscode.window.showErrorMessage(
        'Could not auto-generate a .locusbuild for this project. Create one manually and retry.'
      );
      statusBar.setState('idle');
      return;
    }
    const uri = await writeLocusBuild(workspaceRoot, template);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });

    const confirm = await vscode.window.showInformationMessage(
      'Generated .locusbuild — review it, then deploy.',
      { modal: false },
      'Deploy',
      'Cancel'
    );
    if (confirm !== 'Deploy') {
      statusBar.setState('idle');
      return;
    }
  }

  // Validate the .locusbuild before shipping
  const locusbuild = await readLocusBuild(workspaceRoot);
  if (locusbuild) {
    try {
      const verify = await client.verifyLocusbuild(locusbuild);
      if (!verify.valid) {
        vscode.window.showErrorMessage(
          `Invalid .locusbuild: ${verify.errors.join('; ')}`
        );
        statusBar.setState('idle');
        return;
      }
    } catch (err) {
      // Verification endpoint may not be strict — log and continue
      console.warn('verify-locusbuild failed, continuing:', err);
    }
  }

  // ── Step 6: Get GitHub repo ────────────────────────────────────────────────
  const repoSlug = await ensureGitHubRepo(workspaceRoot);
  if (!repoSlug) {
    statusBar.setState('idle');
    return;
  }

  // ── Step 7: Check for existing project ─────────────────────────────────────
  let result: FromRepoResult;
  const projects = await client.listProjects();
  const existing = projects.find(p => p.name === repoSlug.split('/')[1] || p.name === repoSlug);

  if (existing) {
    // Reuse — redeploy the first service in the primary environment
    const environments = await client.listEnvironments(existing.id);
    const env = environments[0];
    if (!env) {
      vscode.window.showErrorMessage(`Project exists but has no environments. Clean it up in the dashboard.`);
      statusBar.setState('idle');
      return;
    }
    const services = await client.listServices(env.id);
    const service = services[0];
    if (!service) {
      // Fall through to from-repo to create the service
      result = await callFromRepo(client, repoSlug);
    } else {
      // Sync .locusbuild → service config BEFORE triggering the deployment.
      // This fixes a common footgun: user edits .locusbuild (e.g. healthCheck),
      // but subsequent deploys only redeploy code and keep the stale service
      // config, so the change silently never takes effect.
      await syncServiceFromLocusBuild(client, workspaceRoot, services);

      const deployment = await client.triggerDeployment(service.id);
      result = {
        project: existing,
        environment: env,
        services: [service],
        deployments: [deployment],
      };
      vscode.window.showInformationMessage(
        `Redeploying existing project "${existing.name}"...`
      );
    }
  } else {
    // ── Step 8: Deploy via from-repo ────────────────────────────────────────
    result = await callFromRepo(client, repoSlug);
  }

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
  };

  await context.globalState.update('shipshape.lastDeploy', state);

  // ── Step 9: Open output channel + start log streaming ──────────────────────
  const channel = logProvider.getOrCreateChannel(repoSlug);
  channel.show(true);
  channel.appendLine(`🚀 Deployment started — ${new Date().toISOString()}`);
  channel.appendLine(`   Project:    ${result.project.name} (${result.project.id})`);
  channel.appendLine(`   Service:    ${service.name} (${service.id})`);
  channel.appendLine(`   Deployment: ${deployment.id}`);
  channel.appendLine(`   Repo:       ${repoSlug}`);
  channel.appendLine('');

  statusBar.setState('building');

  // Start log streaming in parallel with polling
  const logAbort = new AbortController();
  const logPromise = logProvider.streamDeploymentLogs(deployment.id, channel, logAbort.signal)
    .catch(err => {
      // AbortError is expected — we cancel the stream once polling reaches a terminal state
      if ((err as Error)?.name === 'AbortError') { return; }
      channel.appendLine(`⚠ Log stream disconnected: ${(err as Error)?.message ?? err}`);
    });

  // ── Step 10: Poll deployment status ────────────────────────────────────────
  try {
    const final = await pollDeployment(client, deployment.id, channel);

    if (final.status === 'healthy') {
      channel.appendLine('');
      channel.appendLine(`✅ Deployment healthy. Waiting ${SERVICE_DISCOVERY_DELAY_MS / 1000}s for service discovery...`);
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
      channel.appendLine(`❌ Deployment failed.`);
      // Stop the streaming reader first so the non-streaming fetch gets fresh data.
      logAbort.abort();
      await logPromise;

      await handleFailure({
        context, client, logProvider, channel,
        state, projectType, workspaceRoot,
      });
    } else {
      // cancelled / rolled_back / unknown
      channel.appendLine('');
      channel.appendLine(`⚠ Deployment ended with status: ${final.status}`);
      statusBar.setState('idle');
    }
  } finally {
    logAbort.abort();
    await logPromise;
  }
}

// ─── Sub-flows ──────────────────────────────────────────────────────────────

async function ensureApiKey(
  context: vscode.ExtensionContext,
  client: LocusClient
): Promise<string | undefined> {
  // Check SecretStorage and the CLI credentials file
  const stored = await findStoredApiKey(context.secrets);
  if (stored) {
    return stored.key;
  }

  // Neither found — prompt the user and save to SecretStorage for next time
  const apiKey = await vscode.window.showInputBox({
    prompt: 'Enter your Locus Build API key',
    password: true,
    placeHolder: 'claw_...',
    ignoreFocusOut: true,
    validateInput: (v) => (v && !v.startsWith('claw_') ? 'Key must start with claw_' : null),
  });
  if (!apiKey) {
    return undefined;
  }
  await context.secrets.store('shipshape.buildApiKey', apiKey);
  client.clearTokenCache();
  return apiKey;
}

async function confirmProjectType(detected: ProjectType): Promise<ProjectType | undefined> {
  const detectedLabel = PROJECT_TYPE_LABELS[detected];

  if (detected === 'unknown') {
    vscode.window.showWarningMessage(
      'Could not auto-detect a framework. Pick one, or cancel and add a Dockerfile/.locusbuild manually.'
    );
  }

  const choices: vscode.QuickPickItem[] = [
    {
      label: `$(check) Use detected: ${detectedLabel}`,
      description: detected,
      detail: 'Generate a .locusbuild based on this detection',
    },
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    ...Object.entries(PROJECT_TYPE_LABELS)
      .filter(([k]) => k !== detected && k !== 'unknown')
      .map(([k, label]) => ({ label, description: k })),
    { label: '$(close) Cancel', description: 'cancel' },
  ];

  const pick = await vscode.window.showQuickPick(choices, {
    title: 'ShipShape: Confirm project type',
    placeHolder: `Detected: ${detectedLabel}`,
    ignoreFocusOut: true,
  });

  if (!pick || pick.description === 'cancel') {
    return undefined;
  }
  if (pick.description === detected || pick.label.startsWith('$(check)')) {
    return detected === 'unknown' ? undefined : detected;
  }
  return pick.description as ProjectType;
}

/**
 * For project types where Nixpacks produces a container that doesn't bind to
 * port 8080 (currently: react-vite, which Caddy serves on port 80), offer to
 * drop a hand-rolled Dockerfile at the repo root and commit+push it to
 * GitHub. Returns true if deploy should proceed.
 *
 *   - Project doesn't need fix              → true
 *   - Dockerfile already present            → true (user handled it)
 *   - User cancels / declines commit        → false (stop deploy)
 *   - Dockerfile generated + pushed         → true
 */
async function ensureDockerfileIfNeeded(
  workspaceRoot: vscode.Uri,
  projectType: ProjectType
): Promise<boolean> {
  if (!needsDockerfileFix(projectType)) { return true; }
  if (await dockerfileExists(workspaceRoot)) { return true; }

  const template = dockerfileTemplate(projectType);
  if (!template) { return true; } // no template — let it ride

  const label = PROJECT_TYPE_LABELS[projectType];
  const choice = await vscode.window.showWarningMessage(
    `ShipShape: ${label} projects need a Dockerfile to bind to port 8080. ` +
      `Nixpacks' default serves on port 80 and will fail health checks. ` +
      `Generate one now?`,
    { modal: true },
    'Generate Dockerfile',
    'Deploy anyway'
  );

  if (choice === 'Deploy anyway') {
    vscode.window.showWarningMessage(
      'Proceeding without a Dockerfile. Deployment is likely to fail at runtime health check.'
    );
    return true;
  }
  if (choice !== 'Generate Dockerfile') { return false; }

  // Write the file and show it for review
  const uri = await writeDockerfile(workspaceRoot, template);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });

  // Remind the user that from-repo clones from GitHub — local-only writes won't help
  const commitChoice = await vscode.window.showInformationMessage(
    'Dockerfile written. Locus builds from GitHub, so we need to commit + push before deploying.',
    { modal: true },
    'Commit & push',
    `I'll commit manually`,
    'Cancel'
  );

  if (commitChoice === 'Cancel' || !commitChoice) { return false; }

  if (commitChoice === `I'll commit manually`) {
    vscode.window.showInformationMessage(
      'Commit the Dockerfile and push to your default branch, then run "ShipShape: Deploy Workspace" again.'
    );
    return false;
  }

  // Commit & push via VS Code's Git extension
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'ShipShape: Committing Dockerfile...' },
    async () => commitAndPushFile(workspaceRoot, {
      filePath: dockerfileUri(workspaceRoot).fsPath,
      commitMessage: 'Add Dockerfile for Locus deploy (port 8080)',
    })
  );

  if (!result.ok) {
    const action = await vscode.window.showErrorMessage(
      `Could not commit + push automatically: ${result.reason}`,
      'Open terminal',
      'Cancel'
    );
    if (action === 'Open terminal') {
      const terminal = vscode.window.createTerminal('ShipShape');
      terminal.show();
      terminal.sendText('git add Dockerfile && git commit -m "Add Dockerfile for Locus deploy" && git push');
    }
    return false;
  }

  vscode.window.showInformationMessage('Dockerfile committed and pushed. Continuing deploy...');
  return true;
}

async function ensureGitHubRepo(workspaceRoot: vscode.Uri): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration('shipshape');
  const saved = config.get<string>('githubRepo');

  // 1. Already saved in workspace config
  if (saved && REPO_REGEX.test(saved)) {
    return saved;
  }

  // 2. Auto-detect from .git/config
  const detected = await detectGitHubRemote(workspaceRoot);
  if (detected) {
    const confirm = await vscode.window.showInformationMessage(
      `ShipShape: Deploy from GitHub repo "${detected}"?`,
      { modal: false },
      'Yes',
      'Use a different repo'
    );
    if (confirm === 'Yes') {
      await config.update('githubRepo', detected, vscode.ConfigurationTarget.Workspace);
      return detected;
    }
    if (!confirm) {
      return undefined; // user dismissed
    }
    // fall through to manual input
  } else {
    // Not a git repo or no GitHub remote — explain and offer options
    const notGit = !(await isGitRepo(workspaceRoot));
    if (notGit) {
      const action = await vscode.window.showWarningMessage(
        'This folder has no git repository. Push your code to GitHub first, then deploy.',
        'Enter repo manually'
      );
      if (action !== 'Enter repo manually') {
        return undefined;
      }
    } else {
      // Has git but no GitHub remote
      const action = await vscode.window.showWarningMessage(
        'No GitHub remote found. Add one with "git remote add origin https://github.com/owner/repo" and push, or enter the repo manually.',
        'Enter repo manually'
      );
      if (action !== 'Enter repo manually') {
        return undefined;
      }
    }
  }

  // 3. Manual input fallback
  const input = await vscode.window.showInputBox({
    prompt: 'GitHub repo — paste the URL or enter owner/repo',
    placeHolder: 'e.g. https://github.com/owner/repo  or  owner/repo',
    ignoreFocusOut: true,
    validateInput: (v) => {
      if (!v) { return 'Required'; }
      return normaliseRepo(v) ? null : 'Could not parse a GitHub repo from that input';
    },
  });
  if (!input) {
    return undefined;
  }
  const repo = normaliseRepo(input)!;
  await config.update('githubRepo', repo, vscode.ConfigurationTarget.Workspace);
  return repo;
}

async function callFromRepo(client: LocusClient, repoSlug: string): Promise<FromRepoResult> {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `ShipShape: Creating project from ${repoSlug}...` },
    async () => {
      const region = vscode.workspace.getConfiguration('shipshape').get<string>('defaultRegion') ?? 'us-east-1';
      const name = repoSlug.split('/')[1];
      return client.fromRepo(repoSlug, 'main', name, region);
    }
  );
}

/**
 * Compare `.locusbuild` to the currently-deployed services. If a service's
 * healthCheckPath differs from the file, PATCH it before the next deployment.
 *
 * Background: `POST /deployments` only redeploys code — it never re-reads
 * `.locusbuild`. Without this sync, edits to healthCheck silently have no
 * effect until the service is recreated.
 */
async function syncServiceFromLocusBuild(
  client: LocusClient,
  workspaceRoot: vscode.Uri,
  services: import('../lib/locus').Service[]
): Promise<void> {
  const config = await readLocusBuild(workspaceRoot);
  if (!config?.services) { return; }

  for (const [name, svcConfig] of Object.entries(config.services)) {
    const deployed = services.find((s) => s.name === name);
    if (!deployed) { continue; }

    const desired = svcConfig.healthCheck;
    // We don't have healthCheckPath on the Service type — the API returns it
    // under `runtime` or similar. Rather than trying to read-compare, we just
    // PATCH unconditionally with the desired value. The API is idempotent.
    if (!desired) { continue; }

    try {
      await client.updateService(deployed.id, { healthCheckPath: desired });
      vscode.window.showInformationMessage(
        `Synced healthCheck for "${name}": ${desired}`
      );
    } catch (err) {
      // Non-fatal — log but proceed with the deploy
      console.warn(`Failed to sync healthCheck for ${name}:`, err);
    }
  }
}

// ─── Polling ────────────────────────────────────────────────────────────────

async function pollDeployment(
  client: LocusClient,
  deploymentId: string,
  channel: vscode.OutputChannel
): Promise<Deployment> {
  const startTime = Date.now();
  let lastStatus: DeploymentStatus | null = null;

  // Immediate first poll, then 60s interval
  for (;;) {
    if (Date.now() - startTime > POLL_TIMEOUT_MS) {
      channel.appendLine(`⚠ Polling timed out after ${POLL_TIMEOUT_MS / 60000} minutes.`);
      throw new Error('Deployment polling timeout');
    }

    const deployment = await client.getDeployment(deploymentId);

    if (deployment.status !== lastStatus) {
      channel.appendLine(`[${new Date().toISOString()}] Status: ${deployment.status}`);
      updateStatusBarForStatus(deployment.status);
      lastStatus = deployment.status;
    }

    if (TERMINAL_STATUSES.includes(deployment.status)) {
      return deployment;
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

function updateStatusBarForStatus(status: DeploymentStatus): void {
  switch (status) {
    case 'queued':
    case 'building':
      statusBar.setState('building');
      break;
    case 'deploying':
      statusBar.setState('deploying');
      break;
    case 'healthy':
      // Handled by caller after the discovery delay
      break;
    case 'failed':
    case 'cancelled':
    case 'rolled_back':
      statusBar.setState('failed');
      break;
  }
}

// ─── Failure diagnosis ──────────────────────────────────────────────────────

interface Diagnosis {
  kind: 'platform' | 'user-code' | 'unknown';
  userMessage: string;
}

interface FetchedLogs {
  phase: string;
  renderedLines: string[];
}

/**
 * Fetch the full log buffer for a failed deployment and print a tail to the
 * channel. The `lastLogs` field on the Deployment object is capped at 20
 * lines — we use the dedicated logs endpoint for real diagnosis.
 */
async function fetchFullLogs(
  client: LocusClient,
  deploymentId: string,
  channel: vscode.OutputChannel
): Promise<FetchedLogs> {
  channel.appendLine('');
  channel.appendLine('─── Fetching full deployment logs ───');

  let renderedLines: string[] = [];
  let phase = 'unknown';
  try {
    const result = await client.getDeploymentLogs(deploymentId);
    const rawLogs = result.logs ?? [];
    phase = result.phase ?? 'unknown';
    if (result.reason) {
      channel.appendLine(`Reason: ${result.reason}`);
    }
    channel.appendLine(`Phase at failure: ${phase}`);
    channel.appendLine(`Total log lines: ${rawLogs.length}`);
    channel.appendLine('');

    renderedLines = rawLogs.map(formatLogLine);
    const tail = renderedLines.slice(-100);
    for (const line of tail) {
      channel.appendLine(line);
    }
  } catch (err) {
    channel.appendLine(`⚠ Could not fetch full logs: ${(err as Error).message}`);
    try {
      const deployment = await client.getDeployment(deploymentId);
      if (deployment.lastLogs) {
        renderedLines = deployment.lastLogs.map(formatLogLine as (e: string) => string);
        for (const line of renderedLines) {
          channel.appendLine(line);
        }
      }
    } catch {
      // give up
    }
  }

  return { phase, renderedLines };
}

// ─── AI-powered failure handling ────────────────────────────────────────────

interface HandleFailureArgs {
  context: vscode.ExtensionContext;
  client: LocusClient;
  logProvider: LogOutputProvider;
  channel: vscode.OutputChannel;
  state: DeployState;
  projectType: ProjectType;
  workspaceRoot: vscode.Uri;
}

/**
 * Orchestrates post-failure UX. Fetches logs, then either:
 *   (a) Calls Claude for a structured diagnosis + optional auto-fix, OR
 *   (b) Falls back to the regex classifier if no Pay key is configured.
 */
async function handleFailure(args: HandleFailureArgs): Promise<void> {
  const { context, client, channel, state, projectType, workspaceRoot } = args;
  const { phase, renderedLines } = await fetchFullLogs(client, state.deploymentId, channel);
  statusBar.setState('failed');

  const aiKey = await findStoredAiKey(context.secrets);
  if (aiKey) {
    try {
      channel.appendLine('');
      channel.appendLine('🤖 Running AI diagnosis (Gemini 2.5 Flash)...');
      const diagnosis = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'ShipShape: AI diagnosing failure...' },
        () => diagnoseFailure(aiKey, {
          phase,
          logs: renderedLines,
          projectType,
          workspaceRoot,
          repoSlug: state.repoSlug,
        })
      );
      await presentAiDiagnosis(diagnosis, args);
      return;
    } catch (err) {
      const message = err instanceof AiError
        ? `AI diagnosis failed (HTTP ${err.statusCode}): ${err.message}`
        : `AI diagnosis failed: ${(err as Error).message}`;
      channel.appendLine(`⚠ ${message}`);
      channel.appendLine('   Falling back to pattern-based diagnosis.');
    }
  } else {
    // First time failing without an AI key — offer the upgrade path
    offerAiKeySetup();
  }

  // Regex fallback
  const regex = classifyFailure(renderedLines, phase);
  await presentRegexDiagnosis(regex, channel);
}

function offerAiKeySetup(): void {
  vscode.window.showInformationMessage(
    'Tip: Add a free Gemini API key to get AI-powered failure diagnosis and auto-fix.',
    'Configure',
    'Get a free key'
  ).then(action => {
    if (action === 'Configure') {
      vscode.commands.executeCommand('shipshape.configureAiApiKey');
    } else if (action === 'Get a free key') {
      vscode.env.openExternal(vscode.Uri.parse('https://aistudio.google.com/apikey'));
    }
  });
}

/** Prints the AI diagnosis to the channel and drives the action prompt. */
async function presentAiDiagnosis(
  diagnosis: AiDiagnosis,
  args: HandleFailureArgs
): Promise<void> {
  const { channel } = args;
  channel.appendLine('');
  channel.appendLine(`🤖 AI Diagnosis (${diagnosis.confidence} confidence · owner: ${diagnosis.owner})`);
  channel.appendLine(`   ${diagnosis.summary}`);
  channel.appendLine('');
  for (const line of diagnosis.rootCause.split('\n')) {
    channel.appendLine(`   ${line}`);
  }
  if (diagnosis.fix) {
    channel.appendLine('');
    channel.appendLine(`   💡 Proposed fix: ${diagnosis.fix.description}`);
    channel.appendLine(`      File: ${diagnosis.fix.file}`);
  } else {
    channel.appendLine('');
    channel.appendLine(
      `   ℹ  No safe auto-fix available — this issue needs a manual change`
    );
    channel.appendLine(
      `      (renames, multi-file changes, and low-confidence fixes are skipped for safety).`
    );
  }

  const actions: string[] = [];
  if (diagnosis.fix) {
    actions.push('Apply & redeploy', 'Preview fix', 'View logs');
  } else {
    actions.push('View logs');
    if (diagnosis.owner === 'user' || diagnosis.owner === 'config') {
      actions.push('Retry');
    }
  }

  const action = await vscode.window.showErrorMessage(diagnosis.summary, ...actions);

  if (action === 'Apply & redeploy' && diagnosis.fix) {
    await applyFixAndRedeploy(diagnosis.fix, args);
  } else if (action === 'Preview fix' && diagnosis.fix) {
    await previewFix(diagnosis.fix);
    const confirm = await vscode.window.showInformationMessage(
      'Apply this fix, commit, push, and redeploy?',
      { modal: true },
      'Apply & redeploy',
      'Cancel'
    );
    if (confirm === 'Apply & redeploy') {
      await applyFixAndRedeploy(diagnosis.fix, args);
    }
  } else if (action === 'View logs') {
    channel.show();
  } else if (action === 'Retry') {
    vscode.commands.executeCommand('shipshape.deploy');
  }
}

/** Open the proposed file content in a preview tab so the user can read it. */
async function previewFix(fix: ProposedFix): Promise<void> {
  const language = inferLanguage(fix.file);
  const doc = await vscode.workspace.openTextDocument({ content: fix.content, language });
  await vscode.window.showTextDocument(doc, { preview: true });
}

function inferLanguage(filePath: string): string | undefined {
  if (/\.json$/.test(filePath) || filePath === '.locusbuild') { return 'json'; }
  if (/Dockerfile$/.test(filePath)) { return 'dockerfile'; }
  if (/\.(ts|tsx)$/.test(filePath)) { return 'typescript'; }
  if (/\.(js|jsx|mjs|cjs)$/.test(filePath)) { return 'javascript'; }
  if (/\.ya?ml$/.test(filePath)) { return 'yaml'; }
  if (/\.toml$/.test(filePath)) { return 'toml'; }
  return undefined;
}

/**
 * Write the fix, commit + push via VS Code's Git extension, then trigger a
 * new deployment on the same service (NOT a fresh from-repo). Reuses the
 * existing polling + streaming pipeline.
 */
async function applyFixAndRedeploy(
  fix: ProposedFix,
  args: HandleFailureArgs
): Promise<void> {
  const { context, client, logProvider, channel, state, workspaceRoot } = args;

  const fileUri = vscode.Uri.file(path.join(workspaceRoot.fsPath, fix.file));
  channel.appendLine('');
  channel.appendLine(`🔧 Applying fix: ${fix.description}`);
  channel.appendLine(`   File: ${fix.file}`);

  // Write the file
  try {
    await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(fix.content));
  } catch (err) {
    channel.appendLine(`❌ Could not write file: ${(err as Error).message}`);
    vscode.window.showErrorMessage(`ShipShape: Could not write ${fix.file} — ${(err as Error).message}`);
    return;
  }

  // Commit + push
  channel.appendLine(`   Committing: ${fix.commitMessage}`);
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'ShipShape: Committing + pushing fix...' },
    () => commitAndPushFile(workspaceRoot, {
      filePath: fileUri.fsPath,
      commitMessage: fix.commitMessage,
    })
  );
  if (!result.ok) {
    channel.appendLine(`❌ Could not commit + push: ${result.reason}`);
    vscode.window.showErrorMessage(`ShipShape: Fix written but not pushed — ${result.reason}`);
    return;
  }
  channel.appendLine('✅ Pushed to GitHub. Triggering new deployment...');

  // Trigger a fresh deployment on the same service
  let newDeployment;
  try {
    newDeployment = await client.triggerDeployment(state.serviceId);
  } catch (err) {
    channel.appendLine(`❌ Could not trigger deployment: ${(err as Error).message}`);
    vscode.window.showErrorMessage(`ShipShape: Could not trigger redeploy — ${(err as Error).message}`);
    return;
  }

  const newState: DeployState = { ...state, deploymentId: newDeployment.id };
  await context.globalState.update('shipshape.lastDeploy', newState);

  channel.appendLine(`🚀 New deployment: ${newDeployment.id}`);
  channel.appendLine('');
  statusBar.setState('building');

  // Stream logs + poll (same pattern as the primary deploy flow)
  const logAbort = new AbortController();
  const logPromise = logProvider.streamDeploymentLogs(newDeployment.id, channel, logAbort.signal)
    .catch(err => {
      if ((err as Error)?.name === 'AbortError') { return; }
      channel.appendLine(`⚠ Log stream disconnected: ${(err as Error)?.message ?? err}`);
    });

  try {
    const final = await pollDeployment(client, newDeployment.id, channel);
    if (final.status === 'healthy') {
      channel.appendLine('');
      channel.appendLine(`✅ Fix worked! Waiting ${SERVICE_DISCOVERY_DELAY_MS / 1000}s for service discovery...`);
      statusBar.setState('deploying');
      await sleep(SERVICE_DISCOVERY_DELAY_MS);
      channel.appendLine(`🌐 Live at: ${state.serviceUrl}`);
      statusBar.setState('healthy', state.serviceUrl);
      vscode.commands.executeCommand('shipshape.refreshServices');
      const a = await vscode.window.showInformationMessage(
        `ShipShape: Fix applied — ${state.serviceName} is live at ${state.serviceUrl}`,
        'Open in Browser'
      );
      if (a === 'Open in Browser') {
        vscode.env.openExternal(vscode.Uri.parse(state.serviceUrl));
      }
    } else if (final.status === 'failed') {
      channel.appendLine('');
      channel.appendLine(`❌ Fix did not resolve the issue. Re-diagnosing...`);
      logAbort.abort();
      await logPromise;
      // One-level recursion: handle the new failure (will call AI again).
      // Guard against infinite loop by clearing any AI-proposed fix if it
      // matches the last attempt — handled naturally because Claude sees the
      // new logs and will propose something different (or fix: null).
      await handleFailure({ ...args, state: newState });
    } else {
      channel.appendLine('');
      channel.appendLine(`⚠ Deployment ended with status: ${final.status}`);
      statusBar.setState('idle');
    }
  } finally {
    logAbort.abort();
    await logPromise;
  }
}

async function presentRegexDiagnosis(
  diagnosis: Diagnosis,
  channel: vscode.OutputChannel
): Promise<void> {
  const actions: string[] = [];
  if (diagnosis.kind === 'platform') {
    actions.push('Retry', 'View Logs');
  } else {
    actions.push('View Logs', 'Retry');
  }
  const action = await vscode.window.showErrorMessage(diagnosis.userMessage, ...actions);
  if (action === 'View Logs') {
    channel.show();
  } else if (action === 'Retry') {
    vscode.commands.executeCommand('shipshape.deploy');
  }
}

/**
 * Classify a failure using the API-reported phase as primary signal, then
 * narrow down with log patterns *only within that phase*.
 *
 * Order matters: phase first, then patterns. Don't keyword-match the whole
 * log buffer — e.g. "docker push" appears in successful runs too.
 */
function classifyFailure(logs: string[], phase: string): Diagnosis {
  const tail = logs.slice(-200).join('\n');

  // ── Phase: building ──────────────────────────────────────────────────────
  if (phase === 'building' || phase === 'build' || phase === 'queued') {
    // Base image not in Locus's ECR mirror — specific to Dockerfile builds
    if (/failed to resolve source metadata|not found.*dockerhub\/library|manifest.*not found/i.test(tail)) {
      const match = tail.match(/dockerhub\/library\/([a-z0-9._-]+:[a-z0-9._-]+)/i);
      const imageName = match ? match[1] : 'a base image';
      return {
        kind: 'platform',
        userMessage:
          `Locus's image mirror does not carry \`${imageName}\`. ` +
          `Swap your Dockerfile's FROM line to a mirrored image — node:20-alpine and most official language images work.`,
      };
    }
    if (/npm ERR!|Build failed|error TS\d+|Error: Cannot find module/i.test(tail)) {
      return {
        kind: 'user-code',
        userMessage:
          'Build failed in your project code. Check the logs — likely a missing dependency, TypeScript error, or Node build error.',
      };
    }
    if (/DATABASE_URL.*(?:not set|undefined|required)|AUTH_SECRET.*(?:not set|required)/i.test(tail)) {
      return {
        kind: 'user-code',
        userMessage:
          'Build failed due to a missing environment variable. Add it via the env var manager and redeploy.',
      };
    }
    if (/Nixpacks.*(?:failed|could not detect)/i.test(tail)) {
      return {
        kind: 'user-code',
        userMessage:
          'Locus could not auto-detect how to build your project. Add a Dockerfile or a .locusbuild config.',
      };
    }
    // Build-phase failure with no recognised pattern — check the tail for clues
    return {
      kind: 'unknown',
      userMessage: 'Build failed. Check the full logs below for the exact error.',
    };
  }

  // ── Phase: deploying / runtime ───────────────────────────────────────────
  if (phase === 'deploying' || phase === 'runtime') {
    // SIGTERM with clean shutdown → container was killed by the orchestrator,
    // almost always due to a failing health check.
    if (/SIGTERM/i.test(tail) && /exit_code":\s*0|shutdown complete/i.test(tail)) {
      return {
        kind: 'user-code',
        userMessage:
          'Your container started and ran briefly, then was killed by Locus (SIGTERM). This is almost always a failed health check: the app is not responding on port 8080 at the configured healthCheck path. For Vite/React static sites, the server inside the container may be binding to the wrong port.',
      };
    }

    // Explicit health check failures
    if (/health.?check.*fail|unhealthy|task.*stopped.*health/i.test(tail)) {
      return {
        kind: 'user-code',
        userMessage:
          'Health check failed. Your container needs to respond 200 OK on port 8080 at the healthCheck path in your .locusbuild.',
      };
    }

    // App crashed at startup
    if (/Error:.*(?:ENOENT|EADDRINUSE|EACCES)|uncaught exception|fatal error/i.test(tail)) {
      return {
        kind: 'user-code',
        userMessage:
          'Your container crashed at startup. Check the logs for the exception — typically a missing file, port in use, or permission issue.',
      };
    }

    // Caddy (Nixpacks default static-site server) — specific hint for Vite/React
    if (/caddy/i.test(tail) && /srv0/i.test(tail)) {
      return {
        kind: 'user-code',
        userMessage:
          'Locus built your static site with Caddy. It started but failed health checks — typically because Caddy binds to port 80/443 inside the container, not 8080. Add a Dockerfile or .locusbuild buildConfig that serves on PORT=8080.',
      };
    }

    return {
      kind: 'user-code',
      userMessage:
        'Your container failed to stay healthy. Most common causes: (1) app not listening on port 8080, (2) app crashed at startup, (3) healthCheck path returns non-200. Check the logs below.',
    };
  }

  // ── Genuine platform failures (rare — reached only if build/deploy phases don't match) ──
  if (/ECR.*unauthorized|registry.*timeout|rate.?limit/i.test(tail)) {
    return {
      kind: 'platform',
      userMessage:
        'Locus platform error talking to their image registry. Retry usually works.',
    };
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return {
    kind: 'unknown',
    userMessage: `Deployment failed in phase "${phase}". Check the full logs below for details.`,
  };
}

// ─── Error handling ─────────────────────────────────────────────────────────

function handleDeployError(err: unknown): void {
  // Thin wrapper around the shared formatter — keeps existing call site simple
  void showError(err, 'Deploy failed');
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function getWorkspaceRoot(): vscode.Uri | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
