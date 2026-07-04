import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { showConnect, userSession, AppConfig, UserSession } from '@stacks/connect';
import { appDetails, NetworkType } from '../lib/stacks';

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  network: NetworkType;
  connect: () => void;
  disconnect: () => void;
  switchNetwork: (network: NetworkType) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const appConfig = new AppConfig(['store_write', 'publish_data']);
export const defaultUserSession = new UserSession({ appConfig });

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [network, setNetwork] = useState<NetworkType>('mainnet');

  useEffect(() => {
    const savedNetwork = localStorage.getItem('routeworks-network');
    if (savedNetwork === 'mainnet' || savedNetwork === 'testnet') {
      setNetwork(savedNetwork);
    }

    if (defaultUserSession.isUserSignedIn()) {
      const userData = defaultUserSession.loadUserData();
      const addr = savedNetwork === 'testnet' 
        ? userData.profile.stxAddress.testnet 
        : userData.profile.stxAddress.mainnet;
      setAddress(addr);
      setIsConnected(true);
    } else if (defaultUserSession.isSignInPending()) {
      defaultUserSession.handlePendingSignIn().then(userData => {
        const addr = network === 'testnet' 
          ? userData.profile.stxAddress.testnet 
          : userData.profile.stxAddress.mainnet;
        setAddress(addr);
        setIsConnected(true);
      });
    }
  }, []);

  const switchNetwork = (newNetwork: NetworkType) => {
    setNetwork(newNetwork);
    localStorage.setItem('routeworks-network', newNetwork);
    if (defaultUserSession.isUserSignedIn()) {
      const userData = defaultUserSession.loadUserData();
      const addr = newNetwork === 'testnet' 
        ? userData.profile.stxAddress.testnet 
        : userData.profile.stxAddress.mainnet;
      setAddress(addr);
    }
  };

  const connect = () => {
    showConnect({
      appDetails,
      onFinish: () => {
        const userData = defaultUserSession.loadUserData();
        const addr = network === 'testnet' 
          ? userData.profile.stxAddress.testnet 
          : userData.profile.stxAddress.mainnet;
        setAddress(addr);
        setIsConnected(true);
      },
      userSession: defaultUserSession,
    });
  };

  const disconnect = () => {
    defaultUserSession.signUserOut();
    setAddress(null);
    setIsConnected(false);
  };

  return (
    <WalletContext.Provider value={{ address, isConnected, network, connect, disconnect, switchNetwork }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
