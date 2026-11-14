import type { AppConfig } from "../config";
import type { CallRequest, Chain } from "../near/chain";
import { FakeContract, TEST_ACCOUNTS as ACCOUNTS } from "./fake-contract";

/** Present only in the test build. The production bundle check looks for this string. */
export const PHYLAX_TEST_WALLET_MARKER = "PHYLAX_TEST_WALLET_MARKER";

export const testWalletEnabled = true;
export const TEST_ACCOUNTS = ACCOUNTS;

export function createTestChain(config: AppConfig): Chain {
  const fake = new FakeContract(config.contractId);
  let accountId: string | null = null;
  const listeners = new Set<() => void>();
  let txCount = 0;
  const notify = () => listeners.forEach((listener) => listener());

  function send(request: CallRequest) {
    request.onPhase("waiting");
    if (!accountId) {
      throw new Error("Connect a test account to continue.");
    }
    request.onPhase("pending");
    const returnValue = fake.call(request.method, request.args, accountId, request.depositYocto);
    txCount += 1;
    return Promise.resolve({ hash: `test-${txCount}`, returnValue });
  }

  return {
    async ready() {
      return undefined;
    },
    accountId: () => accountId,
    async connect() {
      accountId = accountId ?? "alice.test";
      notify();
    },
    async disconnect() {
      accountId = null;
      notify();
    },
    useAccount(next) {
      accountId = next;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async view<T>(method: string, args: Record<string, unknown>) {
      return fake.view(method, args) as Promise<T>;
    },
    // The in-memory stand-in has no second deployment, so every contract id
    // resolves to it. The practice page marks that clearly in the UI.
    async viewOn<T>(_contractId: string, method: string, args: Record<string, unknown>) {
      return fake.view(method, args) as Promise<T>;
    },
    callOn: (_contractId: string, request: CallRequest) => send(request),
    call: send,
  };
}
