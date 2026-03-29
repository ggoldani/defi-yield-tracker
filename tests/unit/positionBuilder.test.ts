import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { pad, numberToHex, type Address, type Hash, type Log } from 'viem';
import { initializeSchema } from '../../src/db/schema.js';
import { migrate } from '../../src/db/migrate.js';
import { KNOWN_POOLS } from '../../src/config/pools.js';
import { SICKLE_CONTRACTS } from '../../src/config.js';
import { roundPriceTimestampToHour } from '../../src/db/repositories/price.repo.js';
import { rebuildPositionsForAddressChain } from '../../src/indexer/positionBuilder.js';
import {
  ERC721_TRANSFER_TOPIC0,
  reconcileNftTokenIdsForAddressChain,
} from '../../src/indexer/nftReconciliation.js';
import { PositionRepo } from '../../src/db/repositories/position.repo.js';

const POOL_FARM = KNOWN_POOLS.find((p) => p.id === 'base-farm-usdz-usdc')!;
const POOL_CL = KNOWN_POOLS.find((p) => p.id === 'base-slipstream-cbbtc-weth')!;

/** Placeholder EOA for unit tests only — not a real wallet. */
const EOA = '0x1000000000000000000000000000000000000001' as Address;
const SICKLE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const NPM = '0x827922686190790b37229fd06084350e74485b72' as Address;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;

const TS = 1700000000;

function batchKey(chainId: number, token: string, ts: number): string {
  return `${chainId}:${token.toLowerCase()}:${roundPriceTimestampToHour(ts)}`;
}

function addrTopic(a: string): `0x${string}` {
  return pad(a.toLowerCase() as `0x${string}`, { size: 32 });
}

function tokenTopic(id: bigint): `0x${string}` {
  return pad(numberToHex(id), { size: 32 });
}

function makeTransferLog(hash: Hash, logIndex: number, from: Address, to: Address, tokenId: bigint): Log {
  return {
    address: NPM,
    blockHash: null,
    blockNumber: 200n,
    data: '0x',
    logIndex,
    transactionHash: hash,
    transactionIndex: 0,
    removed: false,
    topics: [ERC721_TRANSFER_TOPIC0, addrTopic(from), addrTopic(to), tokenTopic(tokenId)],
  } as Log;
}

describe('rebuildPositionsForAddressChain', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    migrate(db);
    db.prepare(
      `INSERT INTO addresses (id, address, label, sickle_addresses) VALUES (1, ?, 't', ?)`,
    ).run(EOA.toLowerCase(), JSON.stringify({ 8453: SICKLE }));
  });

  afterEach(() => {
    db.close();
  });

  function insertTx(row: {
    hash: string;
    category: string;
    isFromSickle: number;
    from: string;
    to: string;
    pool: string;
    protocol: string;
    amount0?: string;
    amount1?: string;
    rewardToken?: string | null;
    rewardAmount?: string | null;
    nft?: string | null;
    gasUsd?: number;
    token0?: string;
    token1?: string;
    ts?: number;
    block?: number;
  }) {
    const ts = row.ts ?? TS;
    const block = row.block ?? 1;
    db.prepare(
      `INSERT INTO transactions (
        hash, chain_id, block_number, timestamp, from_address, to_address,
        value, gas_used, gas_price, gas_cost_usd, category, protocol,
        pool_address, token0, token1, amount0, amount1,
        reward_token, reward_amount, nft_token_id, address_id, is_from_sickle
      ) VALUES (?, 8453, ?, ?, ?, ?, '0', '0', '0', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).run(
      row.hash,
      block,
      ts,
      row.from.toLowerCase(),
      row.to.toLowerCase(),
      row.gasUsd ?? 0,
      row.category,
      row.protocol,
      row.pool.toLowerCase(),
      (row.token0 ?? POOL_FARM.token0).toLowerCase(),
      (row.token1 ?? POOL_FARM.token1).toLowerCase(),
      row.amount0 ?? null,
      row.amount1 ?? null,
      row.rewardToken?.toLowerCase() ?? null,
      row.rewardAmount ?? null,
      row.nft ?? null,
      row.isFromSickle,
    );
  }

  it('aggregates two deposits, harvest, withdraw on same V2 pool (mocked batch prices)', async () => {
    const t0 = POOL_FARM.token0;
    const t1 = POOL_FARM.token1;
    const rewardTok = '0xdead000000000000000000000000000000000001';

    insertTx({
      hash: '0x' + '11'.repeat(32),
      category: 'deposit',
      isFromSickle: 1,
      from: SICKLE,
      to: SICKLE_CONTRACTS.farmStrategyV2,
      pool: POOL_FARM.address,
      protocol: 'Aerodrome Farm V2',
      amount0: '1000000000000000000',
      amount1: '2000000000000000000',
      ts: TS,
      block: 1,
      gasUsd: 1,
    });
    insertTx({
      hash: '0x' + '22'.repeat(32),
      category: 'deposit',
      isFromSickle: 1,
      from: SICKLE,
      to: SICKLE_CONTRACTS.farmStrategyV2,
      pool: POOL_FARM.address,
      protocol: 'Aerodrome Farm V2',
      amount0: '1000000000000000000',
      amount1: '2000000000000000000',
      ts: TS + 1,
      block: 2,
      gasUsd: 1,
    });
    insertTx({
      hash: '0x' + '33'.repeat(32),
      category: 'harvest',
      isFromSickle: 1,
      from: SICKLE,
      to: SICKLE_CONTRACTS.farmStrategyV2,
      pool: POOL_FARM.address,
      protocol: 'Aerodrome Farm V2',
      rewardToken: rewardTok,
      rewardAmount: '1000000000000000000',
      ts: TS + 2,
      block: 3,
      gasUsd: 1,
    });
    insertTx({
      hash: '0x' + '44'.repeat(32),
      category: 'withdraw',
      isFromSickle: 1,
      from: SICKLE,
      to: SICKLE_CONTRACTS.farmStrategyV2,
      pool: POOL_FARM.address,
      protocol: 'Aerodrome Farm V2',
      amount0: '500000000000000000',
      amount1: '1000000000000000000',
      ts: TS + 3,
      block: 4,
      gasUsd: 1,
    });

    const priceMap = new Map<string, number | null>([
      [batchKey(8453, t0, TS), 2],
      [batchKey(8453, t1, TS), 3],
      [batchKey(8453, t0, TS + 1), 2],
      [batchKey(8453, t1, TS + 1), 3],
      [batchKey(8453, rewardTok, TS + 2), 10],
      [batchKey(8453, t0, TS + 3), 2],
      [batchKey(8453, t1, TS + 3), 3],
    ]);

    const getHistoricalUsdBatch = vi.fn().mockResolvedValue(priceMap);

    await rebuildPositionsForAddressChain(db, 1, 8453, {
      skipSpotValuation: true,
      priceProvider: { getHistoricalUsdBatch } as never,
    });

    expect(getHistoricalUsdBatch).toHaveBeenCalled();

    const pos = new PositionRepo(db).findByAddress(1, { chainId: 8453 });
    expect(pos).toHaveLength(1);
    const p = pos[0]!;
    expect(p.positionKind).toBe('v2_lp');
    expect(p.nftTokenId).toBe('');
    expect(p.poolAddress.toLowerCase()).toBe(POOL_FARM.address.toLowerCase());
    expect(p.totalDeposited0).toBe('2000000000000000000');
    expect(p.totalDeposited1).toBe('4000000000000000000');
    expect(p.totalWithdrawn0).toBe('500000000000000000');
    expect(p.totalWithdrawn1).toBe('1000000000000000000');
    expect(p.totalDepositedUsd).toBeCloseTo(16, 5);
    expect(p.totalWithdrawnUsd).toBeCloseTo(4, 5);
    expect(p.totalHarvestedUsd).toBeCloseTo(10, 5);
    expect(p.totalGasCostUsd).toBe(4);
  });

  it('splits same pool into two v3_nft positions for different nft_token_id', async () => {
    const t0 = POOL_CL.token0;
    const t1 = POOL_CL.token1;
    insertTx({
      hash: '0x' + 'aa'.repeat(32),
      category: 'deposit',
      isFromSickle: 1,
      from: SICKLE,
      to: SICKLE_CONTRACTS.aerodromeSlipstreamStrategy,
      pool: POOL_CL.address,
      protocol: 'Aerodrome Slipstream',
      token0: t0,
      token1: t1,
      amount0: '1000000000000000000',
      amount1: '0',
      nft: '100',
      ts: TS,
    });
    insertTx({
      hash: '0x' + 'bb'.repeat(32),
      category: 'deposit',
      isFromSickle: 1,
      from: SICKLE,
      to: SICKLE_CONTRACTS.aerodromeSlipstreamStrategy,
      pool: POOL_CL.address,
      protocol: 'Aerodrome Slipstream',
      token0: t0,
      token1: t1,
      amount0: '2000000000000000000',
      amount1: '0',
      nft: '200',
      ts: TS + 1,
    });

    const getHistoricalUsdBatch = vi.fn().mockResolvedValue(new Map());
    const getLogs = vi.fn().mockResolvedValue([]);

    await rebuildPositionsForAddressChain(db, 1, 8453, {
      skipSpotValuation: true,
      priceProvider: { getHistoricalUsdBatch } as never,
      reconcileOptions: { getLogs, npmAddress: NPM },
    });

    const pos = new PositionRepo(db).findByAddress(1, { chainId: 8453 });
    expect(pos).toHaveLength(2);
    const ids = new Set(pos.map((x) => x.nftTokenId));
    expect(ids.has('100')).toBe(true);
    expect(ids.has('200')).toBe(true);
    expect(pos.every((x) => x.positionKind === 'v3_nft')).toBe(true);
  });

  it('includes EOA→strategy row with is_from_sickle=0 in totals', async () => {
    insertTx({
      hash: '0x' + 'ee'.repeat(32),
      category: 'deposit',
      isFromSickle: 0,
      from: EOA,
      to: SICKLE_CONTRACTS.farmStrategyV2,
      pool: POOL_FARM.address,
      protocol: 'Aerodrome Farm V2',
      amount0: '3000000000000000000',
      amount1: '0',
      ts: TS,
    });

    const getHistoricalUsdBatch = vi.fn().mockResolvedValue(new Map([[batchKey(8453, POOL_FARM.token0, TS), 5]]));

    await rebuildPositionsForAddressChain(db, 1, 8453, {
      skipSpotValuation: true,
      priceProvider: { getHistoricalUsdBatch } as never,
    });

    const p = new PositionRepo(db).findByAddress(1, { chainId: 8453 })[0]!;
    expect(p.totalDeposited0).toBe('3000000000000000000');
    expect(p.totalDepositedUsd).toBeCloseTo(15, 4);
  });

  it('uses 0 USD when batch map has null for a token leg', async () => {
    insertTx({
      hash: '0x' + 'ff'.repeat(32),
      category: 'deposit',
      isFromSickle: 1,
      from: SICKLE,
      to: SICKLE_CONTRACTS.farmStrategyV2,
      pool: POOL_FARM.address,
      protocol: 'Aerodrome Farm V2',
      amount0: '1000000000000000000',
      amount1: '1000000000000000000',
      ts: TS,
    });

    const k0 = batchKey(8453, POOL_FARM.token0, TS);
    const k1 = batchKey(8453, POOL_FARM.token1, TS);
    const getHistoricalUsdBatch = vi
      .fn()
      .mockResolvedValue(new Map<string, number | null>([[k0, 4], [k1, null]]));

    await rebuildPositionsForAddressChain(db, 1, 8453, {
      skipSpotValuation: true,
      priceProvider: { getHistoricalUsdBatch } as never,
    });

    const p = new PositionRepo(db).findByAddress(1, { chainId: 8453 })[0]!;
    expect(p.totalDepositedUsd).toBeCloseTo(4, 4);
  });

  it('reconcile + rebuild: EOA→slipstream fills nft via mocked getLogs', async () => {
    const hash = `0x${'99'.repeat(32)}` as Hash;
    db.prepare(
      `INSERT INTO transactions (
        hash, chain_id, block_number, timestamp, from_address, to_address,
        value, gas_used, gas_price, gas_cost_usd, category, protocol,
        pool_address, token0, token1, amount0, amount1,
        reward_token, reward_amount, nft_token_id, address_id, is_from_sickle
      ) VALUES (?, 8453, 200, ?, ?, ?, '0', '0', '0', 0, 'deposit', 'slipstream', ?, ?, ?, '1000000000000000000', '0', NULL, NULL, NULL, 1, 0)`,
    ).run(
      hash,
      TS,
      EOA.toLowerCase(),
      SICKLE_CONTRACTS.aerodromeSlipstreamStrategy.toLowerCase(),
      POOL_CL.address.toLowerCase(),
      POOL_CL.token0.toLowerCase(),
      POOL_CL.token1.toLowerCase(),
    );

    const getLogs = vi
      .fn()
      .mockResolvedValue([makeTransferLog(hash, 0, ZERO, SICKLE, 7777n)]);

    const getHistoricalUsdBatch = vi.fn().mockResolvedValue(new Map());

    await rebuildPositionsForAddressChain(db, 1, 8453, {
      skipSpotValuation: true,
      priceProvider: { getHistoricalUsdBatch } as never,
      reconcileOptions: { getLogs, npmAddress: NPM },
    });

    const row = db.prepare('SELECT nft_token_id FROM transactions WHERE hash = ?').get(hash) as {
      nft_token_id: string | null;
    };
    expect(row.nft_token_id).toBe('7777');

    const pos = new PositionRepo(db).findByAddress(1, { chainId: 8453 });
    expect(pos).toHaveLength(1);
    expect(pos[0]!.positionKind).toBe('v3_nft');
    expect(pos[0]!.nftTokenId).toBe('7777');
  });
});

describe('reconcileNftTokenIdsForAddressChain EOA path', () => {
  let db: Database.Database;
  let getLogs: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    migrate(db);
    getLogs = vi.fn();
  });

  afterEach(() => {
    db.close();
  });

  it('includes EOA→strategy candidate with empty nft', async () => {
    db.prepare(
      `INSERT INTO addresses (id, address, label, sickle_addresses) VALUES (1, ?, 't', ?)`,
    ).run(EOA.toLowerCase(), JSON.stringify({ 8453: SICKLE }));

    const hash = `0x${'77'.repeat(32)}` as Hash;
    db.prepare(
      `INSERT INTO transactions (
        hash, chain_id, block_number, timestamp, from_address, to_address,
        value, gas_used, gas_price, gas_cost_usd, category, protocol,
        pool_address, token0, token1, amount0, amount1,
        reward_token, reward_amount, nft_token_id, address_id, is_from_sickle
      ) VALUES (?, 8453, 100, 1, ?, ?, '0', '0', '0', 0, 'deposit', 'slipstream', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, 0)`,
    ).run(hash, EOA.toLowerCase(), SICKLE_CONTRACTS.aerodromeSlipstreamStrategy.toLowerCase());

    getLogs.mockResolvedValue([makeTransferLog(hash, 0, ZERO, SICKLE, 42n)]);

    const n = await reconcileNftTokenIdsForAddressChain(db, 1, 8453, {
      getLogs,
      npmAddress: NPM,
    });
    expect(n).toBe(1);
    const row = db.prepare('SELECT nft_token_id FROM transactions WHERE hash = ?').get(hash) as {
      nft_token_id: string | null;
    };
    expect(row.nft_token_id).toBe('42');
  });
});
