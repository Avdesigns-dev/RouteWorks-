---
name: FlowVault SDK Integration
description: Key decisions and constraints for the flowvault-sdk integration in RouteWorks. Covers version, init pattern, mainnet gap, and postConditionMode forwarding.
---

## Rule
Use `flowvault-sdk@0.1.2` with browser-wallet mode exclusively. Never use `senderKey` in the browser — all signing goes through `@stacks/connect` `request('stx_callContract', …)`.

**Why:** The app has no server-side signing; all transactions are user-signed via Leather/Xverse wallets. The official docs require `contractCallExecutor` for this pattern.

**How to apply:** `createFlowVaultClient(network, senderAddress)` in `src/lib/flowvault/service.ts` is the factory. Always use it — never instantiate `FlowVault` directly in component code.

---

## Mainnet DEFAULT_CONTRACTS gap (critical)
`DEFAULT_CONTRACTS.mainnet.contractAddress` is an **empty string** in SDK v0.1.2. Passing `network: 'mainnet'` without a `VITE_FLOWVAULT_CONTRACT_ADDRESS` override will throw `InvalidConfigurationError` at runtime.

**Why:** FlowVault mainnet deployment is not yet published in the SDK defaults as of v0.1.2.

**How to apply:** `verifyWalletReady()` in `guard.ts` catches this before any transaction and surfaces `status: 'mainnet_unsupported'` to the user. The guard disables the "Create Routing" button in that state.

---

## postConditionMode forwarding (must not hardcode)
The `contractCallExecutor` must forward `call.postConditionMode` using the official README mapping — not hardcode `'allow'`.

**Why:** Hardcoding `'allow'` deviates from the official SDK pattern and silently breaks any future `deny`-mode post-conditions.

**How to apply:** Use the pattern from `service.ts`:
```ts
const mode = String(call.postConditionMode ?? 'allow').toLowerCase().includes('deny') ? 'deny' : 'allow';
```

---

## Contract addresses
- Testnet FlowVault: `STD7QG84VQQ0C35SZM2EYTHZV4M8FQ0R7YNSQWPD.flowvault-v2`
- Testnet USDCx: `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx`
- Mainnet USDCx (from docs): `SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx`
- Mainnet FlowVault: not yet published in SDK defaults — requires env override

---

## Network comes from WalletContext
The `network` value (`'testnet'` | `'mainnet'`) comes from `useWallet()` in `WalletContext.tsx`, not from an env var. The existing UI network switcher in the header controls this. Do not introduce a separate env var for network selection.

---

## Error classes from SDK
`InvalidAmountError`, `InvalidAddressError`, `InvalidConfigurationError`, `InvalidRoutingRuleError`, `ContractCallError`, `NetworkError`, `ParsingError` — all extend `FlowVaultError`. Handle in `errors.ts` `getFlowVaultErrorMessage()`.

---

## All amounts in micro-units
1 USDCx = 1,000,000 micro-units. Use `tokenToMicro()` and `microToToken()` from SDK. Never pass float amounts. Store as `bigint` or `string`.

---

## SDK routing primitives (Phase 4)
- `client.setRoutingRules({ lockAmount, lockUntilBlock, splitAddress, splitAmount })` — single call, not per-vault
- Lock vault: `lockAmount = tokenToMicro(amountStx)`, `lockUntilBlock = currentBlock + monthsToBlocks(durationMonths)`, `splitAddress: null`, `splitAmount: 0`
- Split vault: SDK only accepts **one** split address per call. Use first recipient; document limitation. `splitAmount: tokenToMicro('1')` registers the routing rule.
- `client.getCurrentBlockHeight(walletAddress)` must be called before computing `lockUntilBlock`
- `client.getVaultState(walletAddress)` after tx for live state (non-blocking — catch errors, tx is confirmed regardless)

## Transaction state machine (Phase 7) — critical: success gate
Success screen (`SuccessScreen`) gates on **`txResult !== null`**, not just `createdVaultId !== null`.
`createdVaultId` is set after API call (before tx); `txResult` is set only after tx confirms.
Without this gate, the success screen renders while the FlowVault tx is still pending.

**Why:** The API call and FlowVault tx are sequential. Setting `createdVaultId` first (before tx) was the Phase 3 pattern. Adding `txResult !== null` to the success condition was required.

## TxPhase state machine
`idle → preparing → signing → submitted → confirmed`
`rejected` / `error` are terminal states shown in-place on the execute screen (not step 4 success).
`handleRetryTx()` re-runs only the FlowVault tx part (vault record already exists in API).

## File structure
```
src/lib/flowvault/
  config.ts       — explorer URLs, monthsToBlocks(), env var constants
  service.ts      — createFlowVaultClient() factory
  guard.ts        — verifyWalletReady() pre-transaction checks
  errors.ts       — getFlowVaultErrorMessage(), isUserRejection()
  transaction.ts  — executeFlowVaultTransaction(), TxPhase, FlowVaultTxResult
src/hooks/
  useFlowVault.ts — React hook: guard + getClient() + connect/isConnecting
```
