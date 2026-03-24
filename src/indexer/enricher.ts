import type { Address } from 'viem';
import type { ExplorerTx, IndexedTransaction } from '../types.js';
import {
  classifyTransaction,
  categorizeTransaction,
  decodeSickleStrategyInput,
  type DecodedSickleStrategyInput,
} from './decoder.js';
import { KNOWN_POOLS, type TrackedPool } from '../config/pools.js';

/** Injected for gas USD; tests pass a mock with no network. */
export type GasCostEnricher = {
  calculateGasCostUsd(
    chainId: number,
    gasUsed: string,
    gasPrice: string,
    timestamp: number,
  ): Promise<number>;
};

function lowerAddr(a: string | undefined): string | undefined {
  if (!a) return undefined;
  const x = a.toLowerCase();
  return x.startsWith('0x') ? x : `0x${x}`;
}

/**
 * Match registry row when decoded pool/LP/tokens align with pool address or token columns.
 */
function findTrackedPoolForDecoded(
  chainId: number,
  decoded: DecodedSickleStrategyInput,
): TrackedPool | undefined {
  const candidates = new Set<string>();
  const add = (x?: string | null) => {
    if (x === undefined || x === null) return;
    const lo = lowerAddr(x);
    if (lo) candidates.add(lo);
  };
  add(decoded.poolAddress);
  add(decoded.lpToken);
  add(decoded.token0);
  add(decoded.token1);

  for (const pool of KNOWN_POOLS) {
    if (pool.chainId !== chainId) continue;
    const rowAddrs = [pool.address, pool.token0, pool.token1].map((x) => x.toLowerCase());
    for (const c of candidates) {
      if (rowAddrs.includes(c)) {
        return pool;
      }
    }
  }
  return undefined;
}

function protocolLabel(matched: TrackedPool | undefined, kind: DecodedSickleStrategyInput['strategyKind']): string {
  if (matched) return matched.protocol;
  if (kind === 'unknown') return 'unknown';
  if (kind === 'farm') return 'sickle-farm';
  if (kind === 'slipstream') return 'slipstream';
  if (kind === 'nft_farm') return 'nft-farm';
  return 'unknown';
}

/**
 * Enriches raw explorer transactions with categorization and metadata.
 * Transforms ExplorerTx → IndexedTransaction ready for DB insertion.
 */
export async function enrichTransaction(
  tx: ExplorerTx,
  addressId: number,
  chainId: number,
  sickleAddress: string | null,
  gasPrices: GasCostEnricher,
): Promise<IndexedTransaction> {
  if (tx.isError === '1') {
    return createIndexedTx(tx, addressId, chainId, 'unknown', false, { gasCostUsd: 0 });
  }

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

  const extras: Partial<IndexedTransaction> = {};
  let protocol = '';

  if (classification.isSickleRelated) {
    if (rawInput) {
      const decoded = decodeSickleStrategyInput({ methodId: finalMethodId, input: rawInput });
      if (decoded.strategyKind !== 'unknown') {
        const matched = findTrackedPoolForDecoded(chainId, decoded);
        const canonicalPool =
          (matched?.address && lowerAddr(matched.address)) ||
          lowerAddr(decoded.poolAddress) ||
          lowerAddr(decoded.lpToken);

        if (canonicalPool) {
          extras.poolAddress = canonicalPool as Address;
        }

        const t0 = lowerAddr(decoded.token0) ?? (matched ? lowerAddr(matched.token0) : undefined);
        const t1 = lowerAddr(decoded.token1) ?? (matched ? lowerAddr(matched.token1) : undefined);
        if (t0) extras.token0 = t0 as Address;
        if (t1) extras.token1 = t1 as Address;
        if (decoded.amount0 !== undefined) extras.amount0 = decoded.amount0;
        if (decoded.amount1 !== undefined) extras.amount1 = decoded.amount1;

        if (decoded.nftTokenId !== undefined) {
          extras.nftTokenId = decoded.nftTokenId;
        }

        protocol = protocolLabel(matched, decoded.strategyKind);
      } else {
        protocol = 'unknown';
      }
    } else {
      protocol = 'unknown';
    }
  }

  const timestamp = parseInt(tx.timeStamp, 10);
  let gasCostUsd = 0;
  try {
    const g = await gasPrices.calculateGasCostUsd(
      chainId,
      tx.gasUsed || '0',
      tx.gasPrice || '0',
      timestamp,
    );
    if (Number.isFinite(g) && g >= 0) {
      gasCostUsd = g;
    }
  } catch {
    gasCostUsd = 0;
  }

  return createIndexedTx(tx, addressId, chainId, category, classification.isSickleRelated, {
    ...extras,
    protocol,
    gasCostUsd,
  });
}

function createIndexedTx(
  tx: ExplorerTx,
  addressId: number,
  chainId: number,
  category: IndexedTransaction['category'],
  isFromSickle: boolean,
  fields: Partial<IndexedTransaction> & { gasCostUsd: number },
): IndexedTransaction {
  const { gasCostUsd, protocol: protoField, ...rest } = fields;
  const protocolOut = typeof protoField === 'string' ? protoField : '';
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
    gasCostUsd,
    category,
    protocol: protocolOut,
    addressId,
    isFromSickle,
    ...rest,
  };
}
