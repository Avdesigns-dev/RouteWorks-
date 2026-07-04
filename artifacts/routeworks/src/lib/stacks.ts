import { STACKS_MAINNET, STACKS_TESTNET } from '@stacks/network';

export const appDetails = {
  name: 'RouteWorks',
  icon: window.location.origin + '/icon.png',
};

export const networks = {
  mainnet: STACKS_MAINNET,
  testnet: STACKS_TESTNET,
};

export type NetworkType = 'mainnet' | 'testnet';
