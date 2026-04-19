import * as vscode from 'vscode';
import { findStoredApiKey } from './credentials';

const BASE_URL = 'https://beta-api.buildwithlocus.com/v1';

// In-memory JWT cache — never persist to disk or SecretStorage
let _cachedToken: string | null = null;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WhoamiResponse {
  userId: string;
  workspaceId: string;
  email: string;
}

export interface BillingBalance {
  creditBalance: number;
  totalServices: number;
  monthlyTotal: number;
  billingCycleDay: number;
  nextBillingDate: string;
  status: 'active' | 'delinquent' | 'suspended';
  warnings?: Array<{
    level: 'warning' | 'info';
    message: string;
    servicesRemaining: number;
  }>;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  region: string;
  workspaceId: string;
  createdAt: string;
}

export interface Environment {
  id: string;
  name: string;
  type: 'development' | 'staging' | 'production';
  projectId: string;
}

export interface RuntimeInstances {
  runningCount: number;
  desiredCount: number;
  pendingCount: number;
}

export interface Service {
  id: string;
  name: string;
  url: string;
  projectId: string;
  environmentId: string;
  deploymentStatus?: string;
  lastDeploymentId?: string;
  lastDeployedAt?: string;
  runtime_instances?: RuntimeInstances | { status: 'not_deployed' };
}

export type DeploymentStatus =
  | 'queued'
  | 'building'
  | 'deploying'
  | 'healthy'
  | 'failed'
  | 'cancelled'
  | 'rolled_back';

export const TERMINAL_STATUSES: DeploymentStatus[] = [
  'healthy',
  'failed',
  'cancelled',
  'rolled_back',
];

export interface Deployment {
  id: string;
  serviceId: string;
  version: number;
  status: DeploymentStatus;
  durationMs: number | null;
  lastLogs?: string[];
  createdAt: string;
  metadata?: {
    phaseTimestamps: Record<string, string>;
  };
}

export interface FromRepoResult {
  project: Project;
  environment: Environment;
  services: Service[];
  deployments: Deployment[];
}

export interface Addon {
  id: string;
  name: string;
  type: 'postgres' | 'redis';
  status: 'provisioning' | 'available' | 'failed';
  environmentId: string;
  requiresRedeploy: boolean;
}

export interface ServiceSource {
  type: 'github' | 'image' | 's3';
  repo?: string;
  branch?: string;
  imageUri?: string;
  rootDir?: string;
}

export interface ServiceRuntime {
  port: 8080;
  cpu?: number;
  memory?: number;
}

export interface CreateServiceOptions {
  projectId: string;
  environmentId: string;
  name: string;
  source: ServiceSource;
  runtime?: ServiceRuntime;
  buildConfig?: {
    method: 'dockerfile';
    dockerfile?: string;
    buildArgs?: Record<string, string>;
  };
  startCommand?: string;
  healthCheckPath?: string;
  autoDeploy?: boolean;
}

export interface VerifyLocusbuildResult {
  valid: boolean;
  errors: string[];
  plan: Record<string, unknown>;
}

export interface LogEntry {
  timestamp?: string;
  message?: string;
  level?: string;
  stream?: 'stdout' | 'stderr';
  [k: string]: unknown;
}

/**
 * Render a log entry (structured or string) as a single line of text.
 * Falls back to JSON.stringify for unknown shapes rather than `[object Object]`.
 */
export function formatLogLine(entry: string | LogEntry): string {
  if (typeof entry === 'string') { return entry; }
  if (entry === null || entry === undefined) { return ''; }
  const msg = entry.message ?? entry['log'] ?? entry['text'] ?? entry['line'];
  if (typeof msg === 'string') {
    const ts = entry.timestamp ? `[${entry.timestamp}] ` : '';
    return `${ts}${msg}`;
  }
  try {
    return JSON.stringify(entry);
  } catch {
    return String(entry);
  }
}

// ─── Error class ─────────────────────────────────────────────────────────────

export class LocusError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: string,
    public readonly creditBalance?: number,
    public readonly requiredAmount?: number
  ) {
    super(message);
    this.name = 'LocusError';
  }
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class LocusClient {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  // ── Token management ───────────────────────────────────────────────────────

  async getToken(): Promise<string> {
    if (_cachedToken) {
      return _cachedToken;
    }
    const stored = await findStoredApiKey(this.secrets);
    if (!stored) {
      throw new LocusError(
        'No API key configured. Run "ShipShape: Configure Locus API Key" first.',
        401
      );
    }
    _cachedToken = await this.exchangeApiKey(stored.key);
    return _cachedToken;
  }

  async exchangeApiKey(apiKey: string): Promise<string> {
    const res = await fetch(`${BASE_URL}/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Token exchange failed' })) as { error?: string };
      throw new LocusError(err.error ?? 'Token exchange failed', res.status);
    }
    const data = await res.json() as { token: string; expiresIn: number };
    return data.token;
  }

  async verifyOrRefreshToken(): Promise<string> {
    const token = await this.getToken();
    try {
      await this._request<WhoamiResponse>('GET', '/auth/whoami', undefined, token);
      return token;
    } catch (err) {
      if (!(err instanceof LocusError) || err.statusCode !== 401) {
        throw err;
      }
      // Try refresh
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json() as { token: string };
          _cachedToken = data.token;
          return _cachedToken;
        }
      } catch {
        // fall through to re-exchange
      }
      // Refresh failed — re-exchange
      _cachedToken = null;
      const stored = await findStoredApiKey(this.secrets);
      if (!stored) {
        throw new LocusError('Session expired. Please re-enter your API key.', 401);
      }
      _cachedToken = await this.exchangeApiKey(stored.key);
      return _cachedToken;
    }
  }

  clearTokenCache(): void {
    _cachedToken = null;
  }

  // ── Core request helper ────────────────────────────────────────────────────

  private async _request<T>(
    method: string,
    path: string,
    body?: unknown,
    tokenOverride?: string
  ): Promise<T> {
    const token = tokenOverride ?? await this.getToken();
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) {
      return undefined as T;
    }

    const data = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (!res.ok) {
      throw new LocusError(
        (data['error'] as string) ?? `${method} ${path} failed (${res.status})`,
        res.status,
        data['details'] as string | undefined,
        data['creditBalance'] as number | undefined,
        data['requiredAmount'] as number | undefined
      );
    }

    return data as T;
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  async whoami(): Promise<WhoamiResponse> {
    return this._request<WhoamiResponse>('GET', '/auth/whoami');
  }

  // ── Billing ────────────────────────────────────────────────────────────────

  async getBillingBalance(): Promise<BillingBalance> {
    return this._request<BillingBalance>('GET', '/billing/balance');
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  async createProject(name: string, region?: string, description?: string): Promise<Project> {
    return this._request<Project>('POST', '/projects', { name, region, description });
  }

  async listProjects(): Promise<Project[]> {
    const data = await this._request<{ projects: Project[] }>('GET', '/projects');
    return data.projects;
  }

  async getProject(projectId: string): Promise<Project> {
    return this._request<Project>('GET', `/projects/${projectId}`);
  }

  async fromRepo(
    repo: string,
    branch = 'main',
    name?: string,
    region?: string
  ): Promise<FromRepoResult> {
    return this._request<FromRepoResult>('POST', '/projects/from-repo', {
      repo,
      branch,
      name,
      region,
    });
  }

  async verifyLocusbuild(locusbuild: object): Promise<VerifyLocusbuildResult> {
    return this._request<VerifyLocusbuildResult>('POST', '/projects/verify-locusbuild', {
      locusbuild,
    });
  }

  // ── Environments ───────────────────────────────────────────────────────────

  async createEnvironment(
    projectId: string,
    name: string,
    type: 'development' | 'staging' | 'production'
  ): Promise<Environment> {
    return this._request<Environment>(`POST`, `/projects/${projectId}/environments`, {
      name,
      type,
    });
  }

  async listEnvironments(projectId: string): Promise<Environment[]> {
    const data = await this._request<{ environments: Environment[] }>(
      'GET',
      `/projects/${projectId}/environments`
    );
    return data.environments;
  }

  // ── Services ──────────────────────────────────────────────────────────────

  async createService(opts: CreateServiceOptions): Promise<Service> {
    return this._request<Service>('POST', '/services', {
      ...opts,
      runtime: opts.runtime ?? { port: 8080 },
    });
  }

  async getService(serviceId: string, includeRuntime = false): Promise<Service> {
    const qs = includeRuntime ? '?include=runtime' : '';
    return this._request<Service>('GET', `/services/${serviceId}${qs}`);
  }

  async listServices(environmentId: string): Promise<Service[]> {
    const data = await this._request<{ services: Service[] }>(
      'GET',
      `/services/environment/${environmentId}`
    );
    return data.services;
  }

  async updateService(
    serviceId: string,
    updates: { name?: string; autoDeploy?: boolean; startCommand?: string; healthCheckPath?: string }
  ): Promise<Service> {
    return this._request<Service>('PATCH', `/services/${serviceId}`, updates);
  }

  async restartService(serviceId: string): Promise<void> {
    return this._request('POST', `/services/${serviceId}/restart`);
  }

  async redeployService(serviceId: string): Promise<Deployment> {
    return this._request<Deployment>('POST', `/services/${serviceId}/redeploy`);
  }

  async deleteService(serviceId: string): Promise<void> {
    return this._request('DELETE', `/services/${serviceId}`);
  }

  // ── Deployments ───────────────────────────────────────────────────────────

  async triggerDeployment(serviceId: string): Promise<Deployment> {
    return this._request<Deployment>('POST', '/deployments', { serviceId });
  }

  async getDeployment(deploymentId: string): Promise<Deployment> {
    return this._request<Deployment>('GET', `/deployments/${deploymentId}`);
  }

  async listDeployments(serviceId: string, limit = 10): Promise<Deployment[]> {
    const data = await this._request<{ deployments: Deployment[] }>(
      'GET',
      `/deployments/service/${serviceId}?limit=${limit}`
    );
    return data.deployments;
  }

  async cancelDeployment(deploymentId: string): Promise<void> {
    return this._request('POST', `/deployments/${deploymentId}/cancel`);
  }

  async rollbackDeployment(deploymentId: string, reason?: string): Promise<Deployment> {
    return this._request<Deployment>('POST', `/deployments/${deploymentId}/rollback`, { reason });
  }

  // ── Variables ─────────────────────────────────────────────────────────────

  async setVariables(serviceId: string, variables: Record<string, string>): Promise<void> {
    return this._request('PUT', `/variables/service/${serviceId}`, { variables });
  }

  async mergeVariables(serviceId: string, variables: Record<string, string>): Promise<void> {
    return this._request('PATCH', `/variables/service/${serviceId}`, { variables });
  }

  async getResolvedVariables(serviceId: string): Promise<Record<string, string>> {
    const data = await this._request<{ variables: Record<string, string> }>(
      'GET',
      `/variables/service/${serviceId}/resolved`
    );
    return data.variables;
  }

  // ── Addons ────────────────────────────────────────────────────────────────

  async createAddon(
    projectId: string,
    environmentId: string,
    type: 'postgres' | 'redis',
    name?: string
  ): Promise<Addon> {
    return this._request<Addon>('POST', '/addons', { projectId, environmentId, type, name });
  }

  async getAddon(addonId: string): Promise<Addon> {
    return this._request<Addon>('GET', `/addons/${addonId}`);
  }

  async listAddons(environmentId: string): Promise<Addon[]> {
    const data = await this._request<{ addons: Addon[] }>(
      'GET',
      `/addons/environment/${environmentId}`
    );
    return data.addons ?? [];
  }

  async deleteAddon(addonId: string): Promise<void> {
    return this._request('DELETE', `/addons/${addonId}`);
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
  async getDeploymentLogs(
    deploymentId: string
  ): Promise<{ logs: Array<string | LogEntry>; phase: string; reason?: string; deploymentStatus: string }> {
    return this._request('GET', `/deployments/${deploymentId}/logs`);
  }

  // ── Logs (SSE streaming) ──────────────────────────────────────────────────

  async streamDeploymentLogs(
    deploymentId: string,
    onLine: (line: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
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

  async streamServiceLogs(
    serviceId: string,
    onLine: (line: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
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

  private async _consumeSseStream(
    body: ReadableStream<Uint8Array>,
    onLine: (line: string) => void
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n')) {
          if (line.startsWith('data:')) {
            onLine(line.replace(/^data:\s?/, ''));
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ── GitHub ────────────────────────────────────────────────────────────────

  async checkRepoAccess(repo: string): Promise<{
    accessible: boolean;
    installationId?: number;
    installUrl?: string;
    message?: string;
  }> {
    return this._request('GET', `/github/repo-access?repo=${encodeURIComponent(repo)}`);
  }

  // ── Git push deploy ───────────────────────────────────────────────────────

  async getGitRemoteUrl(): Promise<{ remoteUrl: string; usage: string }> {
    return this._request('GET', '/git/remote-url');
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  async createWebhook(
    projectId: string,
    url: string,
    events: string[]
  ): Promise<{ id: string; projectId: string; url: string; events: string[] }> {
    return this._request('POST', '/webhooks', { projectId, url, events });
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    return this._request('DELETE', `/webhooks/${webhookId}`);
  }
}
