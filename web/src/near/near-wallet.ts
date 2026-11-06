import { actionCreators } from "@near-js/transactions";
import { loggedRejection } from "./rejection";
import {
  setupWalletSelector,
  type WalletModuleFactory,
  type WalletSelector,
} from "@near-wallet-selector/core";

import type { AppConfig } from "../config";
import { settleWalletLoaders, usableWalletId } from "../wallets";
import type { Chain } from "./chain";
import { rpcView } from "./rpc";

interface OutcomeLike {
  status?: { Failure?: { error_message?: string } } | string;
  transaction_outcome?: { id?: string };
  /** Present on a final outcome; carries the logs the contract wrote before it aborted. */
  receipts_outcome?: Array<{ outcome?: { logs?: string[] } | null }>;
}

/** Wallet id used by connect() when the picker has not chosen one yet. */
const DEFAULT_WALLET = "meteor-wallet";
const REMEMBERED_KEY = "phylaxtag:wallet";
const SESSION_KEY = "phylaxtag:session";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Storage can be blocked; the app then simply forgets the choice.
  }
}

/**
 * The wallet modules are much heavier than the app (Ledger, HERE and the
 * NEAR transaction stack together), so they are imported on demand. A visitor
 * who never connects downloads none of it. Each wallet loads on its own: a
 * chunk that fails only removes that wallet, never the whole picker.
 */
interface LoadedModules {
  modules: WalletModuleFactory[];
  failed: string[];
}

const WALLET_LOADERS: ReadonlyArray<readonly [string, () => Promise<WalletModuleFactory>]> = [
  ["meteor-wallet", async () => (await import("@near-wallet-selector/meteor-wallet")).setupMeteorWallet()],
  ["here-wallet", async () => (await import("@near-wallet-selector/here-wallet")).setupHereWallet()],
  ["sender", async () => (await import("@near-wallet-selector/sender")).setupSender()],
  ["nightly", async () => (await import("@near-wallet-selector/nightly")).setupNightly()],
  ["intear-wallet", async () => (await import("@near-wallet-selector/intear-wallet")).setupIntearWallet()],
  ["ledger", async () => (await import("@near-wallet-selector/ledger")).setupLedger()],
];

async function loadModules(): Promise<LoadedModules> {
  const projectId = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined)?.trim();
  const loaders = [...WALLET_LOADERS];
  if (projectId) {
    // The EVM stack (wagmi, connectors, the selector module) is heavy and only
    // wanted when a WalletConnect project id exists.
    loaders.push([
      "ethereum-wallets",
      async () => (await import("./evm")).createEthereumWalletModule(projectId),
    ]);
  }
  const { items, failed } = await settleWalletLoaders(loaders);
  return { modules: items.map((item) => item.value), failed };
}

function failureMessage(outcome: OutcomeLike): string | null {
  const status = outcome.status;
  if (status === "Failure") {
    return loggedRejection(outcome) ?? "Transaction failed";
  }
  if (status && typeof status === "object" && status.Failure) {
    // The contract logs the reason before it aborts, so prefer that over the VM trap.
    return loggedRejection(outcome) ?? status.Failure.error_message ?? "Transaction failed";
  }
  return null;
}

function returnValue(outcome: OutcomeLike): unknown {
  const status = outcome.status;
  if (!status || typeof status !== "object" || !("SuccessValue" in status)) {
    return null;
  }
  const encoded = (status as { SuccessValue?: string }).SuccessValue;
  if (!encoded) {
    return null;
  }
  const binary = atob(encoded);
  const text = new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function createNearChain(config: AppConfig): Chain {
  let accountId: string | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  let selectorPromise: Promise<WalletSelector> | null = null;
  let failedWallets: string[] = [];

  async function selector(): Promise<WalletSelector> {
    selectorPromise ??= (async () => {
      const loaded = await loadModules();
      failedWallets = loaded.failed;
      const selected = await setupWalletSelector({ network: "testnet", modules: loaded.modules });
      accountId = selected.store.getState().accounts[0]?.accountId ?? null;
      selected.on("signedIn", ({ accounts }) => {
        accountId = accounts[0]?.accountId ?? null;
        writeStorage(SESSION_KEY, accountId ? "1" : null);
        notify();
      });
      selected.on("signedOut", () => {
        accountId = null;
        writeStorage(SESSION_KEY, null);
        notify();
      });
      return selected;
    })();
    return selectorPromise;
  }

  async function connectWithWallet(walletId: string) {
    writeStorage(REMEMBERED_KEY, walletId);
    const selected = await selector();
    if (failedWallets.includes(walletId)) {
      throw new Error(`WalletUnavailable:${walletId}`);
    }
    // The selector types sign-in per wallet kind (redirect, popup, hardware)
    // as an intersection; contractId plus methodNames is what all of them take.
    const wallet = (await selected.wallet(walletId)) as unknown as {
      signIn: (params: { contractId: string; methodNames: string[] }) => Promise<unknown>;
    };
    await wallet.signIn({
      contractId: config.contractId,
      methodNames: ["mint", "pay_service", "nft_transfer", "expire"],
    });
    accountId = selected.store.getState().accounts[0]?.accountId ?? null;
    writeStorage(SESSION_KEY, accountId ? "1" : null);
    notify();
  }

  return {
    async ready() {
      // A cold visit does not need the wallet bundle: restore a session only
      // when this browser had one before.
      if (readStorage(SESSION_KEY) !== "1") {
        return;
      }
      await selector();
      notify();
    },
    accountId: () => accountId,
    async connect() {
      const remembered = usableWalletId(readStorage(REMEMBERED_KEY));
      await connectWithWallet(remembered ?? DEFAULT_WALLET);
    },
    unavailableWallets: () => [...failedWallets],
    connectWith: connectWithWallet,
    async disconnect() {
      // The wallet popup can stall (Meteor stays on "Receiving details from
      // Dapp"). Clear the local session first, then give signOut at most 3 s.
      accountId = null;
      writeStorage(SESSION_KEY, null);
      notify();
      try {
        const selected = await selector();
        if (selected.isSignedIn()) {
          const wallet = await selected.wallet();
          await Promise.race([
            wallet.signOut(),
            new Promise<void>((resolve) => setTimeout(resolve, 3000)),
          ]);
        }
      } catch {
        // Local state is already cleared; a wallet that refuses to sign out is not fatal.
      }
    },
    useAccount() {
      return undefined;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async view<T>(method: string, args: Record<string, unknown>) {
      return rpcView(config, method, args) as Promise<T>;
    },
    async call(request) {
      request.onPhase("waiting");
      const selected = await selector();
      if (!selected.isSignedIn()) {
        throw new Error("Connect a testnet wallet to continue.");
      }
      const wallet = await selected.wallet();
      request.onPhase("pending");
      const outcome = await wallet.signAndSendTransaction({
        signerId: accountId ?? undefined,
        receiverId: config.contractId,
        actions: [
          actionCreators.functionCall(
            request.method,
            request.args,
            BigInt(request.gas),
            BigInt(request.depositYocto),
          ),
        ],
      });
      if (!outcome) {
        return { hash: "", returnValue: null };
      }
      const failure = failureMessage(outcome);
      if (failure) {
        // Keep the hash so the page can still link the failed transaction.
        throw Object.assign(new Error(failure), { hash: outcome.transaction_outcome?.id ?? "" });
      }
      return {
        hash: outcome.transaction_outcome?.id ?? "",
        returnValue: returnValue(outcome),
      };
    },
  };
}
