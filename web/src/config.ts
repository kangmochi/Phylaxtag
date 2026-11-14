export interface AppConfig {
  contractId: string;
  /**
   * Practice contract behind `/try`, where a visitor may mint a tag without
   * being on the issuer allowlist. Empty when the deployment has none.
   */
  practiceContractId: string;
  rpcUrl: string;
  /** Optional second node, tried once when the first one fails. */
  rpcFallbackUrl?: string;
  networkId: "testnet";
  explorerTxUrl: (hash: string) => string;
}

export function loadConfig(): AppConfig {
  const testBuild = import.meta.env.VITE_TEST_WALLET === "1";
  const contractId = import.meta.env.VITE_CONTRACT_ID?.trim() || (testBuild ? "phylaxtag.testnet" : "");
  const rpcUrl = import.meta.env.VITE_RPC_URL?.trim() || (testBuild ? "https://rpc.testnet.near.org" : "");
  const rpcFallbackUrl = import.meta.env.VITE_RPC_FALLBACK_URL?.trim() || "https://rpc.testnet.fastnear.com";
  const practiceContractId = import.meta.env.VITE_PRACTICE_CONTRACT_ID?.trim() || "";
  const networkId = import.meta.env.VITE_NETWORK_ID?.trim() || (testBuild ? "testnet" : "");
  if (networkId !== "testnet") {
    throw new Error("This demo is NEAR testnet only. Set VITE_NETWORK_ID=testnet.");
  }
  if (!contractId || !rpcUrl) {
    throw new Error("Set VITE_CONTRACT_ID and VITE_RPC_URL. See web/.env.example.");
  }
  return {
    contractId,
    practiceContractId,
    rpcUrl,
    rpcFallbackUrl,
    networkId: "testnet",
    explorerTxUrl: (hash) => `https://testnet.nearblocks.io/txns/${hash}`,
  };
}
