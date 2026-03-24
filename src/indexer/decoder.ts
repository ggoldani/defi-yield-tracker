import type { TxCategory } from '../types.js';
import { SICKLE_CONTRACTS } from '../config.js';

// ── Transaction Classification ───────────────────
export interface TxClassification {
  from: string;
  to: string;
  methodId: string;
  functionName: string;
  isSickleRelated: boolean;
}

// ── Known Sickle Strategy Addresses ──────────────
const SICKLE_STRATEGY_ADDRESSES = new Set(
  Object.values(SICKLE_CONTRACTS).map((addr) => addr.toLowerCase()),
);

/**
 * Checks if a target address is a known Sickle strategy contract.
 */
export function isSickleStrategy(address: string): boolean {
  return SICKLE_STRATEGY_ADDRESSES.has(address.toLowerCase());
}

/**
 * Categorizes a transaction based on its function name and context.
 *
 * For Sickle-related transactions, matches against known strategy functions:
 * - deposit, increase, simpleDeposit, simpleIncrease → 'deposit'
 * - withdraw, simpleWithdraw → 'withdraw'
 * - harvest, simpleHarvest, harvestFor → 'harvest'
 * - compound, compoundFor → 'compound'
 * - exit, simpleExit, exitFor → 'exit'
 * - rebalance → 'rebalance'
 *
 * For non-Sickle transactions:
 * - Empty methodId → 'transfer_out' (plain ETH transfer)
 * - approve → 'approval'
 * - swap → 'swap'
 * - Everything else → 'unknown'
 */
export function categorizeTransaction(tx: TxClassification): TxCategory {
  if (tx.isSickleRelated) {
    const fnLower = tx.functionName.toLowerCase();

    // Deposit-related (deposit, increase, simpleDeposit, simpleIncrease)
    if (fnLower.includes('deposit') || fnLower.includes('increase')) return 'deposit';

    // Withdraw-related
    if (fnLower.includes('withdraw')) return 'withdraw';

    // Harvest-related (harvest, simpleHarvest, harvestFor)
    if (fnLower.includes('harvest')) return 'harvest';

    // Compound-related (compound, compoundFor)
    if (fnLower.includes('compound')) return 'compound';

    // Exit-related (exit, simpleExit, exitFor)
    if (fnLower.includes('exit')) return 'exit';

    // Rebalance
    if (fnLower.includes('rebalance')) return 'rebalance';
  }

  // Plain ETH transfer (no input data)
  if (tx.methodId === '0x' || tx.methodId === '') {
    return 'transfer_out';
  }

  // Token approval
  if (tx.functionName.toLowerCase().includes('approve')) {
    return 'approval';
  }

  // Swap
  if (tx.functionName.toLowerCase().includes('swap')) {
    return 'swap';
  }

  return 'unknown';
}

/**
 * Determines if a transaction involves a Sickle wallet or strategy.
 */
export function classifyTransaction(
  tx: { to: string; from: string; methodId: string; functionName: string },
  sickleAddress: string | null,
): TxClassification {
  const toAddr = tx.to.toLowerCase();
  const sickleAddr = sickleAddress?.toLowerCase() || '';

  const isSickleRelated =
    isSickleStrategy(toAddr) || toAddr === sickleAddr;

  return {
    from: tx.from,
    to: tx.to,
    methodId: tx.methodId,
    functionName: tx.functionName,
    isSickleRelated,
  };
}
