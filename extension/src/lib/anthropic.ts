/**
 * Thin client for Anthropic's Messages API, proxied through Locus Pay's
 * wrapped endpoint. Locus Pay forwards to Anthropic and charges our Pay
 * credit balance, so we use the Pay API key (NOT the Build key).
 *
 * Security: the Pay key is read from SecretStorage by the caller and passed
 * in. This module never touches SecretStorage or logs the key.
 */

const WRAPPED_ENDPOINT = 'https://api.paywithlocus.com/api/wrapped/anthropic/v1/messages';

// Use a Claude 4 family model — reliable for structured JSON output
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnthropicRequest {
  model?: string;
  system: string;
  messages: AnthropicMessage[];
  maxTokens?: number;
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  usage?: { input_tokens: number; output_tokens: number };
}

export class AnthropicError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public body?: unknown
  ) {
    super(message);
    this.name = 'AnthropicError';
  }
}

export async function complete(
  payApiKey: string,
  req: AnthropicRequest
): Promise<string> {
  const response = await fetch(WRAPPED_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${payApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: req.model ?? DEFAULT_MODEL,
      max_tokens: req.maxTokens ?? 2000,
      system: req.system,
      messages: req.messages,
    }),
  });

  if (!response.ok) {
    let body: unknown;
    try { body = await response.json(); } catch { /* ignore */ }
    throw new AnthropicError(
      `Locus Pay wrapped Anthropic returned ${response.status}`,
      response.status,
      body
    );
  }

  const data = (await response.json()) as AnthropicResponse;
  const textBlock = data.content.find(c => c.type === 'text' && c.text);
  if (!textBlock?.text) {
    throw new AnthropicError('Empty response from Claude', 500, data);
  }
  return textBlock.text;
}

/**
 * Parse a JSON object from Claude's text response. Handles a few common
 * wrappers: bare JSON, ```json fenced blocks, ``` fenced blocks.
 */
export function extractJson<T>(text: string): T {
  let s = text.trim();
  // Strip code fences if present
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) { s = fence[1].trim(); }
  return JSON.parse(s) as T;
}
