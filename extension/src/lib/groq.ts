/**
 * Thin client for Groq's OpenAI-compatible Chat Completions API.
 * Used as a fallback when Gemini is unavailable (e.g. sustained 5xx).
 * Free tier: https://console.groq.com/keys
 *
 * Security: API key is read from SecretStorage by the caller. This module
 * never touches SecretStorage or logs the key.
 */

export const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export interface GroqRequest {
  model?: string;
  system: string;
  userMessage: string;
  maxTokens?: number;
  /** When true, request JSON mode via response_format. */
  jsonMode?: boolean;
}

interface GroqResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  error?: { message: string; type?: string; code?: string };
}

export class GroqError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public body?: unknown
  ) {
    super(message);
    this.name = 'GroqError';
  }
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 1500;

export async function complete(apiKey: string, req: GroqRequest): Promise<string> {
  const model = req.model ?? DEFAULT_MODEL;
  const body: Record<string, unknown> = {
    model,
    temperature: 0.2,
    max_tokens: req.maxTokens ?? 4000,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.userMessage },
    ],
    ...(req.jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };

  let response: Response | undefined;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (response.ok) { break; }
      if (!RETRYABLE_STATUSES.has(response.status) || attempt === MAX_RETRIES) { break; }
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_RETRIES) { throw err; }
    }
    await new Promise((r) => setTimeout(r, BASE_BACKOFF_MS * 2 ** attempt));
  }

  if (!response) {
    throw new GroqError(
      `Groq network error: ${(lastErr as Error)?.message ?? 'unknown'}`,
      0
    );
  }

  if (!response.ok) {
    let errBody: unknown;
    try { errBody = await response.json(); } catch { /* ignore */ }
    throw new GroqError(
      `Groq API returned ${response.status}`,
      response.status,
      errBody
    );
  }

  const data = (await response.json()) as GroqResponse;
  if (data.error) {
    throw new GroqError(data.error.message, 500, data.error);
  }
  const choice = data.choices?.[0];
  const text = choice?.message?.content;
  if (!text) {
    throw new GroqError('Empty response from Groq', 500, data);
  }
  if (choice?.finish_reason === 'length') {
    throw new GroqError(
      'Groq response was truncated (hit max_tokens). Increase maxTokens or simplify the request.',
      500,
      { finishReason: choice.finish_reason, rawLength: text.length }
    );
  }
  return text;
}
