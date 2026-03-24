import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/db/schema.js';
import { AddressRepo } from '../../src/db/repositories/address.repo.js';

describe('AddressRepo', () => {
  let db: Database.Database;
  let repo: AddressRepo;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    repo = new AddressRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('when adding a new address', () => {
    it('returns the inserted row id', () => {
      const id = repo.add('0xAbCdEf0123456789AbCdEf0123456789AbCdEf01', 'Main Wallet');
      expect(id).toBe(1);
    });

    it('normalizes address to lowercase', () => {
      repo.add('0xAbCdEf0123456789AbCdEf0123456789AbCdEf01', 'Test');
      const found = repo.findByAddress('0xabcdef0123456789abcdef0123456789abcdef01');
      expect(found).toBeDefined();
      expect(found!.address).toBe('0xabcdef0123456789abcdef0123456789abcdef01');
    });

    it('rejects duplicate addresses', () => {
      repo.add('0xAbCdEf0123456789AbCdEf0123456789AbCdEf01', 'First');
      expect(() =>
        repo.add('0xabcdef0123456789abcdef0123456789abcdef01', 'Second'),
      ).toThrow();
    });
  });

  describe('when finding addresses', () => {
    it('returns undefined for non-existent address', () => {
      const result = repo.findByAddress('0x0000000000000000000000000000000000000000');
      expect(result).toBeUndefined();
    });

    it('returns all tracked addresses', () => {
      repo.add('0x1111111111111111111111111111111111111111', 'Wallet 1');
      repo.add('0x2222222222222222222222222222222222222222', 'Wallet 2');
      const all = repo.findAll();
      expect(all).toHaveLength(2);
      expect(all[0].label).toBe('Wallet 1');
      expect(all[1].label).toBe('Wallet 2');
    });
  });

  describe('when updating sickle addresses', () => {
    it('stores sickle address per chain', () => {
      const id = repo.add('0x1111111111111111111111111111111111111111', 'Test');
      repo.updateSickle(id, 8453, '0xSickleBase1234567890123456789012345678');
      repo.updateSickle(id, 137, '0xSicklePolygon234567890123456789012345');

      const found = repo.findByAddress('0x1111111111111111111111111111111111111111');
      expect(found!.sickleAddresses[8453]).toBe('0xsicklebase1234567890123456789012345678');
      expect(found!.sickleAddresses[137]).toBe('0xsicklepolygon234567890123456789012345');
    });
  });
});
