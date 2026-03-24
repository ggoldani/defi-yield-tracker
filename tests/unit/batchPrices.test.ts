import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../src/db/schema.js';
import { PriceProvider } from '../../src/prices/provider.js';
import { roundPriceTimestampToHour } from '../../src/db/repositories/price.repo.js';
import * as defillama from '../../src/prices/defillama.js';

vi.mock('../../src/prices/defillama.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/prices/defillama.js')>();
  return {
    ...actual,
    getHistoricalPrice: vi.fn(),
  };
});

const WETH_BASE = '0x4200000000000000000000000000000000000006';

describe('PriceProvider.getHistoricalUsdBatch', () => {
  let db: Database.Database;
  let provider: PriceProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new Database(':memory:');
    initializeSchema(db);
    provider = new PriceProvider(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns empty Map for empty requests', async () => {
    const m = await provider.getHistoricalUsdBatch([]);
    expect(m.size).toBe(0);
  });

  it('uses roundPriceTimestampToHour for map keys (matches PriceRepo)', async () => {
    vi.mocked(defillama.getHistoricalPrice).mockResolvedValue(123.45);
    const rawTs = 1700001800;
    const rounded = roundPriceTimestampToHour(rawTs);
    expect(rounded).toBe(Math.round(rawTs / 3600) * 3600);

    const m = await provider.getHistoricalUsdBatch([
      { chainId: 8453, tokenAddress: WETH_BASE, timestamp: rawTs },
    ]);

    const key = `8453:${WETH_BASE.toLowerCase()}:${rounded}`;
    expect(m.has(key)).toBe(true);
    expect(m.get(key)).toBe(123.45);
    expect(defillama.getHistoricalPrice).toHaveBeenCalledWith(8453, WETH_BASE, rounded);
  });

  it('dedupes identical normalized keys so getHistoricalPrice runs once', async () => {
    vi.mocked(defillama.getHistoricalPrice).mockResolvedValue(99);
    const ts = 1700000000;
    const rounded = roundPriceTimestampToHour(ts);

    const m = await provider.getHistoricalUsdBatch([
      { chainId: 8453, tokenAddress: WETH_BASE, timestamp: ts },
      { chainId: 8453, tokenAddress: WETH_BASE.toUpperCase() as typeof WETH_BASE, timestamp: ts + 100 },
    ]);

    expect(defillama.getHistoricalPrice).toHaveBeenCalledTimes(1);
    expect(defillama.getHistoricalPrice).toHaveBeenCalledWith(8453, expect.any(String), rounded);
    const key = `8453:${WETH_BASE.toLowerCase()}:${rounded}`;
    expect(m.get(key)).toBe(99);
    expect(m.size).toBe(1);
  });

  it('skips non-finite or negative timestamps (omits keys)', async () => {
    vi.mocked(defillama.getHistoricalPrice).mockResolvedValue(1);
    const m = await provider.getHistoricalUsdBatch([
      { chainId: 8453, tokenAddress: WETH_BASE, timestamp: NaN },
      { chainId: 8453, tokenAddress: WETH_BASE, timestamp: -1 },
      { chainId: 8453, tokenAddress: WETH_BASE, timestamp: Number.POSITIVE_INFINITY },
    ]);
    expect(m.size).toBe(0);
    expect(defillama.getHistoricalPrice).not.toHaveBeenCalled();
  });

  it('cache hit does not call getHistoricalPrice', async () => {
    db.prepare(
      `INSERT INTO price_cache (chain_id, token_address, timestamp, price_usd)
       VALUES (?, ?, ?, ?)`,
    ).run(8453, WETH_BASE.toLowerCase(), roundPriceTimestampToHour(1700000000), 55.5);

    const m = await provider.getHistoricalUsdBatch([
      { chainId: 8453, tokenAddress: WETH_BASE, timestamp: 1700000000 },
    ]);

    expect(defillama.getHistoricalPrice).not.toHaveBeenCalled();
    const key = `8453:${WETH_BASE.toLowerCase()}:${roundPriceTimestampToHour(1700000000)}`;
    expect(m.get(key)).toBe(55.5);
  });

  it('returns null when historical price is missing (0 from API)', async () => {
    vi.mocked(defillama.getHistoricalPrice).mockResolvedValue(0);
    const ts = 1600000000;
    const rounded = roundPriceTimestampToHour(ts);
    const m = await provider.getHistoricalUsdBatch([
      { chainId: 8453, tokenAddress: WETH_BASE, timestamp: ts },
    ]);
    const key = `8453:${WETH_BASE.toLowerCase()}:${rounded}`;
    expect(m.get(key)).toBeNull();
    expect(defillama.getHistoricalPrice).toHaveBeenCalledTimes(1);
  });

  it('limits concurrent getHistoricalPrice calls', async () => {
    let active = 0;
    let maxActive = 0;
    vi.mocked(defillama.getHistoricalPrice).mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return 1;
    });

    const base = 1700000000;
    const requests = Array.from({ length: 12 }, (_, i) => ({
      chainId: 8453,
      tokenAddress: `0x${(i + 1).toString(16).padStart(40, '0')}` as `0x${string}`,
      timestamp: base + i * 7200,
    }));

    await provider.getHistoricalUsdBatch(requests);

    expect(defillama.getHistoricalPrice).toHaveBeenCalledTimes(12);
    expect(maxActive).toBeLessThanOrEqual(4);
  });
});
