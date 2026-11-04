import { createTestChain, testWalletEnabled } from "phylaxtag-test-wallet";

import { loadConfig, type AppConfig } from "../config";
import type { Chain } from "./chain";
import { rpcView } from "./rpc";

export function createAppChain(config: AppConfig = loadConfig()): Chain {
  if (testWalletEnabled) {
    return createTestChain(config);
  }
  return lazyNearChain(config);
}

function lazyNearChain(config: AppConfig): Chain {
  let pending: Promise<Chain> | null = null;
  const inner = () => {
    pending ??= import("./near-wallet").then((mod) => mod.createNearChain(config));
    return pending;
  };
  let accountId: string | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  return {
    async ready() {
      const chain = await inner();
      await chain.ready();
      accountId = chain.accountId();
      chain.subscribe(() => {
        accountId = chain.accountId();
        notify();
      });
    },
    accountId: () => accountId,
    async connect() {
      await (await inner()).connect();
    },
    async disconnect() {
      await (await inner()).disconnect();
      accountId = null;
      notify();
    },
    useAccount(id) {
      void inner().then((chain) => chain.useAccount(id));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    view<T>(method: string, args: Record<string, unknown>) {
      return rpcView(config, method, args) as Promise<T>;
    },
    async call(request) {
      return (await inner()).call(request);
    },
  };
}

export { testWalletEnabled };
