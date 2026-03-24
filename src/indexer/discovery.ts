import { createPublicClient, http, type Address } from 'viem';
import type { ChainConfig, TrackedAddress } from '../types.js';
import { log } from '../utils/logger.js';

const SICKLE_FACTORY_ABI = [
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'sickles',
    outputs: [{ internalType: 'contract Sickle', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Discovers if an EOA has a registered Sickle wallet on a specific chain
 * by reading the `sickles[address]` mapping on the SickleFactory contract.
 */
export async function discoverSickleWallet(chain: ChainConfig, eoaAddress: string): Promise<string | null> {
  try {
    const client = createPublicClient({
      chain: {
        id: chain.id,
        name: chain.name,
        network: chain.name.toLowerCase(),
        nativeCurrency: { name: chain.currency, symbol: chain.currency, decimals: 18 },
        rpcUrls: { default: { http: [chain.rpcUrl] }, public: { http: [chain.rpcUrl] } },
      },
      transport: http(chain.rpcUrl),
    });

    const sickleAddress = await client.readContract({
      address: chain.sickleFactory as Address,
      abi: SICKLE_FACTORY_ABI,
      functionName: 'sickles',
      args: [eoaAddress as Address],
    });

    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    if (sickleAddress && sickleAddress !== ZERO_ADDRESS) {
      log.debug(`Discovered Sickle wallet for ${eoaAddress} on ${chain.name}: ${sickleAddress}`);
      return sickleAddress;
    }

    return null;
  } catch (err) {
    if (err instanceof Error) {
      log.warn(`Failed to discover Sickle wallet on ${chain.name}: ${err.message}`);
    }
    return null;
  }
}
