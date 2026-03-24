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

/** Non-finite or missing inputs → 0 (avoids NaN propagating to CLI tables). */
function usd(n: number | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/**
 * Position PnL from indexed aggregates (`rebuildPositionsForAddressChain`) + Task 5a mark.
 *
 * **What each input means (must stay aligned with `positionBuilder.ts`):**
 * - **`totalDepositedUsd`** — USD from `deposit` / `compound` rows (`token0`/`token1` legs only).
 * - **`totalWithdrawnUsd`** — USD from `withdraw` / `exit` rows (`token0`/`token1` legs only).
 * - **`totalHarvestedUsd`** — USD from `harvest` rows (`rewardToken` / `rewardAmount` only).
 * - **`currentValueUsd`** — Mark on still-open exposure (0 when inactive / failed mark).
 * - **`totalGasCostUsd`** — Sum of `gasCostUsd` across counted txs for the position.
 *
 * **Double-counting:** With the builder above, rewards are **not** added to `totalWithdrawnUsd` and LP
 * removal is **not** added to `totalHarvestedUsd`. The same tx has a **single** category, so one tx
 * cannot hit both `harvest` and `withdraw` buckets. If the enricher ever put the same economic flow
 * into both reward legs and pool token legs, PnL would overstate — that is an **enricher** bug, not
 * fixed here.
 *
 * **Canonical total (invariant):** `totalPnl = totalWithdrawnUsd + totalHarvestedUsd + currentValueUsd
 * - totalDepositedUsd - totalGasCostUsd`.
 *
 * **Decomposition (presentation only — sums to the same total):**
 * - **Realized (yield vs costs):** `totalHarvestedUsd - totalGasCostUsd`. Can be negative when gas
 *   exceeds harvests; does **not** include capital return from withdrawals (those sit in unrealized).
 * - **Unrealized (capital + mark):** `(currentValueUsd + totalWithdrawnUsd) - totalDepositedUsd`.
 *
 * **ROI:** `totalPnl / totalDepositedUsd × 100` when `totalDepositedUsd > 0`; otherwise **0** (denominator
 * undefined — e.g. orphaned harvest-only rows without deposits).
 */
export function calculatePositionPnl(input: PnlInput): PnlResult {
  const D = usd(input.totalDepositedUsd);
  const W = usd(input.totalWithdrawnUsd);
  const H = usd(input.totalHarvestedUsd);
  const C = usd(input.currentValueUsd);
  const G = usd(input.totalGasCostUsd);

  const realizedPnl = H - G;
  const unrealizedPnl = C + W - D;
  const totalPnl = realizedPnl + unrealizedPnl;

  const roi = D > 0 ? (totalPnl / D) * 100 : 0;

  return { realizedPnl, unrealizedPnl, totalPnl, roi };
}
