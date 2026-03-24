/**
 * Task 4 — Rebuild `positions` from **all** indexed transactions for `(addressId, chainId)`.
 *
 * Flow: `reconcileNftTokenIdsForAddressChain` → reload matching txs → `getHistoricalUsdBatch` →
 * stable sort → group by `(pool_lower, nftTokenId sentinel)` → accumulate → `DELETE` chain positions → `upsert`.
 *
 * **Category → counters (documented):**
 * - `deposit` / `compound`: add `amount0`/`amount1` to deposited totals + USD (18-decimal wei × price).
 * - `withdraw`: add to withdrawn totals + USD.
 * - `harvest`: `totalHarvestedUsd` from `rewardToken`/`rewardAmount` only.
 * - `exit`: same token/USD treatment as withdraw, sets **inactive** + `exitTimestamp`; a later `deposit`/`compound` **reactivates** and clears `exitTimestamp`.
 * - `rebalance`: **gas only** (no token/USD — liquidity moved off-chain/router semantics unclear).
 *
 * **CL rows** (`isClRelevantTx` and still empty `nft_token_id` after reconcile): skipped for amounts/USD/gas; `log.warn`.
 */

import type Database from 'better-sqlite3';
import type { Address } from 'viem';
import type { IndexedTransaction, Position, PositionKind } from '../types.js';
import { AddressRepo } from '../db/repositories/address.repo.js';
import { PositionRepo } from '../db/repositories/position.repo.js';
import { TransactionRepo } from '../db/repositories/transaction.repo.js';
import { roundPriceTimestampToHour } from '../db/repositories/price.repo.js';
import { KNOWN_POOLS } from '../config/pools.js';
import { PriceProvider } from '../prices/provider.js';
import { log } from '../utils/logger.js';
import { isClRelevantTx } from './nftReconciliation.js';
import { reconcileNftTokenIdsForAddressChain } from './nftReconciliation.js';

function priceBatchKey(chainId: number, token: string, timestamp: number): string {
  const rounded = roundPriceTimestampToHour(timestamp);
  return `${chainId}:${token.toLowerCase()}:${rounded}`;
}

/** Assumes amounts are uint256 wei; price is USD per 1 whole token (18 decimals). */
function legUsd(
  prices: Map<string, number | null>,
  chainId: number,
  token: string | undefined,
  timestamp: number,
  amountWei: string | undefined | null,
): number {
  if (!token || amountWei === undefined || amountWei === null) return 0;
  try {
    const w = BigInt(amountWei);
    if (w === 0n) return 0;
    const p = prices.get(priceBatchKey(chainId, token, timestamp));
    if (p === undefined || p === null || p <= 0) return 0;
    return (Number(w) / 1e18) * p;
  } catch {
    return 0;
  }
}

function addWei(a: string, b: string | undefined | null): string {
  const x = b ?? '0';
  try {
    return (BigInt(a) + BigInt(x)).toString();
  } catch {
    return a;
  }
}

type Agg = {
  positionKind: PositionKind;
  nftTokenId: string;
  poolAddress: Address;
  token0: Address;
  token1: Address;
  token0Symbol: string;
  token1Symbol: string;
  protocol: string;
  totalDeposited0: string;
  totalDeposited1: string;
  totalWithdrawn0: string;
  totalWithdrawn1: string;
  totalDepositedUsd: number;
  totalWithdrawnUsd: number;
  totalHarvestedUsd: number;
  totalGasCostUsd: number;
  entryTimestamp: number | null;
  isActive: boolean;
  exitTimestamp: number | undefined;
};

function poolMeta(chainId: number, poolLower: string) {
  return KNOWN_POOLS.find((p) => p.chainId === chainId && p.address.toLowerCase() === poolLower);
}

function createAgg(
  kind: PositionKind,
  nftKey: string,
  pool: string,
  tx: IndexedTransaction,
  chainId: number,
): Agg {
  const poolRow = poolMeta(chainId, pool);
  const token0 = (poolRow?.token0 ?? tx.token0 ?? '0x0000000000000000000000000000000000000000').toLowerCase() as Address;
  const token1 = (poolRow?.token1 ?? tx.token1 ?? '0x0000000000000000000000000000000000000000').toLowerCase() as Address;
  return {
    positionKind: kind,
    nftTokenId: nftKey,
    poolAddress: pool as Address,
    token0,
    token1,
    token0Symbol: poolRow?.token0Symbol ?? '',
    token1Symbol: poolRow?.token1Symbol ?? '',
    protocol: poolRow?.protocol ?? tx.protocol ?? 'unknown',
    totalDeposited0: '0',
    totalDeposited1: '0',
    totalWithdrawn0: '0',
    totalWithdrawn1: '0',
    totalDepositedUsd: 0,
    totalWithdrawnUsd: 0,
    totalHarvestedUsd: 0,
    totalGasCostUsd: 0,
    entryTimestamp: null,
    isActive: true,
    exitTimestamp: undefined,
  };
}

export type PositionRebuildDeps = {
  priceProvider?: PriceProvider;
  /** Passed to `reconcileNftTokenIdsForAddressChain` (e.g. mock `getLogs`). */
  reconcileOptions?: Parameters<typeof reconcileNftTokenIdsForAddressChain>[3];
};

/**
 * Full replace of `positions` for one tracked wallet on one chain from transaction history.
 */
export async function rebuildPositionsForAddressChain(
  db: Database.Database,
  addressId: number,
  chainId: number,
  deps?: PositionRebuildDeps,
): Promise<void> {
  const addrRepo = new AddressRepo(db);
  const tracked = addrRepo.findById(addressId);
  if (!tracked) {
    log.warn(JSON.stringify({ scope: 'positionBuilder', reason: 'address_not_found', addressId }));
    return;
  }

  const priceProvider = deps?.priceProvider ?? new PriceProvider(db);

  await reconcileNftTokenIdsForAddressChain(db, addressId, chainId, deps?.reconcileOptions);

  const txRepo = new TransactionRepo(db);
  const raw = txRepo.findForPositionRebuild(addressId, chainId);
  const byHash = new Map<string, IndexedTransaction>();
  for (const t of raw) {
    if (!byHash.has(t.hash)) byHash.set(t.hash, t);
  }
  const txs = [...byHash.values()].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return a.hash.localeCompare(b.hash);
  });

  const batchReq: { chainId: number; tokenAddress: string; timestamp: number }[] = [];
  const pushReq = (token: string | undefined, ts: number, amt?: string | null) => {
    if (!token) return;
    try {
      if (!amt || BigInt(amt) === 0n) return;
    } catch {
      return;
    }
    batchReq.push({ chainId, tokenAddress: token, timestamp: ts });
  };

  for (const tx of txs) {
    pushReq(tx.token0, tx.timestamp, tx.amount0);
    pushReq(tx.token1, tx.timestamp, tx.amount1);
    pushReq(tx.rewardToken, tx.timestamp, tx.rewardAmount);
  }

  const prices = await priceProvider.getHistoricalUsdBatch(batchReq);

  const groups = new Map<string, Agg>();

  for (const tx of txs) {
    const poolRaw = tx.poolAddress?.trim();
    if (!poolRaw) continue;

    const pool = poolRaw.toLowerCase();
    const cl = isClRelevantTx(tx);
    const nft = (tx.nftTokenId || '').trim();
    if (cl && !nft) {
      log.warn(
        JSON.stringify({
          scope: 'positionBuilder',
          reason: 'cl_missing_nft_token_id',
          hash: tx.hash,
          chainId,
        }),
      );
      continue;
    }

    const kind: PositionKind = nft ? 'v3_nft' : 'v2_lp';
    const gkey = `${pool}::${nft}`;

    if (!groups.has(gkey)) {
      groups.set(gkey, createAgg(kind, nft, pool, tx, chainId));
    }
    const agg = groups.get(gkey)!;

    agg.totalGasCostUsd += tx.gasCostUsd || 0;

    if (agg.entryTimestamp === null) {
      agg.entryTimestamp = tx.timestamp;
    }

    const cat = tx.category;

    switch (cat) {
      case 'deposit':
      case 'compound': {
        agg.totalDeposited0 = addWei(agg.totalDeposited0, tx.amount0);
        agg.totalDeposited1 = addWei(agg.totalDeposited1, tx.amount1);
        agg.totalDepositedUsd +=
          legUsd(prices, chainId, tx.token0, tx.timestamp, tx.amount0) +
          legUsd(prices, chainId, tx.token1, tx.timestamp, tx.amount1);
        agg.isActive = true;
        agg.exitTimestamp = undefined;
        break;
      }
      case 'withdraw': {
        agg.totalWithdrawn0 = addWei(agg.totalWithdrawn0, tx.amount0);
        agg.totalWithdrawn1 = addWei(agg.totalWithdrawn1, tx.amount1);
        agg.totalWithdrawnUsd +=
          legUsd(prices, chainId, tx.token0, tx.timestamp, tx.amount0) +
          legUsd(prices, chainId, tx.token1, tx.timestamp, tx.amount1);
        break;
      }
      case 'harvest': {
        agg.totalHarvestedUsd += legUsd(
          prices,
          chainId,
          tx.rewardToken,
          tx.timestamp,
          tx.rewardAmount,
        );
        break;
      }
      case 'exit': {
        agg.totalWithdrawn0 = addWei(agg.totalWithdrawn0, tx.amount0);
        agg.totalWithdrawn1 = addWei(agg.totalWithdrawn1, tx.amount1);
        agg.totalWithdrawnUsd +=
          legUsd(prices, chainId, tx.token0, tx.timestamp, tx.amount0) +
          legUsd(prices, chainId, tx.token1, tx.timestamp, tx.amount1);
        agg.isActive = false;
        agg.exitTimestamp = tx.timestamp;
        break;
      }
      case 'rebalance':
        break;
      default:
        break;
    }
  }

  const posRepo = new PositionRepo(db);
  posRepo.deleteByAddressAndChain(addressId, chainId);

  for (const agg of groups.values()) {
    const row: Omit<Position, 'id'> = {
      addressId,
      chainId,
      positionKind: agg.positionKind,
      nftTokenId: agg.nftTokenId,
      protocol: agg.protocol,
      poolAddress: agg.poolAddress,
      token0: agg.token0,
      token1: agg.token1,
      token0Symbol: agg.token0Symbol,
      token1Symbol: agg.token1Symbol,
      isActive: agg.isActive,
      entryTimestamp: agg.entryTimestamp ?? 0,
      exitTimestamp: agg.exitTimestamp,
      totalDeposited0: agg.totalDeposited0,
      totalDeposited1: agg.totalDeposited1,
      totalWithdrawn0: agg.totalWithdrawn0,
      totalWithdrawn1: agg.totalWithdrawn1,
      totalDepositedUsd: agg.totalDepositedUsd,
      totalWithdrawnUsd: agg.totalWithdrawnUsd,
      totalHarvestedUsd: agg.totalHarvestedUsd,
      totalGasCostUsd: agg.totalGasCostUsd,
    };
    posRepo.upsert(row);
  }
}
