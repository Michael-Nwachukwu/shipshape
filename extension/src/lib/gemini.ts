/**
 * Thin client for Google's Gemini API. Free tier via AI Studio
 * (https://aistudio.google.com/apikey). Uses JSON mode for reliable
 * structured output.
 *
 * Security: the API key is read from SecretStorage by the caller and passed
 * in. This module never touches SecretStorage or logs the key.
 */

export const DEFAULT_MODEL = 'gemini-2.5-flash';
const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiRequest {
  model?: string;
  system: string;
  userMessage: string;
  maxTokens?: number;
  /** When true, ask Gemini to return application/json directly. */
  jsonMode?: boolean;
  /**
   * Gemini responseSchema (OpenAPI 3.0 subset, UPPERCASE types).
   * When provided, the model is constrained to emit JSON matching this schema.
   * Far more reliable than jsonMode alone.
   */
  responseSchema?: Record<string, unknown>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { code: number; message: string; status: string };
}

export class GeminiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public body?: unknown
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

// Retryable HTTP codes: 429 (rate limit), 500/502/503/504 (transient server errors)
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 1500;

export async function complete(
  apiKey: string,
  req: GeminiRequest
): Promise<string> {
  const model = req.model ?? DEFAULT_MODEL;
  const url = `${ENDPOINT_BASE}/${encodeURIComponent(model)}:generateContent`;

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: 'user', parts: [{ text: req.userMessage }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: req.maxTokens ?? 4000,
      ...(req.jsonMode ? { responseMimeType: 'application/json' } : {}),
      ...(req.responseSchema ? { responseSchema: req.responseSchema } : {}),
    },
  };

  let response: Response | undefined;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
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
    // Exponential backoff: 1.5s, 3s
    await new Promise((r) => setTimeout(r, BASE_BACKOFF_MS * 2 ** attempt));
  }

  if (!response) {
    throw new GeminiError(
      `Gemini network error: ${(lastErr as Error)?.message ?? 'unknown'}`,
      0
    );
  }

  if (!response.ok) {
    let errBody: unknown;
    try { errBody = await response.json(); } catch { /* ignore */ }
    throw new GeminiError(
      `Gemini API returned ${response.status}`,
      response.status,
      errBody
    );
  }

  const data = (await response.json()) as GeminiResponse;

  if (data.error) {
    throw new GeminiError(data.error.message, data.error.code || 500, data.error);
  }
  if (data.promptFeedback?.blockReason) {
    throw new GeminiError(
      `Gemini blocked the prompt: ${data.promptFeedback.blockReason}`,
      400,
      data.promptFeedback
    );
  }

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    throw new GeminiError('Empty response from Gemini', 500, data);
  }
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new GeminiError(
      'Gemini response was truncated (hit max output tokens). Increase maxTokens or simplify the request.',
      500,
      { finishReason: candidate.finishReason, rawLength: text.length }
    );
  }
  return text;
}

/**
 * Parse JSON from a model response. Handles bare JSON, ```json fenced blocks,
 * and plain ``` fenced blocks. With jsonMode: true this is usually redundant,
 * but kept as a safety net.
 */
export function extractJson<T>(text: string): T {
  let s = text.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) { s = fence[1].trim(); }
  return JSON.parse(s) as T;
}
