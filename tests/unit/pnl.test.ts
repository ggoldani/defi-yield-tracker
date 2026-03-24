import { describe, it, expect } from 'vitest';
import { calculatePositionPnl } from '../../src/analytics/pnl.js';

describe('PnL Calculator', () => {
  describe('when a position is fully exited with profit', () => {
    it('returns positive totalPnl considering deposits, withdrawals, harvests, and gas', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 1000,
        totalWithdrawnUsd: 800,
        totalHarvestedUsd: 350,
        currentValueUsd: 0,
        totalGasCostUsd: 15,
      });
      expect(pnl.totalPnl).toBe(135); // 800 + 350 - 1000 - 15
      expect(pnl.roi).toBeCloseTo(13.5);
    });
  });

  describe('when a position is still active with unrealized gains', () => {
    it('separates realized PnL (harvests - gas) from unrealized PnL (current value - deposited)', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 1000,
        totalWithdrawnUsd: 0,
        totalHarvestedUsd: 50,
        currentValueUsd: 1100,
        totalGasCostUsd: 10,
      });
      expect(pnl.realizedPnl).toBe(40); // 50 - 10
      expect(pnl.unrealizedPnl).toBe(100); // (1100 + 0) - 1000
      expect(pnl.totalPnl).toBe(140); // 40 + 100
    });
  });

  describe('when gas costs exceed harvested rewards', () => {
    it('returns negative realized PnL', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 500,
        totalWithdrawnUsd: 500,
        totalHarvestedUsd: 5,
        currentValueUsd: 0,
        totalGasCostUsd: 30,
      });
      expect(pnl.totalPnl).toBe(-25); // 500 + 5 - 500 - 30
      expect(pnl.roi).toBeCloseTo(-5.0);
    });
  });

  describe('when position has zero deposits', () => {
    it('returns zero ROI to avoid division by zero', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 0,
        totalWithdrawnUsd: 0,
        totalHarvestedUsd: 0,
        currentValueUsd: 0,
        totalGasCostUsd: 0,
      });
      expect(pnl.roi).toBe(0);
      expect(pnl.totalPnl).toBe(0);
    });
  });

  describe('when position has only deposits and no activity yet', () => {
    it('returns unrealized PnL based on current value vs deposited', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 2000,
        totalWithdrawnUsd: 0,
        totalHarvestedUsd: 0,
        currentValueUsd: 1800, // impermanent loss scenario
        totalGasCostUsd: 5,
      });
      expect(pnl.unrealizedPnl).toBe(-200); // (1800 + 0) - 2000
      expect(pnl.realizedPnl).toBe(-5); // 0 - 5
      expect(pnl.totalPnl).toBe(-205); // -200 + -5
    });
  });

  describe('when position has partial withdrawals', () => {
    it('accounts for withdrawn amounts in realized PnL', () => {
      const pnl = calculatePositionPnl({
        totalDepositedUsd: 3000,
        totalWithdrawnUsd: 1500,
        totalHarvestedUsd: 200,
        currentValueUsd: 1800,
        totalGasCostUsd: 20,
      });
      // Realized: harvested - gas
      expect(pnl.realizedPnl).toBe(180); // 200 - 20
      // Unrealized: (current value + withdrawn) - deposited
      expect(pnl.unrealizedPnl).toBe(300); // (1800 + 1500) - 3000
      expect(pnl.totalPnl).toBe(480); // 180 + 300
    });
  });
});
