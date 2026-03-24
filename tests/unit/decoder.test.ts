import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { encodeFunctionData } from 'viem';
import farmV2Abi from '../../src/abis/FarmV2.json' with { type: 'json' };
import slipstreamAbi from '../../src/abis/Slipstream.json' with { type: 'json' };
import {
  categorizeTransaction,
  decodeSickleStrategyInput,
  type TxClassification,
} from '../../src/indexer/decoder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const nftFarmWithdrawAbi = [
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
] as const;

const nftFarmIncreaseAbi = [
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
] as const;

describe('Transaction Categorizer', () => {
  describe('when transaction is Sickle-related', () => {
    it('categorizes deposit function as deposit', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xStrategy',
        methodId: '0x12345678',
        functionName: 'deposit(tuple,tuple,address[],address,bytes32)',
        isSickleRelated: true,
      });
      expect(category).toBe('deposit');
    });

    it('categorizes simpleDeposit as deposit', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xStrategy',
        methodId: '0xabcdef01',
        functionName: 'simpleDeposit(tuple,tuple,address,bytes32)',
        isSickleRelated: true,
      });
      expect(category).toBe('deposit');
    });

    it('categorizes increase as deposit', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xStrategy',
        methodId: '0x11111111',
        functionName: 'increase(tuple,address[])',
        isSickleRelated: true,
      });
      expect(category).toBe('deposit');
    });

    it('categorizes Aerodrome V2 increase selector 0x10404af4 as deposit when Sickle-related', () => {
      expect(
        categorizeTransaction({
          from: '0x0000000000000000000000000000000000000000',
          to: '0x9699be38e6d54e51a4b36645726fee9cc736eb45',
          methodId: '0x10404af4',
          functionName: '',
          isSickleRelated: true,
        }),
      ).toBe('deposit');
    });

    it('categorizes Slipstream decrease selector 0xd0f7a861 as withdraw when Sickle-related', () => {
      expect(
        categorizeTransaction({
          from: '0xUser',
          to: '0x2f0052779c992c509b0758679b46969418696096',
          methodId: '0xd0f7a861',
          functionName: '',
          isSickleRelated: true,
        }),
      ).toBe('withdraw');
    });

    it('categorizes withdraw as withdraw', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xStrategy',
        methodId: '0x22222222',
        functionName: 'withdraw(tuple,tuple,address[])',
        isSickleRelated: true,
      });
      expect(category).toBe('withdraw');
    });

    it('categorizes harvest as harvest', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xStrategy',
        methodId: '0x33333333',
        functionName: 'harvest(tuple,tuple,address[])',
        isSickleRelated: true,
      });
      expect(category).toBe('harvest');
    });

    it('categorizes compound as compound', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xStrategy',
        methodId: '0x44444444',
        functionName: 'compound(tuple,address[])',
        isSickleRelated: true,
      });
      expect(category).toBe('compound');
    });

    it('categorizes exit as exit', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xStrategy',
        methodId: '0x55555555',
        functionName: 'exit(tuple,tuple,address[],tuple,address[])',
        isSickleRelated: true,
      });
      expect(category).toBe('exit');
    });

    it('categorizes rebalance as rebalance', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xStrategy',
        methodId: '0x66666666',
        functionName: 'rebalance(tuple,tuple)',
        isSickleRelated: true,
      });
      expect(category).toBe('rebalance');
    });

    it('categorizes harvestFor as harvest', () => {
      const category = categorizeTransaction({
        from: '0xAutomation',
        to: '0xStrategy',
        methodId: '0x77777777',
        functionName: 'harvestFor(address,tuple,tuple,address[])',
        isSickleRelated: true,
      });
      expect(category).toBe('harvest');
    });

    it('categorizes compoundFor as compound', () => {
      const category = categorizeTransaction({
        from: '0xAutomation',
        to: '0xStrategy',
        methodId: '0x88888888',
        functionName: 'compoundFor(address,tuple,address[])',
        isSickleRelated: true,
      });
      expect(category).toBe('compound');
    });
  });

  describe('when transaction is not Sickle-related', () => {
    it('categorizes plain ETH transfer as transfer_out', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xRecipient',
        methodId: '0x',
        functionName: '',
        isSickleRelated: false,
      });
      expect(category).toBe('transfer_out');
    });

    it('categorizes empty methodId as transfer_out', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xRecipient',
        methodId: '',
        functionName: '',
        isSickleRelated: false,
      });
      expect(category).toBe('transfer_out');
    });

    it('categorizes approve as approval', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xToken',
        methodId: '0x095ea7b3',
        functionName: 'approve(address,uint256)',
        isSickleRelated: false,
      });
      expect(category).toBe('approval');
    });

    it('categorizes swap calls as swap', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xRouter',
        methodId: '0x38ed1739',
        functionName: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
        isSickleRelated: false,
      });
      expect(category).toBe('swap');
    });

    it('categorizes unknown function as unknown', () => {
      const category = categorizeTransaction({
        from: '0xUser',
        to: '0xContract',
        methodId: '0x99999999',
        functionName: 'someRandomFunction(uint256)',
        isSickleRelated: false,
      });
      expect(category).toBe('unknown');
    });
  });
});

describe('decodeSickleStrategyInput', () => {
  it('golden: Base EOA → AerodromeStrategyV2 increase (real tx input)', () => {
    // Chain: Base. Tx: 0x16de740e023400b6cfd4e1307da4b094801cefba49ce6eccb7bc63bc06a7193c
    // To: SICKLE_CONTRACTS.aerodromeStrategyV2 — selector 0x10404af4
    const input = readFileSync(
      join(__dirname, 'fixtures/aerodrome-v2-increase.input.txt'),
      'utf8',
    ).trim();
    const d = decodeSickleStrategyInput({ methodId: '0x10404af4', input });
    expect(d.strategyKind).toBe('farm');
    expect(d.poolAddress).toBe('0x827922686190790b37229fd06084350e74485b72');
    expect(d.lpToken).toBe('0x827922686190790b37229fd06084350e74485b72');
    expect(d.token0).toBe('0x940181a94a35a4569e4529a3cdfb74e38fd98631');
    expect(d.token1).toBe('0x526728dbc96689597f85ae4cd716d4f7fccbae9d');
    expect(d.amount0).toBe('8645068573504841153');
    expect(d.amount1).toBeUndefined();
    expect(d.nftTokenId).toBeUndefined();
  });

  it('synthetic: Farm V2 deposit (0x25fdd6ce) — lpToken + tokens + amounts', () => {
    const input = encodeFunctionData({
      abi: farmV2Abi,
      functionName: 'deposit',
      args: [
        {
          stakingContractAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          tokensIn: ['0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
          amountsIn: [1000n],
          zapData: {
            swaps: [],
            addLiquidityData: {
              router: '0xcccccccccccccccccccccccccccccccccccccccc',
              lpToken: '0xdddddddddddddddddddddddddddddddddddddddd',
              tokens: [
                '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
                '0xffffffffffffffffffffffffffffffffffffffff',
              ],
              desiredAmounts: [11n, 22n],
              minAmounts: [1n, 2n],
              extraData: '0x',
            },
          },
          extraData: '0x',
        },
        [],
        '0x1111111111111111111111111111111111111111',
        '0x' + '00'.repeat(32),
      ],
    });
    const d = decodeSickleStrategyInput({ methodId: '0x25fdd6ce', input });
    expect(d.strategyKind).toBe('farm');
    expect(d.poolAddress).toBe('0xdddddddddddddddddddddddddddddddddddddddd');
    expect(d.token0).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(d.token1).toBe('0xffffffffffffffffffffffffffffffffffffffff');
    expect(d.amount0).toBe('11');
    expect(d.amount1).toBe('22');
  });

  it('synthetic: Slipstream increase — pool from lpToken; NPM tokenId not in this ABI', () => {
    const input = encodeFunctionData({
      abi: slipstreamAbi,
      functionName: 'increase',
      args: [
        {
          stakingContractAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          swaps: [],
          extraData: '0x',
          tokensOut: [],
        },
        {
          stakingContractAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          tokensIn: [],
          amountsIn: [],
          zapData: {
            swaps: [],
            addLiquidityData: {
              router: '0xcccccccccccccccccccccccccccccccccccccccc',
              lpToken: '0xdddddddddddddddddddddddddddddddddddddddd',
              tokens: [
                '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
                '0xffffffffffffffffffffffffffffffffffffffff',
              ],
              desiredAmounts: [33n, 44n],
              minAmounts: [0n, 0n],
              extraData: '0x',
            },
          },
          extraData: '0x',
        },
        [],
      ],
    });
    const d = decodeSickleStrategyInput({ methodId: '0x82321064', input });
    expect(d.strategyKind).toBe('slipstream');
    expect(d.poolAddress).toBe('0xdddddddddddddddddddddddddddddddddddddddd');
    expect(d.token0).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(d.token1).toBe('0xffffffffffffffffffffffffffffffffffffffff');
    expect(d.amount0).toBe('33');
    expect(d.amount1).toBe('44');
    expect(d.nftTokenId).toBeUndefined();
  });

  it('synthetic: Slipstream decrease — pool from first tuple address (no tokenId in layout)', () => {
    const input = readFileSync(
      join(__dirname, 'fixtures/slipstream-decrease.synthetic.txt'),
      'utf8',
    ).trim();
    const d = decodeSickleStrategyInput({ methodId: '0xd0f7a861', input });
    expect(d.strategyKind).toBe('slipstream');
    expect(d.poolAddress).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(d.nftTokenId).toBeUndefined();
  });

  it('synthetic: NftFarmStrategy withdraw — tokenId in NftPosition', () => {
    const input = encodeFunctionData({
      abi: nftFarmWithdrawAbi,
      functionName: 'withdraw',
      args: [
        {
          farm: {
            stakingContract: '0x1111111111111111111111111111111111111111',
            poolIndex: 2n,
          },
          nft: '0x2222222222222222222222222222222222222222',
          tokenId: 987654321n,
        },
        {
          zap: {
            removeLiquidityParams: {
              nft: '0x3333333333333333333333333333333333333333',
              tokenId: 1n,
              liquidity: 0n,
              amount0Min: 0n,
              amount1Min: 0n,
              amount0Max: 0n,
              amount1Max: 0n,
              extraData: '0x',
            },
            swaps: [],
          },
          tokensOut: [],
          extraData: '0x',
        },
        [],
      ],
    });
    const d = decodeSickleStrategyInput({ methodId: '0x107acebd', input });
    expect(d.strategyKind).toBe('nft_farm');
    expect(d.nftTokenId).toBe('987654321');
  });

  it('synthetic: NftFarmStrategy increase — position tokenId + pool token0/token1', () => {
    const input = encodeFunctionData({
      abi: nftFarmIncreaseAbi,
      functionName: 'increase',
      args: [
        {
          farm: { stakingContract: '0x1111111111111111111111111111111111111111', poolIndex: 0n },
          nft: '0x2222222222222222222222222222222222222222',
          tokenId: 424242n,
        },
        {
          harvest: { rewardTokens: [], amount0Max: 0n, amount1Max: 0n, extraData: '0x' },
          swaps: [],
          outputTokens: [],
          sweepTokens: [],
        },
        {
          tokensIn: [],
          amountsIn: [],
          zap: {
            swaps: [],
            addLiquidityParams: {
              nft: '0x3333333333333333333333333333333333333333',
              tokenId: 0n,
              pool: {
                token0: '0x4444444444444444444444444444444444444444',
                token1: '0x5555555555555555555555555555555555555555',
                fee: 3000,
              },
              tickLower: 0,
              tickUpper: 0,
              amount0Desired: 0n,
              amount1Desired: 0n,
              amount0Min: 0n,
              amount1Min: 0n,
              extraData: '0x',
            },
          },
          extraData: '0x',
        },
        true,
        [],
      ],
    });
    const d = decodeSickleStrategyInput({ methodId: '0xe5bacdd0', input });
    expect(d.strategyKind).toBe('nft_farm');
    expect(d.nftTokenId).toBe('424242');
    expect(d.token0).toBe('0x4444444444444444444444444444444444444444');
    expect(d.token1).toBe('0x5555555555555555555555555555555555555555');
  });

  it('invalid / short calldata is non-throwing unknown', () => {
    expect(decodeSickleStrategyInput({ methodId: '0x', input: '0x' }).strategyKind).toBe('unknown');
    expect(decodeSickleStrategyInput({ methodId: '0xdeadbeef', input: '0xdeadbeef' }).strategyKind).toBe(
      'unknown',
    );
    expect(
      decodeSickleStrategyInput({ methodId: '0x10404af4', input: '0x10404af400' }).strategyKind,
    ).toBe('unknown');
  });
});
