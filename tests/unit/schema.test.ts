import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/db/schema.js';

describe('Database Schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('when initializing a fresh database', () => {
    it('creates all required tables', () => {
      initializeSchema(db);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('addresses');
      expect(tableNames).toContain('transactions');
      expect(tableNames).toContain('positions');
      expect(tableNames).toContain('price_cache');
      expect(tableNames).toContain('sync_state');
    });

    it('creates all required indexes', () => {
      initializeSchema(db);
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
        .all() as { name: string }[];
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_tx_address');
      expect(indexNames).toContain('idx_tx_chain');
      expect(indexNames).toContain('idx_tx_category');
      expect(indexNames).toContain('idx_tx_timestamp');
      expect(indexNames).toContain('idx_positions_address');
      expect(indexNames).toContain('idx_price_lookup');
    });
  });

  describe('when initializing an already-initialized database', () => {
    it('is idempotent (run twice without error)', () => {
      initializeSchema(db);
      expect(() => initializeSchema(db)).not.toThrow();
    });
  });
});
