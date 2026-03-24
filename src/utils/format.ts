import { formatUnits, isAddress, type Address } from 'viem';

export function shortenAddress(addr: string, chars = 4): string {
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  if (!value || isNaN(value)) return '0.00%';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatTokenAmount(wei: string, decimals = 18): string {
  return parseFloat(formatUnits(BigInt(wei), decimals)).toFixed(6);
}

export function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Validates a string as a valid EVM address.
 * Security: always validate user input before using as Address.
 */
export function validateAddress(input: string): Address {
  if (!isAddress(input)) {
    throw new Error(`Invalid EVM address: ${input}`);
  }
  return input as Address;
}
