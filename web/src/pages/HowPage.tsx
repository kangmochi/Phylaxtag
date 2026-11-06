import { useEffect, useState } from "react";
import { Link } from "react-router";

import { formatNear } from "../near/amounts";
import type { Chain } from "../near/chain";
import type { AssetView, StorageInfo } from "../near/types";
import { normalizeAssetView, normalizeNftToken, normalizeStorageInfo } from "../near/views";
import { AccountId, WalletLogo } from "../ui";
import { WALLETS } from "../wallets";

const FUNCTIONS = [
  "new",
  "add_issuer",
  "mint",
  "pay_service",
  "expire",
  "get_asset",
  "get_service_history",
  "get_holder_history",
  "get_storage_info",
  "nft_transfer",
  "nft_token",
  "nft_metadata",
  "nft_tokens",
  "nft_tokens_for_owner",
];

/** sha256 of the deployed wasm, read with the RPC view_code method on 6 Nov 2026. */
const CODE_HASH = "63cfae3d60e84168fc03dc1eb426dbef7b76f76a2ca536f2539278ee6768cebe";
const CODE_BYTES = "367,712";

const LIMITS: ReadonlyArray<{ title: string; body: string }> = [
  { title: "Not a product", body: "It runs on NEAR testnet only. No real money, no support, no service level." },
  { title: "Not a legal title", body: "The NFT does not prove physical authenticity and cannot be used as ownership proof in court." },
  { title: "The bike link is off-chain", body: "Nothing in the contract knows which physical bike a token belongs to." },
  {
    title: "Collusion is possible",
    body: "An approved workshop and the holder can take money together, within the cap, the cooldown and the expiry.",
  },
  { title: "No keeper", body: "Nobody has to run a bot. Expiry, claims and transfers happen when someone calls the contract." },
  {
    title: "The seller can claim first",
    body: "A sale can follow a claim, so the buyer may wait for the next one. The page shows that time before signing.",
  },
];

const TECHNIQUE: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "One source of truth",
    body: "Control is nft_token(token_id).owner_id. Every money-moving action checks predecessor == owner_id at call time, with no session, allowance or per-token key.",
  },
  {
    title: "The fund lives on the token",
    body: "The balance is a field of the token, not of an account. A transfer changes the owner and nothing else, so the fund, the clock and the service book stay with the item.",
  },
  {
    title: "Approvals are cleared on transfer",
    body: "NEP-178 approvals are removed, and nft_transfer_call is disabled, so no receiver contract is ever a temporary owner.",
  },
  {
    title: "A failed payout returns to the token",
    body: "Money can only leave to an approved workshop, or back to the issuer after expiry. Whoever holds the token then benefits, never the previous owner.",
  },
  {
    title: "The holder page re-reads the chain",
    body: "owner_id is fetched on every load and before every action, so the previous owner sees the gate message right after a sale.",
  },
];

/** Cooldown in round units, for the fund line in the diagram. */
function cooldownText(ns: string): string {
  try {
    const seconds = Number(BigInt(ns) / 1_000_000_000n);
    if (seconds >= 3600) {
      return `${Math.round(seconds / 3600)}h`;
    }
    return `${Math.max(1, Math.round(seconds / 60))}m`;
  } catch {
    return "—";
  }
}

export function HowPage({ chain, contractId }: { chain: Chain; contractId: string }) {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [sample, setSample] = useState<AssetView | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setError(null);
    void chain.view("get_storage_info", {}).then((value) => {
      setInfo(normalizeStorageInfo(value));
    }).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  }

  useEffect(() => {
    let cancelled = false;
    void chain.view("get_storage_info", {}).then((value) => {
      if (!cancelled) {
        setInfo(normalizeStorageInfo(value));
      }
    }).catch((caught: unknown) => {
      if (!cancelled) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [chain]);

  // One real warranty, so the diagram shows contract values instead of examples.
  useEffect(() => {
    let cancelled = false;
    void chain.view<unknown[]>("nft_tokens", { from_index: "0", limit: 1 })
      .then((tokens) => {
        const token = normalizeNftToken(tokens[0]);
        if (!token || cancelled) {
          return undefined;
        }
        return chain.view("get_asset", { token_id: token.token_id }).then((raw) => {
          if (!cancelled) {
            setSample(normalizeAssetView(raw));
          }
        });
      })
      .catch(() => {
        // The diagram falls back to the generic wording below.
      });
    return () => {
      cancelled = true;
    };
  }, [chain]);

  const fundLine = sample
    ? `${formatNear(sample.balance)} left · ${formatNear(sample.asset.claim_cap)} per claim · ${cooldownText(sample.asset.cooldown_ns)} cooldown`
    : "A balance inside the NFT, read from the contract";

  return (
    <article>
      <header className="page-head how-head">
        <p className="eyebrow">How it works</p>
        <h1>A warranty that travels with the item</h1>
        <p className="lead">
          A warranty is a small money pot attached to one item. The maker funds it, the owner pays repair
          shops from it, and both the money and the repair history move with the item when it is sold.
        </p>
        <nav className="jump" aria-label="On this page">
          <a href="#parties">The four parties</a>
          <a href="#limits">Honest limits</a>
          <a href="#contract">Official contract</a>
          <a href="#technical">Technical details</a>
          <a href="#try">Try it</a>
        </nav>
      </header>

      <section className="how-block" id="parties">
        <h2>The four parties</h2>
        <p className="how-sub">
          Money moves one way: the issuer funds the warranty, the holder pays an approved workshop,
          and the remainder returns to the issuer after expiry. It can never reach the holder's own
          wallet, and it can never reach a workshop that is not on the list.
        </p>
        <div className="flow">
          <div className="party is-lit">
            <span className="party-step">01 · maker</span>
            <b>Issuer</b>
            <p>Mints the warranty and pays the first fund in NEAR, with a per-claim cap and a cooldown.</p>
          </div>
          <div className="party is-lit">
            <span className="party-step">02 · on the token</span>
            <b>Warranty fund</b>
            <p>{fundLine}</p>
          </div>
          <div className="party is-lit">
            <span className="party-step">03 · approved</span>
            <b>Workshop</b>
            <p>Paid straight from the fund by the current holder. Every payment lands in the service book.</p>
          </div>
          <div className="party is-lit">
            <span className="party-step">04 · transfer</span>
            <b>New owner</b>
            <p>One sale moves the NFT, the remaining fund and the whole history. Nothing is re-issued.</p>
          </div>
        </div>
      </section>

      <section className="how-block" id="limits">
        <h2>Honest limits</h2>
        <p className="how-sub">What this prototype does not do. Take these seriously before trusting any number on the site.</p>
        <div className="limits">
          {LIMITS.map((item) => (
            <div className="limit" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="how-block" id="contract">
        <h2>Official contract</h2>
        <p className="how-sub">
          Only this account is the project. A copy of the code can be deployed by anyone; a copy has a
          different account id and cannot control these warranties, because a token is identified by its
          contract account plus the token id.
        </p>
        <table className="contract-table">
          <tbody>
            <tr><th>Network</th><td>NEAR testnet</td></tr>
            <tr><th>Contract</th><td><AccountId id={contractId} /></td></tr>
            <tr>
              <th>Code hash</th>
              <td>
                <code>
                  {CODE_HASH.slice(0, 8)}…{CODE_HASH.slice(-6)}
                </code>{" "}
                · {CODE_BYTES} bytes
              </td>
            </tr>
            <tr>
              <th>How to check</th>
              <td>
                Read the code with the RPC <code>query</code> method (<code>view_code</code>) and hash the
                bytes; the exact command is in the README.
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="how-block" id="technical">
        <h2>Technical details</h2>
        <div className="tech">
          {TECHNIQUE.map((item, index) => (
            <div className="tech-row" key={item.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p><b>{item.title}.</b> {item.body}</p>
            </div>
          ))}
        </div>

        <h3 className="how-h3">Calls this app uses</h3>
        <ul className="calls">{FUNCTIONS.map((name) => <li key={name}><code>{name}</code></li>)}</ul>

        <h3 className="how-h3">Storage</h3>
        {error ? (
          <div className="alert" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void reload()}>Try again</button>
          </div>
        ) : null}
        {info ? (
          <p className="note">
            {info.storage_usage} bytes used · {formatNear(info.total_locked)} locked · contract balance{" "}
            {formatNear(info.contract_balance)}
          </p>
        ) : <p className="note" role="status">Loading storage info.</p>}
      </section>

      <section className="how-block" id="try">
        <h2>Try it</h2>
        <p className="how-sub">Start with a warranty you can read without a wallet. Connect only when you want to pay or mint.</p>
        <div className="try">
          <Link className="try-link" to="/#all-warranties">
            <b>Open a warranty →</b>
            <span>Fund, claim rules and the service book.</span>
          </Link>
          <Link className="try-link" to="/workshop">
            <b>See workshop payments →</b>
            <span>What an approved workshop received from warranty funds.</span>
          </Link>
          <Link className="try-link" to="/issuer">
            <b>Mint one →</b>
            <span>Issuer console: fund, cap, cooldown, allowlist.</span>
          </Link>
        </div>
      </section>

      <section className="how-block" id="wallets">
        <h2>Supported wallets</h2>
        <p className="how-sub">
          Verified means someone signed in on NEAR testnet with that wallet and came back to this page
          with the account shown. Not verified means the wallet is wired into the connect screen but the
          sign-in has not been run yet; treat it as untested.
        </p>
        <div className="wallet-strip" aria-label="Supported wallets">
          <div className="wallet-track">
            {[...WALLETS.filter((wallet) => !wallet.pickerOnly), ...WALLETS.filter((wallet) => !wallet.pickerOnly)].map((wallet, index) => (
              <span className="wallet-chip" key={`${wallet.id}-${index}`}>
                <WalletLogo entry={wallet} size={28} />
                <span>{wallet.name}</span>
              </span>
            ))}
          </div>
        </div>
        <p className="note">
          Every wallet here is wired into the connect screen. None has a completed sign-in yet, so the
          table below still says not verified for all of them.
        </p>
        <details className="wallet-details">
          <summary>Details</summary>
          <table id="supported-wallets">
          <thead>
            <tr>
              <th>Wallet</th>
              <th>Type</th>
              <th>Testnet account</th>
              <th>Status</th>
              <th>How to use it</th>
            </tr>
          </thead>
          <tbody>
            {WALLETS.filter((wallet) => !wallet.pickerOnly).map((wallet) => (
              <tr key={wallet.id}>
                <td data-label="Wallet">
                  <span className="wallet-cell">
                    <WalletLogo entry={wallet} size={24} />
                    {wallet.name}
                  </span>
                </td>
                <td data-label="Type">{wallet.kind}</td>
                <td data-label="Testnet account">{wallet.testnetAccount}</td>
                <td data-label="Status">{wallet.status}</td>
                <td data-label="How to use it">{wallet.how}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </details>
      </section>
    </article>
  );
}
