import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/db/schema.js';
import { migrate } from '../../src/db/migrate.js';

const { fetchAllTransactions, rebuildPositionsForAddressChain } = vi.hoisted(() => ({
  fetchAllTransactions: vi.fn(),
  rebuildPositionsForAddressChain: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/indexer/scanner.js', () => ({
  fetchAllTransactions,
}));

vi.mock('../../src/indexer/positionBuilder.js', () => ({
  rebuildPositionsForAddressChain,
}));

import { rebuildPositionsOnlyForAddress } from '../../src/indexer/sync.js';
import { CHAINS } from '../../src/config.js';
import type { TrackedAddress } from '../../src/types.js';

describe('rebuildPositionsOnlyForAddress', () => {
  let db: Database.Database;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    migrate(db);
  });

  afterEach(() => {
    db.close();
  });

  it('does not call fetchAllTransactions (no explorer tx list)', async () => {
    const addr: TrackedAddress = {
      id: 1,
      address: '0x0000000000000000000000000000000000000001',
      label: 'x',
      sickleAddresses: {},
    };
    await rebuildPositionsOnlyForAddress(db, addr, [CHAINS[8453]!.id]);
    expect(fetchAllTransactions).not.toHaveBeenCalled();
    expect(rebuildPositionsForAddressChain).toHaveBeenCalled();
    const first = rebuildPositionsForAddressChain.mock.calls[0];
    expect(first?.[1]).toBe(1);
    expect(first?.[2]).toBe(8453);
    expect(first?.[3]).toMatchObject({ priceProvider: expect.any(Object) });
  });

  it('invokes rebuild for each chain when chainIds omitted', async () => {
    const addr: TrackedAddress = {
      id: 2,
      address: '0x0000000000000000000000000000000000000002',
      label: 'y',
      sickleAddresses: {},
    };
    const chainCount = Object.keys(CHAINS).length;
    await rebuildPositionsOnlyForAddress(db, addr);
    expect(rebuildPositionsForAddressChain).toHaveBeenCalledTimes(chainCount);
  });
});
