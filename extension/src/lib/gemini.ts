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
      maxOutputTokens: req.maxTokens ?? 2000,
      ...(req.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

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

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new GeminiError('Empty response from Gemini', 500, data);
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
