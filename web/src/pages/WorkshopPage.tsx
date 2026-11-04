import { useState, type FormEvent } from "react";
import { Link } from "react-router";

import { serviceOutcome } from "../copy";
import { formatNear } from "../near/amounts";
import type { Chain } from "../near/chain";
import type { ServiceRecord } from "../near/types";
import { normalizeServiceHistory } from "../near/views";
import { Field } from "../ui";

export function WorkshopPage({ chain }: { chain: Chain }) {
  const [tokenId, setTokenId] = useState("EB-001");
  const [workshop, setWorkshop] = useState("workshop.test");
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
      <h1>Workshop payments</h1>
      <p>
        The contract has no view that lists payments for one workshop. This page filters
        {" "}<code>get_service_history</code> for a warranty you name. A failed payout is not a payment.
      </p>
      <form onSubmit={(event) => void load(event)}>
        <Field id="workshop-token" label="Warranty token id">
          <input id="workshop-token" value={tokenId} onChange={(event) => setTokenId(event.target.value)} />
        </Field>
        <Field id="workshop-account" label="Workshop account">
          <input id="workshop-account" value={workshop} onChange={(event) => setWorkshop(event.target.value)} />
        </Field>
        <button type="submit">Show payments</button>
      </form>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      {rows ? (
        rows.length === 0 ? <p>No matching service records.</p> : (
          <ul>
            {rows.map((row, index) => (
              <li key={`${row.note_hash}-${index}`}>
                {formatNear(row.amount)} — {serviceOutcome(row.status)} — <Link to={`/asset/${tokenId.trim()}`}>{tokenId.trim()}</Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </article>
  );
}
