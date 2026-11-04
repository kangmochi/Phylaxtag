import { useState, type FormEvent } from "react";
import { Link } from "react-router";

import { serviceOutcome } from "../copy";
import { formatNear } from "../near/amounts";
import type { Chain } from "../near/chain";
import type { ServiceRecord } from "../near/types";
import { formatTimeNs } from "../near/time";
import { normalizeServiceHistory } from "../near/views";
import { Field } from "../ui";

export function WorkshopPage({ chain }: { chain: Chain }) {
  const [tokenId, setTokenId] = useState("");
  const [workshop, setWorkshop] = useState("");
  const [rows, setRows] = useState<ServiceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const history = normalizeServiceHistory(
        await chain.view("get_service_history", { token_id: tokenId.trim(), from_index: 0, limit: 50 }),
      );
      if (history === null) {
        setRows(null);
        setError("Warranty not found");
        return;
      }
      setRows(history.filter((row) => row.workshop === workshop.trim()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <article>
      <header className="page-head">
        <p className="eyebrow">Workshop</p>
        <h1>Workshop payments</h1>
        <p className="lead">
          The contract has no view that lists payments for one workshop. This page filters the service
          history of a warranty you name. A failed payout is not a payment.
        </p>
      </header>
      <section className="card">
      <form onSubmit={(event) => void load(event)}>
        <Field id="workshop-token" label="Warranty token id">
          <input id="workshop-token" value={tokenId} placeholder="e.g. EB-001" onChange={(event) => setTokenId(event.target.value)} />
        </Field>
        <Field id="workshop-account" label="Workshop account">
          <input id="workshop-account" value={workshop} placeholder="e.g. ws-a.phylaxtag-jiwoo-11041950.testnet" onChange={(event) => setWorkshop(event.target.value)} />
        </Field>
        <button type="submit">Show payments</button>
      </form>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      </section>
      {rows ? (
        <section className="card">
          <h2>Payments received</h2>
          {rows.length === 0 ? <p className="note">No matching service records.</p> : (
            <table>
              <thead><tr><th>When (UTC)</th><th>Amount</th><th>Status</th><th>Warranty</th></tr></thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.note_hash}-${index}`}>
                    <td data-label="When (UTC)">{formatTimeNs(row.timestamp_ns)}</td>
                    <td data-label="Amount">{formatNear(row.amount)}</td>
                    <td data-label="Status">{serviceOutcome(row.status)}</td>
                    <td data-label="Warranty"><Link to={`/asset/${tokenId.trim()}`}>{tokenId.trim()}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}
    </article>
  );
}
