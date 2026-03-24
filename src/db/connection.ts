import Database from 'better-sqlite3';
import { DB_PATH } from '../config.js';
import { initializeSchema } from './schema.js';
import { migrate } from './migrate.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let db: Database.Database | null = null;

export function getDb(path?: string): Database.Database {
  if (db) return db;
  const dbPath = path || DB_PATH;
  mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initializeSchema(db);
  migrate(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
