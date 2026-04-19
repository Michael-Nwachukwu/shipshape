import * as vscode from 'vscode';
import {
  LocusClient,
  LocusError,
  Project,
  Environment,
  Service,
  Deployment,
  DeploymentStatus,
} from '../lib/locus';

// ─── Node types ──────────────────────────────────────────────────────────────

export class ProjectNode extends vscode.TreeItem {
  readonly kind = 'project' as const;
  constructor(public readonly project: Project) {
    super(project.name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'project';
    this.iconPath = new vscode.ThemeIcon('folder');
    this.tooltip = `Region: ${project.region}\nID: ${project.id}`;
    this.description = project.region;
  }
}

export class EnvironmentNode extends vscode.TreeItem {
  readonly kind = 'environment' as const;
  constructor(public readonly environment: Environment) {
    super(environment.name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'environment';
    this.iconPath = new vscode.ThemeIcon('server-environment');
    this.description = environment.type;
    this.tooltip = `Environment: ${environment.name} (${environment.type})`;
  }
}

export class ServiceNode extends vscode.TreeItem {
  readonly kind = 'service' as const;
  constructor(public readonly service: Service) {
    super(service.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'service';
    this.iconPath = iconForStatus(service.deploymentStatus as DeploymentStatus | undefined);
    this.description = service.deploymentStatus ?? 'not deployed';
    this.tooltip = [
      `Service: ${service.name}`,
      `Status: ${service.deploymentStatus ?? 'not deployed'}`,
      service.url ? `URL: ${service.url}` : undefined,
      service.lastDeployedAt ? `Last deploy: ${service.lastDeployedAt}` : undefined,
      '',
      'Click to stream logs. Right-click for more actions.',
    ]
      .filter((x) => x !== undefined)
      .join('\n');
    // Single-click default: stream runtime logs. Right-click still shows the full menu.
    this.command = {
      command: 'locus.viewLogs',
      title: 'View Logs',
      arguments: [this],
    };
  }
}

export class DeploymentNode extends vscode.TreeItem {
  readonly kind = 'deployment' as const;
  constructor(
    public readonly deployment: Deployment,
    public readonly serviceId: string
  ) {
    super(`Deploy #${deployment.version}`, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'deployment';
    this.iconPath = iconForStatus(deployment.status);
    this.description = `${deployment.status} — ${formatAgo(deployment.createdAt)}`;
    this.tooltip = [
      `Deployment #${deployment.version}`,
      `Status: ${deployment.status}`,
      `Created: ${deployment.createdAt}`,
      deployment.durationMs !== null && deployment.durationMs !== undefined
        ? `Duration: ${Math.round(deployment.durationMs / 1000)}s`
        : undefined,
      '',
      'Click to view logs. Right-click to roll back.',
    ]
      .filter((x) => x !== undefined)
      .join('\n');
    this.command = {
      command: 'locus.viewLogs',
      title: 'View Logs',
      arguments: [this],
    };
  }
}

class MessageNode extends vscode.TreeItem {
  readonly kind = 'message' as const;
  constructor(label: string, icon?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    if (icon) {
      this.iconPath = new vscode.ThemeIcon(icon);
    }
    this.contextValue = 'message';
  }
}

export type LocusTreeNode =
  | ProjectNode
  | EnvironmentNode
  | ServiceNode
  | DeploymentNode
  | MessageNode;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function iconForStatus(status: DeploymentStatus | string | undefined): vscode.ThemeIcon {
  switch (status) {
    case 'healthy':
      return new vscode.ThemeIcon('vm-running', new vscode.ThemeColor('charts.green'));
    case 'deploying':
    case 'building':
    case 'queued':
      return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.yellow'));
    case 'failed':
      return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
    case 'rolled_back':
      return new vscode.ThemeIcon('history', new vscode.ThemeColor('charts.orange'));
    case 'cancelled':
      return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.gray'));
    default:
      return new vscode.ThemeIcon('vm', new vscode.ThemeColor('charts.gray'));
  }
}

function formatAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) { return iso; }
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) { return `${sec}s ago`; }
  const min = Math.floor(sec / 60);
  if (min < 60) { return `${min}m ago`; }
  const hr = Math.floor(min / 60);
  if (hr < 24) { return `${hr}h ago`; }
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

// ─── Simple TTL cache ────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache {
  private readonly map = new Map<string, CacheEntry<unknown>>();
  constructor(private readonly ttlMs: number) {}

  get<T>(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) { return undefined; }
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T): void {
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.map.clear();
  }
}

// ─── Provider ────────────────────────────────────────────────────────────────

export class ServiceTreeProvider implements vscode.TreeDataProvider<LocusTreeNode> {
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<LocusTreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly cache = new TtlCache(30_000); // 30-second TTL per spec

  constructor(private readonly client: LocusClient) {}

  refresh(): void {
    this.cache.clear();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: LocusTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: LocusTreeNode): Promise<LocusTreeNode[]> {
    try {
      if (!element) {
        return await this.loadProjects();
      }
      if (element instanceof ProjectNode) {
        return await this.loadEnvironments(element.project);
      }
      if (element instanceof EnvironmentNode) {
        return await this.loadServices(element.environment);
      }
      if (element instanceof ServiceNode) {
        return await this.loadDeployments(element.service);
      }
      return [];
    } catch (err) {
      const message = err instanceof LocusError
        ? `Error: ${err.message}`
        : `Error: ${(err as Error).message}`;
      return [new MessageNode(message, 'warning')];
    }
  }

  private async loadProjects(): Promise<LocusTreeNode[]> {
    const cached = this.cache.get<Project[]>('projects');
    const projects = cached ?? (await this.client.listProjects());
    if (!cached) { this.cache.set('projects', projects); }

    if (projects.length === 0) {
      return [new MessageNode('No projects yet — run "Locus: Deploy Workspace"', 'info')];
    }
    return projects.map((p) => new ProjectNode(p));
  }

  private async loadEnvironments(project: Project): Promise<LocusTreeNode[]> {
    const key = `envs:${project.id}`;
    const cached = this.cache.get<Environment[]>(key);
    const envs = cached ?? (await this.client.listEnvironments(project.id));
    if (!cached) { this.cache.set(key, envs); }

    if (envs.length === 0) {
      return [new MessageNode('(no environments)', 'info')];
    }
    return envs.map((e) => new EnvironmentNode(e));
  }

  private async loadServices(env: Environment): Promise<LocusTreeNode[]> {
    const key = `svcs:${env.id}`;
    const cached = this.cache.get<Service[]>(key);
    const services = cached ?? (await this.client.listServices(env.id));
    if (!cached) { this.cache.set(key, services); }

    if (services.length === 0) {
      return [new MessageNode('(no services)', 'info')];
    }
    return services.map((s) => new ServiceNode(s));
  }

  private async loadDeployments(service: Service): Promise<LocusTreeNode[]> {
    const key = `deps:${service.id}`;
    const cached = this.cache.get<Deployment[]>(key);
    const deployments = cached ?? (await this.client.listDeployments(service.id, 5));
    if (!cached) { this.cache.set(key, deployments); }

    if (deployments.length === 0) {
      return [new MessageNode('(no deployments)', 'info')];
    }
    return deployments.map((d) => new DeploymentNode(d, service.id));
  }
}
