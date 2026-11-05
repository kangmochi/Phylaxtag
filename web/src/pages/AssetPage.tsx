import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { holderSummary, nextClaimText, refundLine } from "../copy";
import { formatNear } from "../near/amounts";
import type { Chain } from "../near/chain";
import { explainError } from "../near/errors";
import { CALL_GAS } from "../near/gas";
import { formatTimeNs } from "../near/time";
import type { AssetView, HolderHistory, NftToken, ServiceRecord } from "../near/types";
import { normalizeAssetView, normalizeHolderHistory, normalizeNftToken, normalizeServiceHistory } from "../near/views";
import { AccountId, LoadError, TxNotice, rememberToken, type TxState } from "../ui";


/** Payment amounts as a small line: the shape of the service history at a glance. */
function PaymentSparkline({ amounts }: { amounts: string[] }) {
  if (amounts.length < 2) {
    return null;
  }
  const values = amounts.map((amount) => Number(amount)).filter((value) => Number.isFinite(value));
  if (values.length < 2) {
    return null;
  }
  const max = Math.max(...values, 1);
  const width = 120;
  const height = 28;
  const step = width / (values.length - 1);
  const points = values
    .map((value, index) => `${(index * step).toFixed(1)},${(height - (value / max) * (height - 4) - 2).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Payment amounts in order">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function AssetPage({ chain, explorer }: { chain: Chain; explorer: (hash: string) => string }) {
  const { tokenId = "" } = useParams();
  const [asset, setAsset] = useState<AssetView | null | undefined>(undefined);
  const [nft, setNft] = useState<NftToken | null>(null);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [holders, setHolders] = useState<HolderHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<TxState>({ kind: "idle" });

  async function load() {
    setError(null);
    try {
      const [assetRaw, nftRaw, serviceRaw, holderRaw] = await Promise.all([
        chain.view("get_asset", { token_id: tokenId }),
        chain.view("nft_token", { token_id: tokenId }),
        chain.view("get_service_history", { token_id: tokenId, from_index: 0, limit: 5 }),
        chain.view("get_holder_history", { token_id: tokenId }),
      ]);
      setAsset(normalizeAssetView(assetRaw));
      setNft(normalizeNftToken(nftRaw));
      setServices(normalizeServiceHistory(serviceRaw) ?? []);
      setHolders(normalizeHolderHistory(holderRaw));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  useEffect(() => {
    void load();
    if (tokenId) {
      rememberToken(tokenId);
    }
  }, [tokenId]);

  async function closeWarranty() {
    setTx({ kind: "waiting" });
    try {
      const result = await chain.call({
        method: "expire",
        args: { token_id: tokenId },
        depositYocto: "0",
        gas: CALL_GAS,
        onPhase: (phase) => setTx({ kind: phase }),
      });
      const returned = typeof result.returnValue === "string" ? result.returnValue : "0";
      setTx({
        kind: "success",
        hash: result.hash,
        detail: `Returned amount: ${formatNear(returned)}.`,
      });
      await load();
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : String(caught);
      setTx({ kind: "failure", ...explainError(raw) });
    }
  }

  if (error) {
    return <LoadError message={error} onRetry={() => void load()} />;
  }
  if (asset === undefined) {
    return <p role="status">Loading warranty.</p>;
  }
  if (asset === null) {
    return <h1>Warranty not found</h1>;
  }

  const refund = refundLine(asset.asset.pending_refund);
  const canClose = asset.display_status === "Expired, close pending" || asset.asset.pending_refund !== null;

  return (
    <article>
      <header className="page-head">
        <p className="eyebrow">Warranty</p>
        <h1>{nft?.metadata?.title || `Warranty ${tokenId}`}</h1>
        <p className="lead">
          <span className="status">{asset.display_status}</span>
          {" · held by "}
          <span data-testid="owner"><AccountId id={asset.owner_id} /></span>
        </p>
      </header>

      <div className="cols">
        <section className="card">
          <h2>Warranty fund</h2>
          <p className="big" data-testid="fund">{formatNear(asset.balance)}</p>
          {refund ? <p className="status">{refund}</p> : null}
          <dl className="kv">
            <div><dt>Per-claim cap</dt><dd>{formatNear(asset.asset.claim_cap)}</dd></div>
            <div><dt>Cooldown</dt><dd>{formatNearTime(asset.asset.cooldown_ns)}</dd></div>
            <div><dt>Expiry</dt><dd>{formatTimeNs(asset.asset.expiry_ns)}</dd></div>
            <div><dt>Issuer</dt><dd><AccountId id={asset.asset.issuer} /></dd></div>
          </dl>
          <p className="note">
            {nextClaimText(asset.next_claim_ns, { expired: asset.display_status.toLowerCase().includes("expired"), empty: isZero(asset.balance) })}
          </p>
        </section>

        <section className="card">
          <h2>Holders</h2>
          <p data-testid="holders">{holders ? holderSummary(holders.holder_total) : "No holder log"}</p>
          <ul className="plain">
            {holders?.records.slice(0, 8).map((row, index) => (
              <li key={`${row.owner}-${index}`}><AccountId id={row.owner} /></li>
            ))}
          </ul>
          <h2>Approved workshops</h2>
          <ul className="plain">{asset.asset.workshops.map((workshop) => <li key={workshop}><AccountId id={workshop} /></li>)}</ul>
        </section>
      </div>

      <section className="card">
        <div className="section-head">
          <h2>Recent services</h2>
          <PaymentSparkline amounts={services.map((row) => row.amount)} />
        </div>
        <ServiceTable rows={services} />
        <p><Link to={`/asset/${tokenId}/history`}>Full history</Link></p>
      </section>

      {canClose ? (
        <p>
          <button type="button" onClick={() => void closeWarranty()}>Close warranty</button>
        </p>
      ) : null}
      <TxNotice tx={tx} explorer={explorer} />
      <p><Link to={`/asset/${tokenId}/owner`}>Holder page</Link></p>
    </article>
  );
}

function isZero(yocto: string): boolean {
  try {
    return BigInt(yocto) === 0n;
  } catch {
    return false;
  }
}

function formatNearTime(ns: string): string {
  const seconds = BigInt(ns) / 1_000_000_000n;
  return `${seconds.toString()} seconds`;
}

export function ServiceTable({ rows }: { rows: ServiceRecord[] }) {
  if (rows.length === 0) {
    return <p className="note">No service payments yet.</p>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>When (UTC)</th>
          <th>Workshop</th>
          <th>Amount</th>
          <th>Type</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.note_hash}-${index}`}>
            <td data-label="When (UTC)">{formatTimeNs(row.timestamp_ns)}</td>
            <td data-label="Workshop"><AccountId id={row.workshop} /></td>
            <td data-label="Amount">{formatNear(row.amount)}</td>
            <td data-label="Type">{row.work_type}</td>
            <td data-label="Status">
              {row.status === "Failed" ? "Payment failed, money returned to the warranty fund" : row.status}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
