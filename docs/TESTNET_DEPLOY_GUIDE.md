# Phylaxtag testnet deploy guide

Version: 5 Nov 2026 (Asia/Jakarta). Checked against repo `kangmochi/phylaxtag` at `main` = `6d4fcdd` and against the live testnet contract. English only. **No keys, seed phrases or private credentials appear here, and none may be added.**

Markers on commands:

- **[repo]** — method names, argument shapes and deposits checked against the contract source or its tests.
- **[docs]** — syntax from the near-cli-rs documentation; confirm it against your installed version.
- **[live]** — value read from the current testnet deploy.
- **[estimate]** — calculated, re-check when you run it.

## Live deploy (current)

| Item | Value |
| --- | --- |
| Parent (testnet) | `phylaxtag-jiwoo-11041950.testnet` **[live]** |
| Contract | `demo.phylaxtag-jiwoo-11041950.testnet` **[live]** |
| Explorer | https://testnet.nearblocks.io/accounts/demo.phylaxtag-jiwoo-11041950.testnet |
| Web app | https://phylaxtag.vercel.app/ **[live]** |
| Demo token | `EB-005` — cap 0.3 NEAR, cooldown 900 s, expiry 2030-01-01; one claim of 0.3 NEAR paid, 0.7 NEAR left (RPC check, 6 Nov 2026) **[live]** |

If you redeploy under a new parent, replace `$PARENT` everywhere below. Never reuse a production seed, and never put one in chat or in a file.

## 0. Security rules (read first)

1. You type every command that creates or uses a key yourself.
2. Keys and seed phrases never enter chat, the repo, Vercel, CI, or any agent.
3. Testnet accounts only. Never link a mainnet wallet.
4. Testnet NEAR has no cash value.
5. Keys live on your machine (`~/.near-credentials` or the OS keychain). Do not commit or share them.
6. `web/.env` must not be committed (`web/.env.example` holds placeholders only).
7. After submission, revoke any GitHub token used for the project and discard the shared testnet seed (§9).

## 1. Tools (WSL / Ubuntu recommended)

```bash
sudo apt update && sudo apt install -y build-essential curl git pkg-config
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.sh | sh
near --version
```

The repo pins Rust **1.99.1** with the `wasm32-unknown-unknown` target and `clippy`/`rustfmt` in `rust-toolchain.toml` **[repo]**.

## 2. Clone and build the wasm

```bash
git clone https://github.com/kangmochi/phylaxtag.git
cd phylaxtag/contract
cargo build --target wasm32-unknown-unknown --release
ls -l target/wasm32-unknown-unknown/release/phylaxtag.wasm
```

Size: **367,032 bytes** with the release profile in `Cargo.toml` (measured on the 6 Nov 2026 rebuild that is deployed, sha256 `df5e5e69b98a74b292aba07bb68c2ccb816b79f2b312fb36b89a4a8d02f34f79`; the first deployment was 366,256 bytes, so expect the figure to move a little between rebuilds). That is about 3.67 NEAR locked for code storage. The older unoptimised build was 592,362 bytes.

## 3. Parent account and faucet

```bash
export PARENT=phylaxtag-jiwoo-11041950.testnet   # or your own unique name
near account create-account sponsor-by-faucet-service $PARENT \
  autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
near tokens $PARENT view-near-balance network-config testnet now
```

**Faucet note.** The CLI `sponsor-by-faucet-service` path has credited on the order of 10 NEAR per request in practice; the web faucet at https://docs.near.org/getting-started/faucet and the hackathon faucet table may credit a different amount (2 NEAR, rate limited). Treat the amount as unconfirmed and always read the balance after a request.

Extra top-ups: web faucet (account id only) or a testnet wallet, then `near account import-account` — you type the seed yourself; never in chat.

## 4. Sub-accounts (the parent pays)

Starting balances **[estimate]** for a fresh parent:

| Account | Role | Start |
| --- | --- | --- |
| `phylaxtag.$PARENT` | contract | ~5 NEAR (code + reserve; ~3.66 for the current wasm) |
| `admin.$PARENT` | admin | 0.5 NEAR |
| `issuer.$PARENT` | mint issuer | 2 NEAR |
| `alice.$PARENT` | first owner | 0.5 NEAR |
| `budi.$PARENT` | second owner | 0.5 NEAR |
| `ws-a.$PARENT` / `ws-b.$PARENT` | workshops | 0.1 NEAR each |

```bash
near account create-account fund-myself phylaxtag.$PARENT '5 NEAR' \
  autogenerate-new-keypair save-to-legacy-keychain \
  sign-as $PARENT network-config testnet sign-with-legacy-keychain send
```

Repeat for admin, issuer, alice, budi, ws-a and ws-b. Workshop accounts must exist, otherwise a payout fails and the amount returns to the token (T10/T20) **[repo]**.

## 5. Deploy and init in one transaction

`new(admin, issuers)` does not check the caller, so deploy and init together with `with-init-call`; a second `new` panics `Already initialized` **[repo]**.

```bash
cd ..   # repo root
near contract deploy phylaxtag.$PARENT \
  use-file contract/target/wasm32-unknown-unknown/release/phylaxtag.wasm \
  with-init-call new \
  json-args "{\"admin\":\"admin.$PARENT\",\"issuers\":[\"issuer.$PARENT\"]}" \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
  network-config testnet sign-with-legacy-keychain send
```

## 6. Mint a demo token like EB-005

Amounts are **yoctoNEAR strings** (1 NEAR = `1000000000000000000000000`). Times are nanoseconds: `900 s → 900000000000`. Argument shapes match `mint` in `contract/src/mint.rs` **[repo]**.

```bash
export EXPIRY=$(( ($(date +%s) + 30*86400) * 1000000000 ))

near contract call-function as-transaction phylaxtag.$PARENT mint json-args "{
  \"token_id\":\"EB-006\",
  \"serial_hash\":\"45422d3030360000000000000000000000000000000000000000000000000000\",
  \"fund_amount\":\"1000000000000000000000000\",
  \"expiry\":$EXPIRY,
  \"claim_cap\":\"300000000000000000000000\",
  \"cooldown_ns\":900000000000,
  \"workshops\":[\"ws-a.$PARENT\",\"ws-b.$PARENT\"],
  \"metadata\":{\"title\":\"E-bike EB-006\",\"description\":\"Warranty NFT for one e-bike\",\"copies\":1}
}" prepaid-gas '100 Tgas' attached-deposit '1.5 NEAR' \
  sign-as issuer.$PARENT network-config testnet sign-with-legacy-keychain send
```

Deposit = fund (1.0 NEAR) + storage (1,416 written bytes + 27,218 prepaid bytes ≈ 0.28634 NEAR, plus a margin for longer metadata). 1.5 NEAR leaves headroom; the contract refunds the unused part to the issuer. A smaller deposit fails with `Deposit too small` **[repo]**.

After mint the **issuer owns the token**. Transfer it (exactly 1 yoctoNEAR) **[repo]**:

```bash
near contract call-function as-transaction phylaxtag.$PARENT nft_transfer json-args \
  "{\"receiver_id\":\"alice.$PARENT\",\"token_id\":\"EB-006\",\"approval_id\":null,\"memo\":null}" \
  prepaid-gas '30 Tgas' attached-deposit '1 yoctoNEAR' \
  sign-as issuer.$PARENT network-config testnet sign-with-legacy-keychain send
```

Claim (owner → allowlisted workshop), also exactly 1 yoctoNEAR:

```bash
near contract call-function as-transaction phylaxtag.$PARENT pay_service json-args \
  "{\"token_id\":\"EB-006\",\"workshop\":\"ws-a.$PARENT\",\"amount\":\"300000000000000000000000\",\"note_hash\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"work_type\":\"brakes\"}" \
  prepaid-gas '30 Tgas' attached-deposit '1 yoctoNEAR' \
  sign-as alice.$PARENT network-config testnet sign-with-legacy-keychain send
```

Views:

```bash
near contract call-function as-read-only phylaxtag.$PARENT get_asset \
  json-args '{"token_id":"EB-006"}' network-config testnet now
near contract call-function as-read-only phylaxtag.$PARENT get_service_history \
  json-args '{"token_id":"EB-006"}' network-config testnet now
```

**Wallet panic note.** Contract panics often reach a wallet only as `WebAssembly trap: unreachable opcode`. The web app maps that string to a readable sentence (PR #8). Prefer the explorer receipt or the app's mapped message over the raw wallet text **[live / repo]**.

## 7. Web app on Vercel

From `web/vercel.json` **[repo]**:

1. Import GitHub repo `kangmochi/phylaxtag`.
2. **Root Directory:** `web`
3. Framework: Vite (install `npm ci`, build `npm run build`, output `dist`).
4. SPA rewrites are already in `vercel.json`, so refreshing `/asset/<id>` works.

Environment variables (public build-time values, not secrets). Set them for **Production and Preview**; Preview needs `VITE_RPC_URL` too or the build shows the config error:

| Name | Value |
| --- | --- |
| `VITE_CONTRACT_ID` | `demo.phylaxtag-jiwoo-11041950.testnet` **[live]** |
| `VITE_NETWORK_ID` | `testnet` — required; the app refuses to run without it **[repo]** |
| `VITE_RPC_URL` | required, e.g. `https://rpc.testnet.fastnear.com`; `VITE_RPC_FALLBACK_URL` defaults to FastNEAR in `web/src/config.ts` **[repo]** |
| `VITE_WALLETCONNECT_PROJECT_ID` | optional; only enables the EVM group (MetaMask, Coinbase Wallet, WalletConnect QR). Not set in the current production deploy, so the group is hidden **[live]** |

Never set `VITE_TEST_WALLET` on a real deploy **[repo]**. No keys or seeds belong in Vercel; users connect their own testnet wallets. Meteor is recommended; MyNearWallet is retired for new connections.

Local run:

```bash
cp web/.env.example web/.env
# edit VITE_CONTRACT_ID / VITE_RPC_URL / VITE_NETWORK_ID
cd web && npm ci && npm run dev
```

## 8. Quick verification checklist

- [ ] Contract account matches the explorer link above (or your new id).
- [ ] Mint + transfer + one `pay_service` under the cap succeeds.
- [ ] Over-cap and in-cooldown claims fail (the wallet may only show the unreachable-opcode string).
- [ ] Vercel Production and Preview both have `VITE_RPC_URL`.
- [ ] `git status` clean: no `.env`, no credential files.
- [ ] Only public values shared: contract id, explorer URL, web URL — never keys or seeds.

## 9. Post-submit cleanup

- [ ] Revoke any GitHub personal access token or fine-grained token created for this project.
- [ ] Discard the shared testnet seed (burner parent and sub-accounts). Do not reuse it.
- [ ] Confirm Vercel still holds only public `VITE_*` values.
- [ ] Confirm the public README has no keys, seeds or mainnet payout secrets.
- [ ] Optional: rotate burner accounts that were shared with reviewers.

## Sources

- https://github.com/kangmochi/phylaxtag
- https://docs.near.org/tools/cli · https://docs.near.org/getting-started/faucet · https://docs.near.org/getting-started/create-account
- https://github.com/near/near-cli-rs
- `docs/DECISIONS.md` (pinned versions, measured gas and storage)
