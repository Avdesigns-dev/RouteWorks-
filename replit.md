# RouteWorks

Treasury and payment automation platform built on the Stacks blockchain ecosystem using Flow Vault mechanisms. Helps DAOs, teams, and Web3 organizations automate how funds are locked, released, and distributed.

## Run & Operate

- `pnpm --filter @workspace/routeworks run dev` — run the frontend (port assigned by artifact)
- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, wouter (routing)
- Wallet: @stacks/connect, @stacks/network, @stacks/auth — real Stacks wallet integration
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/routeworks/` — React + Vite frontend
- `artifacts/routeworks/src/context/WalletContext.tsx` — Stacks wallet context (mainnet/testnet)
- `artifacts/routeworks/src/lib/stacks.ts` — network config
- `artifacts/api-server/src/routes/vaults.ts` — vault CRUD + stats endpoints
- `artifacts/api-server/src/routes/activity.ts` — activity feed endpoint
- `lib/api-spec/openapi.yaml` — source-of-truth API spec
- `lib/db/src/schema/vaults.ts` — DB schema (vaults, lock details, split recipients, activity events)

## Architecture decisions

- Stacks wallet address is the user identity — no separate auth system. The connected wallet address (mainnet SP... or testnet ST...) is stored in WalletContext and passed as `ownerAddress` query param to all API calls.
- Flow Vault types: Lock Vault (single recipient, time-based release) and Split Vault (percentage distribution to multiple recipients).
- Vault creation is fully transactional — vault insert, type-specific detail inserts, and activity events all commit together or not at all.
- Server-side invariant validation: lock vaults require lockDetails with positive amounts; split vaults require recipients summing to exactly 100%.
- Owner access control: all GET/PATCH/DELETE vault routes accept an optional `ownerAddress` query param; if provided, it must match the vault's stored owner.

## Product

- Dashboard: vault overview stats, active vault cards, recent activity feed
- Create Vault: two-step flow (pick Lock or Split, then fill form with review step)
- Vault Details: full vault info, rules, activity timeline, status management
- Network switching: Mainnet ↔ Testnet toggle in the header

## User preferences

_Populate as you build._

## Gotchas

- After any OpenAPI spec change, run `pnpm --filter @workspace/api-spec run codegen` then `pnpm run typecheck:libs` before checking API server typecheck.
- `pnpm run typecheck:libs` must be run before `pnpm --filter @workspace/api-server run typecheck` after lib schema changes.
- Stacks mainnet addresses start with SP, testnet with ST. The wallet context selects the right address based on the active network.
- Do not run `pnpm dev` at the workspace root — use workflows or artifact-specific commands.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
