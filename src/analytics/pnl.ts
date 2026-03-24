export interface PnlInput {
  totalDepositedUsd: number;
  totalWithdrawnUsd: number;
  totalHarvestedUsd: number;
  currentValueUsd: number;
  totalGasCostUsd: number;
}

export interface PnlResult {
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  roi: number; // percentage
}

/**
 * Calculates PnL for a position.
 *
 * Total PnL = Withdrawn + Harvested + Current Value - Deposited - Gas Costs
 *
 * Decomposed into:
 * - Realized PnL = Harvested - Gas Costs
 *   (What you've earned net of costs, excluding capital returns)
 * - Unrealized PnL = (Current Value + Withdrawn) - Deposited
 *   (Capital appreciation/depreciation: what you have vs what you put in)
 *
 * For fully exited positions (currentValueUsd = 0):
 *   Total = Withdrawn + Harvested - Deposited - Gas
 *
 * Guards against division by zero when deposits are 0.
 */
export function calculatePositionPnl(input: PnlInput): PnlResult {
  const { totalDepositedUsd, totalWithdrawnUsd, totalHarvestedUsd, currentValueUsd, totalGasCostUsd } = input;

  // Realized: yield earned minus operational costs
  const realizedPnl = totalHarvestedUsd - totalGasCostUsd;

  // Unrealized: current position value + already withdrawn capital vs deposited capital
  const unrealizedPnl = (currentValueUsd + totalWithdrawnUsd) - totalDepositedUsd;

  // Total: everything combined
  const totalPnl = realizedPnl + unrealizedPnl;

  // ROI as percentage of deposited value
  const roi = totalDepositedUsd > 0 ? (totalPnl / totalDepositedUsd) * 100 : 0;

  return { realizedPnl, unrealizedPnl, totalPnl, roi };
}
