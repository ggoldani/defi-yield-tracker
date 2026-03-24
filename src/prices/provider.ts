import type Database from 'better-sqlite3';
import { PriceRepo, roundPriceTimestampToHour } from '../db/repositories/price.repo.js';
import { getCurrentPrice, getHistoricalPrice } from './defillama.js';
import { log } from '../utils/logger.js';

/** Max parallel DeFiLlama `getHistoricalPrice` calls per batch (rate / burst control). */
export const BATCH_HISTORICAL_USD_CONCURRENCY = 4;

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const n = Math.min(Math.max(1, concurrency), items.length);
  let i = 0;
  const runWorker = async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      await worker(items[idx]!);
    }
  };
  await Promise.all(Array.from({ length: n }, () => runWorker()));
}

/**
 * Price provider with SQLite caching layer.
 * Checks cache first, fetches from DeFiLlama on miss, stores result.
 * Timestamps are rounded to nearest hour for cache efficiency.
 */
export class PriceProvider {
  private repo: PriceRepo;

  constructor(db: Database.Database) {
    this.repo = new PriceRepo(db);
  }

  /**
   * Gets the price of a token at a specific timestamp.
   * Uses cache if available, otherwise fetches from DeFiLlama.
   */
  async getPrice(chainId: number, tokenAddress: string, timestamp: number): Promise<number> {
    // Check cache first
    const cached = this.repo.findClosest(chainId, tokenAddress, timestamp);
    if (cached) {
      return cached.priceUsd;
    }

    // Cache miss — fetch from DeFiLlama
    const price = await getHistoricalPrice(chainId, tokenAddress, timestamp);

    if (price > 0) {
      this.repo.upsert(chainId, tokenAddress, timestamp, price);
      log.debug(`Cached price: ${tokenAddress} @ ${timestamp} = $${price}`);
    }

    return price;
  }

  /**
   * Gets the current price of a token.
   */
  async getCurrentPrice(chainId: number, tokenAddress: string): Promise<number> {
    const now = Math.floor(Date.now() / 1000);

    // Check if we have a recent cache entry (within last hour)
    const cached = this.repo.findClosest(chainId, tokenAddress, now);
    if (cached) {
      return cached.priceUsd;
    }

    const price = await getCurrentPrice(chainId, tokenAddress);

    if (price > 0) {
      this.repo.upsert(chainId, tokenAddress, now, price);
    }

    return price;
  }

  /**
   * Gets the native currency price (ETH on Base, POL on Polygon).
   */
  async getNativePrice(chainId: number, timestamp?: number): Promise<number> {
    const native = '0x0000000000000000000000000000000000000000';
    if (timestamp) {
      return this.getPrice(chainId, native, timestamp);
    }
    return this.getCurrentPrice(chainId, native);
  }

  /**
   * Calculates gas cost in USD for a transaction.
   */
  async calculateGasCostUsd(
    chainId: number,
    gasUsed: string,
    gasPrice: string,
    timestamp: number,
  ): Promise<number> {
    const gasCostWei = BigInt(gasUsed) * BigInt(gasPrice);
    const gasCostEth = Number(gasCostWei) / 1e18;
    const nativePrice = await this.getNativePrice(chainId, timestamp);
    return gasCostEth * nativePrice;
  }

  /**
   * Batch historical USD quotes for rebuild-style passes.
   *
   * Used by `rebuildPositionsForAddressChain` (Task 4) to prefetch prices without N× HTTP per tx.
   *
   * **Keys:** `${chainId}:${tokenAddress.toLowerCase()}:${roundedTs}` where `roundedTs` is
   * `roundPriceTimestampToHour(timestamp)` — same bucketing as `PriceRepo` / `getPrice`.
   *
   * **Values:** positive USD from cache or DeFiLlama; **`null`** when no usable price (API returns
   * `0` or missing). Unlike `getPrice` (which returns `0`), this distinguishes “unknown” via `null`.
   *
   * **Dedupe:** Same normalized key is fetched at most once. **Cache:** SQLite checked before HTTP.
   * **Network:** Misses use `getHistoricalPrice` with at most `BATCH_HISTORICAL_USD_CONCURRENCY`
   * concurrent calls. Successful fetches are **upserted** like `getPrice`.
   *
   * **Invalid timestamps** (`NaN`, `Infinity`, or `< 0`) are skipped — no map entry.
   */
  async getHistoricalUsdBatch(
    requests: { chainId: number; tokenAddress: string; timestamp: number }[],
  ): Promise<Map<string, number | null>> {
    const result = new Map<string, number | null>();
    if (requests.length === 0) {
      return result;
    }

    type Entry = { chainId: number; token: string; roundedTs: number; key: string };
    const unique = new Map<string, Entry>();

    for (const r of requests) {
      if (!Number.isFinite(r.timestamp) || r.timestamp < 0) {
        continue;
      }
      const tokenLo = r.tokenAddress.toLowerCase();
      const roundedTs = roundPriceTimestampToHour(r.timestamp);
      const key = `${r.chainId}:${tokenLo}:${roundedTs}`;
      if (!unique.has(key)) {
        unique.set(key, { chainId: r.chainId, token: r.tokenAddress, roundedTs, key });
      }
    }

    const misses: Entry[] = [];
    for (const e of unique.values()) {
      const cached = this.repo.findClosest(e.chainId, e.token, e.roundedTs);
      if (cached && cached.priceUsd > 0) {
        result.set(e.key, cached.priceUsd);
      } else {
        misses.push(e);
      }
    }

    await runWithConcurrency(misses, BATCH_HISTORICAL_USD_CONCURRENCY, async (e) => {
      const price = await getHistoricalPrice(e.chainId, e.token, e.roundedTs);
      if (price > 0) {
        this.repo.upsert(e.chainId, e.token, e.roundedTs, price);
        log.debug(`Cached price (batch): ${e.token} @ ${e.roundedTs} = $${price}`);
        result.set(e.key, price);
      } else {
        result.set(e.key, null);
      }
    });

    return result;
  }
}
