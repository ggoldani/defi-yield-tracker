import type { ExplorerTx, IndexedTransaction } from '../types.js';
import { classifyTransaction, categorizeTransaction } from './decoder.js';

/**
 * Enriches raw explorer transactions with categorization and metadata.
 * Transforms ExplorerTx → IndexedTransaction ready for DB insertion.
 */
export function enrichTransaction(
  tx: ExplorerTx,
  addressId: number,
  chainId: number,
  sickleAddress: string | null,
): IndexedTransaction {
  // Skip failed transactions
  if (tx.isError === '1') {
    return createIndexedTx(tx, addressId, chainId, 'unknown', false);
  }

  // Blockscout sometimes omits methodId and functionName.
  // We can extract the 4-byte selector from the raw input data.
  const rawInput = tx.input && tx.input !== '0x' ? tx.input : '';
  const fallbackMethodId = rawInput.length >= 10 ? rawInput.slice(0, 10).toLowerCase() : '0x';
  const finalMethodId = (tx.methodId && tx.methodId !== '0x' ? tx.methodId : fallbackMethodId).toLowerCase();

  const classification = classifyTransaction(
    {
      to: tx.to || '',
      from: tx.from,
      methodId: finalMethodId,
      functionName: tx.functionName || '',
    },
    sickleAddress,
  );

  const category = categorizeTransaction(classification);

  return createIndexedTx(tx, addressId, chainId, category, classification.isSickleRelated);
}

function createIndexedTx(
  tx: ExplorerTx,
  addressId: number,
  chainId: number,
  category: IndexedTransaction['category'],
  isFromSickle: boolean,
): IndexedTransaction {
  return {
    hash: tx.hash as IndexedTransaction['hash'],
    chainId,
    blockNumber: parseInt(tx.blockNumber, 10),
    timestamp: parseInt(tx.timeStamp, 10),
    from: tx.from as IndexedTransaction['from'],
    to: (tx.to || '') as IndexedTransaction['to'],
    value: tx.value || '0',
    gasUsed: tx.gasUsed || '0',
    gasPrice: tx.gasPrice || '0',
    gasCostUsd: 0, // Will be enriched later with price data
    category,
    protocol: '', // Will be enriched later with pool identification
    addressId,
    isFromSickle,
  };
}
