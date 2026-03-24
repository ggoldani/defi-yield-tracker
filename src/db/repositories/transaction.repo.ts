import type Database from 'better-sqlite3';
import type { IndexedTransaction } from '../../types.js';

export class TransactionRepo {
  constructor(private db: Database.Database) {}

  insert(tx: Omit<IndexedTransaction, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO transactions (
        hash, chain_id, block_number, timestamp, from_address, to_address,
        value, gas_used, gas_price, gas_cost_usd, category, protocol,
        pool_address, token0, token1, amount0, amount1,
        reward_token, reward_amount, nft_token_id, address_id, is_from_sickle
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      tx.hash,
      tx.chainId,
      tx.blockNumber,
      tx.timestamp,
      tx.from,
      tx.to,
      tx.value,
      tx.gasUsed,
      tx.gasPrice,
      tx.gasCostUsd,
      tx.category,
      tx.protocol,
      tx.poolAddress || null,
      tx.token0 || null,
      tx.token1 || null,
      tx.amount0 || null,
      tx.amount1 || null,
      tx.rewardToken || null,
      tx.rewardAmount || null,
      tx.nftTokenId ?? null,
      tx.addressId,
      tx.isFromSickle ? 1 : 0,
    );
    return result.lastInsertRowid as number;
  }

  findByAddress(addressId: number, opts: { chainId?: number; category?: string; limit?: number } = {}): IndexedTransaction[] {
    let sql = 'SELECT * FROM transactions WHERE address_id = ?';
    const params: unknown[] = [addressId];

    if (opts.chainId) {
      sql += ' AND chain_id = ?';
      params.push(opts.chainId);
    }
    if (opts.category) {
      sql += ' AND category = ?';
      params.push(opts.category);
    }

    sql += ' ORDER BY timestamp DESC';

    if (opts.limit) {
      sql += ' LIMIT ?';
      params.push(opts.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.mapRow(row));
  }

  findByPool(addressId: number, poolAddress: string, chainId: number): IndexedTransaction[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM transactions WHERE address_id = ? AND pool_address = ? AND chain_id = ? ORDER BY timestamp ASC',
      )
      .all(addressId, poolAddress.toLowerCase(), chainId) as Record<string, unknown>[];
    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Sickle strategy txs that may need CL `nft_token_id` from NPM logs (Task 4b).
   * Caller should further filter to CL-relevant rows (protocol / `to` / pool heuristic).
   */
  findForNftReconciliation(addressId: number, chainId: number): IndexedTransaction[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM transactions
         WHERE address_id = ? AND chain_id = ?
           AND is_from_sickle = 1
           AND category IN ('deposit','withdraw','harvest','compound','exit','rebalance')
           AND (nft_token_id IS NULL OR TRIM(nft_token_id) = '')`,
      )
      .all(addressId, chainId) as Record<string, unknown>[];
    return rows.map((row) => this.mapRow(row));
  }

  /** Sets `nft_token_id` only when currently empty (idempotent). */
  updateNftTokenId(hash: string, chainId: number, nftTokenId: string): number {
    const result = this.db
      .prepare(
        `UPDATE transactions
         SET nft_token_id = ?
         WHERE hash = ? AND chain_id = ?
           AND (nft_token_id IS NULL OR TRIM(nft_token_id) = '')`,
      )
      .run(nftTokenId, hash, chainId);
    return Number(result.changes);
  }

  getLastBlock(addressId: number, chainId: number): number {
    const row = this.db
      .prepare('SELECT MAX(block_number) as last_block FROM transactions WHERE address_id = ? AND chain_id = ?')
      .get(addressId, chainId) as { last_block: number | null } | undefined;
    return row?.last_block || 0;
  }

  private mapRow(row: Record<string, unknown>): IndexedTransaction {
    return {
      id: row.id as number,
      hash: row.hash as IndexedTransaction['hash'],
      chainId: row.chain_id as number,
      blockNumber: row.block_number as number,
      timestamp: row.timestamp as number,
      from: row.from_address as IndexedTransaction['from'],
      to: row.to_address as IndexedTransaction['to'],
      value: row.value as string,
      gasUsed: row.gas_used as string,
      gasPrice: row.gas_price as string,
      gasCostUsd: row.gas_cost_usd as number,
      category: row.category as IndexedTransaction['category'],
      protocol: row.protocol as string,
      poolAddress: (row.pool_address as IndexedTransaction['poolAddress']) || undefined,
      token0: (row.token0 as IndexedTransaction['token0']) || undefined,
      token1: (row.token1 as IndexedTransaction['token1']) || undefined,
      amount0: (row.amount0 as string) || undefined,
      amount1: (row.amount1 as string) || undefined,
      rewardToken: (row.reward_token as IndexedTransaction['rewardToken']) || undefined,
      rewardAmount: (row.reward_amount as string) || undefined,
      nftTokenId: (row.nft_token_id as string) || undefined,
      addressId: row.address_id as number,
      isFromSickle: Boolean(row.is_from_sickle),
    };
  }
}
