import { describe, it, expect } from 'vitest';
import {
  Q96,
  getSqrtRatioAtTick,
  getAmountsForLiquidity,
  MIN_TICK,
  MAX_TICK,
} from '../../src/analytics/clLiquidityMath.js';

describe('clLiquidityMath (Uniswap v3–compatible)', () => {
  it('tick 0 → sqrtPriceX96 = Q96 (1.0 in Q64.96)', () => {
    expect(getSqrtRatioAtTick(0)).toBe(Q96);
  });

  it('rejects tick outside bounds', () => {
    expect(() => getSqrtRatioAtTick(MIN_TICK - 1)).toThrow();
    expect(() => getSqrtRatioAtTick(MAX_TICK + 1)).toThrow();
  });

  it('getAmountsForLiquidity: in-range price yields both token amounts > 0 for wide range', () => {
    const tickLower = -1000;
    const tickUpper = 1000;
    const sqrtP = getSqrtRatioAtTick(0);
    const sqrtA = getSqrtRatioAtTick(tickLower);
    const sqrtB = getSqrtRatioAtTick(tickUpper);
    const L = 10n ** 22n;
    const { amount0, amount1 } = getAmountsForLiquidity(sqrtP, sqrtA, sqrtB, L);
    expect(amount0 > 0n).toBe(true);
    expect(amount1 > 0n).toBe(true);
  });

  it('getAmountsForLiquidity: below range → only token0', () => {
    const tickLower = 100;
    const tickUpper = 200;
    const sqrtP = getSqrtRatioAtTick(tickLower - 50);
    const sqrtA = getSqrtRatioAtTick(tickLower);
    const sqrtB = getSqrtRatioAtTick(tickUpper);
    const L = 10n ** 18n;
    const { amount0, amount1 } = getAmountsForLiquidity(sqrtP, sqrtA, sqrtB, L);
    expect(amount0 > 0n).toBe(true);
    expect(amount1).toBe(0n);
  });

  it('getAmountsForLiquidity: above range → only token1', () => {
    const tickLower = -200;
    const tickUpper = -100;
    const sqrtP = getSqrtRatioAtTick(tickUpper + 50);
    const sqrtA = getSqrtRatioAtTick(tickLower);
    const sqrtB = getSqrtRatioAtTick(tickUpper);
    const L = 10n ** 18n;
    const { amount0, amount1 } = getAmountsForLiquidity(sqrtP, sqrtA, sqrtB, L);
    expect(amount0).toBe(0n);
    expect(amount1 > 0n).toBe(true);
  });
});
