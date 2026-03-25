/**
 * Uniswap V3–compatible tick / liquidity math for CL valuation (Task 5b).
 * Integer path uses **bigint only** (no float). Ported from Uniswap v3-core `TickMath`, `FullMath`
 * (simplified for positive-only `mulDiv`), and v3-periphery `LiquidityAmounts`.
 */

/** Q64.96: fixed-point 1.0 */
export const Q96 = 1n << 96n;

export const MIN_TICK = -887272;
export const MAX_TICK = 887272;

const MAX_UINT256 = (1n << 256n) - 1n;

/** Floor(a×b÷denominator) for uint256-style positives; exact via BigInt. */
export function mulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('mulDiv: denominator zero');
  return (a * b) / denominator;
}

/**
 * `sqrt(1.0001^tick) * 2^96` as Q64.96 (`uint160`), matching `TickMath.getSqrtRatioAtTick`.
 */
export function getSqrtRatioAtTick(tick: number): bigint {
  if (tick < MIN_TICK || tick > MAX_TICK) {
    throw new Error(`getSqrtRatioAtTick: tick ${tick} out of bounds`);
  }

  const absTick = tick < 0 ? BigInt(-tick) : BigInt(tick);
  if (absTick > BigInt(MAX_TICK)) {
    throw new Error('getSqrtRatioAtTick: abs tick');
  }

  let ratio =
    (absTick & 1n) !== 0n
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n;
  if ((absTick & 2n) !== 0n) ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n;
  if ((absTick & 4n) !== 0n) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if ((absTick & 8n) !== 0n) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if ((absTick & 16n) !== 0n) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if ((absTick & 32n) !== 0n) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if ((absTick & 64n) !== 0n) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if ((absTick & 128n) !== 0n) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if ((absTick & 256n) !== 0n) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if ((absTick & 512n) !== 0n) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if ((absTick & 1024n) !== 0n) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if ((absTick & 2048n) !== 0n) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
  if ((absTick & 4096n) !== 0n) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if ((absTick & 8192n) !== 0n) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if ((absTick & 16384n) !== 0n) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if ((absTick & 32768n) !== 0n) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if ((absTick & 65536n) !== 0n) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
  if ((absTick & 131072n) !== 0n) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if ((absTick & 262144n) !== 0n) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if ((absTick & 524288n) !== 0n) ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n;

  if (tick > 0) {
    ratio = MAX_UINT256 / ratio;
  }

  const sqrtPriceX96 = (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);

  if (sqrtPriceX96 > (1n << 160n) - 1n) {
    throw new Error('getSqrtRatioAtTick: sqrtPriceX96 overflow');
  }
  return sqrtPriceX96;
}

/** Periphery `LiquidityAmounts.getAmount0ForLiquidity` (sqrtA < sqrtB). */
function getAmount0ForLiquidity(sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, liquidity: bigint): bigint {
  let sa = sqrtRatioAX96;
  let sb = sqrtRatioBX96;
  if (sa > sb) [sa, sb] = [sb, sa];
  if (sa === sb) return 0n;
  const L = liquidity << 96n;
  return mulDiv(mulDiv(L, sb - sa, sb), 1n, sa);
}

/** Periphery `LiquidityAmounts.getAmount1ForLiquidity`. */
function getAmount1ForLiquidity(sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, liquidity: bigint): bigint {
  let sa = sqrtRatioAX96;
  let sb = sqrtRatioBX96;
  if (sa > sb) [sa, sb] = [sb, sa];
  if (sa === sb) return 0n;
  return mulDiv(liquidity, sb - sa, Q96);
}

/**
 * Token amounts under `sqrtPriceX96` for liquidity on `[sqrtLowerX96, sqrtUpperX96]`.
 * Same branching as Uniswap `LiquidityAmounts.getAmountsForLiquidity`.
 */
export function getAmountsForLiquidity(
  sqrtPriceX96: bigint,
  sqrtLowerX96: bigint,
  sqrtUpperX96: bigint,
  liquidity: bigint,
): { amount0: bigint; amount1: bigint } {
  let sqrtA = sqrtLowerX96;
  let sqrtB = sqrtUpperX96;
  if (sqrtA > sqrtB) {
    [sqrtA, sqrtB] = [sqrtB, sqrtA];
  }

  let amount0 = 0n;
  let amount1 = 0n;

  if (sqrtPriceX96 <= sqrtA) {
    amount0 = getAmount0ForLiquidity(sqrtA, sqrtB, liquidity);
  } else if (sqrtPriceX96 < sqrtB) {
    amount0 = getAmount0ForLiquidity(sqrtPriceX96, sqrtB, liquidity);
    amount1 = getAmount1ForLiquidity(sqrtA, sqrtPriceX96, liquidity);
  } else {
    amount1 = getAmount1ForLiquidity(sqrtA, sqrtB, liquidity);
  }

  return { amount0, amount1 };
}
