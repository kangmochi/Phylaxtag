import { useEffect, useState } from "react";

import { formatNear } from "../near/amounts";
import type { Chain } from "../near/chain";
import type { StorageInfo } from "../near/types";
import { normalizeStorageInfo } from "../near/views";
import { AccountId, WalletLogo } from "../ui";
import { WALLETS } from "../wallets";

const FUNCTIONS = [
  "new",
  "add_issuer",
  "mint",
  "pay_service",
  "expire",
  "get_asset",
  "get_service_history",
  "get_holder_history",
  "get_storage_info",
  "nft_transfer",
  "nft_token",
  "nft_metadata",
  "nft_tokens",
  "nft_tokens_for_owner",
];

export function HowPage({ chain, contractId }: { chain: Chain; contractId: string }) {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setError(null);
    void chain.view("get_storage_info", {}).then((value) => {
      setInfo(normalizeStorageInfo(value));
    }).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  }

  useEffect(() => {
    let cancelled = false;
    void chain.view("get_storage_info", {}).then((value) => {
      if (!cancelled) {
        setInfo(normalizeStorageInfo(value));
      }
    }).catch((caught: unknown) => {
      if (!cancelled) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [chain]);

  return (
    <article>
      <header className="page-head">
        <p className="eyebrow">How it works</p>
        <h1>A warranty that travels with the item</h1>
        <p className="lead">
          A warranty here is a small money pot attached to one item. The maker puts money in, the owner
          can only pay repair shops from it, and when the item is sold the money and the repair history
          move to the new owner. Anyone can read the balance and every payment. Money can only go to
          approved workshops, or back to the issuer after expiry.
        </p>
      </header>

      <section className="card">
        <h2>Honest limits</h2>
        <ul>
          <li>Prototype on NEAR testnet, not a product.</li>
          <li>The NFT does not prove physical authenticity and is not a legal title.</li>
          <li>The link between the NFT and the bike is outside the contract.</li>
          <li>Nobody verifies that the repair really happened. An approved workshop can collude with an owner within the cap, cooldown, and expiry.</li>
          <li>There is no keeper and no required off-chain component.</li>
          <li>A seller can claim just before selling. The buyer may have to wait for the next claim. The page shows that time before the sale.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Official contract</h2>
        <p className="note">
          Only <AccountId id={contractId} /> is this project. A NEAR contract is a public WASM blob on
          chain, so any copy of this code can be deployed under another account. A copy has a different
          account id and cannot control these warranties: a token is identified by its contract account
          plus the token id.
        </p>
        <p className="note">
          To check what is deployed, read the code over RPC (<code>query</code> with{" "}
          <code>request_type: view_code</code>) and hash the returned bytes. The live contract hashes to{" "}
          <code>73a8da21…5e8c96</code> (366,256 bytes) at the time of writing.
        </p>
      </section>

      <section className="card">
        <h2>Technical details</h2>
        <h3>How control passes on transfer</h3>
        <ol>
          <li>There is exactly one source of truth for control: nft_token(token_id).owner_id in the NEP-171 contract.</li>
          <li>Every money-moving owner action (pay_service) checks predecessor == owner_id at call time. Nothing is cached, and there is no session, allowance, sub-account or access key per token.</li>
          <li>The warranty fund is a field of the token (Asset.balance), not of any account. A transfer changes owner_id and nothing else, so the fund, service history, cooldown clock and limits stay with the item.</li>
          <li>Transfer clears all NEP-178 approvals, so a marketplace or helper the seller approved loses its right to move the token.</li>
          <li>nft_transfer_call is disabled, so there is no window where a receiver contract is a temporary owner.</li>
          <li>Money can only leave to an approved workshop (never the owner) or to the issuer after expiry. A failed payment returns to the token, so whoever owns the token then benefits, never the old owner.</li>
          <li>The holder-only web page re-reads owner_id from the chain on every load and before every action, so the old owner sees &quot;Only the current holder can open this page&quot; right after the sale.</li>
        </ol>
      </section>

      <section className="card">
        <h2>Calls this app uses</h2>
        <ul>{FUNCTIONS.map((name) => <li key={name}><code>{name}</code></li>)}</ul>
      </section>

      <section className="card">
        <h2>Storage</h2>
        {error ? (
          <div className="alert" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void reload()}>Try again</button>
          </div>
        ) : null}
        {info ? (
          <ul>
            <li>storage_usage: {info.storage_usage} bytes</li>
            <li>total_locked: {formatNear(info.total_locked)}</li>
            <li>contract_balance: {formatNear(info.contract_balance)}</li>
          </ul>
        ) : <p className="note" role="status">Loading storage info.</p>}
      </section>

      <section className="card">
        <h2>Supported wallets</h2>
        <p className="note">
          Verified means someone signed in on NEAR testnet with that wallet and came back to this
          page with the account shown. Not verified means the wallet is wired into the connect
          screen but the sign-in has not been run yet; treat it as untested.
        </p>
        <table id="supported-wallets">
          <thead>
            <tr>
              <th>Wallet</th>
              <th>Type</th>
              <th>Testnet account</th>
              <th>Status</th>
              <th>How to use it</th>
            </tr>
          </thead>
          <tbody>
            {WALLETS.map((wallet) => (
              <tr key={wallet.id}>
                <td data-label="Wallet">
                  <span className="wallet-cell">
                    <WalletLogo entry={wallet} size={24} />
                    {wallet.name}
                  </span>
                </td>
                <td data-label="Type">{wallet.kind}</td>
                <td data-label="Testnet account">{wallet.testnetAccount}</td>
                <td data-label="Status">{wallet.status}</td>
                <td data-label="How to use it">{wallet.how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </article>
  );
}
