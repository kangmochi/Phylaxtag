import type { AppConfig } from "../config";
import type { Chain } from "../near/chain";

export const testWalletEnabled = false;
export const TEST_ACCOUNTS: readonly string[] = [];

export function createTestChain(_config: AppConfig): Chain {
  throw new Error("The test wallet is not included in this build.");
}
