export const TRC20_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
  },
];

export interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
  name?: string;
}

export const POPULAR_TOKENS: TokenInfo[] = [
  { symbol: 'USDT', address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6, name: 'Tether USD' },
  { symbol: 'USDC', address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8', decimals: 6, name: 'USD Coin' },
  { symbol: 'BTT',  address: 'TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4', decimals: 18, name: 'BitTorrent' },
];

/** Convert decimal string amount to smallest on-chain unit without floating-point loss */
export function toSmallestUnit(amount: string, decimals: number): string {
  const [intStr, fracStr = ''] = amount.split('.');
  const padded = (fracStr + '0'.repeat(decimals)).slice(0, decimals);
  return (BigInt(intStr) * BigInt(10 ** decimals) + BigInt(padded || '0')).toString();
}

/** Format smallest-unit BigInt or string to human-readable */
export function formatAmount(raw: bigint | string, decimals: number): string {
  const n = BigInt(raw.toString());
  const d = BigInt(10 ** decimals);
  const int = n / d;
  const frac = n % d;
  if (frac === 0n) return int.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${int}.${fracStr}`;
}
