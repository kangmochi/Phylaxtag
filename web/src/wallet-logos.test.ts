import { describe, expect, it } from "vitest";

import { WALLETS } from "./wallets";
import { WALLET_LOGOS, walletInitial, walletLogo } from "./wallet-logos";

describe("wallet logos", () => {
  it("has a bundled file or a neutral fallback for every wallet, never neither", () => {
    for (const wallet of WALLETS) {
      const logo = walletLogo(wallet.id);
      const initial = walletInitial(wallet);
      expect(Boolean(logo) || initial.length === 1).toBe(true);
    }
  });

  it("points every bundled logo at a local asset path, never a remote URL", () => {
    for (const [id, src] of Object.entries(WALLET_LOGOS)) {
      expect(id.length).toBeGreaterThan(0);
      // Vite may inline a small file as a data: URL; nothing may point at a host.
      expect(src.startsWith("http")).toBe(false);
    }
  });

  it("does not invent logos for wallets without an official file", () => {
    expect(walletLogo("stand-in")).toBeNull();
    expect(walletInitial({ id: "stand-in", name: "Stand In Wallet" } as never)).toBe("S");
    // Meteor and MyNearWallet ship their own file now.
    expect(walletLogo("meteor-wallet")).not.toBeNull();
    expect(walletLogo("my-near-wallet")).not.toBeNull();
  });
});
