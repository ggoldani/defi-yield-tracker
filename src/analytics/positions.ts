/**
 * Task 5a — **Spot-based `current_value_usd` (MVP)** for `positions` rows.
 *
 * **Accuracy:** Not tick-accurate for concentrated liquidity (Task 5b). For **V3 / Slipstream** rows
 * we confirm on-chain `liquidity > 0` via NPM, then mark value as **indexed net token wei**
 * `(totalDeposited − totalWithdrawn)` × **DeFiLlama spot** — this ignores price movement inside the
 * position’s tick range and can diverge **~5–15%** (or more in volatile moves) from full Uniswap v3
 * math. **V2** uses **Pair `balanceOf(holder)` × reserves / totalSupply**, which matches wallet-held
 * LP on the pair contract; if LP is staked in a gauge that does **not** reduce the Sickle’s Pair
 * `balanceOf`, this will **understate** until gauge balance is integrated.
 *
 * **Failures:** RPC errors → `log.warn`, return **0** (never throws to callers).
 */

import { parseAbi, type Address, type PublicClient } from 'viem';
import type { ChainConfig, Position } from '../types.js';
import type { PriceProvider } from '../prices/provider.js';
import { log } from '../utils/logger.js';

/** Exported for unit tests that assert ABI strings parse under viem. */
export const valuationAbis = {
  erc20: ['function decimals() view returns (uint8)'] as const,
  v2Pair: [
    'function balanceOf(address account) view returns (uint256)',
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function totalSupply() view returns (uint256)',
  ] as const,
  npmPositions: [
    'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  ] as const,
};

const erc20Abi = parseAbi(valuationAbis.erc20);
const v2PairAbi = parseAbi(valuationAbis.v2Pair);
const npmAbi = parseAbi(valuationAbis.npmPositions);

export type EstimatePositionValueUsdDeps = {
  publicClient: Pick<PublicClient, 'readContract'>;
  priceProvider: PriceProvider;
  chain: ChainConfig;
  /**
   * Holder for V2 Pair `balanceOf` — **Sickle** on this chain when known, else tracked **EOA**.
   * (Gauge-only stake without Pair ledger balance is not modeled in 5a.)
   */
  lpBalanceHolder: Address;
};

function warnCtx(position: Omit<Position, 'id' | 'currentValueUsd'>, extra: Record<string, unknown>) {
  return JSON.stringify({
    scope: 'positionValuation5a',
    addressId: position.addressId,
    chainId: position.chainId,
    pool: position.poolAddress,
    positionKind: position.positionKind,
    nftTokenId: position.nftTokenId,
    ...extra,
  });
}

async function readDecimals(client: Pick<PublicClient, 'readContract'>, token: Address): Promise<number> {
  try {
    const d = await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'decimals',
    });
    return Number(d);
  } catch {
    return 18;
  }
}

function netWei(deposited: string, withdrawn: string): bigint {
  try {
    const d = BigInt(deposited || '0');
    const w = BigInt(withdrawn || '0');
    return d > w ? d - w : 0n;
  } catch {
    return 0n;
  }
}

function npmPositionRow(r: unknown): { token0: Address; token1: Address; liquidity: bigint } {
  if (Array.isArray(r)) {
    return {
      token0: r[2] as Address,
      token1: r[3] as Address,
      liquidity: r[7] as bigint,
    };
  }
  const o = r as {
    token0: Address;
    token1: Address;
    liquidity: bigint;
  };
  return { token0: o.token0, token1: o.token1, liquidity: o.liquidity };
}

async function spotLegUsd(
  priceProvider: PriceProvider,
  chainId: number,
  token: Address,
  amountRaw: bigint,
  decimals: number,
): Promise<number> {
  if (amountRaw === 0n) return 0;
  const price = await priceProvider.getCurrentPrice(chainId, token);
  if (!(price > 0)) return 0;
  const human = Number(amountRaw) / 10 ** decimals;
  if (!Number.isFinite(human)) return 0;
  return Math.max(0, human * price);
}

async function valueV2(
  position: Omit<Position, 'id' | 'currentValueUsd'>,
  deps: EstimatePositionValueUsdDeps,
): Promise<number> {
  const { publicClient, priceProvider, chain, lpBalanceHolder } = deps;
  const pool = position.poolAddress;

  const lpBalance = (await publicClient.readContract({
    address: pool,
    abi: v2PairAbi,
    functionName: 'balanceOf',
    args: [lpBalanceHolder],
  })) as bigint;

  if (lpBalance === 0n) return 0;

  const reservesRaw = await publicClient.readContract({
    address: pool,
    abi: v2PairAbi,
    functionName: 'getReserves',
  });

  const totalSupply = (await publicClient.readContract({
    address: pool,
    abi: v2PairAbi,
    functionName: 'totalSupply',
  })) as bigint;

  if (totalSupply === 0n) {
    log.warn(warnCtx(position, { reason: 'v2_zero_total_supply' }));
    return 0;
  }

  let reserve0: bigint;
  let reserve1: bigint;
  if (Array.isArray(reservesRaw)) {
    reserve0 = reservesRaw[0] as bigint;
    reserve1 = reservesRaw[1] as bigint;
  } else {
    const reserves = reservesRaw as unknown as { reserve0: bigint; reserve1: bigint };
    reserve0 = reserves.reserve0;
    reserve1 = reserves.reserve1;
  }

  const amount0 = (lpBalance * reserve0) / totalSupply;
  const amount1 = (lpBalance * reserve1) / totalSupply;

  const dec0 = await readDecimals(publicClient, position.token0);
  const dec1 = await readDecimals(publicClient, position.token1);

  const usd0 = await spotLegUsd(priceProvider, chain.id, position.token0, amount0, dec0);
  const usd1 = await spotLegUsd(priceProvider, chain.id, position.token1, amount1, dec1);

  return Math.max(0, usd0 + usd1);
}

async function valueV3(
  position: Omit<Position, 'id' | 'currentValueUsd'>,
  deps: EstimatePositionValueUsdDeps,
): Promise<number> {
  const npm = deps.chain.nftPositionManager;
  if (!npm) {
    log.warn(warnCtx(position, { reason: 'v3_missing_npm_config' }));
    return 0;
  }

  let tokenId: bigint;
  try {
    tokenId = BigInt(position.nftTokenId.trim());
  } catch {
    log.warn(warnCtx(position, { reason: 'v3_bad_token_id' }));
    return 0;
  }
  if (tokenId <= 0n) {
    log.warn(warnCtx(position, { reason: 'v3_bad_token_id' }));
    return 0;
  }

  const res = await deps.publicClient.readContract({
    address: npm,
    abi: npmAbi,
    functionName: 'positions',
    args: [tokenId],
  });

  const row = npmPositionRow(res);

  if (row.liquidity === 0n) return 0;

  if (
    row.token0.toLowerCase() !== position.token0.toLowerCase() ||
    row.token1.toLowerCase() !== position.token1.toLowerCase()
  ) {
    log.warn(warnCtx(position, { reason: 'v3_token_mismatch_npm_vs_row' }));
    return 0;
  }

  const n0 = netWei(position.totalDeposited0, position.totalWithdrawn0);
  const n1 = netWei(position.totalDeposited1, position.totalWithdrawn1);

  const dec0 = await readDecimals(deps.publicClient, position.token0);
  const dec1 = await readDecimals(deps.publicClient, position.token1);

  const usd0 = await spotLegUsd(deps.priceProvider, deps.chain.id, position.token0, n0, dec0);
  const usd1 = await spotLegUsd(deps.priceProvider, deps.chain.id, position.token1, n1, dec1);

  return Math.max(0, usd0 + usd1);
}

/**
 * Non-negative USD mark for an **active** position; **inactive** → `0` (no RPC).
 * See module doc: **5a** spot MVP with documented error band vs tick-exact valuation.
 */
export async function estimatePositionValueUsd(
  position: Omit<Position, 'id' | 'currentValueUsd'>,
  deps: EstimatePositionValueUsdDeps,
): Promise<number> {
  if (!position.isActive) {
    return 0;
  }

  try {
    if (position.positionKind === 'v2_lp') {
      return await valueV2(position, deps);
    }
    if (position.positionKind === 'v3_nft') {
      return await valueV3(position, deps);
    }
    return 0;
  } catch (e) {
    log.warn(
      warnCtx(position, {
        reason: 'valuation_rpc_error',
        message: (e as Error).message,
      }),
    );
    return 0;
  }
}
