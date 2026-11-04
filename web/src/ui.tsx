import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const currentToken = location.pathname.match(/^\/asset\/([^/]+)/)?.[1] ?? null;
  const lastToken = currentToken ?? readLastToken();

  return (
    <>
      <header className="topline">
        <p className="banner" role="status">TESTNET DEMO</p>
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "Close menu" : "Menu"}
        </button>
      </header>
      <div className="app">
        <aside id="sidebar" className={menuOpen ? "sidebar open" : "sidebar"}>
          <Link className="brand" to="/" aria-label="Phylaxtag home">
            <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
              <path
                d="M36 16H80a6 6 0 0 1 6 6v56a6 6 0 0 1-6 6H36L14 52a2.4 2.4 0 0 1 0-4L36 16Z"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinejoin="round"
              />
              <circle cx="29" cy="50" r="3.6" stroke="currentColor" strokeWidth="5" />
              <circle cx="58" cy="50" r="12.5" stroke="var(--accent-2)" strokeWidth="6" />
              <path d="M58 30.5v39" stroke="var(--accent-2)" strokeWidth="6" strokeLinecap="round" />
            </svg>
            <span>Phylaxtag</span>
          </Link>

          <nav aria-label="Pages" onClick={() => setMenuOpen(false)}>
            <NavLink to="/" end>Home</NavLink>
            <Link to={lastToken ? `/asset/${lastToken}` : "/#all-warranties"}>Warranty</Link>
            <NavLink to="/issuer">Issuer</NavLink>
            <NavLink to="/workshop">Workshop</NavLink>
            <NavLink to="/how-it-works">How it works</NavLink>
          </nav>

          <div className="account">
            <span className="who">{accountId ? `Signed in as ${accountId}` : "Not signed in"}</span>
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
        </aside>

        <div className="column">
          <main>{children}</main>
          <footer className="foot">
            <p className="note">
              Contract: <AccountId id={config.contractId} />
            </p>
            <p className="disclaimer">{DISCLAIMER}</p>
          </footer>
        </div>
      </div>
    </>
  );
}

/** The warranty the user opened last, or null. Never a hard-coded token id. */
export function readLastToken(): string | null {
  try {
    return window.localStorage.getItem("phylaxtag:last-token");
  } catch {
    return null;
  }
}

export function rememberToken(tokenId: string): void {
  try {
    window.localStorage.setItem("phylaxtag:last-token", tokenId);
  } catch {
    // Storage can be blocked; the nav then falls back to the warranty list.
  }
}

export const DISCLAIMER =
  "To our knowledge, a working NFT-warranty implementation on NEAR. This is a testnet prototype. The NFT is not proof of authenticity and is not a legal title.";

/** Task A5: a full account id, wrapping, linked to the testnet explorer. */
export function AccountId({ id }: { id: string }) {
  return (
    <a
      className="acct"
      href={`https://testnet.nearblocks.io/address/${id}`}
      target="_blank"
      rel="noreferrer"
    >
      {id.split(".").map((part, index) => (
        <span key={`${part}-${index}`}>
          {index > 0 ? (
            <>
              .
              <wbr />
            </>
          ) : null}
          {part}
        </span>
      ))}
    </a>
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
      {tx.fromContract && tx.original !== tx.plain ? <p>Contract said: {tx.original}</p> : null}
      {tx.hash ? <a href={explorer(tx.hash)}>View on the explorer</a> : null}
    </div>
  );
}

/** Task B2: a plain-English message plus a retry button instead of "Failed to fetch". */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="alert" role="alert">
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
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
