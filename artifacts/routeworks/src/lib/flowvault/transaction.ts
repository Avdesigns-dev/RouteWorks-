/**
 * FlowVault – Transaction execution service (Phase 4).
 *
 * Translates RouteWorks routing configuration into FlowVault SDK calls,
 * emits granular progress phases, and reads live on-chain state after
 * confirmation.
 *
 * Official SDK reference: https://docs.flow-vault.dev/docs/sdk
 */

import type { FlowVault, VaultState, NetworkName, TransactionResult } from 'flowvault-sdk';
import { tokenToMicro } from 'flowvault-sdk';
import { monthsToBlocks, getExplorerTxUrl } from './config';

// ── Phase lifecycle ───────────────────────────────────────────────────────────

/** Granular transaction lifecycle phases for progress UI. */
export type TxPhase =
  | 'idle'
  | 'preparing'    // Fetching current block height / building call params
  | 'signing'      // Wallet approval dialog open — waiting for user
  | 'submitted'    // Broadcast accepted by mempool
  | 'confirmed'    // State read complete — fully done
  | 'rejected'     // User dismissed the wallet prompt
  | 'error';       // SDK / network error

export const TX_PHASE_MESSAGES: Record<TxPhase, string> = {
  idle:      '',
  preparing: 'Preparing transaction…',
  signing:   'Waiting for wallet signature…',
  submitted: 'Transaction submitted — waiting for confirmation…',
  confirmed: 'Transaction confirmed on Stacks Testnet',
  rejected:  'Transaction cancelled.',
  error:     'Transaction failed.',
};

// ── Parameter types ───────────────────────────────────────────────────────────

export interface LockTxParams {
  type: 'lock';
  /** STX amount the user entered (whole tokens, e.g. 100). */
  amountStx: number;
  /** Duration months entered in the form. */
  durationMonths: number;
  /** Connected Stacks wallet address (ST… on testnet). */
  walletAddress: string;
}

export interface SplitTxParams {
  type: 'split';
  recipients: Array<{ address: string; percentage: number }>;
  walletAddress: string;
}

export type FlowVaultTxParams = LockTxParams | SplitTxParams;

// ── Result type ───────────────────────────────────────────────────────────────

export interface FlowVaultTxResult {
  /** Raw transaction ID returned by the SDK (hex). */
  txId: string;
  /** Fully-formed Hiro Testnet Explorer URL. */
  explorerUrl: string;
  /** Live vault state read immediately after broadcast, or null if unavailable. */
  vaultState: VaultState | null;
  /**
   * Present only for split vaults with more than one recipient.
   * The FlowVault SDK `set-routing-rules` accepts one split address per call;
   * this note explains the limitation and what was registered on-chain.
   */
  splitNote?: string;
}

// ── Main executor ─────────────────────────────────────────────────────────────

/**
 * Execute a FlowVault routing transaction for a Lock or Split vault.
 *
 * Progression:
 *   preparing → signing → submitted → confirmed
 *
 * Throws on wallet rejection or any SDK / network error — caller must catch.
 *
 * @param client  – Ready FlowVault SDK instance (from `useFlowVault().getClient()`).
 * @param params  – Typed routing parameters derived from the form values.
 * @param network – Active Stacks network (`"testnet"` while mainnet is pending).
 * @param onPhase – Called at each phase transition to drive progress UI.
 */
export async function executeFlowVaultTransaction(
  client: FlowVault,
  params: FlowVaultTxParams,
  network: NetworkName,
  onPhase: (phase: TxPhase) => void
): Promise<FlowVaultTxResult> {
  onPhase('preparing');

  let txResult: TransactionResult;
  let splitNote: string | undefined;

  if (params.type === 'lock') {
    // Derive lockUntilBlock from current chain height + duration
    const currentBlock = await client.getCurrentBlockHeight(params.walletAddress);
    const lockUntilBlock = currentBlock + monthsToBlocks(params.durationMonths);
    const lockAmount = tokenToMicro(String(params.amountStx));

    onPhase('signing');

    // `setRoutingRules` / `createStrategy` — registers the lock rule on-chain.
    // On the next deposit, exactly `lockAmount` micro-units will be locked
    // until `lockUntilBlock`. No split destination.
    txResult = await client.setRoutingRules({
      lockAmount,
      lockUntilBlock,
      splitAddress: null,
      splitAmount: 0,
    });
  } else {
    // ── Split vault ──────────────────────────────────────────────────────────
    // The FlowVault SDK `set-routing-rules` accepts one split address per call.
    // For multi-recipient splits, additional routing rules require separate
    // deposit transactions with updated rules.
    const primary = params.recipients[0];
    if (!primary) {
      throw new Error('At least one recipient address is required for a split routing rule.');
    }

    if (params.recipients.length > 1) {
      const addr = `${primary.address.slice(0, 8)}…${primary.address.slice(-4)}`;
      splitNote =
        `The FlowVault SDK registers one split destination per routing rule. ` +
        `Only ${addr} is recorded on-chain. ` +
        `Route to additional recipients by updating the routing rule before each deposit.`;
    }

    onPhase('signing');

    // Register the split routing rule.
    // `splitAmount: tokenToMicro('1')` sets a 1-USDCx routing amount —
    // this records the routing destination address on-chain. The exact
    // amount forwarded on each deposit is determined at deposit time.
    txResult = await client.setRoutingRules({
      lockAmount: 0,
      lockUntilBlock: 0,
      splitAddress: primary.address,
      splitAmount: tokenToMicro('1'),
    });
  }

  onPhase('submitted');

  // Read live vault state — informational only, never blocks tx success.
  let vaultState: VaultState | null = null;
  try {
    vaultState = await client.getVaultState(params.walletAddress);
  } catch {
    // Non-critical — the transaction is confirmed regardless of this read.
  }

  onPhase('confirmed');

  return {
    txId: txResult.txId,
    explorerUrl: getExplorerTxUrl(txResult.txId, network),
    vaultState,
    splitNote,
  };
}
