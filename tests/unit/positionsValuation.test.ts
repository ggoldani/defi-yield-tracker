import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAbi, type Address } from 'viem';
import type { Position } from '../../src/types.js';
import type { ChainConfig } from '../../src/types.js';
import { estimatePositionValueUsd } from '../../src/analytics/positions.js';
import { getAmountsForLiquidity, getSqrtRatioAtTick, Q96 } from '../../src/analytics/clLiquidityMath.js';

const HOLDER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const PAIR = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
const CL_POOL = '0xcccccccccccccccccccccccccccccccccccccccc' as Address;
const T0 = '0x1111111111111111111111111111111111111111' as Address;
const T1 = '0x2222222222222222222222222222222222222222' as Address;
const NPM = '0x827922686190790b37229fd06084350e74485b72' as Address;

const baseChain: ChainConfig = {
  id: 8453,
  name: 'Base',
  currency: 'ETH',
  rpcUrl: 'https://base.local',
  explorerApiUrl: '',
  explorerApiKey: '',
  sickleFactory: '0x0',
  blockTime: 2,
  nftPositionManager: NPM,
};

function basePosition(over: Partial<Omit<Position, 'id'>> = {}): Omit<Position, 'id' | 'currentValueUsd'> {
  return {
    addressId: 1,
    chainId: 8453,
    positionKind: 'v2_lp',
    nftTokenId: '',
    protocol: 'aerodrome',
    poolAddress: PAIR,
    token0: T0,
    token1: T1,
    token0Symbol: 'A',
    token1Symbol: 'B',
    isActive: true,
    entryTimestamp: 1,
    totalDeposited0: '0',
    totalDeposited1: '0',
    totalWithdrawn0: '0',
    totalWithdrawn1: '0',
    totalDepositedUsd: 0,
    totalWithdrawnUsd: 0,
    totalHarvestedUsd: 0,
    totalGasCostUsd: 0,
    ...over,
  };
}

describe('estimatePositionValueUsd (Task 5b CL / 5a V2)', () => {
  let readContract: ReturnType<typeof vi.fn>;
  let getCurrentPrice: ReturnType<typeof vi.fn>;
  let priceProvider: { getCurrentPrice: typeof getCurrentPrice };

  beforeEach(() => {
    readContract = vi.fn();
    getCurrentPrice = vi.fn();
    priceProvider = { getCurrentPrice };
  });

  it('returns 0 for inactive position without RPC', async () => {
    const p = basePosition({ isActive: false });
    const v = await estimatePositionValueUsd(p, {
      publicClient: { readContract },
      priceProvider: priceProvider as never,
      chain: baseChain,
      lpBalanceHolder: HOLDER,
    });
    expect(v).toBe(0);
    expect(readContract).not.toHaveBeenCalled();
    expect(getCurrentPrice).not.toHaveBeenCalled();
  });

  it('V2: pro-rata reserves × LP balance × spot prices (unchanged 5a)', async () => {
    const WAD = 10n ** 18n;
    readContract.mockImplementation(async (args: { address: Address; functionName: string }) => {
      const { address, functionName } = args;
      if (functionName === 'balanceOf' && address.toLowerCase() === PAIR.toLowerCase()) {
        return WAD;
      }
      if (functionName === 'getReserves' && address.toLowerCase() === PAIR.toLowerCase()) {
        return { reserve0: 2000n * WAD, reserve1: 1000n * WAD, blockTimestampLast: 0 };
      }
      if (functionName === 'totalSupply' && address.toLowerCase() === PAIR.toLowerCase()) {
        return 10n * WAD;
      }
      if (functionName === 'decimals') {
        if (address.toLowerCase() === T0.toLowerCase()) return 18;
        if (address.toLowerCase() === T1.toLowerCase()) return 18;
      }
      throw new Error(`unexpected readContract ${functionName} @ ${address}`);
    });

    getCurrentPrice.mockImplementation(async (_chainId: number, token: string) => {
      if (token.toLowerCase() === T0.toLowerCase()) return 1;
      if (token.toLowerCase() === T1.toLowerCase()) return 2;
      return 0;
    });

    const p = basePosition({ positionKind: 'v2_lp' });
    const v = await estimatePositionValueUsd(p, {
      publicClient: { readContract },
      priceProvider: priceProvider as never,
      chain: baseChain,
      lpBalanceHolder: HOLDER,
    });

    expect(v).toBeCloseTo(400, 5);
  });

  it('V3 (5b): slot0 + tick liquidity math + tokensOwed × spot (not indexed net)', async () => {
    const tickLower = -100;
    const tickUpper = 100;
    const liquidity = 10n ** 18n;
    const owed0 = 1n * 10n ** 15n;
    const owed1 = 2n * 10n ** 15n;

    const sqrtP = getSqrtRatioAtTick(0);
    expect(sqrtP).toBe(Q96);

    readContract.mockImplementation(async (args: { address: Address; functionName: string }) => {
      const { address, functionName } = args;
      if (functionName === 'positions' && address.toLowerCase() === NPM.toLowerCase()) {
        return {
          nonce: 0n,
          operator: '0x0000000000000000000000000000000000000000',
          token0: T0,
          token1: T1,
          fee: 1,
          tickLower,
          tickUpper,
          liquidity,
          feeGrowthInside0LastX128: 0n,
          feeGrowthInside1LastX128: 0n,
          tokensOwed0: owed0,
          tokensOwed1: owed1,
        };
      }
      if (functionName === 'slot0' && address.toLowerCase() === CL_POOL.toLowerCase()) {
        return {
          sqrtPriceX96: sqrtP,
          tick: 0,
          observationIndex: 0,
          observationCardinality: 0,
          observationCardinalityNext: 0,
          feeProtocol: 0,
          unlocked: true,
        };
      }
      if (functionName === 'decimals') return 18;
      throw new Error(`unexpected ${functionName} @ ${address}`);
    });

    getCurrentPrice.mockResolvedValue(1);

    const sqrtA = getSqrtRatioAtTick(tickLower);
    const sqrtB = getSqrtRatioAtTick(tickUpper);
    const { amount0, amount1 } = getAmountsForLiquidity(sqrtP, sqrtA, sqrtB, liquidity);
    const total0 = amount0 + owed0;
    const total1 = amount1 + owed1;
    const expectedUsd = Number(total0) / 1e18 + Number(total1) / 1e18;

    const p = basePosition({
      positionKind: 'v3_nft',
      poolAddress: CL_POOL,
      nftTokenId: '42',
      totalDeposited0: (999n * 10n ** 18n).toString(),
      totalWithdrawn0: '0',
      totalDeposited1: '0',
      totalWithdrawn1: '0',
    });

    const v = await estimatePositionValueUsd(p, {
      publicClient: { readContract },
      priceProvider: priceProvider as never,
      chain: baseChain,
      lpBalanceHolder: HOLDER,
    });

    expect(v).toBeCloseTo(expectedUsd, 4);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: CL_POOL, functionName: 'slot0' }),
    );
  });

  it('V3: returns 0 when NPM reports zero liquidity (no slot0 read)', async () => {
    readContract.mockImplementation(async (args: { address: Address; functionName: string }) => {
      if (args.functionName === 'positions') {
        return {
          nonce: 0n,
          operator: '0x0000000000000000000000000000000000000000',
          token0: T0,
          token1: T1,
          fee: 1,
          tickLower: 0,
          tickUpper: 0,
          liquidity: 0n,
          feeGrowthInside0LastX128: 0n,
          feeGrowthInside1LastX128: 0n,
          tokensOwed0: 0n,
          tokensOwed1: 0n,
        };
      }
      if (args.functionName === 'decimals') return 18;
      throw new Error('unexpected');
    });

    const p = basePosition({
      positionKind: 'v3_nft',
      poolAddress: CL_POOL,
      nftTokenId: '1',
      totalDeposited0: (10n ** 18n).toString(),
    });

    const v = await estimatePositionValueUsd(p, {
      publicClient: { readContract },
      priceProvider: priceProvider as never,
      chain: baseChain,
      lpBalanceHolder: HOLDER,
    });
    expect(v).toBe(0);
    expect(getCurrentPrice).not.toHaveBeenCalled();
    expect(readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: 'slot0' }));
  });

  it('returns 0 on RPC failure (no throw)', async () => {
    readContract.mockRejectedValue(new Error('rpc down'));
    const warn = vi.spyOn((await import('../../src/utils/logger.js')).log, 'warn').mockImplementation(() => {});

    const p = basePosition({ positionKind: 'v2_lp' });
    const v = await estimatePositionValueUsd(p, {
      publicClient: { readContract },
      priceProvider: priceProvider as never,
      chain: baseChain,
      lpBalanceHolder: HOLDER,
    });

    expect(v).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('V3: returns 0 when chain has no nftPositionManager', async () => {
    const chainNoNpm = { ...baseChain, nftPositionManager: undefined };
    const p = basePosition({
      positionKind: 'v3_nft',
      poolAddress: CL_POOL,
      nftTokenId: '1',
      totalDeposited0: '1',
    });
    const v = await estimatePositionValueUsd(p, {
      publicClient: { readContract },
      priceProvider: priceProvider as never,
      chain: chainNoNpm,
      lpBalanceHolder: HOLDER,
    });
    expect(v).toBe(0);
    expect(readContract).not.toHaveBeenCalled();
  });
});

describe('positions valuation ABIs parse', () => {
  it('minimal ABIs used by positions.ts are valid', async () => {
    const { valuationAbis } = await import('../../src/analytics/positions.js');
    expect(() => parseAbi(valuationAbis.erc20)).not.toThrow();
    expect(() => parseAbi(valuationAbis.v2Pair)).not.toThrow();
    expect(() => parseAbi(valuationAbis.npmPositions)).not.toThrow();
    expect(() => parseAbi(valuationAbis.poolSlot0)).not.toThrow();
  });
});
