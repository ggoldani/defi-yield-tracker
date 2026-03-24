import type { TxCategory } from '../types.js';
import { SICKLE_CONTRACTS } from '../config.js';
import type { Abi } from 'viem';
import { decodeFunctionData, parseAbi } from 'viem';
import farmV2DepositAbi from '../abis/FarmV2.json' with { type: 'json' };
import slipstreamIncreaseAbi from '../abis/Slipstream.json' with { type: 'json' };

// ── Transaction Classification ───────────────────
export interface TxClassification {
  from: string;
  to: string;
  methodId: string;
  functionName: string;
  isSickleRelated: boolean;
}

// ── Known Sickle Strategy Addresses ──────────────
const SICKLE_STRATEGY_ADDRESSES = new Set(
  Object.values(SICKLE_CONTRACTS).map((addr) => addr.toLowerCase()),
);

/**
 * Checks if a target address is a known Sickle strategy contract.
 */
export function isSickleStrategy(address: string): boolean {
  return SICKLE_STRATEGY_ADDRESSES.has(address.toLowerCase());
}

/**
 * Categorizes a transaction based on its function name, method selector, and context.
 */
export function categorizeTransaction(tx: TxClassification): TxCategory {
  if (tx.methodId === '0x' || tx.methodId === '') {
    return 'transfer_out';
  }

  const fnLower = tx.functionName.toLowerCase();
  const sel = tx.methodId.toLowerCase();

  const isDeposit =
    fnLower.includes('deposit') ||
    fnLower.includes('increase') ||
    ['0x47e7ef24', '0x621bb6bb', '0x8a92e10a', '0x25fdd6ce', '0x82321064', '0x10404af4'].includes(sel);

  const isWithdraw =
    fnLower.includes('withdraw') ||
    fnLower.includes('decrease') ||
    ['0x69328dec', '0x2e1a7d4d', '0x7b36e88c', '0xd0f7a861'].includes(sel);

  const isHarvest =
    fnLower.includes('harvest') ||
    ['0x4ba0579e', '0xc1074bf8', '0x3d0b27fd', '0x107c5ea4', '0x3424754f'].includes(sel);

  const isCompound =
    fnLower.includes('compound') ||
    ['0xf69e2046', '0x1f6a11e5', '0x422f8e9f', '0x4045ffaa', '0xacd1d6c6'].includes(sel);

  const isExit =
    fnLower.includes('exit') ||
    ['0x111e102e', '0x8052fcf9', '0x62660d2b', '0x71868e68', '0x61016060'].includes(sel);

  const isRebalance =
    fnLower.includes('rebalance') ||
    ['0xe88a1005', '0x9020d3c2', '0xa81fa02b', '0x01b31cd0'].includes(sel);

  if (tx.isSickleRelated) {
    if (isDeposit) return 'deposit';
    if (isWithdraw) return 'withdraw';
    if (isHarvest) return 'harvest';
    if (isCompound) return 'compound';
    if (isExit) return 'exit';
    if (isRebalance) return 'rebalance';
  }

  if (fnLower.includes('approve') || sel === '0x095ea7b3') {
    return 'approval';
  }

  if (fnLower.includes('swap') || ['0x38ed1739', '0x5c11d795', '0x1cff79cd'].includes(sel)) {
    return 'swap';
  }

  return 'unknown';
}

/**
 * Determines if a transaction involves a Sickle wallet or strategy.
 */
export function classifyTransaction(
  tx: { to: string; from: string; methodId: string; functionName: string; input?: string },
  sickleAddress: string | null,
): TxClassification {
  const toAddr = tx.to.toLowerCase();
  const sickleAddr = sickleAddress?.toLowerCase() || '';

  const isSickleRelated = isSickleStrategy(toAddr) || toAddr === sickleAddr;

  return {
    from: tx.from,
    to: tx.to,
    methodId: tx.methodId,
    functionName: tx.functionName,
    isSickleRelated,
  };
}

// ── Calldata decode (Task 2) ─────────────────────

/**
 * High-level strategy family for decoded calldata.
 * - `farm`: V2-style LP (FarmStrategy, Aerodrome V2 strategy, FarmV2 deposit, etc.)
 * - `nft_farm`: NftFarmStrategy (CL NFT positions)
 * - `slipstream`: Aerodrome Slipstream strategy `increase` / `decrease` shapes
 * - `unknown`: unsupported selector, malformed input, or decode failure
 */
export type DecodedStrategyKind = 'farm' | 'nft_farm' | 'slipstream' | 'unknown';

export type DecodedSickleStrategyInput = {
  strategyKind: DecodedStrategyKind;
  /** Pool / pair / LP token address when identified (lowercase `0x…`) */
  poolAddress?: string;
  lpToken?: string;
  /**
   * Decimal string when token id is present in calldata.
   * `null` when the function is an NFT **minting** deposit and id is only knowable from logs (Task 4b).
   * Omitted for pure V2 paths.
   */
  nftTokenId?: string | null;
  token0?: string;
  token1?: string;
  amount0?: string;
  amount1?: string;
};

/*
 * Selector coverage (see categorizeTransaction for category mapping):
 *
 * **Fully supported (viem decode + field extraction)**
 * - 0x10404af4 — Aerodrome strategy V2 `increase` (custom tuple layout; not the same as core FarmStrategy.increase)
 * - 0x25fdd6ce — Farm V2 `deposit` (`FarmV2.json`)
 * - 0x82321064 — Slipstream strategy `increase` (`Slipstream.json` fragment)
 * - 0xd0f7a861 — Slipstream strategy `decrease` (4byte.directory canonical tuple string)
 * - 0x107acebd — NftFarmStrategy `withdraw` (NftPosition carries tokenId)
 * - 0xe5bacdd0 — NftFarmStrategy `increase` (NftPosition + pool tokens from zap)
 *
 * **Partial / intentional gaps**
 * - NftFarmStrategy `deposit` (new NFT): tokenId is assigned on-chain after mint — always `nftTokenId: null` if added later; use logs (Task 4b).
 * - Slipstream `increase` / `decrease`: NPM `tokenId` is not in the repo ABI fragment / decrease tuple we decode; `nftTokenId` omitted unless extended.
 */

/** Selector verified via https://www.4byte.directory — matches Base `aerodromeStrategyV2` txs (e.g. 0x16de740e023400b6cfd4e1307da4b094801cefba49ce6eccb7bc63bc06a7193c). */
const SEL_AERODROME_V2_INCREASE = '0x10404af4';
const AERODROME_V2_INCREASE_ABI = parseAbi([
  'function increase(((address,uint256),address,uint256),((address[],uint128,uint128,bytes),(address,address,uint256,uint256,uint256,address,address,bytes)[],address[],address[]),(address[],uint256[],((address,address,uint256,uint256,uint256,address,address,bytes)[],(address,uint256,(address,address,uint24),int24,int24,uint256,uint256,uint256,uint256,bytes)),bytes),bool,address[])',
] as unknown as readonly string[]) as Abi;

const SEL_FARM_V2_DEPOSIT = '0x25fdd6ce';
const FARM_V2_DEPOSIT_ABI = farmV2DepositAbi as Abi;

const SEL_SLIPSTREAM_INCREASE = '0x82321064';
const SLIPSTREAM_INCREASE_ABI = slipstreamIncreaseAbi as Abi;

/** Canonical tuple string from https://www.4byte.directory/?hex_signature=0xd0f7a861 (synthetic round-trip in tests). */
const SEL_SLIPSTREAM_DECREASE = '0xd0f7a861';
const SLIPSTREAM_DECREASE_ABI = parseAbi([
  'function decrease((address,(address,uint256,uint256,address,bytes)[],bytes,address[]),(address,bytes,((address,address,address[],uint256,uint256[],bytes),(address,uint256,uint256,address,bytes)[]),address[]),(address,address[],uint256[],((address,uint256,uint256,address,bytes)[],(address,address,address[],uint256[],uint256[],bytes)),bytes),address[])',
] as unknown as readonly string[]) as Abi;

const SEL_NFT_FARM_WITHDRAW = '0x107acebd';
const NFT_FARM_WITHDRAW_ABI = [
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'position',
        type: 'tuple',
        components: [
          {
            name: 'farm',
            type: 'tuple',
            components: [
              { name: 'stakingContract', type: 'address' },
              { name: 'poolIndex', type: 'uint256' },
            ],
          },
          { name: 'nft', type: 'address' },
          { name: 'tokenId', type: 'uint256' },
        ],
      },
      {
        name: 'params',
        type: 'tuple',
        components: [
          {
            name: 'zap',
            type: 'tuple',
            components: [
              {
                name: 'removeLiquidityParams',
                type: 'tuple',
                components: [
                  { name: 'nft', type: 'address' },
                  { name: 'tokenId', type: 'uint256' },
                  { name: 'liquidity', type: 'uint128' },
                  { name: 'amount0Min', type: 'uint256' },
                  { name: 'amount1Min', type: 'uint256' },
                  { name: 'amount0Max', type: 'uint128' },
                  { name: 'amount1Max', type: 'uint128' },
                  { name: 'extraData', type: 'bytes' },
                ],
              },
              {
                name: 'swaps',
                type: 'tuple[]',
                components: [
                  { name: 'router', type: 'address' },
                  { name: 'amountIn', type: 'uint256' },
                  { name: 'minAmountOut', type: 'uint256' },
                  { name: 'tokenIn', type: 'address' },
                  { name: 'extraData', type: 'bytes' },
                ],
              },
            ],
          },
          { name: 'tokensOut', type: 'address[]' },
          { name: 'extraData', type: 'bytes' },
        ],
      },
      { name: 'sweepTokens', type: 'address[]' },
    ],
    outputs: [],
  },
] as const satisfies Abi;

const SEL_NFT_FARM_INCREASE = '0xe5bacdd0';
const NFT_FARM_INCREASE_ABI = [
  {
    type: 'function',
    name: 'increase',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'position',
        type: 'tuple',
        components: [
          {
            name: 'farm',
            type: 'tuple',
            components: [
              { name: 'stakingContract', type: 'address' },
              { name: 'poolIndex', type: 'uint256' },
            ],
          },
          { name: 'nft', type: 'address' },
          { name: 'tokenId', type: 'uint256' },
        ],
      },
      {
        name: 'harvestParams',
        type: 'tuple',
        components: [
          {
            name: 'harvest',
            type: 'tuple',
            components: [
              { name: 'rewardTokens', type: 'address[]' },
              { name: 'amount0Max', type: 'uint128' },
              { name: 'amount1Max', type: 'uint128' },
              { name: 'extraData', type: 'bytes' },
            ],
          },
          {
            name: 'swaps',
            type: 'tuple[]',
            components: [
              { name: 'router', type: 'address' },
              { name: 'amountIn', type: 'uint256' },
              { name: 'minAmountOut', type: 'uint256' },
              { name: 'tokenIn', type: 'address' },
              { name: 'extraData', type: 'bytes' },
            ],
          },
          { name: 'outputTokens', type: 'address[]' },
          { name: 'sweepTokens', type: 'address[]' },
        ],
      },
      {
        name: 'increaseParams',
        type: 'tuple',
        components: [
          { name: 'tokensIn', type: 'address[]' },
          { name: 'amountsIn', type: 'uint256[]' },
          {
            name: 'zap',
            type: 'tuple',
            components: [
              {
                name: 'swaps',
                type: 'tuple[]',
                components: [
                  { name: 'router', type: 'address' },
                  { name: 'amountIn', type: 'uint256' },
                  { name: 'minAmountOut', type: 'uint256' },
                  { name: 'tokenIn', type: 'address' },
                  { name: 'extraData', type: 'bytes' },
                ],
              },
              {
                name: 'addLiquidityParams',
                type: 'tuple',
                components: [
                  { name: 'nft', type: 'address' },
                  { name: 'tokenId', type: 'uint256' },
                  {
                    name: 'pool',
                    type: 'tuple',
                    components: [
                      { name: 'token0', type: 'address' },
                      { name: 'token1', type: 'address' },
                      { name: 'fee', type: 'uint24' },
                    ],
                  },
                  { name: 'tickLower', type: 'int24' },
                  { name: 'tickUpper', type: 'int24' },
                  { name: 'amount0Desired', type: 'uint256' },
                  { name: 'amount1Desired', type: 'uint256' },
                  { name: 'amount0Min', type: 'uint256' },
                  { name: 'amount1Min', type: 'uint256' },
                  { name: 'extraData', type: 'bytes' },
                ],
              },
            ],
          },
          { name: 'extraData', type: 'bytes' },
        ],
      },
      { name: 'inPlace', type: 'bool' },
      { name: 'sweepTokens', type: 'address[]' },
    ],
    outputs: [],
  },
] as const satisfies Abi;

function addrLo(a: string | undefined): string | undefined {
  if (!a) return undefined;
  const x = a.toLowerCase();
  return x.startsWith('0x') ? x : `0x${x}`;
}

function pickSelector(methodId: string, input: string): string | null {
  if (input && input.length >= 10) {
    return input.slice(0, 10).toLowerCase();
  }
  const m = methodId?.toLowerCase() || '';
  if (m.length >= 10) return m.slice(0, 10);
  return null;
}

/**
 * Pure decoder for Sickle-related strategy calldata. Never throws; returns `strategyKind: 'unknown'` on errors.
 */
export function decodeSickleStrategyInput(opts: {
  methodId: string;
  input: string;
}): DecodedSickleStrategyInput {
  const unknown = (): DecodedSickleStrategyInput => ({ strategyKind: 'unknown' });
  const input = opts.input?.trim() || '';
  if (!input || input === '0x' || input.length < 10) {
    return unknown();
  }

  const sel = pickSelector(opts.methodId, input);
  if (!sel) return unknown();

  try {
    if (sel === SEL_AERODROME_V2_INCREASE) {
      const { args } = decodeFunctionData({ abi: AERODROME_V2_INCREASE_ABI, data: input as `0x${string}` });
      if (!args) return unknown();
      const head = args[0] as readonly [readonly [string, bigint], string, bigint];
      const pool = addrLo(head[1]);
      const p1 = args[1] as readonly [
        readonly [readonly string[], bigint | string, bigint | string, string],
        unknown,
        readonly string[],
        readonly string[],
      ];
      const tokenList = p1[0][0];
      const zapIn = args[2] as readonly [readonly string[], readonly bigint[], unknown, string];
      const tokensIn = zapIn[0] as readonly string[];
      const amountsIn = zapIn[1] as readonly bigint[];

      const token0 = addrLo(tokenList[0]);
      const token1 = addrLo(tokenList[1]);
      const amount0 = amountsIn[0] !== undefined ? amountsIn[0].toString() : undefined;
      const amount1 = amountsIn[1] !== undefined ? amountsIn[1].toString() : undefined;

      return {
        strategyKind: 'farm',
        poolAddress: pool,
        lpToken: pool,
        token0,
        token1,
        amount0,
        amount1,
      };
    }

    if (sel === SEL_FARM_V2_DEPOSIT) {
      const { args } = decodeFunctionData({ abi: FARM_V2_DEPOSIT_ABI, data: input as `0x${string}` });
      if (!args) return unknown();
      const params = args[0] as {
        stakingContractAddress: string;
        tokensIn: readonly string[];
        amountsIn: readonly bigint[];
        zapData: {
          addLiquidityData: {
            lpToken: string;
            tokens: readonly string[];
            desiredAmounts: readonly bigint[];
          };
        };
      };
      const lp = addrLo(params.zapData.addLiquidityData.lpToken);
      const t = params.zapData.addLiquidityData.tokens;
      const d = params.zapData.addLiquidityData.desiredAmounts;
      return {
        strategyKind: 'farm',
        poolAddress: lp,
        lpToken: lp,
        token0: addrLo(t[0]),
        token1: addrLo(t[1]),
        amount0: d[0] !== undefined ? d[0].toString() : undefined,
        amount1: d[1] !== undefined ? d[1].toString() : undefined,
      };
    }

    if (sel === SEL_SLIPSTREAM_INCREASE) {
      const { args } = decodeFunctionData({ abi: SLIPSTREAM_INCREASE_ABI, data: input as `0x${string}` });
      if (!args) return unknown();
      const depositParams = args[1] as {
        stakingContractAddress: string;
        tokensIn: readonly string[];
        amountsIn: readonly bigint[];
        zapData: {
          addLiquidityData: {
            lpToken: string;
            tokens: readonly string[];
            desiredAmounts: readonly bigint[];
          };
        };
      };
      const lp = addrLo(depositParams.zapData.addLiquidityData.lpToken);
      const t = depositParams.zapData.addLiquidityData.tokens;
      const d = depositParams.zapData.addLiquidityData.desiredAmounts;
      return {
        strategyKind: 'slipstream',
        poolAddress: lp,
        lpToken: lp,
        token0: addrLo(t[0]),
        token1: addrLo(t[1]),
        amount0: d[0] !== undefined ? d[0].toString() : undefined,
        amount1: d[1] !== undefined ? d[1].toString() : undefined,
      };
    }

    if (sel === SEL_SLIPSTREAM_DECREASE) {
      const { args } = decodeFunctionData({ abi: SLIPSTREAM_DECREASE_ABI, data: input as `0x${string}` });
      if (!args) return unknown();
      const p0 = args[0] as readonly [string, unknown, string, readonly string[]];
      const pool = addrLo(p0[0]);
      return {
        strategyKind: 'slipstream',
        poolAddress: pool,
        lpToken: pool,
      };
    }

    if (sel === SEL_NFT_FARM_WITHDRAW) {
      const { args } = decodeFunctionData({ abi: NFT_FARM_WITHDRAW_ABI, data: input as `0x${string}` });
      if (!args) return unknown();
      const position = args[0] as { tokenId: bigint };
      return {
        strategyKind: 'nft_farm',
        nftTokenId: position.tokenId.toString(),
      };
    }

    if (sel === SEL_NFT_FARM_INCREASE) {
      const { args } = decodeFunctionData({ abi: NFT_FARM_INCREASE_ABI, data: input as `0x${string}` });
      if (!args) return unknown();
      const position = args[0] as { tokenId: bigint };
      const inc = args[2] as {
        zap: {
          addLiquidityParams: {
            pool: { token0: string; token1: string };
          };
        };
      };
      const pool = inc.zap.addLiquidityParams.pool;
      return {
        strategyKind: 'nft_farm',
        nftTokenId: position.tokenId.toString(),
        token0: addrLo(pool.token0),
        token1: addrLo(pool.token1),
      };
    }
  } catch {
    return unknown();
  }

  return unknown();
}
