import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/db/schema.js';
import { migrate, SCHEMA_USER_VERSION } from '../../src/db/migrate.js';
import { TransactionRepo } from '../../src/db/repositories/transaction.repo.js';
import { PositionRepo } from '../../src/db/repositories/position.repo.js';

function tableColumns(db: Database.Database, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map((r) => r.name);
}

describe('SQLite migrate', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
  });

  afterEach(() => {
    db.close();
  });

  describe('fresh database (initializeSchema + migrate)', () => {
    it('sets user_version to SCHEMA_USER_VERSION', () => {
      initializeSchema(db);
      migrate(db);
      const v = Number(db.pragma('user_version', { simple: true }));
      expect(v).toBe(SCHEMA_USER_VERSION);
    });

    it('exposes positions.position_kind and positions.nft_token_id', () => {
      initializeSchema(db);
      migrate(db);
      const cols = tableColumns(db, 'positions');
      expect(cols).toContain('position_kind');
      expect(cols).toContain('nft_token_id');
    });

    it('exposes transactions.nft_token_id', () => {
      initializeSchema(db);
      migrate(db);
      expect(tableColumns(db, 'transactions')).toContain('nft_token_id');
    });

    it('is idempotent when migrate runs twice', () => {
      initializeSchema(db);
      migrate(db);
      migrate(db);
      const v = Number(db.pragma('user_version', { simple: true }));
      expect(v).toBe(SCHEMA_USER_VERSION);
      expect(() => migrate(db)).not.toThrow();
    });

    it('enforces unique (address_id, chain_id, pool_address, nft_token_id) on positions', () => {
      initializeSchema(db);
      migrate(db);
      db.prepare('INSERT INTO addresses (address, label) VALUES (?, ?)').run('0xaaa', 'a');
      const base = {
        addressId: 1,
        chainId: 8453,
        protocol: 'aerodrome',
        poolAddress: '0xpool000000000000000000000000000000000001' as `0x${string}`,
        token0: '0xt0' as `0x${string}`,
        token1: '0xt1' as `0x${string}`,
        token0Symbol: 'A',
        token1Symbol: 'B',
        isActive: true,
        entryTimestamp: 1,
        totalDeposited0: '0',
        totalDeposited1: '0',
        totalWithdrawn0: '0',
        totalWithdrawn1: '0',
        totalDepositedUsd: 0,
        totalWithdrawnUsd: 0,
        totalHarvestedUsd: 0,
        totalGasCostUsd: 0,
        positionKind: 'v2_lp' as const,
        nftTokenId: '',
      };
      const repo = new PositionRepo(db);
      repo.upsert(base);
      expect(() => repo.upsert({ ...base })).not.toThrow();
      expect(() =>
        db
          .prepare(
            `INSERT INTO positions (
            address_id, chain_id, protocol, pool_address, token0, token1,
            token0_symbol, token1_symbol, is_active, entry_timestamp,
            total_deposited_0, total_deposited_1, total_withdrawn_0, total_withdrawn_1,
            total_deposited_usd, total_withdrawn_usd, total_harvested_usd,
            total_gas_cost_usd, position_kind, nft_token_id
          ) VALUES (1, 8453, 'x', '0xpool000000000000000000000000000000000001', '0xa', '0xb', '', '', 1, 1,
            '0','0','0','0', 0, 0, 0, 0, 'v2_lp', '')`,
          )
          .run(),
      ).toThrow();
    });

    it('allows two positions same pool with different nft_token_id', () => {
      initializeSchema(db);
      migrate(db);
      db.prepare('INSERT INTO addresses (address, label) VALUES (?, ?)').run('0xbbb', 'b');
      const pool = '0xpool000000000000000000000000000000000002' as `0x${string}`;
      const common = {
        addressId: 1,
        chainId: 8453,
        protocol: 'aero',
        poolAddress: pool,
        token0: '0xt0' as `0x${string}`,
        token1: '0xt1' as `0x${string}`,
        token0Symbol: 'A',
        token1Symbol: 'B',
        isActive: true,
        entryTimestamp: 1,
        totalDeposited0: '0',
        totalDeposited1: '0',
        totalWithdrawn0: '0',
        totalWithdrawn1: '0',
        totalDepositedUsd: 0,
        totalWithdrawnUsd: 0,
        totalHarvestedUsd: 0,
        totalGasCostUsd: 0,
        positionKind: 'v3_nft' as const,
      };
      const repo = new PositionRepo(db);
      repo.upsert({ ...common, nftTokenId: '1' });
      repo.upsert({ ...common, nftTokenId: '2' });
      const rows = db.prepare('SELECT COUNT(*) as c FROM positions').get() as { c: number };
      expect(rows.c).toBe(2);
    });
  });

  describe('legacy schema (pre-Task-1 shape)', () => {
    it('upgrades to v1, adds columns, backfills v2_lp and empty nft_token_id', () => {
      db.exec(`
        CREATE TABLE addresses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          address TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL DEFAULT '',
          sickle_addresses TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO addresses (address, label) VALUES ('0xlegacy', 'L');
        CREATE TABLE transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          hash TEXT NOT NULL,
          chain_id INTEGER NOT NULL,
          block_number INTEGER NOT NULL,
          timestamp INTEGER NOT NULL,
          from_address TEXT NOT NULL,
          to_address TEXT NOT NULL,
          value TEXT NOT NULL DEFAULT '0',
          gas_used TEXT NOT NULL DEFAULT '0',
          gas_price TEXT NOT NULL DEFAULT '0',
          gas_cost_usd REAL NOT NULL DEFAULT 0,
          category TEXT NOT NULL DEFAULT 'unknown',
          protocol TEXT NOT NULL DEFAULT '',
          pool_address TEXT,
          token0 TEXT,
          token1 TEXT,
          amount0 TEXT,
          amount1 TEXT,
          reward_token TEXT,
          reward_amount TEXT,
          address_id INTEGER NOT NULL,
          is_from_sickle INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (address_id) REFERENCES addresses(id),
          UNIQUE(hash, chain_id)
        );
        CREATE TABLE positions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          address_id INTEGER NOT NULL,
          chain_id INTEGER NOT NULL,
          protocol TEXT NOT NULL,
          pool_address TEXT NOT NULL,
          token0 TEXT NOT NULL,
          token1 TEXT NOT NULL,
          token0_symbol TEXT NOT NULL DEFAULT '',
          token1_symbol TEXT NOT NULL DEFAULT '',
          is_active INTEGER NOT NULL DEFAULT 1,
          entry_timestamp INTEGER NOT NULL,
          exit_timestamp INTEGER,
          total_deposited_0 TEXT NOT NULL DEFAULT '0',
          total_deposited_1 TEXT NOT NULL DEFAULT '0',
          total_withdrawn_0 TEXT NOT NULL DEFAULT '0',
          total_withdrawn_1 TEXT NOT NULL DEFAULT '0',
          total_deposited_usd REAL NOT NULL DEFAULT 0,
          total_withdrawn_usd REAL NOT NULL DEFAULT 0,
          total_harvested_usd REAL NOT NULL DEFAULT 0,
          total_gas_cost_usd REAL NOT NULL DEFAULT 0,
          current_value_usd REAL,
          FOREIGN KEY (address_id) REFERENCES addresses(id),
          UNIQUE(address_id, chain_id, pool_address)
        );
        INSERT INTO positions (
          address_id, chain_id, protocol, pool_address, token0, token1,
          token0_symbol, token1_symbol, is_active, entry_timestamp,
          total_deposited_0, total_deposited_1, total_withdrawn_0, total_withdrawn_1,
          total_deposited_usd, total_withdrawn_usd, total_harvested_usd, total_gas_cost_usd
        ) VALUES (
          1, 8453, 'p', '0xpool', '0xa', '0xb', '', '', 1, 100,
          '1', '2', '0', '0', 0, 0, 0, 0
        );
      `);
      expect(Number(db.pragma('user_version', { simple: true }))).toBe(0);

      migrate(db);

      expect(Number(db.pragma('user_version', { simple: true }))).toBe(SCHEMA_USER_VERSION);
      expect(tableColumns(db, 'transactions')).toContain('nft_token_id');
      expect(tableColumns(db, 'positions')).toContain('position_kind');
      expect(tableColumns(db, 'positions')).toContain('nft_token_id');

      const row = db
        .prepare('SELECT position_kind, nft_token_id FROM positions WHERE id = 1')
        .get() as { position_kind: string; nft_token_id: string };
      expect(row.position_kind).toBe('v2_lp');
      expect(row.nft_token_id).toBe('');
    });
  });

  describe('TransactionRepo / PositionRepo persistence', () => {
    it('round-trips nft_token_id on transactions', () => {
      initializeSchema(db);
      migrate(db);
      db.prepare('INSERT INTO addresses (address, label) VALUES (?, ?)').run('0xtx', 't');
      const repo = new TransactionRepo(db);
      repo.insert({
        hash: '0x' + 'a'.repeat(64) as `0x${string}`,
        chainId: 1,
        blockNumber: 1,
        timestamp: 1,
        from: '0xfrom000000000000000000000000000000000001',
        to: '0xto00000000000000000000000000000000000001',
        value: '0',
        gasUsed: '0',
        gasPrice: '0',
        gasCostUsd: 0,
        category: 'deposit',
        protocol: '',
        addressId: 1,
        isFromSickle: false,
        nftTokenId: '12345',
      });
      const found = repo.findByAddress(1, { limit: 1 })[0];
      expect(found.nftTokenId).toBe('12345');
    });

    it('round-trips position_kind and nft_token_id on positions', () => {
      initializeSchema(db);
      migrate(db);
      db.prepare('INSERT INTO addresses (address, label) VALUES (?, ?)').run('0xp', 'p');
      const repo = new PositionRepo(db);
      const p = {
        addressId: 1,
        chainId: 1,
        protocol: 'x',
        poolAddress: '0xpool000000000000000000000000000000000099' as `0x${string}`,
        token0: '0xt0' as `0x${string}`,
        token1: '0xt1' as `0x${string}`,
        token0Symbol: 'T0',
        token1Symbol: 'T1',
        isActive: true,
        entryTimestamp: 9,
        totalDeposited0: '0',
        totalDeposited1: '0',
        totalWithdrawn0: '0',
        totalWithdrawn1: '0',
        totalDepositedUsd: 0,
        totalWithdrawnUsd: 0,
        totalHarvestedUsd: 0,
        totalGasCostUsd: 0,
        positionKind: 'v3_nft' as const,
        nftTokenId: '999',
      };
      repo.upsert(p);
      const back = repo.findByPool(1, p.poolAddress, 1, '999');
      expect(back).toBeDefined();
      expect(back!.positionKind).toBe('v3_nft');
      expect(back!.nftTokenId).toBe('999');
    });
  });
});
