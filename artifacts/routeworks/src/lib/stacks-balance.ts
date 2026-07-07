/**
 * Stacks Testnet — USDCx wallet balance fetcher.
 *
 * Reads the connected wallet's USDCx fungible token balance from the Hiro
 * Stacks Testnet API. Returns whole-token amounts (1 USDCx = 1,000,000 micro).
 *
 * Endpoint: GET https://api.testnet.hiro.so/extended/v1/address/{address}/balances
 * Token key format: <principal>.<contract-name>::<asset-name>
 */

const HIRO_API_TESTNET = 'https://api.testnet.hiro.so';

/**
 * Exact testnet USDCx contract identifier prefix.
 * Key format in the Hiro API: <contractAddress>.<contractName>::<assetName>
 * Override via VITE_FLOWVAULT_TOKEN_CONTRACT_ADDRESS / NAME for custom deployments.
 */
const USDCX_TESTNET_PREFIX =
  (import.meta as { env?: Record<string, string> }).env?.VITE_FLOWVAULT_TOKEN_CONTRACT_ADDRESS
    ? `${(import.meta as { env?: Record<string, string> }).env!.VITE_FLOWVAULT_TOKEN_CONTRACT_ADDRESS}.${(import.meta as { env?: Record<string, string> }).env!.VITE_FLOWVAULT_TOKEN_CONTRACT_NAME ?? 'usdcx'}`
    : 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx';

/** Matches `.usdcx::` — fallback for when the contract address differs from the default. */
const USDCX_FALLBACK_PATTERN = /\.usdcx::/i;

/** 1 USDCx = 1,000,000 micro-units (6 decimals). */
export const USDCX_MICRO_DIVISOR = 1_000_000;

interface HiroBalanceResponse {
  fungible_tokens?: Record<string, { balance: string }>;
}

/**
 * Fetch the USDCx balance (in whole tokens) for a Stacks Testnet address.
 *
 * @param address — Connected wallet address (ST… on testnet).
 * @returns USDCx balance as a `number` (whole tokens, up to 6 decimal places).
 *          Returns `0` if the address has no USDCx holdings.
 *          Returns `null` if the request fails.
 */
export async function fetchUsdcxBalance(address: string): Promise<number | null> {
  if (!address) return null;

  const url = `${HIRO_API_TESTNET}/extended/v1/address/${encodeURIComponent(address)}/balances`;

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(`[stacks-balance] HTTP ${res.status} fetching balances for ${address}`);
      return null;
    }

    const data: HiroBalanceResponse = await res.json();
    const ft = data.fungible_tokens ?? {};

    // Try exact contract prefix first; fall back to pattern match for custom deployments.
    // Key looks like: ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx::usdcx
    const key =
      Object.keys(ft).find((k) => k.startsWith(USDCX_TESTNET_PREFIX)) ??
      Object.keys(ft).find((k) => USDCX_FALLBACK_PATTERN.test(k));
    if (!key) return 0;

    const microBalance = Number(ft[key].balance);
    if (isNaN(microBalance)) return null;

    return microBalance / USDCX_MICRO_DIVISOR;
  } catch (err) {
    console.warn('[stacks-balance] Failed to fetch USDCx balance:', err);
    return null;
  }
}
