import type { ChainConfig } from './types.js';

// ── Etherscan API ────────────────────────────────
// Etherscan V2 unified endpoint requires paid plan for Base/Polygon.
// Falling back to chain-specific endpoints which accept the same API key.
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';

// ── Supported Chains ─────────────────────────────
export const CHAINS: Record<number, ChainConfig> = {
  8453: {
    id: 8453,
    name: 'Base',
    currency: 'ETH',
    rpcUrl: process.env.BASE_RPC_URL || 'https://base.llamarpc.com',
    // Using Blockscout as it mimics Etherscan API but allows free L2 access
    explorerApiUrl: 'https://base.blockscout.com/api',
    explorerApiKey: '', // Not required for Blockscout
    sickleFactory: '0x71D234A3e1dfC161cc1d081E6496e76627baAc31',
    blockTime: 2,
    // Aerodrome Slipstream `NonfungiblePositionManager` on Base (deployment list / vfat; verify on BaseScan "Aerodrome: SlipStream").
    nftPositionManager: '0x827922686190790b37229fd06084350E74485b72',
  },
  137: {
    id: 137,
    name: 'Polygon',
    currency: 'POL',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com', // fallback handled by public nodes if this fails? Let's use publicnode.
    explorerApiUrl: 'https://polygon.blockscout.com/api',
    explorerApiKey: '', // Not required for Blockscout
    sickleFactory: '0x71D234A3e1dfC161cc1d081E6496e76627baAc31',
    blockTime: 2,
    // TODO: verify Polygon CL NPM (Uniswap v3 / Aerodrome) before enabling reconciliation on 137.
  },
};

// ── Chain name lookup ────────────────────────────
export function getChainByName(name: string): ChainConfig | undefined {
  const normalized = name.toLowerCase();
  return Object.values(CHAINS).find((c) => c.name.toLowerCase() === normalized);
}

export function getSupportedChainNames(): string[] {
  return Object.values(CHAINS).map((c) => c.name.toLowerCase());
}

// ── Sickle Strategy Contracts (Base) ─────────────
// These are the same across chains for vfat.io's deployment
export const SICKLE_CONTRACTS = {
  farmStrategy: '0x5A72C0f4Bf7f3Ddf1370780d405e29149b128A04' as const,
  farmStrategyV2: '0x172ec723640970363d6cb773db2e60662613c0b7' as const,
  simpleFarmStrategy: '0x9b381108ef12a138a5b7cf231fbbef4f20e72306' as const,
  nftFarmStrategy: '0x3B8886C3f6d3BA4a75D3BEcb3c83864C0C01e1F3' as const,
  sweepStrategy: '0x29D82976C8babb7d5a82c78c6Ef4c2a2dDc64125' as const,
  rebalanceStrategy: '0x75d57c8d1d16d1045a33dd127929da4f52d59a16' as const,
  multiFarmStrategy: '0x0ce03650ad3699cacf30200e8c7c5d1c071c48e2' as const,
  aerodromeSlipstreamStrategy: '0x2f0052779c992c509b0758679b46969418696096' as const,
  aerodromeStrategyV2: '0x9699be38e6d54e51a4b36645726fee9cc736eb45' as const,
};

/** Lowercased strategy `to` addresses for SQL `IN (...)` / inclusion rules. */
export const SICKLE_STRATEGY_ADDRESSES_LOWER: readonly string[] = [
  ...new Set(Object.values(SICKLE_CONTRACTS).map((a) => a.toLowerCase())),
];

// ── Known Protocol Factories ─────────────────────
// Used for on-chain pool identification via pool.factory() calls
export const PROTOCOL_FACTORIES: Record<string, Record<number, string>> = {
  aerodrome: {
    8453: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
  },
  uniswapV3: {
    8453: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD', // Base
    137: '0x1F98431c8aD98523631AE4a59f267346ea31F984', // Polygon
  },
};

// ── API Configuration ────────────────────────────
export const DB_PATH = process.env.DB_PATH || './data/tracker.db';
export const DEFILLAMA_API = 'https://coins.llama.fi';
export const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// ── Rate Limiting ────────────────────────────────
export const EXPLORER_RATE_LIMIT = 5; // requests per second
export const DEFILLAMA_RATE_LIMIT = 10;
export const EXPLORER_PAGE_SIZE = 1000; // max results per query
export const EXPLORER_MAX_RESULTS = 10000; // etherscan hard limit
