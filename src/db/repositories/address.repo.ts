import type Database from 'better-sqlite3';
import type { TrackedAddress } from '../../types.js';

export class AddressRepo {
  constructor(private db: Database.Database) {}

  add(address: string, label: string, sickleAddresses: Record<number, string> = {}): number {
    const stmt = this.db.prepare(
      'INSERT INTO addresses (address, label, sickle_addresses) VALUES (?, ?, ?)',
    );
    const result = stmt.run(address.toLowerCase(), label, JSON.stringify(sickleAddresses));
    return result.lastInsertRowid as number;
  }

  findByAddress(address: string): TrackedAddress | undefined {
    const row = this.db
      .prepare('SELECT * FROM addresses WHERE address = ?')
      .get(address.toLowerCase()) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  /**
   * Updates or adds a Sickle wallet address for a specific chain
   */
  updateSickleAddress(id: number, chainId: number, sickleAddress: string): void {
    const record = this.findById(id);
    if (!record) throw new Error(`Address with ID ${id} not found`);

    const updatedAddresses = {
      ...record.sickleAddresses,
      [chainId]: sickleAddress,
    };

    this.db.prepare(
      `UPDATE addresses SET sickle_addresses = ? WHERE id = ?`
    ).run(JSON.stringify(updatedAddresses), id);
  }

  findById(id: number): TrackedAddress | undefined {
    const row = this.db
      .prepare('SELECT * FROM addresses WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  findAll(): TrackedAddress[] {
    const rows = this.db
      .prepare('SELECT * FROM addresses ORDER BY id')
      .all() as Record<string, unknown>[];
    return rows.map((row) => this.mapRow(row));
  }

  updateSickle(id: number, chainId: number, sickleAddress: string): void {
    const row = this.db
      .prepare('SELECT sickle_addresses FROM addresses WHERE id = ?')
      .get(id) as { sickle_addresses: string } | undefined;
    if (!row) throw new Error(`Address with id ${id} not found`);
    const sickles = JSON.parse(row.sickle_addresses);
    sickles[chainId] = sickleAddress.toLowerCase();
    this.db
      .prepare('UPDATE addresses SET sickle_addresses = ? WHERE id = ?')
      .run(JSON.stringify(sickles), id);
  }

  private mapRow(row: Record<string, unknown>): TrackedAddress {
    return {
      id: row.id as number,
      address: row.address as string as TrackedAddress['address'],
      label: row.label as string,
      sickleAddresses: JSON.parse(row.sickle_addresses as string),
      createdAt: row.created_at as string,
    };
  }
}
