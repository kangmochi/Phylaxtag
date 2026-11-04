export interface AppConfig {
  contractId: string;
  rpcUrl: string;
  networkId: "testnet";
  explorerTxUrl: (hash: string) => string;
}

export function loadConfig(): AppConfig {
  const testBuild = import.meta.env.VITE_TEST_WALLET === "1";
  const contractId = import.meta.env.VITE_CONTRACT_ID?.trim() || (testBuild ? "phylaxtag.testnet" : "");
  const rpcUrl = import.meta.env.VITE_RPC_URL?.trim() || (testBuild ? "https://rpc.testnet.near.org" : "");
  const networkId = import.meta.env.VITE_NETWORK_ID?.trim() || (testBuild ? "testnet" : "");
  if (networkId !== "testnet") {
    throw new Error("This demo is NEAR testnet only. Set VITE_NETWORK_ID=testnet.");
  }
  if (!contractId || !rpcUrl) {
    throw new Error("Set VITE_CONTRACT_ID and VITE_RPC_URL. See web/.env.example.");
  }
  return {
    contractId,
    rpcUrl,
    networkId: "testnet",
    explorerTxUrl: (hash) => `https://testnet.nearblocks.io/txns/${hash}`,
  };
}
