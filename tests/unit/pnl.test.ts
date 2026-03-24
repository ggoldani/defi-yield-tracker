import { describe, it, expect } from 'vitest';
import { calculatePositionPnl } from '../../src/analytics/pnl.js';

/** Invariant from `calculatePositionPnl` JSDoc — must match implementation. */
function canonicalTotalPnl(input: {
  totalDepositedUsd: number;
  totalWithdrawnUsd: number;
  totalHarvestedUsd: number;
  currentValueUsd: number;
  totalGasCostUsd: number;
}): number {
  const { totalDepositedUsd: D, totalWithdrawnUsd: W, totalHarvestedUsd: H, currentValueUsd: C, totalGasCostUsd: G } =
    input;
  return W + H + C - D - G;
}

describe('calculatePositionPnl', () => {
  /**
   * Fixture A — active position, all flows non-zero; hand-verified against canonical formula.
   * D=2000, W=400, H=120, C=2500, G=40 → W+H+C-D-G = 980; roi = 49%
   */
  describe('Fixture A: active, non-zero current value and typical flows', () => {
    it('matches hand-calculated totalPnl and roi', () => {
      const input = {
        totalDepositedUsd: 2000,
        totalWithdrawnUsd: 400,
        totalHarvestedUsd: 120,
        currentValueUsd: 2500,
        totalGasCostUsd: 40,
      };
      const pnl = calculatePositionPnl(input);
      expect(pnl.realizedPnl).toBe(80); // 120 - 40
      expect(pnl.unrealizedPnl).toBe(900); // 2500 + 400 - 2000
      expect(pnl.totalPnl).toBe(980);
      expect(pnl.totalPnl).toBe(canonicalTotalPnl(input));
      expect(pnl.roi).toBeCloseTo(49, 5);
    });
  });

  /**
   * Fixture B — fully exited: current mark 0, capital returned via withdraw USD.
   */
  describe('Fixture B: exited position (currentValueUsd = 0)', () => {
    it('totalPnl uses withdrawn + harvest - deposited - gas', () => {
      const input = {
        totalDepositedUsd: 500,
        totalWithdrawnUsd: 480,
        totalHarvestedUsd: 100,
        currentValueUsd: 0,
        totalGasCostUsd: 20,
      };
      const pnl = calculatePositionPnl(input);
      expect(pnl.totalPnl).toBe(60); // 480 + 100 - 500 - 20
      expect(pnl.totalPnl).toBe(canonicalTotalPnl(input));
      expect(pnl.roi).toBeCloseTo(12, 5);
      expect(pnl.unrealizedPnl).toBe(-20); // 0 + 480 - 500
    });
  });

  /**
   * Fixture C — zero deposits: ROI guard (denominator undefined for percentage).
   */
  describe('Fixture C: zero deposits (edge from sparse / mis-indexed data)', () => {
    it('returns roi 0 and still reports totalPnl from harvest - gas when no capital base', () => {
      const input = {
        totalDepositedUsd: 0,
        totalWithdrawnUsd: 0,
        totalHarvestedUsd: 100,
        currentValueUsd: 0,
        totalGasCostUsd: 10,
      };
      const pnl = calculatePositionPnl(input);
      expect(pnl.roi).toBe(0);
      expect(pnl.realizedPnl).toBe(90);
      expect(pnl.unrealizedPnl).toBe(0);
      expect(pnl.totalPnl).toBe(90);
      expect(pnl.totalPnl).toBe(canonicalTotalPnl(input));
    });

    it('all-zero inputs yield zero across the board', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 0,
        totalWithdrawnUsd: 0,
        totalHarvestedUsd: 0,
        currentValueUsd: 0,
        totalGasCostUsd: 0,
      });
      expect(pnl).toEqual({ realizedPnl: 0, unrealizedPnl: 0, totalPnl: 0, roi: 0 });
    });
  });

  /**
   * Fixture D — double-count would require the same USD in both W and H; builder uses disjoint
   * fields per category, so this asserts the formula does not add an extra harvest term.
   */
  describe('Fixture D: no duplicate harvest term in total (builder / enricher contract)', () => {
    it('totalPnl equals single application of W + H + C - D - G', () => {
      const input = {
        totalDepositedUsd: 1000,
        totalWithdrawnUsd: 550,
        totalHarvestedUsd: 80,
        currentValueUsd: 500,
        totalGasCostUsd: 25,
      };
      const pnl = calculatePositionPnl(input);
      expect(pnl.totalPnl).toBe(canonicalTotalPnl(input));
      expect(pnl.totalPnl).toBe(105); // 550 + 80 + 500 - 1000 - 25
      // A mistaken model that also added H again would be 105 + 80 = 185
      expect(pnl.totalPnl).not.toBe(185);
    });
  });

  describe('non-finite inputs', () => {
    it('treats NaN as 0 so totalPnl stays finite', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 100,
        totalWithdrawnUsd: NaN,
        totalHarvestedUsd: 50,
        currentValueUsd: 100,
        totalGasCostUsd: 5,
      });
      expect(Number.isFinite(pnl.totalPnl)).toBe(true);
      expect(pnl.totalPnl).toBe(canonicalTotalPnl({
        totalDepositedUsd: 100,
        totalWithdrawnUsd: 0,
        totalHarvestedUsd: 50,
        currentValueUsd: 100,
        totalGasCostUsd: 5,
      }));
    });
  });

  describe('legacy scenarios (regression)', () => {
    it('fully exited with profit', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 1000,
        totalWithdrawnUsd: 800,
        totalHarvestedUsd: 350,
        currentValueUsd: 0,
        totalGasCostUsd: 15,
      });
      expect(pnl.totalPnl).toBe(135);
      expect(pnl.roi).toBeCloseTo(13.5);
    });

    it('active: separates realized (harvest - gas) vs unrealized (C + W - D)', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 1000,
        totalWithdrawnUsd: 0,
        totalHarvestedUsd: 50,
        currentValueUsd: 1100,
        totalGasCostUsd: 10,
      });
      expect(pnl.realizedPnl).toBe(40);
      expect(pnl.unrealizedPnl).toBe(100);
      expect(pnl.totalPnl).toBe(140);
    });

    it('gas exceeds harvest → negative realized', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 500,
        totalWithdrawnUsd: 500,
        totalHarvestedUsd: 5,
        currentValueUsd: 0,
        totalGasCostUsd: 30,
      });
      expect(pnl.totalPnl).toBe(-25);
      expect(pnl.roi).toBeCloseTo(-5.0);
    });

    it('partial withdrawals: withdrawn flows into unrealized component, not realized', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 3000,
        totalWithdrawnUsd: 1500,
        totalHarvestedUsd: 200,
        currentValueUsd: 1800,
        totalGasCostUsd: 20,
      });
      expect(pnl.realizedPnl).toBe(180);
      expect(pnl.unrealizedPnl).toBe(300);
      expect(pnl.totalPnl).toBe(480);
    });

    it('only deposits and mark: IL + gas', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 2000,
        totalWithdrawnUsd: 0,
        totalHarvestedUsd: 0,
        currentValueUsd: 1800,
        totalGasCostUsd: 5,
      });
      expect(pnl.unrealizedPnl).toBe(-200);
      expect(pnl.realizedPnl).toBe(-5);
      expect(pnl.totalPnl).toBe(-205);
    });
  });
});
