import * as vscode from 'vscode';
import { LocusClient, Service, Environment, Project } from '../lib/locus';
import { ServiceNode } from '../providers/ServiceTreeProvider';
import { DomainProvider } from '../providers/DomainProvider';
import { showError } from '../lib/errorFormat';

interface ServicePickItem extends vscode.QuickPickItem {
  service: Service;
  project: Project;
  environment: Environment;
}

/**
 * Entry point for "ShipShape: Add Custom Domain".
 * Accepts a ServiceNode from right-click, or shows a QuickPick across all services.
 */
export async function runAddDomain(
  _context: vscode.ExtensionContext,
  client: LocusClient,
  provider: DomainProvider,
  node?: ServiceNode
): Promise<void> {
  try {
    // ── Step 1: resolve the target service ─────────────────────────────────
    let service: Service | undefined;
    if (node instanceof ServiceNode) {
      service = node.service;
    } else {
      service = await pickService(client);
    }
    if (!service) { return; }

    // ── Step 2: ask BYOD or purchase ───────────────────────────────────────
    const choice = await vscode.window.showQuickPick(
      [
        {
          label: '$(globe) BYOD — I already own this domain',
          description: 'Add your existing domain, add DNS records, then attach',
          value: 'byod' as const,
        },
        {
          label: '$(link-external) Purchase a new domain',
          description: 'Opens the Locus dashboard in your browser',
          value: 'purchase' as const,
        },
      ],
      {
        title: 'Add Custom Domain',
        placeHolder: `Target service: ${service.name}`,
      }
    );
    if (!choice) { return; }

    if (choice.value === 'purchase') {
      await vscode.env.openExternal(
        vscode.Uri.parse('https://beta.buildwithlocus.com/domains')
      );
      vscode.window.showInformationMessage(
        'In-editor domain purchase is not supported — purchase in the dashboard, then return here and choose "BYOD" to wire it up.'
      );
      return;
    }

    // BYOD: open the webview for this service.
    provider.show(service.id, service.name, service.projectId);
  } catch (err) {
    await showError(err, 'Add Custom Domain');
  }
}

async function pickService(client: LocusClient): Promise<Service | undefined> {
  const projects = await client.listProjects();
  if (projects.length === 0) {
    vscode.window.showInformationMessage(
      'No projects yet — deploy a workspace first with "ShipShape: Deploy Workspace".'
    );
    return undefined;
  }

  // Collect all services across all environments, labeled project/env/service.
  const items: ServicePickItem[] = [];
  for (const project of projects) {
    let envs: Environment[] = [];
    try {
      envs = await client.listEnvironments(project.id);
    } catch {
      // Skip projects we can't read — surface via the final empty check.
      continue;
    }
    for (const environment of envs) {
      let services: Service[] = [];
      try {
        services = await client.listServices(environment.id);
      } catch {
        continue;
      }
      for (const service of services) {
        items.push({
          label: `$(server-process) ${service.name}`,
          description: `${project.name} / ${environment.name}`,
          detail: service.url || undefined,
          service,
          project,
          environment,
        });
      }
    }
  }

  if (items.length === 0) {
    vscode.window.showInformationMessage('No services found across your projects.');
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Select a service to add a domain to',
    placeHolder: 'Pick a service',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return picked?.service;
}
