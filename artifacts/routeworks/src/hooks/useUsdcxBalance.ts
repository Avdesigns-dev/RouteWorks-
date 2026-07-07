/**
 * useUsdcxBalance — React Query hook for the connected wallet's USDCx balance.
 *
 * Fetches the USDCx fungible token balance from the Hiro Stacks Testnet API.
 * Caches for 30 seconds, polls every 60 seconds, and refetches on window focus.
 *
 * Returns:
 *   data      — balance in whole USDCx tokens, 0 if none held, null if fetch failed
 *   isLoading — true on initial fetch
 *   refetch   — manually trigger a fresh fetch (e.g. after a routing transaction)
 */

import { useQuery } from '@tanstack/react-query';
import { fetchUsdcxBalance } from '@/lib/stacks-balance';

export function useUsdcxBalance(address: string | null) {
  return useQuery({
    queryKey: ['usdcxBalance', address],
    queryFn: () => fetchUsdcxBalance(address!),
    enabled: !!address,
    staleTime: 30_000,        // re-use cached value for 30s
    refetchInterval: 60_000,  // background poll every 60s
    refetchOnWindowFocus: true,
  });
}
