---
name: RouteWorks USDCx migration
description: Lessons from converting RouteWorks from STX to USDCx (testnet-only) — what worked, what broke, and how balance fetching is structured.
---

## Rules implemented

- Network is locked to testnet by defaulting `WalletContext` state to `'testnet'`. `switchNetwork()` stays in context for future re-introduction without refactoring.
- USDCx wallet balance is fetched from `https://api.testnet.hiro.so/extended/v1/address/{address}/balances` via `src/lib/stacks-balance.ts` + `src/hooks/useUsdcxBalance.ts` (React Query, 30s stale, 60s poll).
- Token key lookup uses exact prefix `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx` first, falling back to `/.usdcx::/i` for custom deployments.
- Balance gate in `handleConfirmExecute` and `handleRetryTx`: block when `usdcxBalance === null` (fetch failed), block when `routeAmount > usdcxBalance`.
- `SplitFormValues` got a `totalAmountUsdcx: string` field; `DistributionBar` got an optional `totalAmountUsdcx?: number | null` prop for per-recipient USDCx preview.

## Critical pitfall: never use `sed` on JSX template literals

`sed 's/} STX`/ USDCx`/g'` on JSX like `value={\`${expr} STX\`}` drops the closing `}` of the template expression, producing broken TSX that TypeScript can't parse. Use targeted `Edit` tool calls with exact old/new strings instead.

**Why:** The `}` before ` STX`` closes the template expression `${...}`. Sed pattern matching is not JSX-aware and happily consumes structural characters.

**How to apply:** Any mass string replace in `.tsx` files — use Edit with replace_all or ShellExec `sed` only for patterns that cannot appear inside `${...}` template expressions (e.g., plain text node content, not backtick template literals).
