import { BinanceWalletAdapter } from '@tronweb3/tronwallet-adapter-binance';
import { WalletConnectAdapter } from '@tronweb3/tronwallet-adapter-walletconnect';

export const binanceAdapter = new BinanceWalletAdapter({
  useWalletConnectWhenWalletNotFound: true,
  walletConnectConfig: {
    network: 'Mainnet',
    options: {
      projectId: import.meta.env.VITE_WC_PROJECT_ID || '',
      metadata: {
        name: 'TRON DApp',
        description: 'Send and receive TRX & TRC-20 tokens via Binance Wallet',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://localhost:5173',
        icons: [],
      },
    },
  },
});

export const wcAdapter = new WalletConnectAdapter({
  network: 'Mainnet',
  options: {
    projectId: import.meta.env.VITE_WC_PROJECT_ID || '',
    metadata: {
      name: 'TRON DApp',
      description: 'Connect your TronLink wallet',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://localhost:5173',
      icons: [],
    },
  },
  includeWalletIds: [
    '225affb176778569276e484e1b92637ad061b01e13a048b35a9d280c3b58970', // TronLink
  ],
});
