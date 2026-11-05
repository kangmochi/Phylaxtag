import { useMemo, useState, type FormEvent } from "react";

import { refundLine } from "../copy";
import { formatNear, parseNearInput } from "../near/amounts";
import type { Chain } from "../near/chain";
import { estimateMintDeposit } from "../near/deposit";
import { explainError } from "../near/errors";
import { CALL_GAS, MINT_GAS } from "../near/gas";
import { randomSaltHex, serialHash } from "../near/hash";
import { nsFromNow } from "../near/time";
import type { AssetView } from "../near/types";
import { normalizeAssetView } from "../near/views";
import { Field, TxNotice, type TxState, useWalletPicker } from "../ui";

const DEMO = {
  tokenId: "EB-002",
  serial: "FRAME-0002",
  fund: "10",
  cap: "0.3",
  cooldownSeconds: "60",
  expiryMinutes: "43200",
  workshops: "ws-a.phylaxtag-jiwoo-11041950.testnet\nws-b.phylaxtag-jiwoo-11041950.testnet",
  title: "E-bike EB-002",
  description: "Warranty NFT for one e-bike",
};

export function IssuerPage({
  chain,
  accountId,
  explorer,
}: {
  chain: Chain;
  accountId: string | null;
  explorer: (hash: string) => string;
}) {
  const openWalletPicker = useWalletPicker();
  const [salt, setSalt] = useState(randomSaltHex);
  const [showSalt, setShowSalt] = useState(false);
  const [tokenId, setTokenId] = useState("");
  const [serial, setSerial] = useState("");
  const [fund, setFund] = useState("");
  const [cap, setCap] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState("");
  const [expiryMinutes, setExpiryMinutes] = useState("");
  const [workshopsText, setWorkshopsText] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [extra, setExtra] = useState("");
  const [hashPreview, setHashPreview] = useState("");
  const [tx, setTx] = useState<TxState>({ kind: "idle" });
  const [closeId, setCloseId] = useState("");
  const [closeAsset, setCloseAsset] = useState<AssetView | null | undefined>(undefined);

  const workshops = workshopsText.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  const estimate = useMemo(() => {
    try {
      return estimateMintDeposit({
        issuerAccountId: accountId ?? "issuer.test",
        tokenId,
        fundNear: fund,
        title,
        description,
        extra,
        workshops,
      });
    } catch {
      return null;
    }
  }, [accountId, tokenId, fund, title, description, extra, workshopsText]);

  async function refreshHash() {
    setHashPreview(await serialHash(salt, serial));
  }

  async function mint(event: FormEvent) {
    event.preventDefault();
    if (!estimate) {
      setTx({ kind: "failure", plain: "Enter a NEAR amount such as 10 or 2.5", original: "Enter a NEAR amount such as 10 or 2.5", fromContract: false });
      return;
    }
    setTx({ kind: "waiting" });
    try {
      const hashed = await serialHash(salt, serial);
      setHashPreview(hashed);
      const result = await chain.call({
        method: "mint",
        args: {
          token_id: tokenId.trim(),
          serial_hash: hashed,
          fund_amount: estimate.fundYocto.toString(),
          expiry: nsFromNow(BigInt(expiryMinutes) * 60_000n),
          claim_cap: parseNearInput(cap).toString(),
          cooldown_ns: (BigInt(cooldownSeconds) * 1_000_000_000n).toString(),
          workshops,
          metadata: { title, description, extra: extra || null, copies: 1 },
        },
        depositYocto: estimate.attachedYocto.toString(),
        gas: MINT_GAS,
        onPhase: (phase) => setTx({ kind: phase }),
      });
      setTx({ kind: "success", hash: result.hash, detail: `Minted ${tokenId.trim()}.` });
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : String(caught);
      setTx({ kind: "failure", ...explainError(raw) });
    }
  }

  async function loadClose() {
    setCloseAsset(normalizeAssetView(await chain.view("get_asset", { token_id: closeId.trim() })));
  }

  async function expire() {
    setTx({ kind: "waiting" });
    try {
      const result = await chain.call({
        method: "expire",
        args: { token_id: closeId.trim() },
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
      await loadClose();
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : String(caught);
      setTx({ kind: "failure", ...explainError(raw) });
    }
  }

  const refund = closeAsset ? refundLine(closeAsset.asset.pending_refund) : null;

  // Nothing on this page is useful without a wallet: the contract only accepts
  // mints from an allowlisted issuer. Hide the form instead of letting a
  // visitor fill it in and then fail at signing time.
  if (!accountId) {
    return (
      <article>
        <h1>Mint a warranty</h1>
        <p>The serial is salted and hashed in this browser. Only the hash is sent.</p>
        <div className="card">
          <p>Connect an issuer wallet to mint warranties.</p>
          <button type="button" onClick={openWalletPicker}>Connect wallet</button>
        </div>
      </article>
    );
  }

  return (
    <article>
      <h1>Mint a warranty</h1>
      <p>The serial is salted and hashed in this browser. Only the hash is sent.</p>
      <p className="note">
        Only accounts on the issuer allowlist can mint. Signed in as {accountId}.
      </p>
      <form onSubmit={(event) => void mint(event)}>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setTokenId(DEMO.tokenId);
            setSerial(DEMO.serial);
            setFund(DEMO.fund);
            setCap(DEMO.cap);
            setCooldownSeconds(DEMO.cooldownSeconds);
            setExpiryMinutes(DEMO.expiryMinutes);
            setWorkshopsText(DEMO.workshops);
            setTitle(DEMO.title);
            setDescription(DEMO.description);
          }}
        >
          Fill demo values
        </button>
        <Field id="token-id" label="Token id">
          <input id="token-id" value={tokenId} placeholder="e.g. EB-002" onChange={(event) => setTokenId(event.target.value)} />
        </Field>
        <Field id="serial" label="Serial (stays off-chain)">
          <input id="serial" value={serial} placeholder="e.g. FRAME-0001" onChange={(event) => setSerial(event.target.value)} />
        </Field>
        <Field id="salt" label="Salt (save this; it is not stored on-chain)">
          <div className="inline-field">
            <input
              id="salt"
              type={showSalt ? "text" : "password"}
              value={salt}
              autoComplete="off"
              onChange={(event) => setSalt(event.target.value)}
            />
            <button type="button" className="secondary" onClick={() => setShowSalt((value) => !value)}>
              {showSalt ? "Hide" : "Show"}
            </button>
            <button type="button" className="secondary" onClick={() => void navigator.clipboard?.writeText(salt)}>
              Copy
            </button>
          </div>
        </Field>
        <p>
          <button type="button" className="secondary" onClick={() => void refreshHash()}>Show serial hash</button>
        </p>
        {hashPreview ? <p>serial_hash: {hashPreview}</p> : null}
        <Field id="fund" label="Fund (NEAR)">
          <input id="fund" placeholder="e.g. 10" value={fund} onChange={(event) => setFund(event.target.value)} inputMode="decimal" />
        </Field>
        <Field id="cap" label="Per-claim cap (NEAR)">
          <input id="cap" placeholder="e.g. 0.3" value={cap} onChange={(event) => setCap(event.target.value)} inputMode="decimal" />
        </Field>
        <Field id="cooldown" label="Cooldown (seconds)">
          <input id="cooldown" placeholder="e.g. 60 seconds" value={cooldownSeconds} onChange={(event) => setCooldownSeconds(event.target.value)} inputMode="numeric" />
        </Field>
        <Field id="expiry" label="Expiry (minutes from now)">
          <input id="expiry" placeholder="e.g. 43200 (30 days)" value={expiryMinutes} onChange={(event) => setExpiryMinutes(event.target.value)} inputMode="numeric" />
        </Field>
        <Field id="workshops" label="Workshops (one account id per line)">
          <textarea id="workshops" placeholder="e.g. ws-a.phylaxtag-jiwoo-11041950.testnet" value={workshopsText} onChange={(event) => setWorkshopsText(event.target.value)} rows={3} />
        </Field>
        <Field id="title" label="Metadata title">
          <input id="title" placeholder="e.g. E-bike EB-002" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field id="description" label="Metadata description">
          <input id="description" placeholder="e.g. Warranty for one e-bike" value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <Field id="extra" label="Metadata extra">
          <input id="extra" placeholder="optional" value={extra} onChange={(event) => setExtra(event.target.value)} />
        </Field>
        <div className="card" data-testid="deposit-preview">
          <h2>Deposit preview</h2>
          {estimate ? (
            <>
              <p>Fund: {formatNear(estimate.fundYocto)}</p>
              <p>Storage deposit (upper estimate, {estimate.storageBytes.toString()} bytes): {formatNear(estimate.storageYocto)}</p>
              <p>Attached before signing: {formatNear(estimate.attachedYocto)}</p>
            </>
          ) : <p>Enter a fund amount to see the deposit.</p>}
          <p>Unused storage deposit is refunded by the contract. The worst-case record prepay is not refunded.</p>
        </div>
        <button type="submit">Mint warranty</button>
      </form>

      <h2>Close warranty / refund</h2>
      <Field id="close-id" label="Token id to close">
        <input id="close-id" placeholder="e.g. EB-001" value={closeId} onChange={(event) => setCloseId(event.target.value)} />
      </Field>
      <button type="button" className="secondary" onClick={() => void loadClose()}>Load warranty</button>
      {closeAsset === null ? <p>Warranty not found</p> : null}
      {closeAsset ? (
        <>
          <p>Status: <span className="status">{closeAsset.display_status}</span></p>
          {refund ? <p className="status">{refund}</p> : null}
          <p>Remaining fund: {formatNear(closeAsset.balance)}</p>
          <button type="button" onClick={() => void expire()}>Close warranty / refund</button>
        </>
      ) : null}
      <TxNotice tx={tx} explorer={explorer} />
    </article>
  );
}
