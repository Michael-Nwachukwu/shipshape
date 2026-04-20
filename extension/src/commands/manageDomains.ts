import * as vscode from 'vscode';
import { LocusClient, LocusError, Domain } from '../lib/locus';
import { showError } from '../lib/errorFormat';

/**
 * Entry point for "ShipShape: Manage Domains".
 * Lists ALL domains in the workspace (attached, pending, validating, orphaned)
 * so the user can remove ones that aren't findable through the service panel —
 * e.g. an unattached domain created in a previous session.
 */
export async function runManageDomains(client: LocusClient): Promise<void> {
  try {
    const domains = await client.listDomains();
    if (domains.length === 0) {
      vscode.window.showInformationMessage(
        'No domains in this workspace. Add one from a service via "ShipShape: Add Custom Domain".'
      );
      return;
    }

    const picked = await vscode.window.showQuickPick(
      domains.map(toPickItem),
      {
        title: `Domains in workspace (${domains.length})`,
        placeHolder: 'Pick a domain to remove',
        matchOnDescription: true,
        matchOnDetail: true,
      }
    );
    if (!picked) { return; }

    const target = picked.domain;
    const confirm = await vscode.window.showWarningMessage(
      `Remove "${target.domain}"?`,
      { modal: true, detail: 'This detaches it from any service and deletes it permanently.' },
      'Remove'
    );
    if (confirm !== 'Remove') { return; }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Removing ${target.domain}…` },
      async () => {
        // Detach first — ignore 400 ("not attached") and 409 ("conflict / already detached")
        try {
          await client.detachDomain(target.id);
        } catch (err) {
          if (!(err instanceof LocusError && (err.statusCode === 400 || err.statusCode === 409))) {
            throw err;
          }
        }
        await client.deleteDomain(target.id);
      }
    );

    vscode.window.showInformationMessage(`Removed ${target.domain}.`);
  } catch (err) {
    await showError(err, 'Manage Domains');
  }
}

interface DomainPickItem extends vscode.QuickPickItem {
  domain: Domain;
}

function toPickItem(d: Domain): DomainPickItem {
  const status = statusLabel(d);
  const detail = d.serviceId
    ? `attached to service ${d.serviceId}`
    : 'unattached';
  return {
    label: `$(globe) ${d.domain}`,
    description: status,
    detail,
    domain: d,
  };
}

function statusLabel(d: Domain): string {
  if (d.serviceId && d.certificateValidated) { return '$(check) attached'; }
  if (d.validationStatus === 'validated') { return '$(pass) validated — not attached'; }
  if (d.validationStatus === 'failed') { return '$(error) failed'; }
  if (d.validationStatus === 'validating') { return '$(sync~spin) validating'; }
  return '$(clock) pending';
}
