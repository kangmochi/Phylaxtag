import { useState } from "react";
import { Link, useNavigate } from "react-router";

import type { Chain } from "../near/chain";
import { normalizeNftToken } from "../near/views";
import type { NftToken } from "../near/types";
import { Field } from "../ui";

export function HomePage({ chain, accountId }: { chain: Chain; accountId: string | null }) {
  const navigate = useNavigate();
  const [tokenId, setTokenId] = useState("EB-001");
  const [mine, setMine] = useState<NftToken[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadMine() {
    if (!accountId) {
      setError("Connect a wallet to see your items.");
      return;
    }
    setError(null);
    const raw = await chain.view<unknown[]>("nft_tokens_for_owner", {
      account_id: accountId,
      from_index: "0",
      limit: 50,
    });
    setMine(raw.map((row) => normalizeNftToken(row)).filter((row): row is NftToken => row !== null));
  }

  return (
    <article>
      <h1>Phylaxtag</h1>
      <p>This e-bike has its own warranty fund. Sell the bike, and the fund and the service book move with it.</p>
      <p>To our knowledge, a working NFT-warranty implementation on NEAR. This is a testnet prototype. The NFT is not proof of authenticity and is not a legal title.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          navigate(`/asset/${tokenId.trim()}`);
        }}
      >
        <Field id="lookup" label="Warranty token id">
          <input id="lookup" value={tokenId} onChange={(event) => setTokenId(event.target.value)} />
        </Field>
        <button type="submit">Open warranty</button>
      </form>
      <p><Link to="/asset/EB-001">Open EB-001</Link></p>
      <h2>My items</h2>
      <button type="button" onClick={() => void loadMine()}>Load my items</button>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      {mine ? (
        <ul>
          {mine.map((token) => (
            <li key={token.token_id}><Link to={`/asset/${token.token_id}`}>{token.token_id}</Link></li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
