import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const CLI_CREDENTIALS_PATH = path.join(os.homedir(), '.config', 'locus', 'credentials.json');

export interface StoredApiKey {
  key: string;
  source: 'secrets' | 'cli-credentials';
}

/**
 * Discover a stored Locus Build API key from known locations, in priority:
 *   1. VS Code SecretStorage (what the extension writes when user runs "Configure API Key")
 *   2. CLI credentials file at ~/.config/locus/credentials.json
 *
 * Returns undefined if none found. The caller is responsible for prompting.
 */
export async function findStoredApiKey(
  secrets: vscode.SecretStorage
): Promise<StoredApiKey | undefined> {
  // 1. SecretStorage (preferred — encrypted)
  const fromSecrets = await secrets.get('shipshape.buildApiKey');
  if (fromSecrets) {
    return { key: fromSecrets, source: 'secrets' };
  }

  // 2. CLI credentials file
  const fromCli = await readCliCredentials();
  if (fromCli) {
    return { key: fromCli, source: 'cli-credentials' };
  }

  return undefined;
}

async function readCliCredentials(): Promise<string | undefined> {
  try {
    const uri = vscode.Uri.file(CLI_CREDENTIALS_PATH);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const data = JSON.parse(new TextDecoder().decode(bytes)) as { api_key?: string };
    if (typeof data.api_key === 'string' && data.api_key.startsWith('claw_')) {
      return data.api_key;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// ─── Gemini API key (for AI failure diagnosis + auto-fix) ────────────────────

const GEMINI_KEY_SECRET = 'shipshape.geminiApiKey';

/** Check SecretStorage only. */
export async function findStoredAiKey(
  secrets: vscode.SecretStorage
): Promise<string | undefined> {
  return secrets.get(GEMINI_KEY_SECRET);
}

/**
 * Prompt user for a Gemini API key and save it. Used lazily — only when an
 * AI feature is invoked for the first time. Get one free at
 * https://aistudio.google.com/apikey. Returns undefined on cancel.
 */
export async function promptForAiKey(
  secrets: vscode.SecretStorage,
  reason?: string
): Promise<string | undefined> {
  const prompt = reason
    ? `${reason} — paste a Gemini API key (free at aistudio.google.com/apikey)`
    : 'Paste a Gemini API key (free at aistudio.google.com/apikey)';
  const key = await vscode.window.showInputBox({
    prompt,
    password: true,
    placeHolder: 'AIza...',
    ignoreFocusOut: true,
    validateInput: (v) => {
      if (!v) { return 'Required'; }
      if (v.length < 20) { return 'Key looks too short'; }
      return null;
    },
  });
  if (!key) { return undefined; }
  await secrets.store(GEMINI_KEY_SECRET, key);
  return key;
}

export async function clearAiKey(secrets: vscode.SecretStorage): Promise<void> {
  await secrets.delete(GEMINI_KEY_SECRET);
}
