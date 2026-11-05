import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";

import { itemName, nextClaimShort } from "../copy";
import { formatNear } from "../near/amounts";
import type { Chain } from "../near/chain";
import type { AssetView, NftToken } from "../near/types";
import { normalizeAssetView, normalizeNftToken } from "../near/views";
import { AccountId, Field } from "../ui";

interface Row {
  tokenId: string;
  title: string;
  fund: string;
  /** Raw yoctoNEAR, so totals are summed as integers and never as floats. */
  fundYocto: string;
  cap: string;
  capYocto: string;
  status: string;
  nextClaim: string;
  owner: string;
  issuer: string;
}

type Filter = "All" | "Active" | "Empty" | "Expired";

const FILTERS: Filter[] = ["All", "Active", "Empty", "Expired"];

function bucket(status: string): Filter {
  const lower = status.toLowerCase();
  if (lower.includes("expired")) {
    return "Expired";
  }
  if (lower.includes("empty")) {
    return "Empty";
  }
  return "Active";
}

function toRow(token: NftToken, asset: AssetView): Row {
  return {
    tokenId: token.token_id,
    title: itemName(token.metadata?.title, token.token_id),
    fund: formatNear(asset.balance),
    fundYocto: asset.balance,
    cap: formatNear(asset.asset.claim_cap),
    capYocto: asset.asset.claim_cap,
    status: asset.display_status,
    nextClaim: nextClaimShort(asset.next_claim_ns, {
      expired: asset.display_status.toLowerCase().includes("expired"),
      empty: asset.balance === "0",
    }),
    owner: asset.owner_id,
    issuer: asset.asset.issuer,
  };
}

const PAGE_SIZE = 50;
const MAX_TOKENS = 500;

/**
 * Keep asking for pages until a short page comes back, so the list is not
 * silently cut at 50. The cap keeps a demo from hammering the RPC.
 */
async function collectTokens(
  chain: Chain,
  method: "nft_tokens" | "nft_tokens_for_owner",
  args: Record<string, unknown>,
): Promise<{ tokens: NftToken[]; capped: boolean }> {
  const tokens: NftToken[] = [];
  const seen = new Set<string>();
  let from = 0;
  while (tokens.length < MAX_TOKENS) {
    const page = await chain.view<unknown[]>(method, {
      ...args,
      from_index: String(from),
      limit: PAGE_SIZE,
    });
    let added = 0;
    for (const raw of page) {
      const token = normalizeNftToken(raw);
      if (token && !seen.has(token.token_id)) {
        seen.add(token.token_id);
        tokens.push(token);
        added += 1;
      }
    }
    if (page.length < PAGE_SIZE || added === 0) {
      return { tokens, capped: false };
    }
    from += PAGE_SIZE;
  }
  return { tokens, capped: true };
}

export function HomePage({ chain, accountId }: { chain: Chain; accountId: string | null }) {
  const navigate = useNavigate();
  const [tokenId, setTokenId] = useState("EB-001");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("All");
  const [mine, setMine] = useState<NftToken[] | null>(null);
  const [mineError, setMineError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [capped, setCapped] = useState(false);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const { tokens: normalized, capped } = await collectTokens(chain, "nft_tokens", {});
      setCapped(capped);
      const assets = await Promise.all(
        normalized.map((token) => chain.view("get_asset", { token_id: token.token_id })),
      );
      const next: Row[] = [];
      normalized.forEach((token, index) => {
        const asset = normalizeAssetView(assets[index]);
        if (asset) {
          next.push(toRow(token, asset));
        }
      });
      setRows(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadMine() {
    if (!accountId) {
      return;
    }
    setMineError(null);
    try {
      const { tokens } = await collectTokens(chain, "nft_tokens_for_owner", { account_id: accountId });
      setMine(tokens);
    } catch (caught) {
      setMineError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  useEffect(() => {
    if (accountId) {
      void loadMine();
    } else {
      setMine(null);
    }
  }, [accountId]);

  const visible = useMemo(() => {
    if (!rows) {
      return [];
    }
    return filter === "All" ? rows : rows.filter((row) => bucket(row.status) === filter);
  }, [rows, filter]);

  const issued = useMemo(() => {
    if (!accountId || !rows) {
      return [];
    }
    return rows.filter((row) => row.issuer === accountId && row.owner !== accountId);
  }, [rows, accountId]);

  const totals = useMemo(() => {
    if (!rows) {
      return null;
    }
    let locked = 0n;
    for (const row of rows) {
      try {
        locked += BigInt(row.fundYocto);
      } catch {
        // A malformed balance is left out of the total instead of breaking the page.
      }
    }
    return {
      count: rows.length,
      locked: formatNear(locked),
      active: rows.filter((row) => bucket(row.status) === "Active").length,
    };
  }, [rows]);

  // The tiles show a real warranty, preferring the one named in PLAN.md.
  const featured = rows?.find((row) => row.tokenId === "EB-005") ?? rows?.[0] ?? null;

  return (
    <article>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Warranty on NEAR testnet</p>
          <h1>The warranty travels with the bike</h1>
          <p className="hero-lead">
            Every warranty is an NFT that carries its own fund and service book. Sell the item and both move
            to the next owner: no email, no account, no paper booklet.
          </p>
          <div className="hero-actions">
            <a className="button" href="#all-warranties">Get started</a>
            <Link className="button secondary" to="/how-it-works">
              How it works
            </Link>
          </div>
          <p className="hero-fine">
            Testnet only. The NFT is not proof of authenticity and is not a legal title.
          </p>
        </div>
      </section>

      <section className="stats" aria-label="Live summary">
        <div className="stat">
          <span>Warranties</span>
          <b>{totals ? totals.count : "—"}</b>
        </div>
        <div className="stat">
          <span>NEAR in funds</span>
          <b>{totals ? totals.locked : "—"}</b>
        </div>
        <div className="stat">
          <span>Active</span>
          <b>{totals ? totals.active : "—"}</b>
        </div>
        <div className="stat">
          <span>Network</span>
          <b>NEAR testnet</b>
        </div>
      </section>

      <section className="home-block">
        <div className="section-head">
          <h2>What you can do here</h2>
        </div>
        <div className="tiles">
          <a className="tile" href="#all-warranties">
            <div>
              <h3>Every warranty</h3>
              <p>Fund, status and next claim for every warranty on the contract, filterable.</p>
            </div>
            <div className="tile-art" aria-hidden="true">
              {(rows ?? []).slice(0, 3).map((row) => (
                <div className="tile-row" key={row.tokenId}>
                  <span className="mono">{row.tokenId}</span>
                  <b>{row.fund}</b>
                </div>
              ))}
              {!rows ? (
                <div className="tile-row">
                  <span className="mono">loading</span>
                </div>
              ) : null}
            </div>
          </a>

          <a className="tile" href={featured ? `/asset/${featured.tokenId}` : "#all-warranties"}>
            <div>
              <h3>One warranty page</h3>
              <p>Fund, claim rules, service book and holder history for a single item.</p>
            </div>
            <div className="tile-art" aria-hidden="true">
              <div className="tile-row">
                <span className="mono">{featured ? featured.tokenId : "—"}</span>
                <b>{featured ? featured.fund : "—"}</b>
              </div>
              <div className="tile-row">
                <span>Per claim cap</span>
                <b>{featured ? featured.cap : "—"}</b>
              </div>
              <div className="tile-row">
                <span>Next claim</span>
                <b>{featured ? featured.nextClaim : "—"}</b>
              </div>
            </div>
          </a>

          <a className="tile" href={featured ? `/asset/${featured.tokenId}/owner` : "#all-warranties"}>
            <div>
              <h3>Workshop payout</h3>
              <p>The holder pays a workshop straight from the warranty fund, inside the claim cap.</p>
            </div>
            <div className="tile-art" aria-hidden="true">
              <div className="tile-row">
                <span>Checked before signing</span>
                <b>amount, cap, fund</b>
              </div>
              <div className="tile-row">
                <span>Cooldown</span>
                <b>read from the contract</b>
              </div>
              <div className="tile-row">
                <span>Receipt</span>
                <b>service book</b>
              </div>
            </div>
          </a>

          <a className="tile tile-wide" href="/issuer">
            <div className="tile-copy">
              <h3>Issuer console</h3>
              <p>
                Mint a warranty, fund it in NEAR, set the per-claim cap and the cooldown. Only accounts on
                the issuer allowlist can mint.
              </p>
            </div>
            <div className="tile-art" aria-hidden="true">
              <div className="tile-row">
                <span className="mono">token_id</span>
                <b>next free id</b>
              </div>
              <div className="tile-row">
                <span className="mono">fund</span>
                <b>NEAR, paid by the issuer</b>
              </div>
              <div className="tile-row">
                <span className="mono">claim cap · cooldown</span>
                <b>per warranty</b>
              </div>
            </div>
          </a>
        </div>
      </section>

      <section className="home-block">
        <p className="eyebrow">The app</p>
        <div className="section-head">
          <h2>All warranties</h2>
          {rows ? <span className="note">{rows.length} on the contract</span> : null}
        </div>
        <div className="chips">
          {FILTERS.map((name) => (
            <button
              key={name}
              type="button"
              className={filter === name ? "chip on" : "chip"}
              aria-pressed={filter === name}
              onClick={() => setFilter(name)}
            >
              {name}
            </button>
          ))}
        </div>
        {error ? (
          <div className="alert" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void loadAll()}>Try again</button>
          </div>
        ) : null}
        {loading && !rows ? <p className="note" role="status">Loading warranties.</p> : null}
        {rows && visible.length === 0 ? <p className="note">No warranties match this filter.</p> : null}
        {capped ? <p className="note">Showing up to 500 warranties.</p> : null}
        {visible.length > 0 ? (
          <table id="all-warranties">
            <thead>
              <tr>
                <th>Warranty</th>
                <th>Item</th>
                <th>Fund</th>
                <th>Status</th>
                <th>Next claim</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.tokenId}>
                  <td data-label="Warranty"><Link to={`/asset/${row.tokenId}`}>{row.tokenId}</Link></td>
                  <td data-label="Item">{row.title || "—"}</td>
                  <td data-label="Fund">{row.fund}</td>
                  <td data-label="Status">{row.status}</td>
                  <td data-label="Next claim">{row.nextClaim}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <section className="home-block">
        <div className="section-head">
          <h2>Your side</h2>
        </div>
        <div className="tools">
          <div className="card">
            <h3>My warranties</h3>
            {accountId ? (
              <>
                <p className="note">Signed in as <AccountId id={accountId} />.</p>
                {mineError ? <p className="alert" role="alert">{mineError}</p> : null}
                {mine && mine.length > 0 ? (
                  <>
                    <h3>Held by this account</h3>
                    <ul className="plain">
                      {mine.map((token) => (
                        <li key={token.token_id}>
                          <Link to={`/asset/${token.token_id}`}>{token.token_id}</Link>
                          {token.metadata?.title ? (
                            <span className="note"> · {token.metadata.title}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {mine && mine.length === 0 ? <p className="note">This account holds no warranties.</p> : null}
                {issued.length > 0 ? (
                  <>
                    <h3>Issued by this account</h3>
                    <ul className="plain">
                      {issued.map((row) => (
                        <li key={row.tokenId}>
                          <Link to={`/asset/${row.tokenId}`}>{row.tokenId}</Link>
                          <span className="note"> · held by {row.owner}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            ) : (
              <p className="note">Connect a wallet to see your warranties.</p>
            )}
          </div>

          <div className="card">
            <h3>Look up a warranty</h3>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                navigate(`/asset/${tokenId.trim()}`);
              }}
            >
              <Field id="lookup" label="Warranty token id">
                <input id="lookup" value={tokenId} onChange={(event) => setTokenId(event.target.value)} />
              </Field>
              <button type="submit">Open warranty</button>
            </form>
          </div>
        </div>
      </section>
    </article>
  );
}
