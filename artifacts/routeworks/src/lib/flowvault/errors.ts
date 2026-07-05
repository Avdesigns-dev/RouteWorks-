/**
 * FlowVault – SDK error handling utilities.
 *
 * Maps typed FlowVault SDK errors to user-facing messages.
 * See: https://docs.flow-vault.dev/docs/sdk#error-handling
 */

import {
  FlowVaultError,
  InvalidAmountError,
  InvalidAddressError,
  InvalidConfigurationError,
  InvalidRoutingRuleError,
  ContractCallError,
  NetworkError,
  ParsingError,
} from 'flowvault-sdk';

// ── Error message mapping ─────────────────────────────────────────────────────

const REJECTION_KEYWORDS = [
  'user rejected',
  'user denied',
  'cancelled',
  'canceled',
  'user cancel',
  'request rejected',
];

/**
 * Detect whether the error is a wallet user rejection (not a technical failure).
 * This should be surfaced differently — as an informational notice, not an error.
 */
export function isUserRejection(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const lower = error.message.toLowerCase();
  return REJECTION_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Convert any FlowVault SDK error (or generic Error) into a user-readable message.
 *
 * SDK error types handled (from https://docs.flow-vault.dev/docs/sdk#error-handling):
 *   InvalidAmountError, InvalidAddressError, InvalidConfigurationError,
 *   InvalidRoutingRuleError, ContractCallError, NetworkError, ParsingError
 */
export function getFlowVaultErrorMessage(error: unknown): string {
  if (isUserRejection(error)) {
    return 'Transaction cancelled — you rejected the wallet signature request.';
  }

  if (error instanceof InvalidAddressError) {
    return (
      'Invalid wallet address. Please reconnect your Stacks wallet and try again.'
    );
  }

  if (error instanceof InvalidAmountError) {
    return `Invalid amount: ${error.message}`;
  }

  if (error instanceof InvalidRoutingRuleError) {
    return `Routing rule error: ${error.message}`;
  }

  if (error instanceof InvalidConfigurationError) {
    return `SDK configuration error: ${error.message} — contact support.`;
  }

  if (error instanceof ContractCallError) {
    return `Transaction rejected by contract: ${error.message}`;
  }

  if (error instanceof NetworkError) {
    return `Network error: ${error.message}. Check your connection and try again.`;
  }

  if (error instanceof ParsingError) {
    return `Failed to read contract response: ${error.message}`;
  }

  if (error instanceof FlowVaultError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
}
