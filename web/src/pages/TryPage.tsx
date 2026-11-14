import { useEffect, useMemo, useState, type FormEvent } from "react";

import { isNearAccountId } from "../near/account-id";
import { formatNear, parseNearInput } from "../near/amounts";
import type { Chain } from "../near/chain";
import { estimateMintDeposit } from "../near/deposit";
import { explainError } from "../near/errors";
import { MINT_GAS } from "../near/gas";
import { randomSaltHex, serialHash } from "../near/hash";
import { Field, TxNotice, type TxState, useWalletPicker } from "../ui";

/** Limits the practice contract reports, plus the address to point at. */
interface OpenMintInfo {
  minted_total: number;
  cap: number;
  expiry_ns: string;
}

interface MintedToken {
  token_id?: string;
  owner_id?: string;
}

const THIRTY_DAYS_NS = 30n * 86_400n * 1_000_000_000n;

/** One account id per entry; a comma is accepted as a separator too. */
function splitWorkshops(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** `sandbox.<parent>` belongs to `<parent>`, so the workshop hint follows it. */
function parentOf(contractId: string): string {
  const dot = contractId.indexOf(".");
  return dot === -1 ? "" : contractId.slice(dot + 1);
}

export function TryPage({
  chain,
  accountId,
  practiceContractId,
  explorer,
}: {
  chain: Chain;
  accountId: string | null;
  practiceContractId: string;
  explorer: (hash: string) => string;
}) {
  const openWalletPicker = useWalletPicker();
  const [info, setInfo] = useState<OpenMintInfo | null>(null);
  const [used, setUsed] = useState(false);
  const [salt] = useState(randomSaltHex);
  const [serial, setSerial] = useState("PRACTICE-1");
  const [fund, setFund] = useState("0.5");
  const [cap, setCap] = useState("0.25");
  const [cooldownSeconds, setCooldownSeconds] = useState("60");
  const [workshop, setWorkshop] = useState("");
  const [title, setTitle] = useState("Practice tag");
  const [tx, setTx] = useState<TxState>({ kind: "idle" });
  const [demoToken, setDemoToken] = useState<string | null>(null);
  const [mintedId, setMintedId] = useState<string | null>(null);

  const parent = useMemo(() => parentOf(practiceContractId), [practiceContractId]);
  const defaultWorkshop = parent ? `ws-a.${parent}` : "ws-a.practice.testnet";

  useEffect(() => {
    if (!practiceContractId || !chain.viewOn) {
      return;
    }
    let active = true;
    void chain
      .viewOn<OpenMintInfo>(practiceContractId, "get_open_mint_info", {})
      .then((next) => {
        if (active) {
          setInfo(next);
        }
      })
      .catch(() => {
        // A missing view leaves the limits unpublished; the form still works.
      });
    return () => {
      active = false;
    };
  }, [chain, practiceContractId]);

  useEffect(() => {
    if (!accountId || !practiceContractId || !chain.viewOn) {
      setUsed(false);
      return;
    }
    let active = true;
    void chain
      .viewOn<boolean>(practiceContractId, "open_mint_used", { account_id: accountId })
      .then((taken) => {
        if (active) {
          setUsed(Boolean(taken));
        }
      })
      .catch(() => {
        if (active) {
          setUsed(false);
        }
      });
    return () => {
      active = false;
    };
  }, [chain, accountId, practiceContractId, tx]);

  // A visitor should not have to invent a workshop: the project workshop is
  // pre-filled, and the whole field list sits under "Advanced options".
  useEffect(() => {
    setWorkshop((current) => (current.trim() ? current : defaultWorkshop));
  }, [defaultWorkshop]);

  const problems = useMemo(() => {
    const list: string[] = [];
    if (!(Number(fund) > 0)) {
      list.push("Enter a fund larger than 0 NEAR.");
    }
    if (!(Number(cap) > 0)) {
      list.push("Enter a per-claim cap larger than 0 NEAR.");
    }
    if (Number(cap) > Number(fund)) {
      list.push("The cap cannot be larger than the fund.");
    }
    if (!(Number(cooldownSeconds) > 0)) {
      list.push("Enter a cooldown of at least 1 second.");
    }
    if (!serial.trim()) {
      list.push("Enter any serial text; only its hash is sent.");
    }
    const workshops = splitWorkshops(workshop);
    if (workshops.length === 0) {
      list.push("Enter one workshop account id.");
    }
    const notAnAccount = workshops.filter((item) => !isNearAccountId(item));
    if (notAnAccount.length > 0) {
      list.push(
        `${notAnAccount.join(", ")} is not a NEAR account id. It is an account, not a label: use lowercase letters, digits, - and _, with dots for sub-accounts (for example ws-a.${parent || "example.testnet"}).`,
      );
    }
    if (accountId && workshops.includes(accountId)) {
      list.push("The workshop cannot be your own account.");
    }
    if (!title.trim()) {
      list.push("Enter a title for the tag.");
    }
    return list;
  }, [fund, cap, cooldownSeconds, serial, workshop, accountId, title]);

  // An untouched form should not greet the visitor with a list of complaints.
  const showProblems = problems.length > 0 && Boolean(serial.trim() || title.trim());

  const estimate = useMemo(() => {
    try {
      return estimateMintDeposit({
        issuerAccountId: accountId ?? "practice.test",
        tokenId: "J-1",
        fundNear: fund,
        title,
        description: "Practice tag",
        extra: "",
        workshops: splitWorkshops(workshop),
      });
    } catch {
      return null;
    }
  }, [accountId, fund, title, workshop]);

  function requestArgs(hashed: string) {
    return {
      serial_hash: hashed,
      fund_amount: estimate ? estimate.fundYocto.toString() : "0",
      claim_cap: parseNearInput(cap).toString(),
      cooldown_ns: (BigInt(cooldownSeconds) * 1_000_000_000n).toString(),
      workshops: splitWorkshops(workshop),
      metadata: { title: title.trim(), description: "Practice tag", copies: 1 },
    };
  }

  function resetDefaults() {
    setSerial("PRACTICE-1");
    setFund("0.5");
    setCap("0.25");
    setCooldownSeconds("60");
    setWorkshop(defaultWorkshop);
    setTitle("Practice tag");
  }

  async function mint(event: FormEvent) {
    event.preventDefault();
    if (problems.length > 0 || !estimate || !practiceContractId || !chain.callOn) {
      return;
    }
    setTx({ kind: "waiting" });
    try {
      const hashed = await serialHash(salt, serial);
      const result = await chain.callOn(practiceContractId, {
        method: "mint_open",
        args: requestArgs(hashed),
        depositYocto: estimate.attachedYocto.toString(),
        gas: MINT_GAS,
        onPhase: (phase) => setTx({ kind: phase }),
      });
      const minted = (result.returnValue ?? {}) as MintedToken;
      const id = minted.token_id ?? "";
      setMintedId(id || null);
      setTx({
        kind: "success",
        hash: result.hash,
        detail: id ? `Minted ${id} on the practice contract.` : "Minted on the practice contract.",
      });
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : String(caught);
      setTx({ kind: "failure", ...explainError(raw) });
    }
  }

  async function demoMint() {
    if (problems.length > 0) {
      return;
    }
    try {
      const hashed = await serialHash(salt, serial);
      // The stand-in lives in the bundle for this section only; it never signs,
      // never holds a key, and nothing it does reaches a chain.
      const { FakeContract } = await import("../test-wallet/fake-contract");
      const fake = new FakeContract(practiceContractId || "practice.testnet");
      const callArgs = requestArgs(hashed);
      // The stand-in checks the same deposit rule as the contract, and there is
      // no real money here, so the fund amount stands in for the deposit.
      const minted = fake.call("mint_open", callArgs, "you.test", callArgs.fund_amount) as MintedToken;
      setDemoToken(minted.token_id ?? null);
      setTx({ kind: "idle" });
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : String(caught);
      setTx({ kind: "failure", ...explainError(raw) });
    }
  }

  const expiryDate = estimate
    ? new Date(Date.now() + Number(THIRTY_DAYS_NS / 1_000_000n)).toISOString().slice(0, 10)
    : "";

  return (
    <article>
      <h1>Try minting a tag</h1>
      <p>
        This page talks to the practice contract, a separate testnet deployment where anyone may mint
        one tag. You fund the warranty yourself, so there is nothing to drain, and the tag always
        expires 30 days after mint.
      </p>
      {practiceContractId ? (
        <p className="note">
          Practice contract: <code>{practiceContractId}</code>
          {info ? ` · ${info.minted_total} of ${info.cap} practice tags minted` : ""}
        </p>
      ) : (
        <p className="alert" role="alert">
          This build has no practice contract configured. Set VITE_PRACTICE_CONTRACT_ID.
        </p>
      )}

      {accountId && used ? (
        <div className="card">
          <h2>You already minted your practice tag</h2>
          <p>
            The practice contract accepts one tag per account, so {accountId} cannot mint another one.
            The practice deployment keeps its own token list, separate from the demo warranties, so open
            it under{" "}
            {practiceContractId ? (
              <a href={`https://testnet.nearblocks.io/accounts/${practiceContractId}`} target="_blank" rel="noreferrer">
                the practice explorer
              </a>
            ) : (
              "the practice explorer"
            )}
            , or use a different account.
          </p>
        </div>
      ) : null}

      <form onSubmit={(event) => void mint(event)}>
        <Field id="try-fund" label="Fund (NEAR) — you pay this into the tag">
          <input id="try-fund" value={fund} inputMode="decimal" onChange={(event) => setFund(event.target.value)} />
        </Field>
        <p className="note">
          Everything else already has a working value. Open “Advanced options” only if you want a
          different tag title, cap, cooldown, workshop or serial.
        </p>
        <details className="card advanced">
          <summary>Advanced options</summary>
          <Field id="try-title" label="Tag title">
            <input id="try-title" value={title} placeholder="e.g. Practice tag" onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field id="try-cap" label="Per-claim cap (NEAR)">
            <input id="try-cap" value={cap} inputMode="decimal" onChange={(event) => setCap(event.target.value)} />
          </Field>
          <Field id="try-cooldown" label="Cooldown (seconds)">
            <input id="try-cooldown" value={cooldownSeconds} inputMode="numeric" onChange={(event) => setCooldownSeconds(event.target.value)} />
          </Field>
          <Field id="try-workshop" label="Workshop account id (where a claim would be paid)">
            <input
              id="try-workshop"
              value={workshop}
              placeholder={defaultWorkshop || "ws-a.example.testnet"}
              onChange={(event) => setWorkshop(event.target.value)}
            />
            <span className="note">
              Already set to this project's workshop. A claim pays this account, so it has to be a
              real NEAR account, not a label like “E-bike”.
            </span>
          </Field>
          <Field id="try-serial" label="Serial (any text; it stays in this browser, only the hash is sent)">
            <input id="try-serial" value={serial} placeholder="e.g. PRACTICE-1" onChange={(event) => setSerial(event.target.value)} />
          </Field>
          <button type="button" className="secondary" onClick={resetDefaults}>
            Reset the defaults
          </button>
        </details>

        {showProblems ? (
          <ul className="alert" role="alert">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}

        <div className="card" data-testid="try-deposit-preview">
          <h2>Deposit preview</h2>
          {estimate ? (
            <>
              <p>Fund: {formatNear(estimate.fundYocto.toString())}</p>
              <p>Storage deposit (upper estimate, {estimate.storageBytes.toString()} bytes): {formatNear(estimate.storageYocto.toString())}</p>
              <p>Attached before signing: {formatNear(estimate.attachedYocto.toString())}</p>
              <p>Expiry: {expiryDate} (30 days after mint)</p>
            </>
          ) : (
            <p>Enter a fund amount to see the deposit.</p>
          )}
        </div>

        {accountId ? (
          <button type="submit" disabled={problems.length > 0 || used}>
            Mint my practice tag
          </button>
        ) : (
          <>
            <button type="button" onClick={openWalletPicker}>
              Connect a wallet to mint on testnet
            </button>
            <p className="note">
              No testnet wallet? Run the same form against an in-browser stand-in. Nothing is signed
              and nothing reaches a chain.
            </p>
            <button type="button" className="secondary" onClick={() => void demoMint()} disabled={problems.length > 0}>
              Mint in demo mode (nothing on chain)
            </button>
          </>
        )}

        <TxNotice tx={tx} explorer={explorer} />
        {mintedId && practiceContractId ? (
          <p>
            <a
              href={`https://testnet.nearblocks.io/nft-token/${practiceContractId}/${mintedId}`}
              target="_blank"
              rel="noreferrer"
            >
              {mintedId} on the block explorer
            </a>{" "}
            (the practice contract holds its own tokens, so it is not in the demo list on the home page).
          </p>
        ) : null}
        {demoToken ? (
          <p role="status">
            Demo mode minted <code>{demoToken}</code> in this tab only. Nothing was sent to a chain, and
            reloading forgets it.
          </p>
        ) : null}
      </form>
    </article>
  );
}
