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
 * Categorizes a transaction based on its function name, method selector, and context.
 */
export function categorizeTransaction(tx: TxClassification): TxCategory {
  // Plain ETH transfer (no input data)
  if (tx.methodId === '0x' || tx.methodId === '') {
    return 'transfer_out';
  }

  const fnLower = tx.functionName.toLowerCase();
  const sel = tx.methodId.toLowerCase();

  // Known Sickle FarmStrategy Selectors + V2 + MultiFarm + Aerodrome
  
  // deposit: 0x47e7ef24, increase: 0x621bb6bb, simpleDeposit: 0x8a92e10a,
  // v2 deposit: 0x25fdd6ce, slipstream increase: 0x82321064
  const isDeposit = fnLower.includes('deposit') || fnLower.includes('increase') || 
                    ['0x47e7ef24', '0x621bb6bb', '0x8a92e10a', '0x25fdd6ce', '0x82321064'].includes(sel);
                    
  // withdraw: 0x69328dec, simpleWithdraw: 0x2e1a7d4d, v2 withdraw: 0x7b36e88c, slipstream decrease: 0xd0f7a861
  const isWithdraw = fnLower.includes('withdraw') || fnLower.includes('decrease') || 
                     ['0x69328dec', '0x2e1a7d4d', '0x7b36e88c', '0xd0f7a861'].includes(sel);
  
  // harvest: 0x4ba0579e, simpleHarvest: 0xc1074bf8, harvestFor: 0x3d0b27fd
  // v2 harvest: 0x107c5ea4, harvestMultiple: 0x3424754f
  const isHarvest = fnLower.includes('harvest') || ['0x4ba0579e', '0xc1074bf8', '0x3d0b27fd', '0x107c5ea4', '0x3424754f'].includes(sel);
  
  // compound: 0xf69e2046, compoundFor: 0x1f6a11e5
  // v2 compound: 0x422f8e9f, v2 compoundFor: 0x4045ffaa, compoundMultiple: 0xacd1d6c6
  const isCompound = fnLower.includes('compound') || ['0xf69e2046', '0x1f6a11e5', '0x422f8e9f', '0x4045ffaa', '0xacd1d6c6'].includes(sel);
  
  // exit: 0x111e102e, simpleExit: 0x8052fcf9, exitFor: 0x62660d2b, v2 exit: 0x71868e68, exitMultiple (guess): 0x61016060
  const isExit = fnLower.includes('exit') || ['0x111e102e', '0x8052fcf9', '0x62660d2b', '0x71868e68', '0x61016060'].includes(sel);
  
  // rebalance: 0xe88a1005, v2 rebalance: 0x9020d3c2, rebalanceStrategy: 0xa81fa02b, rebalanceFor: 0x01b31cd0
  const isRebalance = fnLower.includes('rebalance') || ['0xe88a1005', '0x9020d3c2', '0xa81fa02b', '0x01b31cd0'].includes(sel);

  if (tx.isSickleRelated) {
    if (isDeposit) return 'deposit';
    if (isWithdraw) return 'withdraw';
    if (isHarvest) return 'harvest';
    if (isCompound) return 'compound';
    if (isExit) return 'exit';
    if (isRebalance) return 'rebalance';
  }

  // Token approval (0x095ea7b3)
  if (fnLower.includes('approve') || sel === '0x095ea7b3') {
    return 'approval';
  }

  // Swap operations
  if (fnLower.includes('swap') || ['0x38ed1739', '0x5c11d795', '0x1cff79cd'].includes(sel)) {
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
