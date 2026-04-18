import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectType } from './detector';

export interface LocusBuildConfig {
  services: Record<string, {
    path: string;
    port: 8080;
    healthCheck: string;
    env?: Record<string, string>;
  }>;
  addons?: Record<string, { type: 'postgres' | 'redis' }>;
  region?: string;
}

/**
 * Templates per project type. `null` → we don't know enough, ask the user.
 *
 * CRITICAL: Never include `buildConfig` here — it's not supported in `.locusbuild`.
 * `.locusbuild` uses Nixpacks auto-detection for builds. `buildConfig` is only
 * valid on direct `POST /v1/services` calls.
 */
const TEMPLATES: Record<ProjectType, LocusBuildConfig | null> = {
  nextjs:           { services: { web: { path: '.', port: 8080, healthCheck: '/' } } },
  'react-vite':     { services: { web: { path: '.', port: 8080, healthCheck: '/' } } },
  express:          { services: { api: { path: '.', port: 8080, healthCheck: '/' } } },
  fastapi:          { services: { api: { path: '.', port: 8080, healthCheck: '/health' } } },
  django:           { services: { api: { path: '.', port: 8080, healthCheck: '/' } } },
  rails:            { services: { api: { path: '.', port: 8080, healthCheck: '/' } } },
  dockerfile:       { services: { web: { path: '.', port: 8080, healthCheck: '/' } } },
  'generic-node':   { services: { web: { path: '.', port: 8080, healthCheck: '/' } } },
  'generic-python': { services: { api: { path: '.', port: 8080, healthCheck: '/' } } },
  unknown:          null,
};

export function generateLocusBuild(projectType: ProjectType): LocusBuildConfig | null {
  return TEMPLATES[projectType];
}

// ─── Filesystem I/O ───────────────────────────────────────────────────────────

export async function locusBuildUri(workspaceRoot: vscode.Uri): Promise<vscode.Uri> {
  return vscode.Uri.file(path.join(workspaceRoot.fsPath, '.locusbuild'));
}

export async function readLocusBuild(workspaceRoot: vscode.Uri): Promise<LocusBuildConfig | null> {
  try {
    const uri = await locusBuildUri(workspaceRoot);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text) as LocusBuildConfig;
  } catch {
    return null;
  }
}

export async function writeLocusBuild(
  workspaceRoot: vscode.Uri,
  config: LocusBuildConfig
): Promise<vscode.Uri> {
  const uri = await locusBuildUri(workspaceRoot);
  const content = new TextEncoder().encode(JSON.stringify(config, null, 2) + '\n');
  await vscode.workspace.fs.writeFile(uri, content);
  return uri;
}

export async function locusBuildExists(workspaceRoot: vscode.Uri): Promise<boolean> {
  try {
    const uri = await locusBuildUri(workspaceRoot);
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
