declare module "phylaxtag-test-wallet" {
  import type { AppConfig } from "./config";
  import type { Chain } from "./near/chain";

  export const testWalletEnabled: boolean;
  export const TEST_ACCOUNTS: readonly string[];
  export function createTestChain(config: AppConfig): Chain;
}
