import { CHAINS } from '../config.js';

/**
 * Parse `--chain` the same way as `sync`: numeric id only, must exist in `CHAINS`.
 */
export function resolveChainFilter(chainOption: string | undefined): number | undefined {
  if (chainOption === undefined) return undefined;
  const id = parseInt(chainOption, 10);
  if (Number.isNaN(id)) {
    throw new Error('Chain ID must be a number');
  }
  if (!CHAINS[id]) {
    const supported = Object.keys(CHAINS).join(', ');
    throw new Error(`Unknown or unsupported chain ID: ${chainOption} (supported: ${supported})`);
  }
  return id;
}

/** Shown after positions/pnl tables — no per-row price gap tracking in DB (Task 7). */
export const CLI_HISTORICAL_PRICE_CAVEAT =
  'USD totals depend on indexed historical prices; missing quotes may understate amounts and PnL.';
