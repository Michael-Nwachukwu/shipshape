import * as vscode from 'vscode';
import { LocusError } from './locus';

/**
 * Format any thrown error into a user-friendly message + optional action button.
 * Centralised so that 401/402/404/5xx all surface consistently across commands.
 */
export interface FormattedError {
  message: string;
  actions?: Array<{ label: string; url?: string }>;
}

export function formatError(err: unknown, context?: string): FormattedError {
  const prefix = context ? `${context}: ` : '';
  const isDomainContext = !!context && /domain/i.test(context);

  if (err instanceof LocusError) {
    // Only treat a domain 400 as "limit reached" when the API message actually
    // mentions a limit — detach/delete can also return 400 for unrelated reasons
    // ("not attached", etc.) and the limit message would be misleading there.
    const looksLikeDomainLimit =
      isDomainContext &&
      /limit|max(imum)?|quota|too many/i.test(`${err.message} ${err.details ?? ''}`);

    switch (err.statusCode) {
      case 400:
        if (looksLikeDomainLimit) {
          return {
            message: `${prefix}Domain limit reached — max 20 per workspace. Remove an unused domain to free a slot.`,
            actions: [{ label: 'Open Dashboard', url: 'https://beta.buildwithlocus.com/domains' }],
          };
        }
        return {
          message: `${prefix}${err.message}${err.details ? ` — ${err.details}` : ''}`,
        };
      case 401:
        return {
          message: `${prefix}Authentication failed. Your API key may be invalid or expired.`,
          actions: [{ label: 'Re-enter API Key' }],
        };
      case 402: {
        const balance = err.creditBalance !== undefined ? `$${err.creditBalance}` : 'unknown';
        const required = err.requiredAmount !== undefined ? `$${err.requiredAmount}` : '$0.25';
        return {
          message: `${prefix}Insufficient credits (balance: ${balance}, need: ${required}).`,
          actions: [{ label: 'Add Credits', url: 'https://beta.buildwithlocus.com/billing' }],
        };
      }
      case 404:
        return {
          message: `${prefix}Resource not found — it may have been deleted or never existed.`,
        };
      case 409:
        return {
          message: `${prefix}Conflict — ${err.message}${err.details ? ` (${err.details})` : ''}`,
        };
      case 429:
        if (isDomainContext) {
          // Use the specific message when the API confirms it's a validation cap,
          // otherwise fall through to the generic 429.
          const looksLikeDomainValidationCap = /pending|validat|limit|max/i.test(
            `${err.message} ${err.details ?? ''}`
          );
          if (looksLikeDomainValidationCap) {
            return {
              message: `${prefix}Domain validation limit reached — max 5 pending domains per workspace. Wait for existing ones to validate or remove them.`,
              actions: [{ label: 'Open Dashboard', url: 'https://beta.buildwithlocus.com/domains' }],
            };
          }
        }
        return {
          message: `${prefix}Rate limited by Locus API. Wait a moment and try again.`,
        };
      case 500:
      case 502:
      case 503:
      case 504:
        return {
          message: `${prefix}Locus API is having issues (HTTP ${err.statusCode}). Try again in a minute.`,
        };

      default:
        return {
          message: `${prefix}${err.message}${err.details ? ` — ${err.details}` : ''}`,
        };
    }
  }

  if (err instanceof Error) {
    // Network / fetch / abort errors
    if (err.name === 'AbortError') {
      return { message: `${prefix}Request cancelled.` };
    }
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(err.message)) {
      return {
        message: `${prefix}Network error — check your internet connection and try again.`,
      };
    }
    return { message: `${prefix}${err.message}` };
  }

  return { message: `${prefix}Unknown error — ${String(err)}` };
}

/**
 * Show a formatted error notification with optional action buttons.
 * Handles URL actions and a special "Re-enter API Key" action that opens the
 * configure-key command.
 */
export async function showError(err: unknown, context?: string): Promise<void> {
  const { message, actions } = formatError(err, context);
  const labels = (actions ?? []).map((a) => a.label);
  const choice = await vscode.window.showErrorMessage(`ShipShape: ${message}`, ...labels);
  if (!choice) { return; }
  const action = (actions ?? []).find((a) => a.label === choice);
  if (action?.url) {
    vscode.env.openExternal(vscode.Uri.parse(action.url));
  } else if (action?.label === 'Re-enter API Key') {
    vscode.commands.executeCommand('shipshape.openSettings');
  }
}
