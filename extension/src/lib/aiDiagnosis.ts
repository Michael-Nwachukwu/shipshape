import * as vscode from 'vscode';
import * as path from 'path';
import { complete, extractJson, AnthropicError } from './anthropic';
import { ProjectType, PROJECT_TYPE_LABELS } from './detector';

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

/** Build the user-facing message for Claude: logs + attached files. */
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

export async function diagnoseFailure(
  payApiKey: string,
  input: DiagnosisInput
): Promise<AiDiagnosis> {
  const files = await collectProjectFiles(input.workspaceRoot);
  const userMessage = buildUserMessage(input, files);

  const response = await complete(payApiKey, {
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 2000,
  });

  let parsed: AiDiagnosis;
  try {
    parsed = extractJson<AiDiagnosis>(response);
  } catch (err) {
    throw new AnthropicError(
      `Claude returned malformed JSON: ${(err as Error).message}`,
      500,
      { raw: response.slice(0, 500) }
    );
  }

  // Basic shape validation — enough to fail fast on junk responses
  if (typeof parsed.summary !== 'string' || typeof parsed.rootCause !== 'string') {
    throw new AnthropicError('Diagnosis JSON missing required fields', 500, parsed);
  }
  return parsed;
}
