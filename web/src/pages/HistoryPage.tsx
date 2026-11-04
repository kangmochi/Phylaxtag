import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { holderSummary } from "../copy";
import { formatNear } from "../near/amounts";
import type { Chain } from "../near/chain";
import { formatTimeNs } from "../near/time";
import type { HolderHistory, ServiceRecord } from "../near/types";
import { normalizeHolderHistory, normalizeServiceHistory } from "../near/views";
import { AccountId, LoadError } from "../ui";
import { ServiceTable } from "./AssetPage";

export function HistoryPage({ chain }: { chain: Chain }) {
  const { tokenId = "" } = useParams();
  const [services, setServices] = useState<ServiceRecord[] | null>(null);
  const [holders, setHolders] = useState<HolderHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [serviceRaw, holderRaw] = await Promise.all([
          chain.view("get_service_history", { token_id: tokenId, from_index: 0, limit: 50 }),
          chain.view("get_holder_history", { token_id: tokenId }),
        ]);
        if (cancelled) {
          return;
        }
        setServices(normalizeServiceHistory(serviceRaw));
        setHolders(normalizeHolderHistory(holderRaw));
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chain, tokenId, nonce]);

  if (error) {
    return <LoadError message={error} onRetry={() => setNonce((value) => value + 1)} />;
  }
  if (services === null && holders === null) {
    return <p role="status">Loading history.</p>;
  }
  if (services === null || holders === null) {
    return <h1>Warranty not found</h1>;
  }

  return (
    <article>
      <header className="page-head">
        <p className="eyebrow">History</p>
        <h1>History for {tokenId}</h1>
        <p className="note"><Link to={`/asset/${tokenId}`}>Back to the warranty</Link></p>
      </header>
      <section className="card">
        <h2>Service payments</h2>
        <ServiceTable rows={services} />
      </section>
      <section className="card">
      <h2>Who held it</h2>
      <p>{holderSummary(holders.holder_total)}</p>
      <table>
        <thead>
          <tr>
            <th>Owner</th>
            <th>Since</th>
            <th>Fund at transfer</th>
          </tr>
        </thead>
        <tbody>
          {holders.records.map((record, index) => (
            <tr key={`${record.owner}-${index}`}>
              <td data-label="Owner"><AccountId id={record.owner} /></td>
              <td data-label="Since">{formatTimeNs(record.since_ns)}</td>
              <td data-label="Fund at transfer">{formatNear(record.balance_at_transfer)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </section>
    </article>
  );
}
