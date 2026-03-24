import { DEFILLAMA_API } from '../config.js';
import { retry } from '../utils/retry.js';

// ── Chain ID → DeFiLlama chain name mapping ──────
const CHAIN_MAP: Record<number, string> = {
  1: 'ethereum',
  8453: 'base',
  137: 'polygon',
  10: 'optimism',
  42161: 'arbitrum',
};

// ── Native token → Wrapped token mapping ─────────
const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';
const WRAPPED: Record<number, string> = {
  1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',     // WETH
  8453: '0x4200000000000000000000000000000000000006',     // WETH on Base
  137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',     // WMATIC on Polygon
  10: '0x4200000000000000000000000000000000000006',       // WETH on Optimism
  42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',   // WETH on Arbitrum
};

/**
 * Builds a DeFiLlama coin ID string: "chain:address"
 * Resolves native token (0x0) to wrapped token.
 */
function getDefillamaId(chainId: number, tokenAddress: string): string {
  const chain = CHAIN_MAP[chainId];
  if (!chain) throw new Error(`Unsupported chain ID: ${chainId}`);
  const addr = tokenAddress.toLowerCase() === NATIVE_TOKEN
    ? WRAPPED[chainId] || tokenAddress
    : tokenAddress;
  return `${chain}:${addr.toLowerCase()}`;
}

/**
 * Fetches the current price of a token in USD.
 */
export async function getCurrentPrice(chainId: number, tokenAddress: string): Promise<number> {
  const id = getDefillamaId(chainId, tokenAddress);
  const url = `${DEFILLAMA_API}/prices/current/${id}`;
  const res = await retry(
    () => fetch(url).then((r) => r.json()),
    { label: `current price for ${id}` },
  );
  return (res as Record<string, Record<string, Record<string, number>>>).coins?.[id]?.price || 0;
}

/**
 * Fetches the historical price of a token at a specific timestamp.
 */
export async function getHistoricalPrice(
  chainId: number,
  tokenAddress: string,
  timestamp: number,
): Promise<number> {
  const id = getDefillamaId(chainId, tokenAddress);
  const url = `${DEFILLAMA_API}/prices/historical/${timestamp}/${id}`;
  const res = await retry(
    () => fetch(url).then((r) => r.json()),
    { label: `historical price for ${id}` },
  );
  return (res as Record<string, Record<string, Record<string, number>>>).coins?.[id]?.price || 0;
}

/**
 * Fetches current prices for multiple tokens in a single request.
 * Returns a map of "chain:address" → price.
 */
export async function getBatchPrices(
  tokens: Array<{ chainId: number; address: string }>,
): Promise<Record<string, number>> {
  if (tokens.length === 0) return {};
  const ids = tokens.map((t) => getDefillamaId(t.chainId, t.address));
  const url = `${DEFILLAMA_API}/prices/current/${ids.join(',')}`;
  const res = await retry(
    () => fetch(url).then((r) => r.json()),
    { label: 'batch prices' },
  );
  const result: Record<string, number> = {};
  const coins = (res as Record<string, Record<string, Record<string, number>>>).coins || {};
  for (const [key, val] of Object.entries(coins)) {
    result[key] = (val as Record<string, number>).price || 0;
  }
  return result;
}
