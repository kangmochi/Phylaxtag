import { describe, expect, it } from "vitest";

import { WALLETS, groupTitle, selectorIdOf, settleWalletLoaders, usableWalletId, walletGroups, walletProblem, type WalletEntry } from "./wallets";

const evmEntry: WalletEntry = {
  id: "ethereum-wallets",
  name: "EVM wallets",
  group: "evm",
  kind: "extension",
  testnetAccount: "not verified",
  status: "not verified",
  how: "Connect an EVM wallet and the dapp maps it to a NEAR account.",
};

describe("wallet list", () => {
  it("lists the NEAR wallets first and keeps the configured order", () => {
    const groups = walletGroups(false);
    expect(groups).toHaveLength(1);
    const offered = WALLETS.filter((wallet) => !wallet.retired && wallet.group === "near").map((wallet) => wallet.id);
    expect(groups[0].map((wallet) => wallet.id)).toEqual(offered);
    expect(groups[0][0].id).toBe("meteor-wallet");
    expect(groups[0][1].id).toBe("here-wallet");
  });

  it("hides the EVM group when no WalletConnect project id is configured", () => {
    expect(walletGroups(false, [...WALLETS, evmEntry])).toHaveLength(1);
  });

  it("shows the EVM group after the NEAR wallets when it is enabled", () => {
    const groups = walletGroups(true);
    expect(groups).toHaveLength(2);
    expect(groupTitle(groups[0])).toBe("NEAR wallets");
    expect(groupTitle(groups[1])).toBe("Other wallets (EVM)");
    // One honest entry: the browser decides which extension owns window.ethereum.
    expect(groups[1][0].id).toBe("evm-injected");
    expect(groups[1]).toHaveLength(1);
    expect(selectorIdOf(groups[1][0])).toBe("ethereum-wallets");
  });

  it("never advertises a wallet as verified without a real sign-in", () => {
    const claimed = WALLETS.filter((wallet) => wallet.status === "verified");
    expect(claimed).toEqual([]);
  });

  it("keeps the EVM group out of the picker when the project id is missing", () => {
    const groups = walletGroups(false);
    expect(groups.flat().every((wallet) => wallet.group === "near")).toBe(true);
  });

  it("routes every offered EVM entry through the one EVM selector module", () => {
    const evm = WALLETS.filter((wallet) => wallet.group === "evm" && !wallet.tableOnly);
    expect(evm.length).toBeGreaterThan(0);
    expect(new Set(evm.map((wallet) => selectorIdOf(wallet)))).toEqual(new Set(["ethereum-wallets"]));
  });

  it("keeps wallets reached through the Other wallet entry in the table only", () => {
    const offered = walletGroups(true).flat().map((wallet) => wallet.id);
    expect(offered).toContain("evm-injected");
    expect(offered).not.toContain("evm-metamask");
    expect(offered).not.toContain("evm-walletconnect");
    expect(WALLETS.some((wallet) => wallet.id === "evm-metamask" && wallet.tableOnly)).toBe(true);
  });

  it("never offers a retired wallet in the picker but keeps it in the table", () => {
    const picker = walletGroups(false).flat().map((wallet) => wallet.id);
    expect(picker).not.toContain("my-near-wallet");
    const retired = WALLETS.find((wallet) => wallet.id === "my-near-wallet");
    expect(retired?.retired).toBe(true);
    expect(retired?.how).toContain("Retired");
  });

  it("ignores a remembered wallet that is retired or unknown", () => {
    expect(usableWalletId("my-near-wallet")).toBeNull();
    expect(usableWalletId("no-such-wallet")).toBeNull();
    expect(usableWalletId(null)).toBeNull();
    expect(usableWalletId("meteor-wallet")).toBe("meteor-wallet");
  });

  it("keeps every wallet ids unique", () => {
    const ids = WALLETS.map((wallet) => wallet.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("wallet loading", () => {
  it("drops only the wallet whose chunk failed", async () => {
    const { items, failed } = await settleWalletLoaders<number>([
      ["meteor-wallet", async () => 1],
      ["here-wallet", async () => {
        throw new Error("chunk failed");
      }],
      ["sender", async () => 3],
    ]);
    expect(items.map((item) => [item.id, item.value])).toEqual([
      ["meteor-wallet", 1],
      ["sender", 3],
    ]);
    expect(failed).toEqual(["here-wallet"]);
  });
});

describe("wallet problems", () => {
  it("explains a wallet whose chunk could not be loaded", () => {
    expect(walletProblem("HERE Wallet", "WalletUnavailable:here-wallet")).toContain("could not be loaded");
  });

  it("explains a wallet that is not installed", () => {
    expect(walletProblem("Sender", "Injected wallet not installed")).toContain("is not installed in this browser");
  });

  it("explains a blocked popup", () => {
    expect(walletProblem("Meteor Wallet", "popup blocked")).toContain("needs a popup window");
  });

  it("falls back to a plain retry line", () => {
    expect(walletProblem("HERE Wallet", "user rejected the request")).toContain("did not finish signing in");
  });
});
