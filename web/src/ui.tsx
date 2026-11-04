import type { ReactNode } from "react";
import { Link } from "react-router";

import { TEST_ACCOUNTS, testWalletEnabled } from "phylaxtag-test-wallet";

import type { AppConfig } from "./config";
import type { Chain } from "./near/chain";
import type { ExplainedError } from "./near/errors";

export type TxState =
  | { kind: "idle" }
  | { kind: "waiting" }
  | { kind: "pending" }
  | { kind: "success"; hash: string; detail?: string }
  | ({ kind: "failure"; hash?: string } & ExplainedError);

export function Shell({
  chain,
  config,
  accountId,
  children,
}: {
  chain: Chain;
  config: AppConfig;
  accountId: string | null;
  children: ReactNode;
}) {
  return (
    <>
      <p className="banner" role="status">Testnet demo</p>
      <header className="top">
        <nav aria-label="Pages">
          <Link to="/">Home</Link>
          <Link to="/asset/EB-001">Warranty EB-001</Link>
          <Link to="/issuer">Issuer</Link>
          <Link to="/workshop">Workshop</Link>
          <Link to="/how-it-works">How it works</Link>
        </nav>
        <div className="account">
          <span>{accountId ? `Signed in as ${accountId}` : "Not signed in"}</span>
          {testWalletEnabled
            ? TEST_ACCOUNTS.map((id) => (
              <button key={id} type="button" className="secondary" onClick={() => chain.useAccount(id)}>
                {id}
              </button>
            ))
            : (
              <button type="button" onClick={() => void (accountId ? chain.disconnect() : chain.connect())}>
                {accountId ? "Disconnect" : "Connect wallet"}
              </button>
            )}
        </div>
      </header>
      <main>
        <p className="note">Contract: {config.contractId}</p>
        {children}
      </main>
    </>
  );
}

export function TxNotice({ tx, explorer }: { tx: TxState; explorer: (hash: string) => string }) {
  if (tx.kind === "idle") {
    return null;
  }
  if (tx.kind === "waiting") {
    return <p role="status">Waiting for your wallet.</p>;
  }
  if (tx.kind === "pending") {
    return <p role="status">Pending on the network.</p>;
  }
  if (tx.kind === "success") {
    return (
      <p className="ok" role="status">
        Succeeded. {tx.detail ?? ""}{" "}
        {tx.hash ? <a href={explorer(tx.hash)}>View on the explorer</a> : null}
      </p>
    );
  }
  return (
    <div className="alert" role="alert">
      <p>{tx.plain}</p>
      <p>Contract said: {tx.original}</p>
      {tx.hash ? <a href={explorer(tx.hash)}>View on the explorer</a> : null}
    </div>
  );
}

export function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={id}>
      {label}
      {children}
    </label>
  );
}
