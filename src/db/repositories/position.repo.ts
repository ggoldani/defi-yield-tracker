import type Database from 'better-sqlite3';
import type { Position, PositionKind } from '../../types.js';

function asPositionKind(value: unknown): PositionKind {
  return value === 'v3_nft' ? 'v3_nft' : 'v2_lp';
}

export class PositionRepo {
  constructor(private db: Database.Database) {}

  upsert(position: Omit<Position, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO positions (
        address_id, chain_id, protocol, pool_address, token0, token1,
        token0_symbol, token1_symbol, is_active, entry_timestamp, exit_timestamp,
        total_deposited_0, total_deposited_1, total_withdrawn_0, total_withdrawn_1,
        total_deposited_usd, total_withdrawn_usd, total_harvested_usd,
        total_gas_cost_usd, current_value_usd, position_kind, nft_token_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(address_id, chain_id, pool_address, nft_token_id) DO UPDATE SET
        is_active = excluded.is_active,
        exit_timestamp = excluded.exit_timestamp,
        total_deposited_0 = excluded.total_deposited_0,
        total_deposited_1 = excluded.total_deposited_1,
        total_withdrawn_0 = excluded.total_withdrawn_0,
        total_withdrawn_1 = excluded.total_withdrawn_1,
        total_deposited_usd = excluded.total_deposited_usd,
        total_withdrawn_usd = excluded.total_withdrawn_usd,
        total_harvested_usd = excluded.total_harvested_usd,
        total_gas_cost_usd = excluded.total_gas_cost_usd,
        current_value_usd = excluded.current_value_usd,
        position_kind = excluded.position_kind,
        nft_token_id = excluded.nft_token_id
    `);
    const result = stmt.run(
      position.addressId,
      position.chainId,
      position.protocol,
      position.poolAddress.toLowerCase(),
      position.token0.toLowerCase(),
      position.token1.toLowerCase(),
      position.token0Symbol,
      position.token1Symbol,
      position.isActive ? 1 : 0,
      position.entryTimestamp,
      position.exitTimestamp || null,
      position.totalDeposited0,
      position.totalDeposited1,
      position.totalWithdrawn0,
      position.totalWithdrawn1,
      position.totalDepositedUsd,
      position.totalWithdrawnUsd,
      position.totalHarvestedUsd,
      position.totalGasCostUsd,
      position.currentValueUsd || null,
      position.positionKind,
      position.nftTokenId ?? '',
    );
    return result.lastInsertRowid as number;
  }

  findByAddress(addressId: number, opts: { chainId?: number; activeOnly?: boolean } = {}): Position[] {
    let sql = 'SELECT * FROM positions WHERE address_id = ?';
    const params: unknown[] = [addressId];

    if (opts.chainId) {
      sql += ' AND chain_id = ?';
      params.push(opts.chainId);
    }
    if (opts.activeOnly) {
      sql += ' AND is_active = 1';
    }

    sql += ' ORDER BY entry_timestamp DESC';

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.mapRow(row));
  }

  findByPool(
    addressId: number,
    poolAddress: string,
    chainId: number,
    nftTokenId: string = '',
  ): Position | undefined {
    const row = this.db
      .prepare(
        'SELECT * FROM positions WHERE address_id = ? AND pool_address = ? AND chain_id = ? AND nft_token_id = ?',
      )
      .get(addressId, poolAddress.toLowerCase(), chainId, nftTokenId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  private mapRow(row: Record<string, unknown>): Position {
    return {
      id: row.id as number,
      addressId: row.address_id as number,
      chainId: row.chain_id as number,
      positionKind: asPositionKind(row.position_kind),
      nftTokenId: (row.nft_token_id as string) ?? '',
      protocol: row.protocol as string,
      poolAddress: row.pool_address as Position['poolAddress'],
      token0: row.token0 as Position['token0'],
      token1: row.token1 as Position['token1'],
      token0Symbol: row.token0_symbol as string,
      token1Symbol: row.token1_symbol as string,
      isActive: Boolean(row.is_active),
      entryTimestamp: row.entry_timestamp as number,
      exitTimestamp: (row.exit_timestamp as number) || undefined,
      totalDeposited0: row.total_deposited_0 as string,
      totalDeposited1: row.total_deposited_1 as string,
      totalWithdrawn0: row.total_withdrawn_0 as string,
      totalWithdrawn1: row.total_withdrawn_1 as string,
      totalDepositedUsd: row.total_deposited_usd as number,
      totalWithdrawnUsd: row.total_withdrawn_usd as number,
      totalHarvestedUsd: row.total_harvested_usd as number,
      totalGasCostUsd: row.total_gas_cost_usd as number,
      currentValueUsd: (row.current_value_usd as number) || undefined,
    };
  }
}
