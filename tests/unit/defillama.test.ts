import { describe, it, expect } from 'vitest';
import { getCurrentPrice, getHistoricalPrice, getBatchPrices } from '../../src/prices/defillama.js';

// WETH on Base
const WETH_BASE = '0x4200000000000000000000000000000000000006';
// Native token sentinel
const NATIVE = '0x0000000000000000000000000000000000000000';

describe('DeFiLlama Price Provider', () => {
  describe('when fetching current prices', () => {
    it('returns a valid price for WETH on Base', async () => {
      const price = await getCurrentPrice(8453, WETH_BASE);
      expect(price).toBeGreaterThan(0);
      expect(price).toBeLessThan(100000);
    });

    it('resolves native token (0x0) to wrapped token', async () => {
      const price = await getCurrentPrice(8453, NATIVE);
      expect(price).toBeGreaterThan(0);
    });
  });

  describe('when fetching historical prices', () => {
    it('returns a valid price for a past timestamp', async () => {
      const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
      const price = await getHistoricalPrice(8453, WETH_BASE, oneDayAgo);
      expect(price).toBeGreaterThan(0);
    });
  });

  describe('when fetching batch prices', () => {
    it('returns prices for multiple tokens', async () => {
      const prices = await getBatchPrices([
        { chainId: 8453, address: WETH_BASE },
      ]);
      expect(Object.keys(prices).length).toBeGreaterThan(0);
      const firstPrice = Object.values(prices)[0];
      expect(firstPrice).toBeGreaterThan(0);
    });
  });
});
