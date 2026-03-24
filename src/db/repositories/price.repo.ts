import type Database from 'better-sqlite3';
import type { CachedPrice } from '../../types.js';

export class PriceRepo {
  constructor(private db: Database.Database) {}

  /**
   * Upsert a price entry. Timestamps are rounded to nearest hour for cache efficiency.
   */
  upsert(chainId: number, tokenAddress: string, timestamp: number, priceUsd: number): void {
    const roundedTs = this.roundToHour(timestamp);
    this.db
      .prepare(
        `INSERT INTO price_cache (chain_id, token_address, timestamp, price_usd)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(chain_id, token_address, timestamp) DO UPDATE SET price_usd = excluded.price_usd`,
      )
      .run(chainId, tokenAddress.toLowerCase(), roundedTs, priceUsd);
  }

  /**
   * Find cached price closest to the given timestamp (within 1 hour tolerance).
   */
  findClosest(chainId: number, tokenAddress: string, timestamp: number): CachedPrice | undefined {
    const roundedTs = this.roundToHour(timestamp);
    const row = this.db
      .prepare(
        `SELECT * FROM price_cache
         WHERE chain_id = ? AND token_address = ? AND timestamp = ?`,
      )
      .get(chainId, tokenAddress.toLowerCase(), roundedTs) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  /**
   * Get all cached prices for a token on a chain, ordered by timestamp.
   */
  findByToken(chainId: number, tokenAddress: string): CachedPrice[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM price_cache WHERE chain_id = ? AND token_address = ? ORDER BY timestamp ASC',
      )
      .all(chainId, tokenAddress.toLowerCase()) as Record<string, unknown>[];
    return rows.map((row) => this.mapRow(row));
  }

  private roundToHour(timestamp: number): number {
    return Math.round(timestamp / 3600) * 3600;
  }

  private mapRow(row: Record<string, unknown>): CachedPrice {
    return {
      id: row.id as number,
      chainId: row.chain_id as number,
      tokenAddress: row.token_address as CachedPrice['tokenAddress'],
      timestamp: row.timestamp as number,
      priceUsd: row.price_usd as number,
    };
  }
}
