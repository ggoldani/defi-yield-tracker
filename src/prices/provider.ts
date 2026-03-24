import type Database from 'better-sqlite3';
import { PriceRepo } from '../db/repositories/price.repo.js';
import { getCurrentPrice, getHistoricalPrice } from './defillama.js';
import { log } from '../utils/logger.js';

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
}
