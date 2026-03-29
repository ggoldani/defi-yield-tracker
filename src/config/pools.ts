export interface TrackedPool {
  id: string;
  chainId: number;
  address: string;
  protocol: string;
  name: string;
  token0: string;
  token0Symbol: string;
  token1: string;
  token1Symbol: string;
}

export const KNOWN_POOLS: TrackedPool[] = [
  {
    id: 'base-slipstream-cbbtc-weth',
    chainId: 8453,
    address: '0x827922686190790b37229fd06084350E74485b72',
    protocol: 'Aerodrome Slipstream',
    name: 'cbBTC/WETH',
    token0: '0x4200000000000000000000000000000000000006',
    token0Symbol: 'WETH',
    token1: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    token1Symbol: 'cbBTC'
  },
  {
    id: 'base-farm-usdz-usdc',
    chainId: 8453,
    address: '0x6d0b9c9e92a3de30081563c3657b5258b3ffa38b',
    protocol: 'Aerodrome Farm V2',
    name: 'USDz/USDC',
    token0: '0x04d5ddf5f3a8939889f11e97f8c4bb48317f1938',
    token0Symbol: 'USDz',
    token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    token1Symbol: 'USDC'
  },
  {
    id: 'base-slipstream-msusd-usdc',
    chainId: 8453,
    address: '0xcefc8b799a8ee5d9b312aeca73262645d664aaf7',
    protocol: 'Aerodrome Slipstream',
    name: 'msUSD/USDC',
    token0: '0x940181a94a35a4569e4529a3cdfb74e38fd98631',
    token0Symbol: 'msUSD',
    token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    token1Symbol: 'USDC'
  }
];
