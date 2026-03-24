import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { encodeFunctionData } from 'viem';
import { enrichTransaction } from '../../src/indexer/enricher.js';
import { SICKLE_CONTRACTS } from '../../src/config.js';
import type { ExplorerTx } from '../../src/types.js';

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

function baseExplorerTx(overrides: Partial<ExplorerTx> = {}): ExplorerTx {
  return {
    hash: '0x' + 'ab'.repeat(32),
    blockNumber: '12345',
    timeStamp: '1700000000',
    from: '0x0000000000000000000000000000000000000000',
    to: SICKLE_CONTRACTS.aerodromeStrategyV2,
    value: '0',
    gas: '21000',
    gasUsed: '500000',
    gasPrice: '1000000000',
    input: '0x',
    isError: '0',
    methodId: '0x',
    functionName: '',
    contractAddress: '',
    ...overrides,
  };
}

describe('enrichTransaction', () => {
  it('maps Sickle strategy tx with real calldata to poolAddress, tokens, amounts, protocol via KNOWN_POOLS', async () => {
    const input = readFileSync(
      join(__dirname, 'fixtures/aerodrome-v2-increase.input.txt'),
      'utf8',
    ).trim();

    const gas = {
      calculateGasCostUsd: vi.fn().mockResolvedValue(2.5),
    };

    const out = await enrichTransaction(
      baseExplorerTx({
        input,
        methodId: '0x10404af4',
        to: SICKLE_CONTRACTS.aerodromeStrategyV2,
      }),
      1,
      8453,
      null,
      gas,
    );

    expect(out.poolAddress).toBe('0x827922686190790b37229fd06084350e74485b72');
    expect(out.token0).toBe('0x940181a94a35a4569e4529a3cdfb74e38fd98631');
    expect(out.token1).toBe('0x526728dbc96689597f85ae4cd716d4f7fccbae9d');
    expect(out.amount0).toBe('8645068573504841153');
    expect(out.protocol).toBe('Aerodrome Slipstream');
    expect(out.gasCostUsd).toBe(2.5);
    expect(gas.calculateGasCostUsd).toHaveBeenCalledWith(8453, '500000', '1000000000', 1700000000);
  });

  it('sets nftTokenId when decoder provides it (NftFarm withdraw)', async () => {
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

    const out = await enrichTransaction(
      baseExplorerTx({
        input,
        methodId: '0x107acebd',
        to: SICKLE_CONTRACTS.nftFarmStrategy,
      }),
      1,
      8453,
      null,
      { calculateGasCostUsd: vi.fn().mockResolvedValue(0.01) },
    );

    expect(out.nftTokenId).toBe('987654321');
    expect(out.protocol).toBe('nft-farm');
  });

  it('does not throw on failed or non-strategy tx; leaves optional fields unset', async () => {
    const gas = { calculateGasCostUsd: vi.fn().mockResolvedValue(0) };

    const failed = await enrichTransaction(
      baseExplorerTx({ isError: '1', input: '0x10404af4' + '00'.repeat(32) }),
      1,
      8453,
      null,
      gas,
    );
    expect(failed.category).toBe('unknown');
    expect(failed.poolAddress).toBeUndefined();
    expect(failed.gasCostUsd).toBe(0);

    const swap = await enrichTransaction(
      baseExplorerTx({
        to: '0x1111111111111111111111111111111111111111',
        methodId: '0x38ed1739',
        functionName: 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
        input: '0x38ed1739' + '00'.repeat(100),
      }),
      1,
      8453,
      null,
      gas,
    );
    expect(swap.category).toBe('swap');
    expect(swap.poolAddress).toBeUndefined();
    expect(swap.protocol).toBe('');
  });

  it('gasCostUsd stays 0 when price helper rejects or returns non-finite', async () => {
    const out = await enrichTransaction(
      baseExplorerTx({
        input: readFileSync(join(__dirname, 'fixtures/aerodrome-v2-increase.input.txt'), 'utf8').trim(),
        methodId: '0x10404af4',
        to: SICKLE_CONTRACTS.aerodromeStrategyV2,
      }),
      1,
      8453,
      null,
      { calculateGasCostUsd: vi.fn().mockRejectedValue(new Error('network')) },
    );
    expect(out.gasCostUsd).toBe(0);
  });
});
