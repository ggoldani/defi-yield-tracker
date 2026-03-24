import type Database from 'better-sqlite3';

/** Bump when a new sequential migration block is added (see migrate()). */
export const SCHEMA_USER_VERSION = 1;

function tableHasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

function migrateToV1(db: Database.Database): void {
  const apply = db.transaction(() => {
    if (!tableHasColumn(db, 'transactions', 'nft_token_id')) {
      db.exec(`ALTER TABLE transactions ADD COLUMN nft_token_id TEXT`);
    }

    if (!tableHasColumn(db, 'positions', 'position_kind')) {
      db.exec(`
      CREATE TABLE positions_new (
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
        position_kind TEXT NOT NULL DEFAULT 'v2_lp',
        nft_token_id TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (address_id) REFERENCES addresses(id),
        UNIQUE(address_id, chain_id, pool_address, nft_token_id)
      );

      INSERT INTO positions_new (
        id, address_id, chain_id, protocol, pool_address,
        token0, token1, token0_symbol, token1_symbol,
        is_active, entry_timestamp, exit_timestamp,
        total_deposited_0, total_deposited_1, total_withdrawn_0, total_withdrawn_1,
        total_deposited_usd, total_withdrawn_usd, total_harvested_usd,
        total_gas_cost_usd, current_value_usd,
        position_kind, nft_token_id
      )
      SELECT
        id, address_id, chain_id, protocol, pool_address,
        token0, token1, token0_symbol, token1_symbol,
        is_active, entry_timestamp, exit_timestamp,
        total_deposited_0, total_deposited_1, total_withdrawn_0, total_withdrawn_1,
        total_deposited_usd, total_withdrawn_usd, total_harvested_usd,
        total_gas_cost_usd, current_value_usd,
        'v2_lp',
        ''
      FROM positions;

      DROP TABLE positions;
      ALTER TABLE positions_new RENAME TO positions;
      CREATE INDEX IF NOT EXISTS idx_positions_address ON positions(address_id);
    `);
    } else {
      db.exec(`
      UPDATE positions SET position_kind = 'v2_lp' WHERE position_kind IS NULL OR TRIM(position_kind) = '';
      UPDATE positions SET nft_token_id = '' WHERE nft_token_id IS NULL;
    `);
    }
  });
  apply();
}

/**
 * Applies idempotent schema migrations after `initializeSchema`.
 * Safe to call on every open; advances `PRAGMA user_version` only after success.
 */
export function migrate(db: Database.Database): void {
  const version = Number(db.pragma('user_version', { simple: true }));
  if (version >= SCHEMA_USER_VERSION) {
    return;
  }

  // When SCHEMA_USER_VERSION > 1, add `if (version < N) migrateToN(db)` blocks before the pragma below.
  if (version < 1) {
    migrateToV1(db);
  }

  db.pragma(`user_version = ${SCHEMA_USER_VERSION}`);
}
