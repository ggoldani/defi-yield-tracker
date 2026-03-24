import type Database from 'better-sqlite3';

export function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL DEFAULT '',
      sickle_addresses TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
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
      nft_token_id TEXT,
      address_id INTEGER NOT NULL,
      is_from_sickle INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (address_id) REFERENCES addresses(id),
      UNIQUE(hash, chain_id)
    );

    CREATE TABLE IF NOT EXISTS positions (
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

    CREATE TABLE IF NOT EXISTS price_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chain_id INTEGER NOT NULL,
      token_address TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      price_usd REAL NOT NULL,
      UNIQUE(chain_id, token_address, timestamp)
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address_id INTEGER NOT NULL,
      chain_id INTEGER NOT NULL,
      last_block INTEGER NOT NULL DEFAULT 0,
      last_synced_at TEXT,
      FOREIGN KEY (address_id) REFERENCES addresses(id),
      UNIQUE(address_id, chain_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tx_address ON transactions(address_id);
    CREATE INDEX IF NOT EXISTS idx_tx_chain ON transactions(chain_id);
    CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transactions(timestamp);
    CREATE INDEX IF NOT EXISTS idx_positions_address ON positions(address_id);
    CREATE INDEX IF NOT EXISTS idx_price_lookup ON price_cache(chain_id, token_address, timestamp);
  `);
}
