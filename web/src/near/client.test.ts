import { describe, expect, it } from "vitest";

import type { AppConfig } from "../config";
import type { Chain } from "./chain";
import { lazyNearChain } from "./client";

const config: AppConfig = {
  contractId: "phylaxtag.testnet",
  rpcUrl: "https://rpc.testnet.near.org",
  rpcFallbackUrl: "https://rpc.testnet.near.org",
  networkId: "testnet",
  explorerTxUrl: (hash: string) => `https://explorer.testnet.near.org/transactions/${hash}`,
};

function fakeChain(records: string[]): Chain {
  return {
    async ready() {
      return undefined;
    },
    accountId: () => null,
    async connect() {
      records.push("connect");
    },
    async connectWith(walletId: string) {
      records.push(`connectWith:${walletId}`);
    },
    unavailableWallets: () => ["ledger"],
    async disconnect() {
      records.push("disconnect");
    },
    useAccount() {
      return undefined;
    },
    subscribe() {
      return () => undefined;
    },
    async view<T>() {
      return {} as T;
    },
    async call() {
      return { hash: "", returnValue: null };
    },
  };
}

describe("lazyNearChain", () => {
  it("forwards connectWith with the wallet the user picked", async () => {
    const records: string[] = [];
    const chain = lazyNearChain(config, async () => fakeChain(records));
    await chain.connectWith?.("meteor-wallet");
    expect(records).toEqual(["connectWith:meteor-wallet"]);
    expect(records).not.toContain("connect");
  });

  it("reports the wallets whose chunk failed", async () => {
    const chain = lazyNearChain(config, async () => fakeChain([]));
    await chain.connectWith?.("sender");
    expect(chain.unavailableWallets?.()).toEqual(["ledger"]);
  });
});
