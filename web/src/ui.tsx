import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";

import { TEST_ACCOUNTS, testWalletEnabled } from "phylaxtag-test-wallet";

import type { AppConfig } from "./config";
import type { Chain } from "./near/chain";
import type { ExplainedError } from "./near/errors";
import { METEOR_HINT, WALLETS, detectedInjectedWallet, groupTitle, selectorIdOf, walletGroups, walletProblem, type WalletEntry } from "./wallets";
import { isWideLogo, walletInitial, walletLogo } from "./wallet-logos";

/**
 * One way to open the wallet picker, so every "Connect wallet" button on every
 * page goes through the same dialog instead of calling the chain directly.
 */
const WalletPickerContext = createContext<() => void>(() => {});

export function useWalletPicker(): () => void {
  return useContext(WalletPickerContext);
}

/** The tag mark: a luggage tag with a keyring. Nav and footer use the same one. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path
        d="M36 16H80a6 6 0 0 1 6 6v56a6 6 0 0 1-6 6H36L14 52a2.4 2.4 0 0 1 0-4L36 16Z"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <circle cx="29" cy="50" r="3.6" stroke="currentColor" strokeWidth="5" />
      <circle cx="58" cy="50" r="12.5" stroke="currentColor" strokeWidth="6" />
      <path d="M58 30.5v39" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}


/** X mark, used only to link to the project account. */
export function XMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
    </svg>
  );
}

/** GitHub mark, used only to link to the source repository. */
export function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

/**
 * The one honest EVM entry represents whichever extension owns window.ethereum,
 * so it cannot carry a brand mark. This is a neutral wallet outline (Lucide
 * "wallet-minimal", ISC licence), not a logo of any wallet.
 */
export function GenericWalletGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 14h.01" />
      <path d="M7 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14" />
    </svg>
  );
}

/** A bundled local logo, or a neutral badge when no official file exists. */
export function WalletLogo({ entry, size = 28 }: { entry: WalletEntry; size?: number }) {
  const src = walletLogo(entry.id);
  if (src) {
    if (isWideLogo(entry.id)) {
      // A wordmark keeps its own width at the same height.
      return <img className="wallet-logo wallet-logo-wide" src={src} alt="" />;
    }
    return (
      <img
        className="wallet-logo"
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    );
  }
  if (entry.id === "evm-injected") {
    // Generic entry: a neutral wallet mark instead of a made-up brand or a
    // bare letter that reads like a placeholder.
    return (
      <span className="wallet-logo wallet-logo-glyph" style={{ width: size, height: size }} aria-hidden="true">
        <GenericWalletGlyph />
      </span>
    );
  }
  return (
    <span className="wallet-logo wallet-logo-fallback" style={{ width: size, height: size }} aria-hidden="true">
      {walletInitial(entry)}
    </span>
  );
}

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
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletUnavailable, setWalletUnavailable] = useState<string[]>([]);
  const [walletBusy, setWalletBusy] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const location = useLocation();

  // A route change does not move the viewport on its own. Without this the
  // "Warranty" link (which points at /#all-warranties) keeps the reader at the
  // top of the home page, and back/forward keep the old scroll position. The
  // warranty table only exists after the RPC answers, so look again for a few
  // seconds instead of giving up on the first frame.
  useEffect(() => {
    const hash = location.hash.replace(/^#/, "");
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!hash) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    let tries = 0;
    let timer: number | undefined;
    const findAndScroll = () => {
      const target = document.getElementById(hash);
      if (target) {
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        return;
      }
      if (tries < 12) {
        tries += 1;
        timer = window.setTimeout(findAndScroll, 250);
      }
    };
    findAndScroll();
    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [location.pathname, location.hash, location.key]);

  const currentToken = location.pathname.match(/^\/asset\/([^/]+)/)?.[1] ?? null;
  const lastToken = currentToken ?? readLastToken();
  // The EVM group needs a WalletConnect project id at build time; without it the
  // group is hidden rather than failing when a user picks a wallet.
  const projectId = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined)?.trim();
  const groups = walletGroups(Boolean(projectId));

  function openWalletPicker() {
    setWalletError(null);
    setWalletUnavailable(chain.unavailableWallets?.() ?? []);
    setWalletOpen(true);
  }

  async function pickWallet(entry: WalletEntry) {
    setWalletError(null);
    setWalletBusy(entry.id);
    // Close the picker first. It is a <dialog> in the top layer, so a wallet's
    // own modal (WalletConnect QR, extension popups) would otherwise open
    // behind it and look like nothing happened.
    setWalletOpen(false);
    try {
      if (chain.connectWith) {
        await chain.connectWith(selectorIdOf(entry));
      } else {
        await chain.connect();
      }
    } catch (caught) {
      // Refresh the unavailable list so a failed chunk is marked in this view too.
      setWalletUnavailable(chain.unavailableWallets?.() ?? []);
      setWalletError(walletProblem(entry.name, caught instanceof Error ? caught.message : String(caught)));
      // Bring the list back with the message instead of leaving a blank page.
      setWalletOpen(true);
    } finally {
      setWalletBusy(null);
    }
  }

  // One delegated listener gives every card a spotlight that follows the pointer.
  useEffect(() => {
    const cards = ".tile, .party, .limit, .step, .try-link, .tech-row, .feed-row, .card, .panel, form, article > section";
    function onMove(event: PointerEvent) {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(cards);
      if (!target || target.matches(".hero, .stats, .home-block, .how-block")) {
        return;
      }
      const rect = target.getBoundingClientRect();
      target.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      target.style.setProperty("--my", `${event.clientY - rect.top}px`);
    }
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <WalletPickerContext.Provider value={openWalletPicker}>
      <div className="topline">
        <nav className="nav" aria-label="Main">
          <div className="nav-inner">
            <div className="brand-wrap">
              <Link className="brand" to="/" aria-label="Phylaxtag home">
                <BrandMark />
                <span>Phylaxtag</span>
              </Link>
              <span className="tag">Testnet</span>
            </div>
            <button
              type="button"
              className="menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="nav-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? "Close menu" : "Menu"}
            </button>
            <div id="nav-menu" className={menuOpen ? "nav-menu open" : "nav-menu"}>
              <div className="nav-links" onClick={() => setMenuOpen(false)}>
                <NavLink to="/" end>Home</NavLink>
                <Link to={lastToken ? `/asset/${lastToken}` : "/#all-warranties"}>Warranty</Link>
                <NavLink to="/issuer">Issuer</NavLink>
                <NavLink to="/try">Try it</NavLink>
                <NavLink to="/workshop">Workshop</NavLink>
                <NavLink to="/how-it-works">How it works</NavLink>
              </div>

              <div className="account">
                {accountId ? <span className="who">Signed in as {accountId}</span> : null}
                {testWalletEnabled
                  ? (
                    <>
                      {TEST_ACCOUNTS.map((id) => (
                        <button key={id} type="button" className="secondary" onClick={() => chain.useAccount(id)}>
                          {id}
                        </button>
                      ))}
                      <button type="button" className="secondary" onClick={openWalletPicker}>
                        Choose a wallet
                      </button>
                    </>
                  )
                  : (
                    <button
                      type="button"
                      onClick={() => {
                        if (accountId) {
                          void chain.disconnect();
                        } else {
                          openWalletPicker();
                        }
                      }}
                    >
                      {accountId ? "Disconnect" : "Connect wallet"}
                    </button>
                  )}
              </div>
            </div>
          </div>
        </nav>
      </div>

      <div className="app">
        <main>{children}</main>
        <footer className="foot">
          <div className="foot-inner">
            <div className="foot-brand">
              <Link className="brand" to="/" aria-label="Phylaxtag home">
                <BrandMark />
                <span>Phylaxtag</span>
              </Link>
              <p className="note">
                A warranty that travels with the item. Each one carries its own fund and service book on
                NEAR testnet.
              </p>
            </div>
            <div>
              <h2>Pages</h2>
              <ul>
                <li><Link to="/">Home</Link></li>
                <li><Link to="/how-it-works">How it works</Link></li>
                <li><Link to="/issuer">Issuer</Link></li>
                <li><Link to="/try">Try it</Link></li>
                <li><Link to="/workshop">Workshop</Link></li>
              </ul>
            </div>
            <div>
              <h2>Resources</h2>
              <ul>
                <li><AccountId id={config.contractId} /></li>
                <li><Link to="/how-it-works#supported-wallets">Supported wallets</Link></li>
              </ul>
            </div>
          </div>
          <div className="foot-bottom">
            <p className="disclaimer">{DISCLAIMER}</p>
            <div className="foot-social">
              <a
                href="https://x.com/Phylaxtag"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Phylaxtag on X"
                title="Phylaxtag on X"
              >
                <XMark />
              </a>
              <a
                href="https://github.com/kangmochi/Phylaxtag"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Source code on GitHub"
                title="Source code on GitHub"
              >
                <GitHubMark />
              </a>
            </div>
          </div>
        </footer>
      </div>

      {walletOpen ? (
        <WalletPicker
          groups={groups}
          busyId={walletBusy}
          error={walletError}
          unavailable={walletUnavailable}
          onPick={(entry) => void pickWallet(entry)}
          onClose={() => setWalletOpen(false)}
        />
      ) : null}
    </WalletPickerContext.Provider>
  );
}

/** The connect screen: NEAR wallets first, then the EVM group when it is enabled. */
export function WalletPicker({
  groups,
  busyId,
  error,
  unavailable,
  onPick,
  onClose,
}: {
  groups: WalletEntry[][];
  busyId: string | null;
  error: string | null;
  unavailable: string[];
  onPick: (entry: WalletEntry) => void;
  onClose: () => void;
}) {
  // Retired wallets stay visible but cannot be picked: the provider refuses new
  // app connections, so a live button would only mislead.
  const retiredNear = WALLETS.filter((wallet) => wallet.retired && wallet.group === "near" && !wallet.pickerOnly);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  // Read once per open: which EIP-1193 wallet an "Other wallet" click would hit.
  const detected = detectedInjectedWallet();

  // showModal() puts the dialog in the top layer, so it is centred and visible
  // without any page CSS, and Escape works natively.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    return () => {
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="wallet-picker-title"
      data-testid="wallet-picker"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click that lands on the dialog element itself is a backdrop click.
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <h2 id="wallet-picker-title">Connect a wallet</h2>
      <p className="note">
        This demo runs on NEAR testnet. A testnet account ends with <code>.testnet</code>.
      </p>
      <p className="note" data-testid="meteor-hint">{METEOR_HINT}</p>
      {groups.map((group) => (
        <section key={groupTitle(group)}>
          <h3>{groupTitle(group)}</h3>
          <ul className="plain wallet-list">
            {group.map((entry) => {
              const broken = unavailable.includes(selectorIdOf(entry));
              return (
                <li key={entry.id}>
                  <WalletLogo entry={entry} />
                  <button
                    type="button"
                    className="secondary"
                    disabled={busyId === entry.id || broken}
                    onClick={() => onPick(entry)}
                  >
                    {entry.name}
                  </button>
                  <span className="note"> {broken ? "Could not be loaded. Try again later." : entry.how}</span>
                  {entry.id === "evm-injected" ? (
                    <span className="note">
                      {" "}
                      {detected ? `${detected} detected in this browser.` : "No browser wallet extension detected."}
                    </span>
                  ) : null}
                </li>
              );
            })}
            {groupTitle(group) === "NEAR wallets"
              ? retiredNear.map((entry) => (
                  <li key={entry.id}>
                    <WalletLogo entry={entry} />
                    <button type="button" className="secondary" disabled>
                      {entry.name}
                    </button>
                    <span className="note"> {entry.how}</span>
                  </li>
                ))
              : null}
          </ul>
        </section>
      ))}
      {error ? <p className="alert" role="alert">{error}</p> : null}
      <button type="button" className="secondary" onClick={onClose}>Close</button>
    </dialog>
  );
}

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

/** A full account id, wrapping, linked to the testnet explorer. */
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

/** A plain-English message plus a retry button instead of "Failed to fetch". */
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
