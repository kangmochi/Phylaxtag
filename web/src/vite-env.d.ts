/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTRACT_ID: string;
  readonly VITE_RPC_FALLBACK_URL?: string;
  readonly VITE_RPC_URL: string;
  readonly VITE_NETWORK_ID: string;
  readonly VITE_TEST_WALLET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
