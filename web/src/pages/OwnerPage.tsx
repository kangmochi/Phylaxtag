import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";

import { GATE_MESSAGE, holderSummary, sellDisclosure, serviceOutcome } from "../copy";
import { formatNear, parseNearInput } from "../near/amounts";
import type { Chain } from "../near/chain";
import { claimBlock, claimProblemMessage, cooldownLabel, cooldownText, maxClaimableYocto, prefillAmount } from "../near/claim";
import { explainError } from "../near/errors";
import { CALL_GAS, ONE_YOCTO } from "../near/gas";
import { noteHash } from "../near/hash";
import type { AssetView } from "../near/types";
import { normalizeAssetView, normalizeServiceHistory } from "../near/views";
import { Field, TxNotice, type TxState } from "../ui";

function SaleNote({ receipt, warning }: { receipt: string | null; warning: boolean }) {
  if (!receipt) {
    return null;
  }
  return (
    <p className={warning ? "alert" : undefined} role={warning ? "alert" : undefined}>
      {receipt}
    </p>
  );
}

export function OwnerPage({
  chain,
  accountId,
  explorer,
}: {
  chain: Chain;
  accountId: string | null;
  explorer: (hash: string) => string;
}) {
  const { tokenId = "" } = useParams();
  const [asset, setAsset] = useState<AssetView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const prefilledFor = useRef<string | null>(null);
  const [nowNs, setNowNs] = useState(() => BigInt(Date.now()) * 1_000_000n);
  const [workshop, setWorkshop] = useState("");
  const [workType, setWorkType] = useState("brakes");
  const [note, setNote] = useState("Replaced the brake pads");
  const [buyer, setBuyer] = useState("budi.test");
  const [sellOpen, setSellOpen] = useState(false);
  const [tx, setTx] = useState<TxState>({ kind: "idle" });
  const [receipt, setReceipt] = useState<string | null>(null);
  const [receiptWarning, setReceiptWarning] = useState(false);

  async function readAsset(): Promise<AssetView | null> {
    return normalizeAssetView(await chain.view("get_asset", { token_id: tokenId }));
  }

  async function load() {
    setError(null);
    try {
      const next = await readAsset();
      setAsset(next);
      if (next && !workshop) {
        setWorkshop(next.asset.workshops[0] ?? "");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  useEffect(() => {
    void load();
  }, [tokenId, accountId]);

  // Prefill the amount with the claimable maximum, once per token, holder and
  // balance: a successful claim changes the balance, so the field refills.
  useEffect(() => {
    if (!asset) {
      return;
    }
    const key = `${tokenId}:${accountId ?? ""}:${asset.balance}`;
    if (prefilledFor.current === key) {
      return;
    }
    prefilledFor.current = key;
    setAmount(prefillAmount(maxClaimableYocto(asset)));
  }, [asset, tokenId, accountId]);

  // The cooldown has to count down, so the clock ticks once a second.
  useEffect(() => {
    const timer = setInterval(() => setNowNs(BigInt(Date.now()) * 1_000_000n), 1000);
    return () => clearInterval(timer);
  }, []);

  const isHolder = asset !== null && asset !== undefined && accountId === asset.owner_id;
  const block = isHolder && asset ? claimBlock(asset, nowNs) : null;
  const problem = isHolder && asset ? claimProblemMessage(amount, asset) : null;
  // An untouched empty field is not worth an alert; the block reason covers it.
  const amountProblem = problem && problem.kind !== "empty" ? problem : null;
  const claimDisabled = block !== null || problem !== null;
  const cooldownInfo = asset ? cooldownText(asset.asset.cooldown_ns) : null;
  const disabledReason = block
    ? block.kind === "cooldown"
      ? cooldownLabel(block.nextClaimNs, nowNs)
      : block.message
    : problem?.message ?? null;

  async function pay(event: FormEvent) {
    event.preventDefault();
    setReceipt(null);
    if (block || problem) {
      const message = block ? block.message : problem?.message ?? "Enter a NEAR amount.";
      setTx({ kind: "failure", plain: message, original: message, fromContract: false });
      return;
    }
    const current = await readAsset();
    setAsset(current);
    if (!current || accountId !== current.owner_id) {
      return;
    }
    setTx({ kind: "waiting" });
    try {
      const hash = await noteHash(note);
      const result = await chain.call({
        method: "pay_service",
        args: {
          token_id: tokenId,
          workshop,
          amount: parseNearInput(amount).toString(),
          note_hash: hash,
          work_type: workType,
        },
        depositYocto: ONE_YOCTO,
        gas: CALL_GAS,
        onPhase: (phase) => setTx({ kind: phase }),
      });
      const history = normalizeServiceHistory(
        await chain.view("get_service_history", { token_id: tokenId, from_index: 0, limit: 50 }),
      ) ?? [];
      const latest = history[history.length - 1];
      await load();
      if (latest && latest.status === "Failed") {
        setTx({
          kind: "failure",
          hash: result.hash,
          plain: serviceOutcome("Failed"),
          original: "Failed",
          fromContract: false,
        });
        return;
      }
      setTx({
        kind: "success",
        hash: result.hash,
        detail: latest?.status === "Paid"
          ? "The workshop was paid."
          : "Payment sent. It appears in the history after the next block.",
      });
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : String(caught);
      const failedHash = (caught as { hash?: string } | null)?.hash;
      setTx({ kind: "failure", hash: failedHash || undefined, ...explainError(raw) });
    }
  }

  async function sell(event: FormEvent) {
    event.preventDefault();
    const current = await readAsset();
    setAsset(current);
    if (!current || accountId !== current.owner_id) {
      setSellOpen(false);
      return;
    }
    if (!buyer.trim()) {
      setTx({ kind: "failure", plain: "Enter the buyer account.", original: "Enter the buyer account.", fromContract: false });
      return;
    }
    const beforeFund = current.balance;
    const beforeHolders = current.asset.holder_total;
    setTx({ kind: "waiting" });
    try {
      const result = await chain.call({
        method: "nft_transfer",
        args: {
          receiver_id: buyer.trim(),
          token_id: tokenId,
          approval_id: null,
          memo: null,
        },
        depositYocto: ONE_YOCTO,
        gas: CALL_GAS,
        onPhase: (phase) => setTx({ kind: phase }),
      });
      const after = await readAsset();
      setAsset(after);
      setSellOpen(false);
      const owner = `Owner is now ${after?.owner_id ?? buyer.trim()}.`;
      const holders = `${holderSummary(after?.asset.holder_total ?? beforeHolders + 1)}.`;
      if (after === null) {
        setReceiptWarning(true);
        setReceipt(`${owner} Warning: the warranty could not be re-read after the sale, so the fund was not confirmed. ${holders}`);
      } else if (after.balance !== beforeFund) {
        setReceiptWarning(true);
        setReceipt(`${owner} Warning: the fund changed during the sale. It was ${formatNear(beforeFund)} and it is now ${formatNear(after.balance)}. ${holders}`);
      } else {
        setReceiptWarning(false);
        setReceipt(`${owner} Fund is still ${formatNear(after.balance)}. ${holders}`);
      }
      setTx({ kind: "success", hash: result.hash, detail: "The item was transferred." });
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : String(caught);
      setTx({ kind: "failure", ...explainError(raw) });
    }
  }

  if (error) {
    return <p className="alert" role="alert">{error}</p>;
  }
  if (asset === undefined) {
    return <p role="status">Loading holder page.</p>;
  }
  if (asset === null) {
    return <h1>Warranty not found</h1>;
  }
  if (!isHolder) {
    const signedIn = accountId !== null;
    return (
      <article>
        <header className="page-head">
          <p className="eyebrow">Holder page</p>
          <h1>{GATE_MESSAGE}</h1>
          <p className="lead">
            {signedIn
              ? `You are signed in as ${accountId}, but this warranty is held by ${asset.owner_id}. Only the holder can pay a workshop or sell it.`
              : "Connect the wallet that holds this warranty to pay a workshop or sell the item."}
          </p>
        </header>
        <p className="actions">
          {signedIn ? (
            <button type="button" onClick={() => void chain.disconnect()}>Switch account</button>
          ) : (
            <button type="button" onClick={() => void chain.connect()}>Connect wallet</button>
          )}
          <Link className="button secondary" to={`/asset/${tokenId}`}>Back to the warranty</Link>
        </p>
        <SaleNote receipt={receipt} warning={receiptWarning} />
        <TxNotice tx={tx} explorer={explorer} />
      </article>
    );
  }

  return (
    <article>
      <h1>Pay workshop from warranty fund</h1>
      <p>Remaining fund: <span data-testid="fund">{formatNear(asset.balance)}</span></p>
      <p>Per-claim cap: {formatNear(asset.asset.claim_cap)}</p>
      {cooldownInfo ? (
        <p className="note" data-testid="cooldown-note">
          Cooldown between claims: {cooldownInfo.label}.
          {cooldownInfo.demo ? " This is a short demo cooldown. A real warranty would use days." : null}
        </p>
      ) : null}
      <p>{sellDisclosure(asset.next_claim_ns)}</p>
      <form onSubmit={(event) => void pay(event)}>
        <Field id="amount" label="Amount (NEAR)">
          <input id="amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
        </Field>
        <p className="note" data-testid="claim-hint">
          You can claim up to {formatNear(maxClaimableYocto(asset))} now.
        </p>
        {amountProblem ? (
          <p className="alert" role="alert" data-testid="claim-problem">{amountProblem.message}</p>
        ) : null}
        <Field id="workshop" label="Workshop">
          <select id="workshop" value={workshop} onChange={(event) => setWorkshop(event.target.value)}>
            {asset.asset.workshops.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </Field>
        <Field id="work-type" label="Work type">
          <input id="work-type" value={workType} onChange={(event) => setWorkType(event.target.value)} maxLength={32} />
        </Field>
        <Field id="note" label="Service note (hashed in this browser)">
          <textarea id="note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
        </Field>
        <p className="note">
          Your wallet may show a deposit of 0 NEAR. The contract asks for 1 yoctoNEAR (a security
          deposit of 0.000000000000000000000001 NEAR), so this is expected.
        </p>
        <button type="submit" disabled={claimDisabled}>Request service payment</button>
        {claimDisabled && disabledReason ? (
          <p className="note" role="status" data-testid="claim-blocked">
            {disabledReason}
          </p>
        ) : null}
      </form>
      <p>
        <button type="button" onClick={() => setSellOpen(true)}>Sell this item</button>
      </p>
      {sellOpen ? (
        <dialog open aria-labelledby="sell-title">
          <h2 id="sell-title">Sell this item</h2>
          <p>{sellDisclosure(asset.next_claim_ns)}</p>
          <form onSubmit={(event) => void sell(event)}>
            <Field id="buyer" label="Buyer account">
              <input id="buyer" value={buyer} onChange={(event) => setBuyer(event.target.value)} />
            </Field>
            <button type="submit">Confirm sale</button>
            <button type="button" className="secondary" onClick={() => setSellOpen(false)}>Cancel</button>
          </form>
        </dialog>
      ) : null}
      <SaleNote receipt={receipt} warning={receiptWarning} />
      <TxNotice tx={tx} explorer={explorer} />
    </article>
  );
}
