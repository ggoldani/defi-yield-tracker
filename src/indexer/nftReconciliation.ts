/**
 * Task 4b — CL `nft_token_id` when calldata omitted it (e.g. fresh mint).
 *
 * **Resolution order (same tx only; block-wide scan not implemented — too ambiguous):**
 * 1. Skip if DB row already has non-empty `nft_token_id`.
 * 2. Load candidate txs (`TransactionRepo.findForNftReconciliation`), then keep **CL-relevant** only
 *    (`isClRelevantTx`: Slipstream / NftFarm strategy `to`, protocol hints, or known Slipstream pool row).
 * 3. For each tx: `getLogs` with `fromBlock = toBlock = blockNumber`, `address = npm`, `topics = [ERC721 Transfer]`.
 *    Keep logs whose `transactionHash` matches the tx. Sort by `logIndex` ASC.
 * 4. Decode IERC721 `Transfer(from,to,tokenId)`. **Plausible** ids:
 *    - Any transfer with `from === sickle` or `to === sickle`, or mint-to-sickle (`from === zero && to === sickle`).
 * 5. If exactly one distinct `tokenId` among plausible → persist via `updateNftTokenId`.
 *    If multiple plausible ids but exactly one distinct id from **mints to sickle** (`from === zero && to === sickle`) → use that.
 *    Otherwise → **no write**; structured `log.warn` (`hash`, `chainId`, `reason`).
 *
 * **Task 4** should call this before aggregating CL positions. No `sync.ts` hook in Task 4b.
 */

import type Database from 'better-sqlite3';
import type { Address, Hash, Hex, Log } from 'viem';
import {
  createPublicClient,
  decodeEventLog,
  http,
  parseAbiItem,
  toEventHash,
} from 'viem';
import { base, polygon } from 'viem/chains';
import { CHAINS, SICKLE_CONTRACTS } from '../config.js';
import { KNOWN_POOLS } from '../config/pools.js';
import { TransactionRepo } from '../db/repositories/transaction.repo.js';
import type { IndexedTransaction } from '../types.js';
import { log } from '../utils/logger.js';

const ZERO = '0x0000000000000000000000000000000000000000';

const transferAbi = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
);

/** `keccak256("Transfer(address,address,uint256)")` for IERC721. */
export const ERC721_TRANSFER_TOPIC0 = toEventHash(transferAbi) as Hash;

const VIEM_CHAIN = {
  8453: base,
  137: polygon,
} as const;

export type NftReconciliationGetLogs = (args: {
  address: Address;
  fromBlock: bigint;
  toBlock: bigint;
  topics?: readonly [Hex, ...Hex[]] | readonly Hex[] | undefined;
}) => Promise<Log[]>;

function createDefaultGetLogs(chainId: number): NftReconciliationGetLogs {
  const cfg = CHAINS[chainId];
  const chain = VIEM_CHAIN[chainId as keyof typeof VIEM_CHAIN];
  if (!cfg || !chain) {
    throw new Error(`nftReconciliation: unsupported chainId ${chainId}`);
  }
  const client = createPublicClient({
    chain,
    transport: http(cfg.rpcUrl),
  });
  return (args) => client.getLogs(args);
}

function poolLooksSlipstream(chainId: number, poolAddress?: string): boolean {
  if (!poolAddress) return false;
  const lo = poolAddress.toLowerCase();
  return KNOWN_POOLS.some(
    (p) =>
      p.chainId === chainId &&
      p.address.toLowerCase() === lo &&
      p.protocol.toLowerCase().includes('slipstream'),
  );
}

/** Heuristic filter so V2-only farm rows are not assigned NPM token ids. Exported for tests. */
export function isClRelevantTx(tx: IndexedTransaction): boolean {
  const to = tx.to.toLowerCase();
  const p = tx.protocol.toLowerCase();
  if (p.includes('slipstream')) return true;
  if (p.includes('nft-farm')) return true;
  if (
    to === SICKLE_CONTRACTS.aerodromeSlipstreamStrategy.toLowerCase() ||
    to === SICKLE_CONTRACTS.nftFarmStrategy.toLowerCase()
  ) {
    return true;
  }
  if (poolLooksSlipstream(tx.chainId, tx.poolAddress)) return true;
  return false;
}

type DecodedRow = { logIndex: number; from: string; to: string; tokenId: string };

function tryDecodeNpmTransfer(l: Log): Omit<DecodedRow, 'logIndex'> | null {
  const topics = l.topics;
  if (!topics || topics.length !== 4) return null;
  if (topics[0]!.toLowerCase() !== ERC721_TRANSFER_TOPIC0.toLowerCase()) return null;
  try {
    const d = decodeEventLog({
      abi: [transferAbi],
      data: l.data,
      topics: topics as [Hex, Hex, Hex, Hex],
    });
    const from = (d.args as { from: Address }).from.toLowerCase();
    const to = (d.args as { to: Address }).to.toLowerCase();
    const tokenId = (d.args as { tokenId: bigint }).tokenId.toString();
    return { from, to, tokenId };
  } catch {
    return null;
  }
}

function pickTokenId(sorted: DecodedRow[], sickleLo: string): { id: string } | 'ambiguous' | 'none' {
  const involving = sorted.filter(
    (l) =>
      l.from === sickleLo ||
      l.to === sickleLo ||
      (l.from === ZERO && l.to === sickleLo),
  );
  const uniqueInvolving = [...new Set(involving.map((l) => l.tokenId))];
  if (uniqueInvolving.length === 1) {
    return { id: uniqueInvolving[0]! };
  }
  if (uniqueInvolving.length === 0) {
    return 'none';
  }
  const mintToSickle = sorted.filter((l) => l.from === ZERO && l.to === sickleLo);
  const mintIds = [...new Set(mintToSickle.map((l) => l.tokenId))];
  if (mintIds.length === 1) {
    return { id: mintIds[0]! };
  }
  return 'ambiguous';
}

async function resolveTokenIdForTx(
  hash: Hash,
  blockNumber: number,
  npm: Address,
  sickleLo: string,
  getLogs: NftReconciliationGetLogs,
): Promise<{ id: string } | 'ambiguous' | 'none'> {
  const logs = await getLogs({
    address: npm,
    fromBlock: BigInt(blockNumber),
    toBlock: BigInt(blockNumber),
    topics: [ERC721_TRANSFER_TOPIC0],
  });

  const hashLo = hash.toLowerCase();
  const sameTx = logs
    .filter((l) => (l.transactionHash as string).toLowerCase() === hashLo)
    .sort((a, b) => Number(a.logIndex ?? 0n) - Number(b.logIndex ?? 0n));

  const decoded: DecodedRow[] = [];
  for (const row of sameTx) {
    const d = tryDecodeNpmTransfer(row);
    if (d) {
      decoded.push({ logIndex: Number(row.logIndex ?? 0), ...d });
    }
  }

  return pickTokenId(decoded, sickleLo);
}

/**
 * @param options.getLogs — inject for tests; default uses `CHAIN.rpcUrl` + viem `getLogs`.
 * @param options.npmAddress — override NPM (e.g. tests); default `CHAINS[chainId].nftPositionManager`.
 */
export async function reconcileNftTokenIdsForAddressChain(
  db: Database.Database,
  addressId: number,
  chainId: number,
  sickleAddress: string,
  options?: {
    getLogs?: NftReconciliationGetLogs;
    npmAddress?: Address;
  },
): Promise<number> {
  const npm = options?.npmAddress ?? CHAINS[chainId]?.nftPositionManager;
  if (!npm) {
    return 0;
  }

  const sickleLo = sickleAddress.toLowerCase();
  const getLogs = options?.getLogs ?? createDefaultGetLogs(chainId);
  const repo = new TransactionRepo(db);
  const candidates = repo.findForNftReconciliation(addressId, chainId).filter(isClRelevantTx);

  let updated = 0;
  for (const tx of candidates) {
    const resolved = await resolveTokenIdForTx(
      tx.hash as Hash,
      tx.blockNumber,
      npm,
      sickleLo,
      getLogs,
    );

    if (resolved === 'ambiguous') {
      log.warn(
        JSON.stringify({
          scope: 'nftReconciliation',
          reason: 'ambiguous_npm_transfer_tokenIds',
          hash: tx.hash,
          chainId,
          blockNumber: tx.blockNumber,
        }),
      );
      continue;
    }
    if (resolved === 'none') {
      continue;
    }
    updated += repo.updateNftTokenId(tx.hash, chainId, resolved.id);
  }

  return updated;
}
