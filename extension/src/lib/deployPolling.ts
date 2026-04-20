import * as vscode from 'vscode';
import {
  LocusClient,
  Deployment,
  DeploymentStatus,
  TERMINAL_STATUSES,
} from './locus';
import * as statusBar from '../statusBar';

export const POLL_INTERVAL_MS = 60_000;
export const POLL_TIMEOUT_MS = 15 * 60_000;
export const SERVICE_DISCOVERY_DELAY_MS = 60_000;

/**
 * Poll a deployment to terminal status. Uses setTimeout-based rescheduling
 * (never setInterval or while-true loops). Logs status transitions to the
 * provided output channel and updates the status bar.
 */
export async function pollDeployment(
  client: LocusClient,
  deploymentId: string,
  channel: vscode.OutputChannel
): Promise<Deployment> {
  const startTime = Date.now();
  let lastStatus: DeploymentStatus | null = null;

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

export function updateStatusBarForStatus(status: DeploymentStatus): void {
  switch (status) {
    case 'queued':
    case 'building':
      statusBar.setState('building');
      break;
    case 'deploying':
      statusBar.setState('deploying');
      break;
    case 'healthy':
      // Handled by caller after the service-discovery delay
      break;
    case 'failed':
    case 'cancelled':
    case 'rolled_back':
      statusBar.setState('failed');
      break;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
