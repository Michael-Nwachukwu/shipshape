import * as vscode from 'vscode';

/**
 * Thin wrapper over VS Code's built-in Git extension API. We only need three
 * operations: `git add`, `git commit`, `git push`. The Git extension exposes
 * these on a Repository object.
 *
 * Types are minimal by design — the full GitExtension types are internal to
 * VS Code. We declare only the fields we touch.
 */

interface GitRepository {
  rootUri: vscode.Uri;
  state: {
    HEAD?: { name?: string; upstream?: unknown };
  };
  add(paths: string[]): Promise<void>;
  commit(message: string, options?: { all?: boolean }): Promise<void>;
  push(remoteName?: string, branchName?: string, setUpstream?: boolean): Promise<void>;
}

interface GitAPI {
  repositories: GitRepository[];
}

interface GitExtension {
  getAPI(version: 1): GitAPI;
}

async function getGitApi(): Promise<GitAPI | undefined> {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!ext) { return undefined; }
  const exports = ext.isActive ? ext.exports : await ext.activate();
  return exports.getAPI(1);
}

export async function findRepository(
  workspaceRoot: vscode.Uri
): Promise<GitRepository | undefined> {
  const api = await getGitApi();
  if (!api) { return undefined; }
  return api.repositories.find(r => r.rootUri.fsPath === workspaceRoot.fsPath);
}

export interface CommitAndPushOptions {
  filePath: string;
  commitMessage: string;
}

/**
 * Stage a single file, create a commit, and push to the current upstream.
 * Returns true on success, false if no git repo / no upstream / error.
 */
export async function commitAndPushFile(
  workspaceRoot: vscode.Uri,
  opts: CommitAndPushOptions
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const repo = await findRepository(workspaceRoot);
  if (!repo) {
    return { ok: false, reason: 'No git repository detected in this workspace.' };
  }

  try {
    await repo.add([opts.filePath]);
    await repo.commit(opts.commitMessage);
  } catch (err) {
    return { ok: false, reason: `git commit failed: ${(err as Error).message}` };
  }

  const branch = repo.state.HEAD?.name;
  const hasUpstream = Boolean(repo.state.HEAD?.upstream);
  try {
    if (hasUpstream) {
      await repo.push();
    } else if (branch) {
      // No upstream yet — set it on this push
      await repo.push('origin', branch, true);
    } else {
      return { ok: false, reason: 'Commit created, but could not push — branch has no name.' };
    }
  } catch (err) {
    return { ok: false, reason: `git push failed: ${(err as Error).message}` };
  }

  return { ok: true };
}
