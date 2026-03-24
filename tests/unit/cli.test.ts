import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

const { syncAddress, rebuildPositionsOnlyForAddress } = vi.hoisted(() => ({
  syncAddress: vi.fn().mockResolvedValue([]),
  rebuildPositionsOnlyForAddress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/db/connection.js', () => ({
  getDb: vi.fn(() => ({})),
  closeDb: vi.fn(),
}));

vi.mock('../../src/indexer/sync.js', () => ({
  syncAddress,
  rebuildPositionsOnlyForAddress,
}));

vi.mock('../../src/db/repositories/address.repo.js', () => ({
  /** `new AddressRepo()` — must be a constructible function for Vitest/TS */
  AddressRepo: vi.fn(function AddressRepoMock() {
    return {
      findById: vi.fn(),
      findAll: vi.fn(),
    };
  }),
}));

import { getDb } from '../../src/db/connection.js';
import { setupSyncCommand } from '../../src/cli/commands/sync.js';
import { AddressRepo } from '../../src/db/repositories/address.repo.js';

const sampleAddr = {
  id: 7,
  address: '0x0000000000000000000000000000000000000000' as const,
  label: 'ref',
  sickleAddresses: {} as Record<number, string>,
};

describe('CLI sync command', () => {
  let program: Command;

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    program.exitOverride();
    (AddressRepo as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return {
        findById: vi.fn().mockReturnValue(sampleAddr),
        findAll: vi.fn().mockReturnValue([sampleAddr]),
      };
    });
    (getDb as unknown as ReturnType<typeof vi.fn>).mockReturnValue({});
    setupSyncCommand(program);
  });

  it('with --rebuild-positions calls rebuildPositionsOnlyForAddress and not syncAddress', async () => {
    await program.parseAsync(['sync', '--rebuild-positions'], { from: 'user' });
    expect(rebuildPositionsOnlyForAddress).toHaveBeenCalledTimes(1);
    expect(rebuildPositionsOnlyForAddress).toHaveBeenCalledWith({}, sampleAddr, undefined);
    expect(syncAddress).not.toHaveBeenCalled();
  });

  it('with -r short flag triggers rebuild-only path', async () => {
    await program.parseAsync(['sync', '-r'], { from: 'user' });
    expect(rebuildPositionsOnlyForAddress).toHaveBeenCalled();
    expect(syncAddress).not.toHaveBeenCalled();
  });

  it('passes chain filter to rebuild path', async () => {
    await program.parseAsync(['sync', '--rebuild-positions', '-c', '8453'], { from: 'user' });
    expect(rebuildPositionsOnlyForAddress).toHaveBeenCalledWith({}, sampleAddr, [8453]);
  });

  it('without flag calls syncAddress and not rebuild-only', async () => {
    await program.parseAsync(['sync'], { from: 'user' });
    expect(syncAddress).toHaveBeenCalledTimes(1);
    expect(syncAddress).toHaveBeenCalledWith({}, sampleAddr, undefined);
    expect(rebuildPositionsOnlyForAddress).not.toHaveBeenCalled();
  });

  it('passes address id to rebuild path', async () => {
    await program.parseAsync(['sync', '7', '--rebuild-positions'], { from: 'user' });
    expect(rebuildPositionsOnlyForAddress).toHaveBeenCalledWith({}, sampleAddr, undefined);
    const instances = (AddressRepo as unknown as ReturnType<typeof vi.fn>).mock.results;
    const repo = instances[instances.length - 1]?.value as { findById: ReturnType<typeof vi.fn> };
    expect(repo.findById).toHaveBeenCalledWith(7);
  });

  it('rejects unknown --chain id without calling sync or rebuild', async () => {
    await program.parseAsync(['sync', '--chain', '999999'], { from: 'user' });
    expect(syncAddress).not.toHaveBeenCalled();
    expect(rebuildPositionsOnlyForAddress).not.toHaveBeenCalled();
  });
});
