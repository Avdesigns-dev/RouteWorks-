/**
 * useFlowVault – React hook for wallet-verified FlowVault access.
 *
 * Combines wallet state from WalletContext with pre-transaction guard checks,
 * and provides a factory for creating ready-to-use FlowVault client instances.
 *
 * Usage:
 *   const { guard, getClient, isReady } = useFlowVault();
 *   if (!isReady) return <WalletRequiredPrompt message={guard.message} />;
 *   const client = getClient();
 *   const result = await client.setRoutingRules({ ... });
 */

import { useMemo, useCallback } from 'react';
import { useWallet } from '@/context/WalletContext';
import { createFlowVaultClient } from '@/lib/flowvault/service';
import { verifyWalletReady, type WalletGuardResult } from '@/lib/flowvault/guard';
import type { FlowVault, NetworkName } from 'flowvault-sdk';

// ── Return type ───────────────────────────────────────────────────────────────

export interface UseFlowVaultReturn {
  /** Result of the pre-transaction wallet guard checks. */
  guard: WalletGuardResult;
  /**
   * Create a wallet-connected FlowVault client.
   * Throws if `guard.isReady` is false — always check `isReady` first.
   */
  getClient: () => FlowVault;
  /** Shortcut: `guard.isReady`. */
  isReady: boolean;
  /** Currently selected network. */
  network: NetworkName;
  /** Connected wallet address, or null. */
  address: string | null;
  /** Prompt the user to connect their wallet (delegates to WalletContext). */
  connect: () => Promise<void>;
  /** Whether a wallet connection attempt is in progress. */
  isConnecting: boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Provides a verified FlowVault client bound to the currently connected wallet.
 *
 * Must be called inside a component that is a descendant of WalletProvider.
 */
export function useFlowVault(): UseFlowVaultReturn {
  const { isConnected, address, network, connect, isConnecting } = useWallet();

  // Re-run guard whenever wallet state changes
  const guard: WalletGuardResult = useMemo(
    () => verifyWalletReady(isConnected, address, network),
    [isConnected, address, network]
  );

  // Stable factory — only recreated when wallet state actually changes
  const getClient = useCallback((): FlowVault => {
    if (!guard.isReady || !address) {
      throw new Error(
        `Wallet not ready for FlowVault: ${guard.message ?? 'unknown error'}`
      );
    }
    return createFlowVaultClient(network as NetworkName, address);
  }, [guard, address, network]);

  return {
    guard,
    getClient,
    isReady: guard.isReady,
    network: network as NetworkName,
    address,
    connect,
    isConnecting,
  };
}
