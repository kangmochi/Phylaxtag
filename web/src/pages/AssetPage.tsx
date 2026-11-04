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
import { TxNotice, type TxState } from "../ui";

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
    return <p className="alert" role="alert">{error}</p>;
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
      <h1>{nft?.metadata?.title || `Warranty ${tokenId}`}</h1>
      <p>Issuer: <strong>{asset.asset.issuer}</strong></p>
      <p>Owner: <span data-testid="owner">{asset.owner_id}</span></p>
      <p>Status: <span className="status">{asset.display_status}</span></p>
      {refund ? <p className="status">{refund}</p> : null}
      <p>Remaining fund: <span data-testid="fund">{formatNear(asset.balance)}</span></p>
      <p>Per-claim cap: {formatNear(asset.asset.claim_cap)}</p>
      <p>Cooldown: {formatNearTime(asset.asset.cooldown_ns)}</p>
      <p>{nextClaimText(asset.next_claim_ns)}</p>
      <p>Expiry: {formatTimeNs(asset.asset.expiry_ns)}</p>
      <h2>Allowlisted workshops</h2>
      <ul>{asset.asset.workshops.map((workshop) => <li key={workshop}>{workshop}</li>)}</ul>
      <h2>Recent services</h2>
      <ServiceTable rows={services} />
      <p><Link to={`/asset/${tokenId}/history`}>Full history</Link></p>
      <h2>Holders</h2>
      <p data-testid="holders">{holders ? holderSummary(holders.holder_total) : "No holder log"}</p>
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

function formatNearTime(ns: string): string {
  const seconds = BigInt(ns) / 1_000_000_000n;
  return `${seconds.toString()} seconds`;
}

export function ServiceTable({ rows }: { rows: ServiceRecord[] }) {
  if (rows.length === 0) {
    return <p>No service payments yet.</p>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>Workshop</th>
          <th>Amount</th>
          <th>Type</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.note_hash}-${index}`}>
            <td>{row.workshop}</td>
            <td>{formatNear(row.amount)}</td>
            <td>{row.work_type}</td>
            <td>{row.status === "Failed" ? "Payment failed, money returned to the warranty fund" : row.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
