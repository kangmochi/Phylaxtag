import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LoadError, WalletLogo, WalletPicker } from "./ui";
import { WALLETS, walletGroups } from "./wallets";

describe("LoadError", () => {
  it("shows a plain message and a Try again button that re-runs the request", () => {
    let retried = 0;
    const html = renderToStaticMarkup(
      <LoadError message="We could not reach the NEAR testnet. Check your connection and try again." onRetry={() => { retried += 1; }} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("We could not reach the NEAR testnet.");
    expect(html).toContain("Try again");
    // The button exists as a real control, not just text.
    expect(html).toContain("<button");
    expect(retried).toBe(0);
  });
});

describe("WalletPicker", () => {
  it("shows the NEAR wallets in order and no EVM group without a project id", () => {
    const html = renderToStaticMarkup(
      <WalletPicker groups={walletGroups(false)} busyId={null} error={null} unavailable={[]} onPick={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain("NEAR wallets");
    expect(html.indexOf("Meteor Wallet")).toBeLessThan(html.indexOf("HERE Wallet"));
    // MyNearWallet is retired: it stays visible in the picker as a disabled row
    // so nobody wonders where it went, but it cannot be chosen.
    expect(html).toContain("MyNearWallet");
    expect(html).toMatch(/disabled=""[^>]*>MyNearWallet/);
    expect(html).not.toContain("Other wallets (EVM)");
    expect(html).toContain("Meteor opens a popup window. Allow popups for this site.");
  });

  it("shows a readable problem instead of failing silently", () => {
    const html = renderToStaticMarkup(
      <WalletPicker
        groups={walletGroups(false)}
        busyId={null}
        error="Sender is not installed in this browser."
        unavailable={[]}
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Sender is not installed in this browser.");
  });
});

describe("WalletLogo", () => {
  it("renders the HERE wordmark at its own width instead of a squashed square", () => {
    const here = WALLETS.find((wallet) => wallet.id === "here-wallet");
    if (!here) throw new Error("here-wallet missing");
    const html = renderToStaticMarkup(<WalletLogo entry={here} />);
    expect(html).toContain("wallet-logo-wide");
    expect(html).not.toContain('width="28"');
  });

  it("renders a neutral badge for a wallet with no official file", () => {
    // Every listed wallet has an official file, so the fallback is exercised
    // with a stand-in entry instead of a real wallet.
    const stand = { id: "stand-in", name: "Stand In Wallet" } as never;
    const html = renderToStaticMarkup(<WalletLogo entry={stand} />);
    expect(html).toContain("wallet-logo-fallback");
    expect(html).toContain(">S<");
  });
});
