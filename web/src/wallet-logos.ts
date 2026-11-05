/**
 * Local logo files, bundled by Vite. No remote images: every file in
 * assets/wallets is copied from the wallet's own site or press material and
 * listed with its source in assets/wallets/SOURCES.md.
 *
 * Wallets without a clearly usable official file use the neutral initial badge
 * instead; nothing here is drawn to look like a brand.
 */
import hereWallet from "./assets/wallets/here-wallet.svg";
import intearWallet from "./assets/wallets/intear-wallet.svg";
import ledger from "./assets/wallets/ledger.png";
import metamask from "./assets/wallets/metamask.svg";
import nightly from "./assets/wallets/nightly.png";
import sender from "./assets/wallets/sender.png";
import type { WalletEntry } from "./wallets";

export const WALLET_LOGOS: Readonly<Record<string, string>> = {
  "here-wallet": hereWallet,
  "intear-wallet": intearWallet,
  ledger,
  "evm-metamask": metamask,
  nightly,
  sender,
};

export function walletLogo(id: string): string | null {
  return WALLET_LOGOS[id] ?? null;
}

/**
 * Some official files are wordmarks, not square icons. They are shown at the
 * same 28 px height with their own width instead of being squashed into a
 * square, which would make the name unreadable.
 */
export const WIDE_LOGOS: ReadonlySet<string> = new Set(["here-wallet"]);

export function isWideLogo(id: string): boolean {
  return WIDE_LOGOS.has(id);
}

/** First letter of a wallet name, for the neutral fallback badge. */
export function walletInitial(entry: WalletEntry): string {
  return entry.name.trim().slice(0, 1).toUpperCase();
}
