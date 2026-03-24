import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discoverSickleWallet } from '../../src/indexer/discovery.js';
import { createPublicClient, http } from 'viem';
import { CHAINS } from '../../src/config.js';

// Mock viem's public client
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createPublicClient: vi.fn(),
    http: vi.fn(),
  };
});

describe('Sickle Wallet Discovery', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      readContract: vi.fn(),
    };
    (createPublicClient as any).mockReturnValue(mockClient);
  });

  describe('when a Sickle wallet exists for the given EOA', () => {
    it('returns the Sickle wallet address', async () => {
      const mockSickleAddress = '0x1111111111111111111111111111111111111111';
      mockClient.readContract.mockResolvedValue(mockSickleAddress);

      const address = await discoverSickleWallet(CHAINS[8453], '0xUserAddress');
      
      expect(address).toBe(mockSickleAddress);
      expect(mockClient.readContract).toHaveBeenCalledWith({
        address: CHAINS[8453].sickleFactory,
        abi: expect.any(Array),
        functionName: 'sickles',
        args: ['0xUserAddress'], // The EOA address
      });
    });
  });

  describe('when no Sickle wallet exists for the given EOA', () => {
    it('returns null if the factory returns zero address', async () => {
      // The zero address indicates no sickle wallet has been deployed for this user
      const zeroAddress = '0x0000000000000000000000000000000000000000';
      mockClient.readContract.mockResolvedValue(zeroAddress);

      const address = await discoverSickleWallet(CHAINS[8453], '0xUserAddress');
      
      expect(address).toBeNull();
    });

    it('returns null if the factory call reverts or errors', async () => {
      mockClient.readContract.mockRejectedValue(new Error('Contract reverted'));

      const address = await discoverSickleWallet(CHAINS[8453], '0xUserAddress');
      
      expect(address).toBeNull();
    });
  });
});
