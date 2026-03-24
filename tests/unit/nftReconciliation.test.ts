import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { pad, numberToHex, type Address, type Hash, type Log } from 'viem';
import { initializeSchema } from '../../src/db/schema.js';
import { TransactionRepo } from '../../src/db/repositories/transaction.repo.js';
import {
  reconcileNftTokenIdsForAddressChain,
  ERC721_TRANSFER_TOPIC0,
} from '../../src/indexer/nftReconciliation.js';
import * as logger from '../../src/utils/logger.js';

const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const NPM = '0x827922686190790b37229fd06084350e74485b72' as Address;
const SICKLE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const STRATEGY = '0x2f0052779c992c509b0758679b46969418696096' as Address; // aerodromeSlipstreamStrategy

function addrTopic(a: string): `0x${string}` {
  return pad(a.toLowerCase() as `0x${string}`, { size: 32 });
}

function tokenTopic(id: bigint): `0x${string}` {
  return pad(numberToHex(id), { size: 32 });
}

function makeTransferLog(
  logIndex: number,
  from: Address,
  to: Address,
  tokenId: bigint,
  overrides: Partial<Pick<Log, 'blockNumber' | 'transactionHash'>> = {},
): Log {
  const txHash = (overrides.transactionHash ??
    '0x' + '11'.repeat(32)) as Hash;
  return {
    address: NPM,
    blockHash: null,
    blockNumber: overrides.blockNumber ?? 100n,
    data: '0x',
    logIndex,
    transactionHash: txHash,
    transactionIndex: 0,
    removed: false,
    topics: [ERC721_TRANSFER_TOPIC0, addrTopic(from), addrTopic(to), tokenTopic(tokenId)],
  } as Log;
}

describe('reconcileNftTokenIdsForAddressChain', () => {
  let db: Database.Database;
  let txRepo: TransactionRepo;
  let getLogs: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    txRepo = new TransactionRepo(db);
    getLogs = vi.fn();
    vi.spyOn(logger.log, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  function insertClCandidate(opts: { hash?: Hash; nft?: string | null } = {}) {
    const hash = opts.hash ?? (`0x${'aa'.repeat(32)}` as Hash);
    db.prepare(`INSERT INTO addresses (id, address, label) VALUES (1, ?, 't')`).run(ZERO);
    db.prepare(
      `INSERT INTO transactions (
        hash, chain_id, block_number, timestamp, from_address, to_address,
        value, gas_used, gas_price, gas_cost_usd, category, protocol,
        pool_address, token0, token1, amount0, amount1,
        reward_token, reward_amount, nft_token_id, address_id, is_from_sickle
      ) VALUES (?, 8453, 100, 1, ?, ?, '0', '0', '0', 0, 'deposit', 'slipstream', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, 1, 1)`,
    ).run(hash, SICKLE, STRATEGY, opts.nft ?? null);
    return hash;
  }

  it('writes tokenId when a single NPM Transfer involves the Sickle (mint to sickle)', async () => {
    const hash = insertClCandidate();
    getLogs.mockResolvedValue([makeTransferLog(0, ZERO, SICKLE, 4242n, { transactionHash: hash })]);

    const updated = await reconcileNftTokenIdsForAddressChain(db, 1, 8453, SICKLE, {
      getLogs,
    });

    expect(updated).toBe(1);
    expect(getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        address: expect.stringMatching(/^0x827922686190790b37229fd06084350e74485b72$/i),
        fromBlock: 100n,
        toBlock: 100n,
        topics: [ERC721_TRANSFER_TOPIC0],
      }),
    );
    const row = db.prepare('SELECT nft_token_id FROM transactions WHERE hash = ?').get(hash) as {
      nft_token_id: string | null;
    };
    expect(row.nft_token_id).toBe('4242');
  });

  it('sorts by logIndex: mint then transfer-to-sickle same tokenId resolves to one id', async () => {
    const hash = insertClCandidate();
    const router = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
    getLogs.mockResolvedValue([
      makeTransferLog(0, ZERO, router, 99n, { transactionHash: hash }),
      makeTransferLog(1, router, SICKLE, 99n, { transactionHash: hash }),
    ]);

    const updated = await reconcileNftTokenIdsForAddressChain(db, 1, 8453, SICKLE, { getLogs });
    expect(updated).toBe(1);
    const row = db.prepare('SELECT nft_token_id FROM transactions WHERE hash = ?').get(hash) as {
      nft_token_id: string | null;
    };
    expect(row.nft_token_id).toBe('99');
  });

  it('does not update when two mints to sickle yield two tokenIds (ambiguous)', async () => {
    const hash = insertClCandidate();
    getLogs.mockResolvedValue([
      makeTransferLog(0, ZERO, SICKLE, 1n, { transactionHash: hash }),
      makeTransferLog(1, ZERO, SICKLE, 2n, { transactionHash: hash }),
    ]);

    const updated = await reconcileNftTokenIdsForAddressChain(db, 1, 8453, SICKLE, { getLogs });
    expect(updated).toBe(0);
    expect(logger.log.warn).toHaveBeenCalled();
    const warnMsg = vi.mocked(logger.log.warn).mock.calls[0][0] as string;
    expect(warnMsg).toContain('nftReconciliation');
    expect(warnMsg).toContain(hash);
    const row = db.prepare('SELECT nft_token_id FROM transactions WHERE hash = ?').get(hash) as {
      nft_token_id: string | null;
    };
    expect(row.nft_token_id).toBeNull();
  });

  it('skips rows that already have nft_token_id', async () => {
    const hash = insertClCandidate({ nft: '7' });
    getLogs.mockResolvedValue([makeTransferLog(0, ZERO, SICKLE, 99n, { transactionHash: hash })]);

    const updated = await reconcileNftTokenIdsForAddressChain(db, 1, 8453, SICKLE, { getLogs });
    expect(updated).toBe(0);
    expect(getLogs).not.toHaveBeenCalled();
  });

  it('skips non-CL-relevant rows (no getLogs)', async () => {
    const hash = `0x${'cc'.repeat(32)}` as Hash;
    db.prepare(`INSERT INTO addresses (id, address, label) VALUES (1, ?, 't')`).run(ZERO);
    db.prepare(
      `INSERT INTO transactions (
        hash, chain_id, block_number, timestamp, from_address, to_address,
        value, gas_used, gas_price, gas_cost_usd, category, protocol,
        pool_address, token0, token1, amount0, amount1,
        reward_token, reward_amount, nft_token_id, address_id, is_from_sickle
      ) VALUES (?, 8453, 100, 1, ?, ?, '0', '0', '0', 0, 'deposit', 'Aerodrome Farm V2', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, 1, 1)`,
    ).run(hash, SICKLE, '0x9699be38e6d54e51a4b36645726fee9cc736eb45', 1);

    const updated = await reconcileNftTokenIdsForAddressChain(db, 1, 8453, SICKLE, { getLogs });
    expect(updated).toBe(0);
    expect(getLogs).not.toHaveBeenCalled();
  });
});
