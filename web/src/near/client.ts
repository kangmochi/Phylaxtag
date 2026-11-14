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

export function lazyNearChain(
  config: AppConfig,
  load: () => Promise<Chain> = () => import("./near-wallet").then((mod) => mod.createNearChain(config)),
): Chain {
  let pending: Promise<Chain> | null = null;
  const inner = () => {
    pending ??= load();
    return pending;
  };
  let accountId: string | null = null;
  let unavailable: string[] = [];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  return {
    async ready() {
      const chain = await inner();
      await chain.ready();
      unavailable = chain.unavailableWallets?.() ?? [];
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
    async connectWith(walletId: string) {
      const chain = await inner();
      await chain.connectWith?.(walletId);
      unavailable = chain.unavailableWallets?.() ?? [];
    },
    unavailableWallets() {
      return unavailable;
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
    viewOn<T>(contractId: string, method: string, args: Record<string, unknown>) {
      return rpcView(config, method, args, contractId) as Promise<T>;
    },
    async call(request) {
      return (await inner()).call(request);
    },
    async callOn(contractId, request) {
      const chain = await inner();
      if (chain.callOn) {
        return chain.callOn(contractId, request);
      }
      return chain.call(request);
    },
  };
}

export { testWalletEnabled };
