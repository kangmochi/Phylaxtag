import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import { holderSummary } from "../copy";
import { formatNear } from "../near/amounts";
import type { Chain } from "../near/chain";
import { formatTimeNs } from "../near/time";
import type { HolderHistory, ServiceRecord } from "../near/types";
import { normalizeHolderHistory, normalizeServiceHistory } from "../near/views";
import { ServiceTable } from "./AssetPage";

export function HistoryPage({ chain }: { chain: Chain }) {
  const { tokenId = "" } = useParams();
  const [services, setServices] = useState<ServiceRecord[] | null>(null);
  const [holders, setHolders] = useState<HolderHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }, [chain, tokenId]);

  if (error) {
    return <p className="alert" role="alert">{error}</p>;
  }
  if (services === null && holders === null) {
    return <p role="status">Loading history.</p>;
  }
  if (services === null || holders === null) {
    return <h1>Warranty not found</h1>;
  }

  return (
    <article>
      <h1>History for {tokenId}</h1>
      <p><Link to={`/asset/${tokenId}`}>Back to the warranty</Link></p>
      <h2>Service payments</h2>
      <ServiceTable rows={services} />
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
              <td>{record.owner}</td>
              <td>{formatTimeNs(record.since_ns)}</td>
              <td>{formatNear(record.balance_at_transfer)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
