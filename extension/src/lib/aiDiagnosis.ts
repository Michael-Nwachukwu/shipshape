import * as vscode from 'vscode';
import * as path from 'path';
import { complete as geminiComplete, extractJson, GeminiError } from './gemini';
import { complete as groqComplete, GroqError } from './groq';
import { ProjectType, PROJECT_TYPE_LABELS } from './detector';

// Re-export so callers catch a single error type without importing gemini directly
export { GeminiError as AiError };

export type AiProvider = 'gemini' | 'groq';

export interface AiKeys {
  gemini?: string;
  groq?: string;
}

export interface AiDiagnosisResult {
  diagnosis: AiDiagnosis;
  provider: AiProvider;
  /** Populated when the primary provider (Gemini) failed and we fell back. */
  primaryError?: string;
}

/** What we hand Claude. Kept small — logs are the bulk of tokens. */
export interface DiagnosisInput {
  phase: string;
  logs: string[];
  projectType: ProjectType;
  workspaceRoot: vscode.Uri;
  repoSlug: string;
}

export interface AiDiagnosis {
  summary: string;            // one-line human headline
  rootCause: string;          // 2-4 sentences
  owner: 'user' | 'platform' | 'config' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  fix: ProposedFix | null;    // null = no safe auto-fix
}

export interface ProposedFix {
  description: string;        // "Change Dockerfile FROM to node:20-alpine"
  file: string;               // path relative to workspace root
  action: 'replace';          // future: 'patch' for surgical edits
  content: string;            // full new file content
  commitMessage: string;      // suggested git commit
}

const SYSTEM_PROMPT = `You are an expert deployment failure diagnostician for the Locus PaaS.
You will receive the failure phase, the tail of the build/runtime logs, and the project's current state (relevant files).

Your job: identify the ROOT CAUSE and, when safe, propose a concrete file-level fix.

Context about Locus:
- Containers MUST listen on port 8080 (platform injects PORT=8080)
- Base images are pulled from Locus's ECR mirror of Docker Hub (only "library/*" images, subset available — node:20-alpine works, caddy:2-alpine does NOT)
- Images MUST be linux/arm64
- \`.locusbuild\` uses Nixpacks auto-detection; does NOT support buildConfig — that only works on direct POST /v1/services
- Health checks: Locus proxies to the service at the configured healthCheck path on 8080 shortly after start

Output a single JSON object matching this schema EXACTLY. No prose, no markdown fences, no explanation.

{
  "summary": "one-sentence headline of what went wrong",
  "rootCause": "2-4 sentences explaining the actual cause, citing specific log lines if relevant",
  "owner": "user" | "platform" | "config" | "unknown",
  "confidence": "high" | "medium" | "low",
  "fix": null | {
    "description": "short label for the change",
    "file": "path/relative/to/workspace/root",
    "action": "replace",
    "content": "FULL new file content (we overwrite the existing file)",
    "commitMessage": "git commit message"
  }
}

Rules for proposing a fix:
- Only propose a fix when confidence is "high" and the change is SAFE and MINIMAL.
- "file" must be the path of an existing file in the workspace (Dockerfile, package.json, .locusbuild, etc.), relative to repo root.
- "content" must be the COMPLETE new file contents. The extension does a full replace, not a patch.
- If the fix would require changes to multiple files, or would delete/add files, set "fix": null and explain in rootCause.
- Prefer the smallest viable change. Don't refactor. Don't add comments. Don't change anything unrelated to the fix.
- If the failure is platform-side (owner: "platform"), set fix: null — user can't fix it, only retry.`;

/** Build the user-facing message for Gemini: logs + attached files. */
function buildUserMessage(input: DiagnosisInput, files: AttachedFile[]): string {
  const logs = input.logs.slice(-200).join('\n');
  const attachments = files.length > 0
    ? files.map(f => `\n===== FILE: ${f.path} =====\n${f.content}`).join('\n')
    : '\n(no project files attached)';

  return `Deployment failed.

Phase at failure: ${input.phase}
Project type: ${PROJECT_TYPE_LABELS[input.projectType]} (${input.projectType})
Repo: ${input.repoSlug}

---- LAST ${Math.min(input.logs.length, 200)} LOG LINES ----
${logs}

---- PROJECT FILES ----${attachments}`;
}

/**
 * Build a smaller message for Groq's free-tier context window.
 * Limits: 80 log lines, 3 KB per file, top-4 most diagnostic files only.
 */
function buildGroqUserMessage(input: DiagnosisInput, files: AttachedFile[]): string {
  const MAX_LOG_LINES = 80;
  const MAX_FILE_CHARS = 3_000;
  const MAX_FILES = 4;

  const logs = input.logs.slice(-MAX_LOG_LINES).join('\n');

  // Prioritise the files most likely to contain the root cause.
  const priority = ['Dockerfile', '.locusbuild', 'package.json', 'nixpacks.toml',
                    'requirements.txt', 'pyproject.toml', 'Gemfile'];
  const sorted = [...files].sort(
    (a, b) => (priority.indexOf(a.path) === -1 ? 99 : priority.indexOf(a.path))
            - (priority.indexOf(b.path) === -1 ? 99 : priority.indexOf(b.path))
  );
  const trimmed = sorted.slice(0, MAX_FILES).map(f => {
    const content = f.content.length > MAX_FILE_CHARS
      ? f.content.slice(0, MAX_FILE_CHARS) + '\n... [truncated]'
      : f.content;
    return `\n===== FILE: ${f.path} =====\n${content}`;
  });

  const attachments = trimmed.length > 0 ? trimmed.join('\n') : '\n(no project files attached)';

  return `Deployment failed.

Phase: ${input.phase}
Project type: ${PROJECT_TYPE_LABELS[input.projectType]}
Repo: ${input.repoSlug}

---- LAST ${Math.min(input.logs.length, MAX_LOG_LINES)} LOG LINES ----
${logs}

---- PROJECT FILES ----${attachments}`;
}

interface AttachedFile {
  path: string;
  content: string;
}

/** Read the files that are most likely to be diagnostic — keep total size bounded. */
async function collectProjectFiles(workspaceRoot: vscode.Uri): Promise<AttachedFile[]> {
  const candidates = [
    'Dockerfile',
    '.locusbuild',
    'package.json',
    'requirements.txt',
    'pyproject.toml',
    'Gemfile',
    'nixpacks.toml',
  ];
  const files: AttachedFile[] = [];
  const MAX_BYTES_PER_FILE = 8_000;

  for (const name of candidates) {
    try {
      const uri = vscode.Uri.file(path.join(workspaceRoot.fsPath, name));
      const bytes = await vscode.workspace.fs.readFile(uri);
      let content = new TextDecoder().decode(bytes);
      if (content.length > MAX_BYTES_PER_FILE) {
        content = content.slice(0, MAX_BYTES_PER_FILE) + `\n... [truncated, file is ${bytes.byteLength} bytes total]`;
      }
      files.push({ path: name, content });
    } catch {
      // file doesn't exist — skip
    }
  }
  return files;
}

// Gemini responseSchema — OpenAPI 3.0 subset, UPPERCASE type names.
// The `fix` object is wrapped in nullable so Gemini can legitimately emit null.
const DIAGNOSIS_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    rootCause: { type: 'STRING' },
    owner: { type: 'STRING', enum: ['user', 'platform', 'config', 'unknown'] },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    fix: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        description: { type: 'STRING' },
        file: { type: 'STRING' },
        action: { type: 'STRING', enum: ['replace'] },
        content: { type: 'STRING' },
        commitMessage: { type: 'STRING' },
      },
      required: ['description', 'file', 'action', 'content', 'commitMessage'],
    },
  },
  required: ['summary', 'rootCause', 'owner', 'confidence', 'fix'],
};

function validateDiagnosis(parsed: AiDiagnosis): void {
  if (typeof parsed.summary !== 'string' || typeof parsed.rootCause !== 'string') {
    throw new Error('Diagnosis JSON missing required fields');
  }
}

async function runGemini(apiKey: string, userMessage: string): Promise<AiDiagnosis> {
  const response = await geminiComplete(apiKey, {
    system: SYSTEM_PROMPT,
    userMessage,
    maxTokens: 8000,
    jsonMode: true,
    responseSchema: DIAGNOSIS_SCHEMA,
  });
  let parsed: AiDiagnosis;
  try {
    parsed = extractJson<AiDiagnosis>(response);
  } catch (err) {
    throw new GeminiError(
      `Gemini returned malformed JSON: ${(err as Error).message}. Raw response (first 300 chars): ${response.slice(0, 300)}`,
      500,
      { raw: response.slice(0, 1000) }
    );
  }
  try {
    validateDiagnosis(parsed);
  } catch (err) {
    throw new GeminiError((err as Error).message, 500, parsed);
  }
  return parsed;
}

async function runGroq(
  apiKey: string,
  input: DiagnosisInput,
  files: AttachedFile[]
): Promise<AiDiagnosis> {
  // Build a smaller message that fits Groq's free-tier context window.
  const userMessage = buildGroqUserMessage(input, files);
  // Groq's JSON mode enforces valid JSON but no schema — push the schema into the prompt.
  const system = SYSTEM_PROMPT + '\n\nReturn ONLY the JSON object. Do not wrap in any other keys.';
  const response = await groqComplete(apiKey, {
    system,
    userMessage,
    maxTokens: 4000,
    jsonMode: true,
  });
  let parsed: AiDiagnosis;
  try {
    parsed = extractJson<AiDiagnosis>(response);
  } catch (err) {
    throw new GroqError(
      `Groq returned malformed JSON: ${(err as Error).message}. Raw response (first 300 chars): ${response.slice(0, 300)}`,
      500,
      { raw: response.slice(0, 1000) }
    );
  }
  try {
    validateDiagnosis(parsed);
  } catch (err) {
    throw new GroqError((err as Error).message, 500, parsed);
  }
  return parsed;
}

/**
 * Diagnose a failure using Gemini first, falling back to Groq if Gemini errors
 * (after its own internal retries). Throws only if BOTH providers fail — or if
 * the only configured provider fails. Throws AiError (Gemini) so existing
 * call-sites keep working; Groq failures are logged in primaryError.
 */
export async function diagnoseFailure(
  keys: AiKeys,
  input: DiagnosisInput,
  onProviderEvent?: (event: { type: 'fallback'; reason: string }) => void
): Promise<AiDiagnosisResult> {
  const files = await collectProjectFiles(input.workspaceRoot);
  const userMessage = buildUserMessage(input, files);

  if (keys.gemini) {
    try {
      const diagnosis = await runGemini(keys.gemini, userMessage);
      return { diagnosis, provider: 'gemini' };
    } catch (err) {
      const reason = err instanceof GeminiError
        ? `Gemini failed (HTTP ${err.statusCode}): ${err.message}`
        : `Gemini failed: ${(err as Error).message}`;
      if (!keys.groq) {
        throw err;
      }
      onProviderEvent?.({ type: 'fallback', reason });
      const diagnosis = await runGroq(keys.groq, input, files);
      return { diagnosis, provider: 'groq', primaryError: reason };
    }
  }

  if (keys.groq) {
    const diagnosis = await runGroq(keys.groq, input, files);
    return { diagnosis, provider: 'groq' };
  }

  throw new GeminiError('No AI provider key configured', 401);
}
