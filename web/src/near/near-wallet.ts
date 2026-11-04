import { actionCreators } from "@near-js/transactions";
import { setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import "@near-wallet-selector/modal-ui/styles.css";

import type { AppConfig } from "../config";
import type { Chain } from "./chain";
import { rpcView } from "./rpc";

interface OutcomeLike {
  status?: { Failure?: { error_message?: string } } | string;
  transaction_outcome?: { id?: string };
}

function failureMessage(outcome: OutcomeLike): string | null {
  const status = outcome.status;
  if (status && typeof status === "object" && status.Failure) {
    return status.Failure.error_message || "Transaction failed";
  }
  if (status === "Failure") {
    return "Transaction failed";
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

  const selector = () => {
    selectorPromise ??= setupWalletSelector({
      network: "testnet",
      modules: [
        setupMyNearWallet({ walletUrl: "https://testnet.mynearwallet.com" }),
        setupMeteorWallet(),
      ],
    });
    return selectorPromise;
  };

  return {
    async ready() {
      const selected = await selector();
      accountId = selected.store.getState().accounts[0]?.accountId ?? null;
      selected.on("signedIn", ({ accounts }) => {
        accountId = accounts[0]?.accountId ?? null;
        notify();
      });
      selected.on("signedOut", () => {
        accountId = null;
        notify();
      });
      notify();
    },
    accountId: () => accountId,
    async connect() {
      const selected = await selector();
      setupModal(selected, { contractId: config.contractId, description: "Phylaxtag testnet demo" }).show();
    },
    async disconnect() {
      const selected = await selector();
      if (selected.isSignedIn()) {
        const wallet = await selected.wallet();
        await wallet.signOut();
      }
      accountId = null;
      notify();
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
        throw new Error(failure);
      }
      return {
        hash: outcome.transaction_outcome?.id ?? "",
        returnValue: returnValue(outcome),
      };
    },
  };
}
