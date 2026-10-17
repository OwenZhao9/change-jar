import { defineChain, type Address } from 'viem';

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet-rpc.monad.xyz';
export const EXPLORER_URL = (process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://testnet.monadvision.com').replace(/\/$/, '');
export const FAUCET_PAGE = 'https://faucet.monad.xyz';
export const FAUCET_API = 'https://agents.devnads.com/v1/faucet';

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL], webSocket: ['wss://testnet-rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'MonadVision', url: EXPLORER_URL } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11', blockCreated: 251449 } },
  testnet: true,
});

export const DEFAULT_CHANGE_JAR_ADDRESS: Address = '0x7a07aD401432441a8A304D54F814AD0C0c9aD8A4';
const raw = (process.env.NEXT_PUBLIC_CHANGE_JAR_ADDRESS || DEFAULT_CHANGE_JAR_ADDRESS).trim();

// 内存合约只在开发构建且显式打开时可用
export const USE_MEMORY = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_LOCAL_DEV === '1';
export const CONTRACT_ADDRESS: Address | null = !USE_MEMORY && /^0x[0-9a-fA-F]{40}$/.test(raw) ? (raw as Address) : null;
