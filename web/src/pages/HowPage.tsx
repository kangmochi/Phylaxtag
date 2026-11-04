import { useEffect, useState } from "react";

import { formatNear } from "../near/amounts";
import type { Chain } from "../near/chain";
import type { StorageInfo } from "../near/types";
import { normalizeStorageInfo } from "../near/views";

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

export function HowPage({ chain }: { chain: Chain }) {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <h1>How it works</h1>
      <p>
        Phylax (φύλαξ) is Greek for &quot;guardian&quot;: the warranty is a guardian that lives on the item and transfers with it.
        To our knowledge, a working NFT-warranty implementation on NEAR.
      </p>
      <h2>How control passes on transfer</h2>
      <ol>
        <li>There is exactly one source of truth for control: nft_token(token_id).owner_id in the NEP-171 contract.</li>
        <li>Every money-moving owner action (pay_service) checks predecessor == owner_id at call time. Nothing is cached, and there is no session, allowance, sub-account or access key per token.</li>
        <li>The warranty fund is a field of the token (Asset.balance), not of any account. A transfer changes owner_id and nothing else, so the fund, service history, cooldown clock and limits stay with the item.</li>
        <li>Transfer clears all NEP-178 approvals, so a marketplace or helper the seller approved loses its right to move the token.</li>
        <li>nft_transfer_call is disabled, so there is no window where a receiver contract is a temporary owner.</li>
        <li>Money can only leave to an approved workshop (never the owner) or to the issuer after expiry. A failed payment returns to the token, so whoever owns the token then benefits, never the old owner.</li>
        <li>The holder-only web page re-reads owner_id from the chain on every load and before every action, so the old owner sees &quot;Only the current holder can open this page&quot; right after the sale.</li>
      </ol>
      <h2>Calls this app uses</h2>
      <ul>{FUNCTIONS.map((name) => <li key={name}><code>{name}</code></li>)}</ul>
      <h2>Storage</h2>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      {info ? (
        <ul>
          <li>storage_usage: {info.storage_usage} bytes</li>
          <li>total_locked: {formatNear(info.total_locked)}</li>
          <li>contract_balance: {formatNear(info.contract_balance)}</li>
        </ul>
      ) : <p role="status">Loading storage info.</p>}
      <h2>Honest limits</h2>
      <ul>
        <li>Prototype on NEAR testnet, not a product.</li>
        <li>The NFT does not prove physical authenticity and is not a legal title.</li>
        <li>The link between the NFT and the bike is outside the contract.</li>
        <li>Nobody verifies that the repair really happened. An approved workshop can collude with an owner within the cap, cooldown, and expiry.</li>
        <li>There is no keeper and no required off-chain component.</li>
        <li>A seller can claim just before selling. The buyer may have to wait for the next claim. The page shows that time before the sale.</li>
      </ul>
    </article>
  );
}
