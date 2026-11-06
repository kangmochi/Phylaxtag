# Phylaxtag

This e-bike has its own warranty fund. Sell the bike, and the fund and the service book move with it.

Phylaxtag turns one physical item (MVP: one e-bike) into a NEP-171 NFT on NEAR. The warranty fund is stored on the token, so it moves with the NFT when the item is sold. The issuer funds it once at mint. The owner can never withdraw it. Phylax (φύλαξ) is Greek for "guardian": the warranty is a guardian that lives on the item and transfers with it.

To our knowledge, a working NFT-warranty implementation on NEAR. This repository is a testnet prototype. The NFT is not proof of authenticity and is not a legal title. The contract can mint a warranty, pay an approved workshop, transfer the NFT, and close it after expiry. Those paths are covered by unit tests and by sandbox tests on a local chain. The web app is in `web/` and is deployed on NEAR testnet (below).

## Live demo (NEAR testnet)

| What | Value |
| --- | --- |
| Web app | https://phylaxtag.vercel.app/ |
| X | https://x.com/Phylaxtag |
| Contract | `demo.phylaxtag-jiwoo-11041950.testnet` |
| Explorer | https://testnet.nearblocks.io/accounts/demo.phylaxtag-jiwoo-11041950.testnet |
| Demo token | `EB-005` — fund 1.0 NEAR at mint, per-claim cap 0.3 NEAR, cooldown 900 s; one claim of 0.3 NEAR paid, 0.7 NEAR left (checked on chain 6 Nov 2026) |
| Parent account | `phylaxtag-jiwoo-11041950.testnet` |

| Deployment | Vercel builds `web/` on every push to `main`; the build needs `VITE_CONTRACT_ID`, `VITE_RPC_URL`, `VITE_NETWORK_ID`, and `VITE_WALLETCONNECT_PROJECT_ID` for the EVM group |

### What a visitor can try

| Action | Who can do it today |
| --- | --- |
| Read a warranty, its history, the holder log and the storage figures | Anyone, without a wallet |
| Connect a wallet | Anyone on NEAR testnet; the app only ever signs for the account you connect |
| `mint` | Only an account on the issuer allowlist. Any other wallet is refused with "This account is not an allowed issuer." |
| `pay_service`, `nft_transfer` | Only the current holder of that token, or an account the holder approved for the transfer (NEP-178). `pay_service` is refused while any approval is active, so a listed token cannot be drained before the sale |
| `expire` | Anyone, but only after that token's expiry (the demo token `EB-005` expires on 2030-01-01) |

So a visitor can read everything and connect a wallet, while the state-changing calls stay with
the roles the contract defines. That is deliberate: the fund and the ownership both live inside
the token, so a call that anyone could make would let anyone move somebody else's money or item.

To exercise the holder flow, reply to [@Phylaxtag](https://x.com/Phylaxtag) with a testnet account
id and a demo token can be transferred to it, which makes `pay_service`, `nft_transfer` and the
holder-only page yours to try.

### Official contract

Only `demo.phylaxtag-jiwoo-11041950.testnet` is this project. An earlier testnet contract,
`phylaxtag.phylaxtag-jiwoo-11041950.testnet`, is kept as an archive: it holds the first round of
demo tokens and is no longer used by the app. The contract code is public by nature: a NEAR contract ships as a WASM blob that anyone can download from the chain, so hiding the source would not prevent a copy. What a copy cannot do is take over these warranties, because a token is identified by its contract account plus `token_id`, and a redeployed copy lives under a different account id.

To check what is actually deployed, read the code over RPC and hash the returned bytes. At the time of writing (6 Nov 2026) this prints `63cfae3d60e84168fc03dc1eb426dbef7b76f76a2ca536f2539278ee6768cebe` for 367,712 bytes:

```bash
curl -s https://rpc.testnet.fastnear.com -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_code","finality":"final","account_id":"demo.phylaxtag-jiwoo-11041950.testnet"}}' \
  | jq -r .result.code_base64 | base64 -d | sha256sum
```

Rebuilding `contract/` from this repository should produce a wasm with the same hash while the deployed code and the source stay in step.

Home labels: **All warranties**, **Your side**. Wallets: NEAR wallets come first and **Meteor** is the recommended one; **MyNearWallet is retired** for new app connections. EVM wallets (MetaMask, Coinbase Wallet, WalletConnect QR) ship in this repository but the group is hidden unless `VITE_WALLETCONNECT_PROJECT_ID` is set at build time, and **no EVM sign-in has been verified yet**.

## How control passes on transfer

1. There is exactly one source of truth for control: `nft_token(token_id).owner_id` in the NEP-171 contract.
2. Every money-moving owner action (`pay_service`) checks `predecessor == owner_id` at call time. Nothing is cached, and there is no session, allowance, sub-account or access key per token.
3. The warranty fund is a field of the token (`Asset.balance`), not of any account. A transfer changes `owner_id` and nothing else, so the fund, service history, cooldown clock and limits stay with the item.
4. Transfer clears all NEP-178 approvals, so a marketplace or helper the seller approved loses its right to move the token.
5. `nft_transfer_call` is disabled, so there is no window where a receiver contract is a temporary owner.
6. Money can only leave to an approved workshop (never the owner) or to the issuer after expiry. A failed payment returns to the token, so whoever owns the token then benefits, never the old owner.
7. The holder-only web page re-reads `owner_id` from the chain on every load and before every action, so the old owner sees "Only the current holder can open this page" right after the sale.

## Try it

- Run `cargo test` in `contract/` - see 62 tests pass.
- Run `cargo test` in `integration-tests/` - see 8 tests pass. Build the release wasm first (the line below). CI runs this on a GitHub-hosted runner with `--test-threads=1`. The sandbox creates its own accounts. It needs a network the first time, because `near-sandbox` downloads its binary.
- Run `cargo fmt --check` in `contract/` and in `integration-tests/` - see no diff. CI runs this.
- Run `cargo clippy --all-targets -- -D warnings` in `contract/` and in `integration-tests/` - see no warnings. CI runs this.
- Run `cargo build --target wasm32-unknown-unknown --release` in `contract/` - see `contract/target/wasm32-unknown-unknown/release/phylaxtag.wasm`. The wasm file is gitignored.
- Run `npm test` in `web/` - see 70 tests pass (Vitest).
- Run `npm run e2e` in `web/` - see 27 tests pass (Playwright).
- Deploy to testnet - the live demo uses `demo.phylaxtag-jiwoo-11041950.testnet` under parent `phylaxtag-jiwoo-11041950.testnet`; the full procedure is in [docs/TESTNET_DEPLOY_GUIDE.md](docs/TESTNET_DEPLOY_GUIDE.md).

## Build

From `contract/`, with Rust 1.99.1 (see `rust-toolchain.toml`; rustup installs it, including `wasm32-unknown-unknown`):

```sh
cargo build --target wasm32-unknown-unknown --release
```

`contract/Cargo.toml` sets `[profile.release]` to `opt-level = "z"`, link-time optimisation, one codegen unit, `panic = "abort"`, `strip = true`, and `overflow-checks = true`. Measured on 4 November 2026 (Asia/Jakarta) with that toolchain:

| Build | Wasm bytes | NEAR locked (bytes × 10^19 yoctoNEAR) |
| --- | --- | --- |
| Release before that profile | 592_362 | 5.92362 NEAR |
| Release with that profile | 366_144 | 3.66144 NEAR |

`wasm-opt` was not on the machine, so there is no `wasm-opt -Oz` size. The tests load the Cargo release wasm, not a `wasm-opt` binary. The wasm file is gitignored.

## Deploy to testnet

Deployed on NEAR testnet: contract `demo.phylaxtag-jiwoo-11041950.testnet` under parent `phylaxtag-jiwoo-11041950.testnet`. The user deployed with their own accounts and keys; this repository holds no key, seed phrase, access token, or contract account. The step-by-step guide, including account creation, mint, transfer, claim, Vercel environment values and post-submit cleanup, is in [docs/TESTNET_DEPLOY_GUIDE.md](docs/TESTNET_DEPLOY_GUIDE.md).

Build the contract with the command in "Build". The wasm path is `contract/target/wasm32-unknown-unknown/release/phylaxtag.wasm`.

For the web app, set the Vercel project root directory to `web/`. `web/vercel.json` sets the install command to `npm ci`, the build command to `npm run build`, and the output directory to `dist`. It also rewrites every path to `/index.html` after Vercel has checked the filesystem, so a refresh of `/asset/<id>` still loads the app. The router is `BrowserRouter` (browser history, not a hash router), so that rewrite is required. Set `VITE_CONTRACT_ID` in the Vercel environment. `VITE_RPC_URL` and `VITE_NETWORK_ID` are the other build values. `web/.env.example` has placeholders only.

## Test

```sh
cd contract
cargo test
```

62 tests pass. `cargo test` in `contract/` does not need OpenSSL or pkg-config.

Spec IDs in this run:

- T01 `t01_balance_moves_with_nft`
- T02 `t02_old_owner_cannot_pay`, `t02_new_owner_pays_after_cooldown`, `t02_missing_token_not_found`
- T03 `t03_non_approved_workshop_rejected`
- T04 `t04_cap_enforced`, `t04_cap_enforced_exact_cap_succeeds`, `t04_zero_amount_rejected`
- T05 `t05_over_balance_rejected`
- T06 `t06_expiry_returns_funds_to_issuer`
- T07 `t07_pay_after_expiry_rejected`
- T08 `t08_only_allowlisted_issuer_can_mint`
- T09 `t09_second_expire_is_noop`
- T10 `t10_failed_payout_restores_balance`
- T11 `t11_expire_before_expiry_rejected`
- T12 `t12_approved_account_cannot_pay`
- T13 `t13_transfer_call_disabled`
- T14 `t14_history_view_paginated`
- T15 `t15_cooldown_enforced_inside_window`, `t15_cooldown_enforced_succeeds_after`
- T16 `t16_cooldown_not_reset_by_transfer`
- T18 `t18_owner_cannot_pay_self`
- T19 `t19_sale_mid_payout_failure_unit`
- T21 `t21_failed_payout_after_expire`
- T22 `t22_failed_expire_refund_restores`
- T23 `t23_listed_token_blocks_claim`, `t23_claim_works_after_revoke`
- T24 `t24_approvals_cleared_on_transfer`
- T25 `t25_holder_history_records_transfers`
- T27 `t27_history_cap_50`
- T28 `t28_no_remint_same_token_id`, `t28_no_remint_same_serial_hash`
- T29 `t29_mint_input_validation_past_expiry`, `t29_mint_input_validation_cap_zero`, `t29_mint_input_validation_cap_above_fund`, `t29_mint_input_validation_empty_workshops`, `t29_mint_input_validation_issuer_as_workshop`, `t29_mint_input_validation_duplicate_workshop`, `t29_mint_input_validation_token_id_empty`, `t29_mint_input_validation_token_id_too_long`, `t29_mint_input_validation_serial_hash_short`, `t29_mint_input_validation_serial_hash_uppercase`, `t29_mint_input_validation_serial_hash_non_hex`, `t29_mint_accepts_boundary_token_ids`, `t29_mint_input_validation_deposit_too_small`
- T30 `t30_string_limits_work_type`, `t30_string_limits_note_hash`
- T34 `t34_mint_rejects_zero_cooldown`
- T35 `t35_same_block_double_claim_rejected`
- T36 `t36_expire_empty_fund_marks_expired`
- T37 `t37_holder_log_full_never_blocks_transfer`
- T39 `t39_mint_rejects_contract_as_workshop`

Also, not spec IDs: `mint_happy_path`, `add_issuer_rejects_non_admin`, `new_rejects_second_init`, `different_issuer_may_reuse_serial_hash`, `pay_service_requires_one_yocto`, `expire_rejects_missing_token`, `expire_noop_while_refund_in_flight`, `storage_prepay_matches_one_service_record`, `storage_prepay_covers_full_rings`.

`different_issuer_may_reuse_serial_hash` checks the accepted residual risk in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) S11: a second issuer may mint the same `serial_hash`.

Not in this run:

- T17, T20, the full T26 byte and cost measurement, the T37 storage check, and sandbox repeats of T10, T19, and T22 are in `integration-tests/`. See below.
- T31, T32, and T38 are the three Playwright tests in `web/e2e/web.spec.ts`.
- T33 is a manual newcomer run.

## Sandbox tests

From a fresh checkout:

```sh
cd contract
cargo build --target wasm32-unknown-unknown --release
cd ../integration-tests
cargo test -- --test-threads=1
```

8 tests pass. The first run downloads the `near-sandbox` 0.4.0 binary. Every account is created by that local chain.

- T10 `t10_sandbox_missing_workshop_restores_cooldown`
- T17 `t17_no_top_up_and_locked_follows_funds_only`
- T19 `t19_sandbox_sale_mid_failed_payout`
- T20 `t20_sale_mid_payout_missing_workshop`, `t20_sale_mid_payout_workshop_is_paid`
- T22 `t22_sandbox_missing_issuer_restores_refund`
- T26 `t26_storage_invariant_and_byte_cost`
- T37 `t37_sandbox_long_accounts_stay_inside_prepay`

Measured on 4 November 2026 (Asia/Jakarta) with `near-workspaces` 0.24.0. The storage price on that chain was 10^19 yoctoNEAR per byte.

- One mint wrote 1,416 bytes (0.01416 NEAR). The worst-case prepay is charged on top of that and is not refunded. `WORST_CASE_TOKEN_BYTES` is 27,200. For a 7-byte issuer the extra prepay is 27,218 bytes (0.27218 NEAR).
- One service record added 299 bytes (0.00299 NEAR).
- One holder record, between two account ids of equal length, added 120 bytes (0.0012 NEAR).

Callback gas is 5 TGas. The highest measured callback burn was `on_payout` failure at 2.455 TGas. The margin and the other figures are in `docs/DECISIONS.md`.

T06, T10, T19, T21, T22, and T36 check one part of the T26 invariant after every state change. The test keeps its own ledger from the amounts it passed in (mint deposits, accepted payouts, expiry refunds, and restores). It then checks that `total_locked` matches that ledger and that the sum of `get_asset` balances matches `total_locked`.

## Repo layout

- `contract/` - Rust NEAR contract crate `phylaxtag`
- `integration-tests/` - sandbox tests (`near-workspaces` 0.24.0). Not used by `contract/`.
- `web/` - Vite + React + TypeScript app. Read-only pages use RPC view calls. Signing uses NEAR Wallet Selector on testnet.
- `docs/SPEC.md` - contract and web design reference: actors, interface, limits, storage, events, tests
- `docs/ARCHITECTURE.md` - how the contract, the web app and the tests fit together
- `docs/THREAT_MODEL.md` - how a seller could try to keep the money or the access, and what stops it
- `docs/DECISIONS.md` - pinned crate and npm versions, measured gas, and measured storage
- `docs/TESTNET_DEPLOY_GUIDE.md` - deploy, mint, claim, Vercel setup, and post-submit cleanup
- `.github/workflows/ci.yml` - contract fmt, clippy, and test, the sandbox job, and the web job, on pull requests and on pushes to `main`

## Status

In this repository now:

- `new`, `add_issuer`, and `mint` (checks and storage accounting from [docs/SPEC.md](docs/SPEC.md) sections 6.1 and 8, including the worst-case record prepay)
- `pay_service` and `on_payout` (idempotent; a failed payout restores the balance, `total_locked`, and the cooldown)
- `expire` and `on_expire_payout` (idempotent; `warranty_expired` once, later attempts `expire_refund_retried`; a call while a refund is already in flight returns 0)
- `nft_transfer` writes the holder log (50-entry ring, drop oldest)
- Views `get_asset` (display status from [docs/SPEC.md](docs/SPEC.md) section 6.3), `get_service_history`, `get_holder_history`, `get_storage_info`, and the NEP-171 / NEP-177 / NEP-181 views
- NEP-178 approval methods, delegated to `near-contract-standards`
- `nft_transfer_call` always panics with `nft_transfer_call disabled in MVP`
- Sandbox tests for T10, T17, T19, T20, T22, T26, and T37

The web app has the warranty page, the history page, the issuer page (mint and close), the holder-only page (pay and sell), a workshop payments view, My items, and How it works. It uses only the view and call names in `contract/src/lib.rs`.

Not built yet:

- T33 (newcomer run of this README) is still manual.
- EVM sign-in, EVM meta-transactions and an EVM account passing the issuer allowlist: code ships, none of it is verified yet.
- An above-cap issuer approval step: not built.

Callback gas is 5 TGas, from the sandbox measurement in `docs/DECISIONS.md`.

## Libraries used

- Rust 1.99.1
- `near-sdk` 5.30.0
- `near-contract-standards` 5.30.0
- `near-workspaces` 0.24.0, in `integration-tests/` only, with the `experimental` feature
- `near-primitives` 0.38.0, in `integration-tests/` only (the version `near-workspaces` 0.24.0 already uses)
- `near-sandbox` 0.4.0, brought in by `near-workspaces`

Versions, the day they were checked, why they were chosen, and the previous stable fallback are in `docs/DECISIONS.md`.

Web, pinned in `web/package.json` (licenses in `docs/DECISIONS.md`):

- Node.js 26.13.0
- Vite 8.3.5, React 19.3.1, React DOM 19.3.1, React Router 8.5.1
- TypeScript 6.0.3, typescript-eslint 8.72.1, ESLint 10.14.0
- Vitest 5.1.0, Playwright 1.64.1
- `@near-wallet-selector/core`, `modal-ui`, `meteor-wallet`, `here-wallet`, `sender`, `nightly`, `intear-wallet`, `ledger`, and `my-near-wallet` (retired, hidden from the picker) 10.1.4
- `@near-wallet-selector/ethereum-wallets` 10.1.4 with `wagmi` 2.19.5, `@wagmi/core` 2.21.1, `@wagmi/connectors` 5.10.2 (EVM group, hidden unless `VITE_WALLETCONNECT_PROJECT_ID` is set)
- `@near-js/transactions` 2.5.1, `buffer` 6.0.3

## Run the web app locally

Prerequisites: Node.js 26.13.0 (`web/.nvmrc`) and npm. No Rust toolchain is required for the web job. The app never asks for a key or a seed phrase.

```sh
cd web
cp .env.example .env
npm ci
npm run dev
```

`web/.env.example` sets `VITE_CONTRACT_ID=your-contract.testnet`, `VITE_RPC_URL=https://rpc.testnet.near.org`, and `VITE_NETWORK_ID=testnet`. Leave `VITE_TEST_WALLET` unset. Open the printed local URL - the header carries a `Testnet` badge. Read-only pages call the RPC without a wallet. Connect uses NEAR Wallet Selector on testnet only. A missing env file shows a configuration error screen instead of the app, and it does not start the test wallet.

- Run `npm run typecheck` in `web/` - see no type errors.
- Run `npm run lint` in `web/` - see no lint errors.
- Run `npm test` in `web/` - see 70 tests pass.
- Run `npm run build` and then `npm run check:bundle` in `web/` - see "Production bundle is clean" and no test-wallet marker.
- Run `npx playwright install chromium` once, then run `npm run e2e` in `web/` - see 27 tests pass (Playwright).

The browser suite (27 tests) covers `T31 gated page access`, `T32 sell button flow` and `T38 status labels and next claim`, plus the wallet picker at 375 px, the EVM group with a dummy project id, the mobile table header, and the issuer gate. They set `VITE_TEST_WALLET=1`, which is a build flag. That build talks to an in-memory contract and switches account labels. It has no keys. The production build resolves the same import to a disabled module, and `check:bundle` fails if the test marker or a Google Fonts URL is in `web/dist`.

The JSON shapes in `web/src/test-wallet/fixtures/sandbox-views.json` were copied from one local sandbox mint: `get_asset`, `get_service_history`, `get_holder_history`, `get_storage_info`, `nft_token`, and `nft_metadata`. The unit test parses that file as text so the expiry nanoseconds stay exact. The Playwright state is a separate in-memory copy with the same field names and yoctoNEAR strings. A successful sandbox `expire` settles its callback before a test can read `pending_refund`, so the in-flight fixture uses the same yoctoNEAR string encoding as `balance`.

### Deposit shown before mint

The contract has no quote view. For a 7-character issuer and the measured demo metadata, storage is 1,416 bytes written by mint plus 27,218 prepaid bytes = 28,634 bytes = 0.28634 NEAR, at 10^19 yoctoNEAR per byte. The page adds a 2,000 byte margin (0.02 NEAR) for longer metadata. If the title, description, and extra text exceed that margin, the longer count replaces it. A shorter issuer adds two bytes per missing byte, because the owner id is stored twice. Each workshop after the first adds 4 bytes plus the account id length. A token id longer than `EB-001` adds the extra bytes. The attached deposit is the fund plus that storage amount. The page says "Unused storage deposit is refunded by the contract." The worst-case record prepay is not refunded. The formula is `estimateMintDeposit` in `web/src/near/deposit.ts`.

Gas attached by the app, from `web/src/near/gas.ts`: 15 TGas for `mint` (measured burn 3_633_924_445_063 gas) and 30 TGas for `pay_service`, `expire`, and `nft_transfer`. Unused gas is refunded. Details are in `docs/DECISIONS.md`.

## Campaign videos

Two short films summarise the project. Both are rendered at 1280x720 with an English voiceover and a
CC0 music bed; the sources and licences are listed in [docs/CREDITS.md](docs/CREDITS.md).

| Film | Length | File | What it covers |
| --- | --- | --- | --- |
| Hero | 45 s | [phylaxtag-hero-45s.mp4](docs/videos/phylaxtag-hero-45s.mp4) | Why a warranty dies at resale, and how the fund travels with the token |
| Explainer | 124 s | [phylaxtag-explainer-124s.mp4](docs/videos/phylaxtag-explainer-124s.mp4) | Mint, transfer, claim caps, approvals, expiry, public reads, and the limits of the prototype |

Poster frames: [hero](docs/videos/hero-poster.png) · [explainer](docs/videos/explainer-poster.png).

## Demo script

For a live walkthrough (about 90 seconds). The public run uses the deployed contract and the demo token `EB-005`; with `VITE_TEST_WALLET=1` the same screens run locally against the in-memory contract, using the "Demo preset" on the issuer page and the account buttons `issuer.test`, `alice.test`, and `budi.test`.

1. The issuer opens the issuer page, mints EB-001, and the deposit preview is visible before the wallet opens. It shows the fund and the storage deposit, and it says unused storage deposit is refunded by the contract.
2. The owner opens the holder page for EB-001, requests a service payment inside the cap, and the workshop is paid. The service record reads Paid.
3. A claim over the cap is rejected. The page shows "That amount is over the per-claim cap." and the original contract string "Over cap".
4. Optional: after expiry, close the warranty. While the refund transfer has not settled, the page shows "Refund in flight: X NEAR". The returned amount stays 0 until that transfer finishes.

## Team and AI disclosure

**Team (3 members, one human and two AI agents):** pranesta kresa (lead, human); Pharita (AI agent, spec, schedule and submission materials); Jiwoo (AI agent, red-team review, README and web fixes).

**Who wrote what**

- Smart contract, unit tests and sandbox tests: Cursor's coding agent (model as reported by the Cursor team; an earlier revision of this README said "Cursor Grok 4.7").
- Web app in `web/`: Jiwoo, a Hermes agent running `deepseek-v4.1-flash` through OpenRouter.
- Spec, schedule and submission materials: Pharita, a Grok agent on xAI; the spec owner names the exact model version.
- Campaign videos in `docs/videos/`: script, storyboard and edit by Jiwoo; the voiceover is synthetic, generated with an open-source text-to-speech model on the owner's own hardware from a reference clip the owner supplied; the films were rendered from HTML compositions by the same agent. The music is a CC0 track, credited in [docs/CREDITS.md](docs/CREDITS.md).

Both code-generation services are named above; no further code-generation service was used. Every change went through a pull request and a review; no agent holds a key or a seed phrase. An earlier revision of this README said that all code, including the web app, came from Cursor AI agents and that no other code-generation service was used; the lines above replace that sentence.

## License

MIT. See [LICENSE](LICENSE).
