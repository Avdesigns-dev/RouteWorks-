/**
 * FlowVault – Pre-transaction wallet verification (Phase 3).
 *
 * Before any routing transaction is submitted, verify that the wallet is
 * connected, a valid STX address is present, and the address prefix is
 * consistent with the selected network.
 *
 * Docs requirement: https://docs.flow-vault.dev/docs/implementation
 * "Validate network and contract principals at process startup."
 * "Wallet address must be STX format (not BTC tb1 format)."
 */

import type { NetworkName } from 'flowvault-sdk';
import { isValidAddress } from 'flowvault-sdk';
import { VITE_CONTRACT_ADDRESS } from './config';

/** Granular status codes for pre-transaction checks. */
export type WalletGuardStatus =
  | 'ready'               // All checks pass — safe to submit transactions
  | 'not_connected'       // Wallet not connected at all
  | 'no_address'          // Connected but no STX address resolved
  | 'invalid_address'     // Address format fails SDK validation
  | 'network_mismatch'    // Address prefix ≠ selected network
  | 'mainnet_unsupported'; // Mainnet FlowVault contract not yet deployed/configured

/** Result of a wallet guard check. */
export interface WalletGuardResult {
  /** Granular status code. */
  status: WalletGuardStatus;
  /** `true` only when status === 'ready'. */
  isReady: boolean;
  /** Human-readable message for UI display. `null` when ready. */
  message: string | null;
}

/**
 * Verify wallet state before executing any FlowVault transaction.
 *
 * Checks performed (in order):
 * 1. Wallet is connected.
 * 2. A non-empty STX address is present.
 * 3. The address passes the FlowVault SDK `isValidAddress` check.
 * 4. The address prefix (SP/ST) matches the selected network.
 *
 * @param isConnected – Current wallet connection status.
 * @param address     – Resolved STX address (null if none).
 * @param network     – Currently selected Stacks network.
 */
export function verifyWalletReady(
  isConnected: boolean,
  address: string | null,
  network: NetworkName | string
): WalletGuardResult {
  if (!isConnected) {
    return {
      status: 'not_connected',
      isReady: false,
      message: 'Connect your Stacks wallet to continue.',
    };
  }

  if (!address || address.trim() === '') {
    return {
      status: 'no_address',
      isReady: false,
      message:
        'Wallet is connected but no STX address was found. Please reconnect.',
    };
  }

  // Use the SDK's own address validator so we stay consistent with on-chain rules
  if (!isValidAddress(address)) {
    return {
      status: 'invalid_address',
      isReady: false,
      message: `"${address}" is not a valid Stacks address. Please reconnect your wallet.`,
    };
  }

  // Stacks mainnet addresses start with SP, testnet with ST.
  // Mixed pairs cause silent failures at the contract level.
  const isMainnet = network === 'mainnet';
  const addressIsMainnet = address.startsWith('SP');
  const addressIsTestnet = address.startsWith('ST');

  if (isMainnet && addressIsTestnet) {
    return {
      status: 'network_mismatch',
      isReady: false,
      message:
        'Your wallet address is for Testnet (ST…) but Mainnet is selected. ' +
        'Switch to Testnet or reconnect with a Mainnet wallet.',
    };
  }

  if (!isMainnet && addressIsMainnet) {
    return {
      status: 'network_mismatch',
      isReady: false,
      message:
        'Your wallet address is for Mainnet (SP…) but Testnet is selected. ' +
        'Switch to Mainnet or reconnect with a Testnet wallet.',
    };
  }

  // Unexpected prefix (neither SP nor ST)
  if (!addressIsMainnet && !addressIsTestnet) {
    return {
      status: 'invalid_address',
      isReady: false,
      message: `Unexpected address prefix in "${address}". Expected SP… (mainnet) or ST… (testnet).`,
    };
  }

  // FlowVault SDK 0.1.2: DEFAULT_CONTRACTS.mainnet has empty contract addresses.
  // Mainnet requires explicit VITE_FLOWVAULT_CONTRACT_ADDRESS override to function.
  if (network === 'mainnet' && !VITE_CONTRACT_ADDRESS) {
    return {
      status: 'mainnet_unsupported',
      isReady: false,
      message:
        'FlowVault mainnet contract addresses are not yet configured. ' +
        'Switch to Testnet to proceed, or set VITE_FLOWVAULT_CONTRACT_ADDRESS.',
    };
  }

  return {
    status: 'ready',
    isReady: true,
    message: null,
  };
}
