import type { Address, Hash } from 'viem';

// ── Chain Configuration ───────────────────────────
export interface ChainConfig {
  id: number;
  name: string;
  currency: string;
  rpcUrl: string;
  explorerApiUrl: string;
  explorerApiKey: string;
  sickleFactory: Address;
  blockTime: number; // avg seconds per block
}

// ── Tracked Address ───────────────────────────────
export interface TrackedAddress {
  id?: number;
  address: Address;
  label: string;
  sickleAddresses: Record<number, Address>; // chainId → sickle address
  createdAt: string;
}

// ── Transaction Categories ────────────────────────
export type TxCategory =
  | 'deposit'
  | 'withdraw'
  | 'harvest'
  | 'compound'
  | 'exit'
  | 'rebalance'
  | 'transfer_in'
  | 'transfer_out'
  | 'swap'
  | 'approval'
  | 'unknown';

// ── Indexed Transaction ───────────────────────────
export interface IndexedTransaction {
  id?: number;
  hash: Hash;
  chainId: number;
  blockNumber: number;
  timestamp: number;
  from: Address;
  to: Address;
  value: string; // wei as string
  gasUsed: string;
  gasPrice: string;
  gasCostUsd: number;
  category: TxCategory;
  protocol: string; // e.g., 'aerodrome', 'uniswap-v3'
  poolAddress?: Address;
  token0?: Address;
  token1?: Address;
  amount0?: string;
  amount1?: string;
  rewardToken?: Address;
  rewardAmount?: string;
  addressId: number;
  isFromSickle: boolean;
}

// ── LP Position ─────────────────────────────────
export interface Position {
  id?: number;
  addressId: number;
  chainId: number;
  protocol: string;
  poolAddress: Address;
  token0: Address;
  token1: Address;
  token0Symbol: string;
  token1Symbol: string;
  isActive: boolean;
  entryTimestamp: number;
  exitTimestamp?: number;
  totalDeposited0: string;
  totalDeposited1: string;
  totalWithdrawn0: string;
  totalWithdrawn1: string;
  totalDepositedUsd: number;
  totalWithdrawnUsd: number;
  totalHarvestedUsd: number;
  totalGasCostUsd: number;
  currentValueUsd?: number;
}

// ── PnL Report ──────────────────────────────────
export interface PnlReport {
  position: Position;
  depositedUsd: number;
  withdrawnUsd: number;
  harvestedUsd: number;
  currentValueUsd: number;
  gasCostUsd: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  roi: number; // percentage
}

// ── Price Cache ─────────────────────────────────
export interface CachedPrice {
  id?: number;
  chainId: number;
  tokenAddress: Address;
  timestamp: number;
  priceUsd: number;
}

// ── Explorer API Response Types ────────────────
export interface ExplorerTxResponse {
  status: string;
  result: ExplorerTx[];
}

export interface ExplorerTx {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasUsed: string;
  gasPrice: string;
  input: string;
  isError: string;
  methodId: string;
  functionName: string;
  contractAddress: string;
}
