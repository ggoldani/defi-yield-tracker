import type Database from 'better-sqlite3';
import type { ChainConfig, TrackedAddress } from '../types.js';
import { CHAINS } from '../config.js';
import { log } from '../utils/logger.js';
import { fetchAllTransactions } from './scanner.js';
import { enrichTransaction } from './enricher.js';
import { PriceProvider } from '../prices/provider.js';
import { TransactionRepo } from '../db/repositories/transaction.repo.js';
import { PositionRepo } from '../db/repositories/position.repo.js';
import { KNOWN_POOLS } from '../config/pools.js';
import { discoverSickleWallet } from './discovery.js';
import { AddressRepo } from '../db/repositories/address.repo.js';

/**
 * Sync state tracking — stores last synced block per address per chain.
 */
function getLastSyncedBlock(db: Database.Database, addressId: number, chainId: number): number {
  const row = db
    .prepare('SELECT last_block FROM sync_state WHERE address_id = ? AND chain_id = ?')
    .get(addressId, chainId) as { last_block: number } | undefined;
  return row?.last_block || 0;
}

function updateSyncState(
  db: Database.Database,
  addressId: number,
  chainId: number,
  lastBlock: number,
): void {
  db.prepare(
    `INSERT INTO sync_state (address_id, chain_id, last_block, last_synced_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(address_id, chain_id) DO UPDATE SET
       last_block = excluded.last_block,
       last_synced_at = excluded.last_synced_at`,
  ).run(addressId, chainId, lastBlock);
}

export interface SyncResult {
  chainName: string;
  newTransactions: number;
  totalFetched: number;
  lastBlock: number;
}

/**
 * Syncs all transactions for a tracked address on a specific chain.
 *
 * Flow:
 * 1. Discover Sickle wallet if not already known
 * 2. Get last synced block from sync_state
 * 3. Fetch all new transactions from block explorer
 * 4. Enrich and categorize each transaction
 * 5. Insert into transactions table (INSERT OR IGNORE for idempotency)
 * 6. Update sync_state with last block
 */
export async function syncAddressOnChain(
  db: Database.Database,
  address: TrackedAddress,
  chain: ChainConfig,
): Promise<SyncResult> {
  const addressId = address.id!;
  
  // 1. Discovery phase
  let sickleAddress = address.sickleAddresses[chain.id];
  if (!sickleAddress) {
    const discovered = await discoverSickleWallet(chain, address.address);
    if (discovered) {
      log.info(`  Discovered new Sickle wallet on ${chain.name}: ${discovered}`);
      const addressRepo = new AddressRepo(db);
      addressRepo.updateSickleAddress(addressId, chain.id, discovered);
      sickleAddress = discovered as `0x${string}`;
      address.sickleAddresses[chain.id] = discovered as `0x${string}`; // update local object
    }
  }

  const startBlock = getLastSyncedBlock(db, addressId, chain.id) + 1;

  log.info(`Syncing ${address.label || address.address} on ${chain.name} from block ${startBlock}...`);

  // Fetch transactions for EOA
  const eoaTxs = await fetchAllTransactions(chain, address.address, startBlock);

  // Fetch transactions for Sickle wallet if discovered
  let sickleTxs: typeof eoaTxs = [];
  if (sickleAddress) {
    sickleTxs = await fetchAllTransactions(chain, sickleAddress, startBlock);
    log.info(`  Sickle wallet: ${sickleTxs.length} transactions`);
  }

  // Merge and deduplicate by hash
  const allTxs = [...eoaTxs, ...sickleTxs];
  const seen = new Set<string>();
  const uniqueTxs = allTxs.filter((tx) => {
    const key = `${tx.hash}-${chain.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Enrich and insert
  const txRepo = new TransactionRepo(db);
  const priceProvider = new PriceProvider(db);
  let inserted = 0;

  const enrichedByHash = new Map<string, Awaited<ReturnType<typeof enrichTransaction>>>();
  for (const rawTx of uniqueTxs) {
    const enrichedTx = await enrichTransaction(rawTx, addressId, chain.id, sickleAddress, priceProvider);
    enrichedByHash.set(rawTx.hash, enrichedTx);
    try {
      txRepo.insert(enrichedTx);
      inserted++;
    } catch {
      // INSERT OR IGNORE handles duplicates silently
    }
  }

  // Update sync state
  const lastBlock = uniqueTxs.length > 0
    ? Math.max(...uniqueTxs.map((tx) => parseInt(tx.blockNumber, 10)))
    : startBlock - 1;

  if (uniqueTxs.length > 0) {
    updateSyncState(db, addressId, chain.id, lastBlock);
  }

  // 7. Update Positions state
  const strategyPositions = new Map<string, any>();
  
  for (const rawTx of uniqueTxs) {
    const enrichedTx = enrichedByHash.get(rawTx.hash);
    if (!enrichedTx) continue;
    if (!enrichedTx.isFromSickle) continue;

    let matchedPool = undefined;
    if (rawTx.input && rawTx.input !== '0x') {
      const hexPayload = rawTx.input.toLowerCase();
      // Try mapping by explicit LP address
      matchedPool = KNOWN_POOLS.find(p => p.chainId === chain.id && hexPayload.includes(p.address.replace('0x', '').toLowerCase()));
      
      // Fallback for V3 strategies that omit LP address: Match if BOTH underlying tokens are vividly present in the Zap parameters
      if (!matchedPool) {
        matchedPool = KNOWN_POOLS.find(p => {
          if (p.chainId !== chain.id) return false;
          const t0 = p.token0.replace('0x', '').toLowerCase();
          const t1 = p.token1.replace('0x', '').toLowerCase();
          return hexPayload.includes(t0) && hexPayload.includes(t1);
        });
      }
    }

    // Ignore unrecognized sickle transactions
    if (!matchedPool) continue;

    const poolAddr = matchedPool.address as `0x${string}`;
    if (!strategyPositions.has(poolAddr)) {
      strategyPositions.set(poolAddr, {
        addressId,
        chainId: chain.id,
        positionKind: 'v2_lp' as const,
        nftTokenId: '',
        protocol: matchedPool.protocol,
        poolAddress: poolAddr,
        token0: matchedPool.token0, token1: matchedPool.token1,
        token0Symbol: matchedPool.token0Symbol, token1Symbol: matchedPool.token1Symbol,
        isActive: true,
        entryTimestamp: enrichedTx.timestamp,
        totalDeposited0: '0', totalDeposited1: '0',
        totalWithdrawn0: '0', totalWithdrawn1: '0',
        totalDepositedUsd: 0, totalWithdrawnUsd: 0,
        totalHarvestedUsd: 0, totalGasCostUsd: 0,
      });
    }

    const pos = strategyPositions.get(poolAddr)!;
    pos.totalGasCostUsd += enrichedTx.gasCostUsd || 0;
    
    // Naively update status
    if (enrichedTx.category === 'exit') pos.isActive = false;
    if (enrichedTx.category === 'deposit') pos.isActive = true;
  }

  // Persist inferred positions
  const posRepo = new PositionRepo(db);
  for (const pos of strategyPositions.values()) {
    try {
      posRepo.upsert(pos);
    } catch (e) {
      log.error(`Failed to upsert position: ${(e as Error).message}`);
    }
  }

  log.success(
    `  ${chain.name}: ${inserted} new transactions indexed (${uniqueTxs.length} fetched, ` +
    `last block: ${lastBlock})`,
  );

  return {
    chainName: chain.name,
    newTransactions: inserted,
    totalFetched: uniqueTxs.length,
    lastBlock,
  };
}

/**
 * Syncs all chains for a tracked address.
 */
export async function syncAddress(
  db: Database.Database,
  address: TrackedAddress,
  chainIds?: number[],
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const targetChains = chainIds
    ? chainIds.map((id) => CHAINS[id]).filter(Boolean)
    : Object.values(CHAINS);

  for (const chain of targetChains) {
    const result = await syncAddressOnChain(db, address, chain);
    results.push(result);
  }

  return results;
}
