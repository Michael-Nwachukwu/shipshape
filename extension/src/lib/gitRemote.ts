import * as vscode from 'vscode';
import * as path from 'path';

const GITHUB_REMOTE_REGEX = /github\.com[/:]([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?$/;

/**
 * Try to read the GitHub remote origin from the workspace's .git/config.
 * Returns owner/repo slug, or undefined if not found.
 */
export async function detectGitHubRemote(
  workspaceRoot: vscode.Uri
): Promise<string | undefined> {
  try {
    const gitConfigUri = vscode.Uri.file(path.join(workspaceRoot.fsPath, '.git', 'config'));
    const bytes = await vscode.workspace.fs.readFile(gitConfigUri);
    const text = new TextDecoder().decode(bytes);
    return parseGitHubRemote(text);
  } catch {
    return undefined;
  }
}

/**
 * Parse .git/config text and find the first GitHub remote URL.
 * Handles both https:// and git@github.com: formats.
 */
export function parseGitHubRemote(gitConfig: string): string | undefined {
  for (const line of gitConfig.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('url =')) { continue; }
    const url = trimmed.replace(/^url\s*=\s*/, '').trim();
    const match = url.match(GITHUB_REMOTE_REGEX);
    if (match) { return match[1]; }
  }
  return undefined;
}

/**
 * Check whether the workspace is a git repo at all (has a .git directory).
 */
export async function isGitRepo(workspaceRoot: vscode.Uri): Promise<boolean> {
  try {
    const gitDirUri = vscode.Uri.file(path.join(workspaceRoot.fsPath, '.git'));
    const stat = await vscode.workspace.fs.stat(gitDirUri);
    return stat.type === vscode.FileType.Directory;
  } catch {
    return false;
  }
}
