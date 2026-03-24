import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAbi, type Address } from 'viem';
import type { Position } from '../../src/types.js';
import type { ChainConfig } from '../../src/types.js';
import { estimatePositionValueUsd } from '../../src/analytics/positions.js';

const HOLDER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const PAIR = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
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

describe('estimatePositionValueUsd (Task 5a spot MVP)', () => {
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

  it('V2: pro-rata reserves × LP balance × spot prices', async () => {
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

    // LP share = 1e18 / 10e18 = 10% of pool → 200 A, 100 B → 200*1 + 100*2 = 400
    expect(v).toBeCloseTo(400, 5);
  });

  it('V3: NPM liquidity > 0 uses net (deposited − withdrawn) wei × spot', async () => {
    readContract.mockImplementation(async (args: { address: Address; functionName: string }) => {
      if (args.functionName === 'positions' && args.address.toLowerCase() === NPM.toLowerCase()) {
        return {
          nonce: 0n,
          operator: '0x0000000000000000000000000000000000000000',
          token0: T0,
          token1: T1,
          fee: 1,
          tickLower: -100,
          tickUpper: 100,
          liquidity: 999n,
          feeGrowthInside0LastX128: 0n,
          feeGrowthInside1LastX128: 0n,
          tokensOwed0: 0n,
          tokensOwed1: 0n,
        };
      }
      if (args.functionName === 'decimals') return 18;
      throw new Error(`unexpected ${args.functionName}`);
    });

    getCurrentPrice.mockImplementation(async () => 1);

    const WAD = 10n ** 18n;
    const p = basePosition({
      positionKind: 'v3_nft',
      nftTokenId: '42',
      totalDeposited0: (2n * WAD).toString(),
      totalWithdrawn0: WAD.toString(),
      totalDeposited1: (4n * WAD).toString(),
      totalWithdrawn1: WAD.toString(),
    });

    const v = await estimatePositionValueUsd(p, {
      publicClient: { readContract },
      priceProvider: priceProvider as never,
      chain: baseChain,
      lpBalanceHolder: HOLDER,
    });

    // net0 = 1 WAD, net1 = 3 WAD, price 1 each → 4 USD
    expect(v).toBeCloseTo(4, 5);
  });

  it('V3: returns 0 when NPM reports zero liquidity', async () => {
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
  });
});
