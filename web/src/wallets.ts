/**
 * One list of wallets, in the order a normal user should see them.
 *
 * The ids are the module ids from @near-wallet-selector, so a click can ask the
 * selector for that wallet directly. Nothing here holds a key or a network
 * setting: the selector is created for testnet in near-wallet.ts.
 */

export type WalletGroup = "near" | "evm";
export type WalletKind = "redirect" | "popup" | "extension" | "web" | "mobile" | "hardware";
export type TestnetAccount = "yes" | "import only" | "no" | "not verified";
export type WalletStatus = "verified" | "not verified" | "untested";

export interface WalletEntry {
  id: string;
  name: string;
  group: WalletGroup;
  kind: WalletKind;
  /** Can the wallet create or import a testnet account inside the wallet itself? */
  testnetAccount: TestnetAccount;
  status: WalletStatus;
  /** One short line for the picker and the table. */
  how: string;
  /** Retired wallets stay in the table but are never offered in the picker. */
  retired?: boolean;
  /** Kept in the supported-wallets table only, e.g. a wallet reached through another entry. */
  tableOnly?: boolean;
  /** Shown in the picker only, not as a row of its own in the supported-wallets table. */
  pickerOnly?: boolean;
  /** Selector module that handles the click; defaults to `id`. */
  selectorId?: string;
}

/** Shown under the wallet list: the Meteor module falls back to a popup. */
export const METEOR_HINT = "Meteor opens a popup window. Allow popups for this site.";

/** NEAR wallets first, ordered by how likely a normal user already has one. */
export const WALLETS: readonly WalletEntry[] = [
  {
    id: "meteor-wallet",
    name: "Meteor Wallet",
    group: "near",
    kind: "popup",
    testnetAccount: "yes",
    status: "not verified",
    how: "Uses the Meteor extension when it is installed, otherwise it needs a popup.",
  },
  {
    id: "here-wallet",
    name: "HERE Wallet",
    group: "near",
    kind: "popup",
    testnetAccount: "not verified",
    status: "not verified",
    how: "Opens a HERE window to approve the sign-in, then returns to this page.",
  },
  {
    id: "sender",
    name: "Sender",
    group: "near",
    kind: "extension",
    testnetAccount: "not verified",
    status: "not verified",
    how: "Needs the Sender browser extension; it signs without leaving the page.",
  },
  {
    id: "nightly",
    name: "Nightly",
    group: "near",
    kind: "extension",
    testnetAccount: "not verified",
    status: "not verified",
    how: "Needs the Nightly extension or app; pick Testnet inside the wallet.",
  },
  {
    id: "bitte-wallet",
    name: "Bitte Wallet",
    group: "near",
    kind: "popup",
    testnetAccount: "not verified",
    status: "not verified",
    how: "Opens a Bitte window for the sign-in and returns to this page.",
  },
  {
    id: "intear-wallet",
    name: "Intear Wallet",
    group: "near",
    kind: "web",
    testnetAccount: "not verified",
    status: "not verified",
    how: "Web wallet at wallet.intear.tech; it can import a seed phrase or a key.",
  },
  {
    id: "my-near-wallet",
    name: "MyNearWallet",
    group: "near",
    kind: "redirect",
    testnetAccount: "import only",
    status: "untested",
    retired: true,
    how: "Retired - no longer accepts new app connections. Move the account to Meteor Wallet.",
  },
  {
    id: "ledger",
    name: "Ledger",
    group: "near",
    kind: "hardware",
    testnetAccount: "not verified",
    status: "not verified",
    how: "Needs a Ledger device with the NEAR app open and unlocked.",
  },
  {
    id: "evm-injected",
    selectorId: "ethereum-wallets",
    name: "Other wallet",
    pickerOnly: true,
    group: "evm",
    kind: "extension",
    testnetAccount: "not verified",
    status: "not verified",
    how: "Uses the wallet installed in this browser: MetaMask, Coinbase Wallet, Phantom, Rabby, Zerion or OKX.",
  },
  {
    id: "evm-metamask",
    name: "MetaMask",
    group: "evm",
    kind: "extension",
    testnetAccount: "not verified",
    status: "not verified",
    how: "Reached through the Other wallet entry. The NEAR account is the 0x address.",
    tableOnly: true,
  },
  {
    id: "evm-coinbase",
    name: "Coinbase Wallet",
    group: "evm",
    kind: "extension",
    testnetAccount: "not verified",
    status: "not verified",
    how: "Reached through the Other wallet entry. The NEAR account is the 0x address.",
    tableOnly: true,
  },
  {
    id: "evm-walletconnect",
    name: "WalletConnect (QR)",
    group: "evm",
    kind: "popup",
    testnetAccount: "not verified",
    status: "not verified",
    how: "Not offered yet: the QR modal is not wired into this build, so only installed browser wallets connect.",
    tableOnly: true,
  },
];

/**
 * The picker shows NEAR wallets, then the EVM group only when the build has a
 * WalletConnect project id. Without one the EVM module cannot open a session,
 * so the group is hidden instead of failing.
 */
export function walletGroups(evmEnabled: boolean, wallets: readonly WalletEntry[] = WALLETS): WalletEntry[][] {
  const usable = wallets.filter((wallet) => !wallet.retired && !wallet.tableOnly);
  const near = usable.filter((wallet) => wallet.group === "near");
  const evm = usable.filter((wallet) => wallet.group === "evm");
  const groups = [near, ...(evmEnabled ? [evm] : [])];
  return groups.filter((group) => group.length > 0);
}

export function groupTitle(group: readonly WalletEntry[]): string {
  return group[0]?.group === "evm" ? "Other wallets (EVM)" : "NEAR wallets";
}

/**
 * Load every wallet on its own: one chunk that fails only removes that wallet.
 * Returned in the input order so the picker keeps its ordering.
 */
export async function settleWalletLoaders<T>(
  loaders: ReadonlyArray<readonly [string, () => Promise<T>]>,
): Promise<{ items: { id: string; value: T }[]; failed: string[] }> {
  const settled = await Promise.allSettled(loaders.map(([, load]) => load()));
  const items: { id: string; value: T }[] = [];
  const failed: string[] = [];
  settled.forEach((result, index) => {
    const id = loaders[index][0];
    if (result.status === "fulfilled") {
      items.push({ id, value: result.value });
    } else {
      failed.push(id);
    }
  });
  return { items, failed };
}

/**
 * The wallet id a click may connect to: the remembered one only when it is
 * still offered, otherwise null so the caller asks the user again.
 */
export function usableWalletId(id: string | null | undefined, wallets: readonly WalletEntry[] = WALLETS): string | null {
  if (!id) {
    return null;
  }
  const entry = wallets.find((wallet) => wallet.id === id);
  return entry && !entry.retired ? entry.id : null;
}

/** The selector module a picker entry opens. */
export function selectorIdOf(entry: WalletEntry): string {
  return entry.selectorId ?? entry.id;
}

/** Plain-English line for a wallet that is not installed or failed to open. */
export function walletProblem(name: string, raw: string): string {
  if (/WalletUnavailable/i.test(raw)) {
    return `${name} could not be loaded. Try again, or pick another wallet.`;
  }
  if (/not installed|not found|injected wallet|no wallet/i.test(raw)) {
    return `${name} is not installed in this browser. Install its extension or open it on your phone, then try again.`;
  }
  if (/popup|window/i.test(raw)) {
    return `${name} needs a popup window. Allow popups for this site and try again.`;
  }
  return `${name} did not finish signing in. Try again, or pick another wallet.`;
}

/**
 * Name of the EIP-1193 wallet that currently owns `window.ethereum`, if any.
 * Most extensions also set `isMetaMask`, so the specific flags are checked
 * first: Zerion, for example, answers true to both.
 */
export function detectedInjectedWallet(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const eth = (window as unknown as { ethereum?: Record<string, unknown> }).ethereum;
  if (!eth) {
    return null;
  }
  if (eth.isZerion) return "Zerion";
  if (eth.isRabby) return "Rabby";
  if (eth.isPhantom) return "Phantom";
  if (eth.isOkxWallet || eth.isOKExWallet) return "OKX Wallet";
  if (eth.isCoinbaseWallet) return "Coinbase Wallet";
  if (eth.isBraveWallet) return "Brave Wallet";
  if (eth.isMetaMask) return "MetaMask";
  return "An installed wallet";
}
