import * as vscode from 'vscode';
import * as path from 'path';

export type ProjectType =
  | 'nextjs'
  | 'react-vite'
  | 'express'
  | 'fastapi'
  | 'django'
  | 'rails'
  | 'generic-node'
  | 'generic-python'
  | 'dockerfile'
  | 'unknown';

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  'nextjs':         'Next.js',
  'react-vite':     'React + Vite',
  'express':        'Express (Node.js)',
  'fastapi':        'FastAPI (Python)',
  'django':         'Django (Python)',
  'rails':          'Ruby on Rails',
  'generic-node':   'Generic Node.js',
  'generic-python': 'Generic Python',
  'dockerfile':     'Dockerfile (custom)',
  'unknown':        'Unknown',
};

/**
 * Detect the project type from workspace files.
 * Priority order matters — a Dockerfile always wins, then specific frameworks,
 * then generic language buckets.
 */
export async function detectProjectType(workspaceRoot: vscode.Uri): Promise<ProjectType> {
  // 1. Dockerfile
  if (await fileExists(workspaceRoot, 'Dockerfile')) {
    return 'dockerfile';
  }

  // 2-4. Node.js frameworks (via package.json)
  const pkgJson = await readJsonFile(workspaceRoot, 'package.json');
  if (pkgJson) {
    const deps = {
      ...(pkgJson.dependencies ?? {}),
      ...(pkgJson.devDependencies ?? {}),
    };
    if ('next' in deps) {
      return 'nextjs';
    }
    if ('react' in deps && 'vite' in deps) {
      return 'react-vite';
    }
    if ('express' in deps) {
      return 'express';
    }
    return 'generic-node';
  }

  // 5-6. Python frameworks (via requirements.txt)
  const requirements = await readTextFile(workspaceRoot, 'requirements.txt');
  if (requirements !== null) {
    const lower = requirements.toLowerCase();
    if (/\bfastapi\b/.test(lower)) {
      return 'fastapi';
    }
    if (/\bdjango\b/.test(lower)) {
      return 'django';
    }
    return 'generic-python';
  }

  // Check pyproject.toml as fallback for Python projects
  const pyproject = await readTextFile(workspaceRoot, 'pyproject.toml');
  if (pyproject !== null) {
    const lower = pyproject.toLowerCase();
    if (/fastapi/.test(lower)) {
      return 'fastapi';
    }
    if (/django/.test(lower)) {
      return 'django';
    }
    return 'generic-python';
  }

  // 7. Rails (Gemfile)
  const gemfile = await readTextFile(workspaceRoot, 'Gemfile');
  if (gemfile !== null) {
    if (/\brails\b/i.test(gemfile)) {
      return 'rails';
    }
  }

  return 'unknown';
}

// ─── File helpers ────────────────────────────────────────────────────────────

async function fileExists(root: vscode.Uri, name: string): Promise<boolean> {
  try {
    const uri = vscode.Uri.file(path.join(root.fsPath, name));
    const stat = await vscode.workspace.fs.stat(uri);
    return stat.type === vscode.FileType.File;
  } catch {
    return false;
  }
}

async function readTextFile(root: vscode.Uri, name: string): Promise<string | null> {
  try {
    const uri = vscode.Uri.file(path.join(root.fsPath, name));
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

async function readJsonFile(root: vscode.Uri, name: string): Promise<any | null> {
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
