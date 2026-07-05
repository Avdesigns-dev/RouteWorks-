/**
 * FlowVault – Network & explorer configuration.
 *
 * Contract addresses default to the SDK's built-in DEFAULT_CONTRACTS values
 * (testnet: STD7QG84VQQ0C35SZM2EYTHZV4M8FQ0R7YNSQWPD.flowvault-v2).
 * Override via VITE_FLOWVAULT_CONTRACT_ADDRESS / VITE_FLOWVAULT_TOKEN_ADDRESS
 * for custom deployments.
 */

import type { NetworkName } from 'flowvault-sdk';

// ── Explorer URLs ─────────────────────────────────────────────────────────────

const EXPLORER_TX_BASE: Record<NetworkName, string> = {
  testnet: 'https://explorer.hiro.so/txid/',
  mainnet: 'https://explorer.hiro.so/txid/',
};

/**
 * Build a Hiro Explorer link for a given transaction ID and network.
 *
 * @example
 * getExplorerTxUrl('0xabc…', 'testnet')
 * // https://explorer.hiro.so/txid/0xabc…?chain=testnet
 */
export function getExplorerTxUrl(txId: string, network: NetworkName): string {
  const cleanId = txId.startsWith('0x') ? txId : `0x${txId}`;
  return `${EXPLORER_TX_BASE[network]}${cleanId}?chain=${network}`;
}

// ── Block timing helpers ──────────────────────────────────────────────────────

/** Approximate Stacks block time in seconds (~10 minutes on mainnet, similar on testnet). */
export const STACKS_BLOCK_TIME_SECONDS = 600;

/**
 * Convert a duration in months to an approximate Stacks block count.
 *
 * Used to compute `lockUntilBlock` from a user-supplied month count.
 * Block estimates assume 30-day months.
 *
 * @param months – Number of calendar months.
 * @returns Approximate number of Stacks blocks.
 */
export function monthsToBlocks(months: number): number {
  const secondsPerMonth = 30 * 24 * 60 * 60; // 30 days
  return Math.ceil((months * secondsPerMonth) / STACKS_BLOCK_TIME_SECONDS);
}

// ── Contract address overrides (optional) ─────────────────────────────────────
// Leave undefined to use the SDK's built-in DEFAULT_CONTRACTS values.

export const VITE_CONTRACT_ADDRESS: string | undefined =
  import.meta.env.VITE_FLOWVAULT_CONTRACT_ADDRESS;

export const VITE_CONTRACT_NAME: string | undefined =
  import.meta.env.VITE_FLOWVAULT_CONTRACT_NAME;

export const VITE_TOKEN_CONTRACT_ADDRESS: string | undefined =
  import.meta.env.VITE_FLOWVAULT_TOKEN_CONTRACT_ADDRESS;

export const VITE_TOKEN_CONTRACT_NAME: string | undefined =
  import.meta.env.VITE_FLOWVAULT_TOKEN_CONTRACT_NAME;
