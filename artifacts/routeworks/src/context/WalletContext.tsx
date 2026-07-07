import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  connect as stacksConnect,
  disconnect as stacksDisconnect,
  isConnected as stacksIsConnected,
  getLocalStorage,
} from '@stacks/connect';
import type { NetworkType } from '../lib/stacks';

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  network: NetworkType;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: (network: NetworkType) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

/** Pick the STX address matching the active network from stored/returned addresses. */
function pickStxAddress(
  addresses: Array<{ address: string }>,
  network: NetworkType
): string | null {
  const prefix = network === 'mainnet' ? 'SP' : 'ST';
  const match = addresses.find((a) => a.address.startsWith(prefix));
  // Fallback: return the first STX-looking address if prefix doesn't match
  return match?.address ?? addresses[0]?.address ?? null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  // RouteWorks operates exclusively on Stacks Testnet.
  // The switchNetwork function is preserved so Mainnet can be reintroduced later
  // without refactoring — just add the network UI back in App.tsx.
  const [network, setNetwork] = useState<NetworkType>('testnet');

  // Restore session from localStorage on mount
  useEffect(() => {
    if (stacksIsConnected()) {
      const stored = getLocalStorage();
      const stxAddresses = stored?.addresses?.stx ?? [];
      if (stxAddresses.length > 0) {
        const addr = pickStxAddress(stxAddresses, network);
        setAddress(addr);
        setConnected(true);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When network changes while connected, re-derive address from stored data
  useEffect(() => {
    if (connected && stacksIsConnected()) {
      const stored = getLocalStorage();
      const stxAddresses = stored?.addresses?.stx ?? [];
      if (stxAddresses.length > 0) {
        const addr = pickStxAddress(stxAddresses, network);
        setAddress(addr);
      }
    }
  }, [network, connected]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      // `stacksConnect` opens the wallet selector UI (Xverse, Leather, etc.)
      // and returns { addresses: AddressEntry[] }
      const result = await stacksConnect({
        // `forceWalletSelect: false` re-uses the previously chosen wallet if any;
        // set to true only if you want to always re-prompt for wallet selection
        forceWalletSelect: false,
        persistWalletSelect: true,
        enableLocalStorage: true,
      });

      if (result?.addresses?.length) {
        const addr = pickStxAddress(result.addresses, network);
        setAddress(addr);
        setConnected(true);
      }
    } catch (err) {
      // User dismissed the wallet selector — not an error
      console.warn('[RouteWorks] Wallet connection cancelled or failed:', err);
    } finally {
      setIsConnecting(false);
    }
  }, [network]);

  const disconnect = useCallback(() => {
    stacksDisconnect();
    setAddress(null);
    setConnected(false);
  }, []);

  const switchNetwork = useCallback((newNetwork: NetworkType) => {
    setNetwork(newNetwork);
    localStorage.setItem('routeworks-network', newNetwork);

    // Re-derive address for the new network from stored data
    if (stacksIsConnected()) {
      const stored = getLocalStorage();
      const stxAddresses = stored?.addresses?.stx ?? [];
      if (stxAddresses.length > 0) {
        const addr = pickStxAddress(stxAddresses, newNetwork);
        setAddress(addr);
      }
    }
  }, []);

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected: connected,
        network,
        isConnecting,
        connect,
        disconnect,
        switchNetwork,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider');
  return ctx;
}
