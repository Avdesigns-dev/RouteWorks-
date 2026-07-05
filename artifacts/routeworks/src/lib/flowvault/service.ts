/**
 * FlowVault – SDK client factory.
 *
 * Creates FlowVault instances configured for browser-wallet signing via
 * @stacks/connect `request('stx_callContract', …)`.  Never uses a private key
 * in the browser — all signing is delegated to the user's wallet.
 *
 * Official pattern: https://docs.flow-vault.dev/docs/sdk#initialization
 */

import { FlowVault, type NetworkName } from 'flowvault-sdk';
import { request } from '@stacks/connect';
import {
  VITE_CONTRACT_ADDRESS,
  VITE_CONTRACT_NAME,
  VITE_TOKEN_CONTRACT_ADDRESS,
  VITE_TOKEN_CONTRACT_NAME,
} from './config';

/**
 * Create a browser-wallet FlowVault client for a given network + sender.
 *
 * The returned instance uses `@stacks/connect` `request()` as the executor,
 * so every write operation opens the user's wallet for signature approval.
 *
 * Contract addresses fall back to the SDK's built-in DEFAULT_CONTRACTS for
 * the selected network if no VITE_ override is set.
 *
 * @param network   – `"testnet"` or `"mainnet"`.
 * @param senderAddress – Connected Stacks wallet address (ST… or SP…).
 * @returns A configured `FlowVault` instance ready for reads and writes.
 */
export function createFlowVaultClient(
  network: NetworkName,
  senderAddress: string
): FlowVault {
  return new FlowVault({
    network,
    // Use env-override or fall through to SDK DEFAULT_CONTRACTS
    ...(VITE_CONTRACT_ADDRESS ? { contractAddress: VITE_CONTRACT_ADDRESS } : {}),
    ...(VITE_CONTRACT_NAME ? { contractName: VITE_CONTRACT_NAME } : {}),
    ...(VITE_TOKEN_CONTRACT_ADDRESS
      ? { tokenContractAddress: VITE_TOKEN_CONTRACT_ADDRESS }
      : {}),
    ...(VITE_TOKEN_CONTRACT_NAME
      ? { tokenContractName: VITE_TOKEN_CONTRACT_NAME }
      : {}),
    senderAddress,
    /**
     * Browser wallet executor — matches the pattern documented at
     * https://docs.flow-vault.dev/docs/sdk#initialization (browser wallet mode)
     * and the demo-app reference:
     * https://docs.flow-vault.dev/docs/demo-app#sdk-integration
     */
    /**
     * Forward post-condition mode exactly as shown in the official README
     * browser-wallet example (sdk#initialization). Maps the SDK's enum/string
     * value to the 'allow'/'deny' literal that @stacks/connect expects.
     */
    contractCallExecutor: async (call) => {
      const mode = String(call.postConditionMode ?? 'allow')
        .toLowerCase()
        .includes('deny')
        ? 'deny'
        : 'allow';

      return request('stx_callContract', {
        contract: `${call.contractAddress}.${call.contractName}`,
        functionName: call.functionName,
        functionArgs: call.functionArgs,
        network: call.network,
        postConditionMode: mode,
        postConditions: call.postConditions ?? [],
      });
    },
  });
}
