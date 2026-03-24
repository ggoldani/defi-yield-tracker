import type { ChainConfig, ExplorerTxResponse, ExplorerTx } from '../types.js';
import { retry } from '../utils/retry.js';
import { log } from '../utils/logger.js';
import { EXPLORER_RATE_LIMIT, EXPLORER_PAGE_SIZE } from '../config.js';

// ── Rate Limiting ────────────────────────────────
let lastCallTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const minInterval = 1000 / EXPLORER_RATE_LIMIT;
  const elapsed = now - lastCallTime;
  if (elapsed < minInterval) {
    await new Promise((r) => setTimeout(r, minInterval - elapsed));
  }
  lastCallTime = Date.now();
  return fetch(url);
}

// ── Core Fetch Function ──────────────────────────
async function fetchExplorerApi(
  chain: ChainConfig,
  params: Record<string, string>,
  label: string,
): Promise<ExplorerTx[]> {
  const url = new URL(chain.explorerApiUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  if (chain.explorerApiKey) {
    url.searchParams.set('apikey', chain.explorerApiKey);
  }

  const response = await retry(
    () => rateLimitedFetch(url.toString()).then((r) => r.json() as Promise<ExplorerTxResponse>),
    { label },
  );

  if (response.status !== '1') {
    // Status 0 with "No transactions found" is not an error
    if (response.result?.length === 0 || typeof response.result === 'string') {
      return [];
    }
  }

  return Array.isArray(response.result) ? response.result : [];
}

// ── Transaction Fetchers ─────────────────────────

/**
 * Fetches normal transactions for an address on a chain.
 * Automatically paginates if more than PAGE_SIZE results.
 */
export async function fetchAllTransactions(
  chain: ChainConfig,
  address: string,
  startBlock = 0,
): Promise<ExplorerTx[]> {
  const allTxs: ExplorerTx[] = [];
  let currentStartBlock = startBlock;
  let hasMore = true;

  while (hasMore) {
    const txs = await fetchExplorerApi(
      chain,
      {
        module: 'account',
        action: 'txlist',
        address,
        startblock: currentStartBlock.toString(),
        endblock: '99999999',
        page: '1',
        offset: EXPLORER_PAGE_SIZE.toString(),
        sort: 'asc',
      },
      `fetch txs for ${address.slice(0, 10)}... on ${chain.name}`,
    );

    allTxs.push(...txs);

    // If we got a full page, there might be more — paginate by startblock
    if (txs.length >= EXPLORER_PAGE_SIZE) {
      const lastBlock = parseInt(txs[txs.length - 1].blockNumber, 10);
      currentStartBlock = lastBlock; // Will re-fetch last block but deduped by INSERT OR IGNORE
      log.debug(`Pagination: fetched ${txs.length} txs, continuing from block ${lastBlock}`);
    } else {
      hasMore = false;
    }
  }

  return allTxs;
}

/**
 * Fetches ERC-20 token transfer events for an address.
 * Used to extract exact token amounts from deposit/withdraw transactions.
 */
export async function fetchTokenTransfers(
  chain: ChainConfig,
  address: string,
  startBlock = 0,
): Promise<ExplorerTx[]> {
  return fetchExplorerApi(
    chain,
    {
      module: 'account',
      action: 'tokentx',
      address,
      startblock: startBlock.toString(),
      endblock: '99999999',
      page: '1',
      offset: EXPLORER_PAGE_SIZE.toString(),
      sort: 'asc',
    },
    `fetch token transfers for ${address.slice(0, 10)}...`,
  );
}

/**
 * Fetches internal transactions for an address.
 */
export async function fetchInternalTransactions(
  chain: ChainConfig,
  address: string,
  startBlock = 0,
): Promise<ExplorerTx[]> {
  return fetchExplorerApi(
    chain,
    {
      module: 'account',
      action: 'txlistinternal',
      address,
      startblock: startBlock.toString(),
      endblock: '99999999',
      sort: 'asc',
    },
    `fetch internal txs for ${address.slice(0, 10)}...`,
  );
}
