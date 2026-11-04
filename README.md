# Phylaxtag

This e-bike has its own warranty fund. Sell the bike, and the fund and the service book move with it.

Phylaxtag turns one physical item (MVP: one e-bike) into a NEP-171 NFT on NEAR. The warranty fund is stored on the token, so it moves with the NFT when the item is sold. The issuer funds it once at mint. The owner can never withdraw it. Phylax (φύλαξ) is Greek for "guardian": the warranty is a guardian that lives on the item and transfers with it.

To our knowledge, a working NFT-warranty implementation on NEAR. This repository is a testnet prototype. The NFT is not proof of authenticity and is not a legal title. The contract can mint a warranty, pay an approved workshop, transfer the NFT, and close it after expiry. Those paths are covered by unit tests and by sandbox tests on a local chain. The web app is in `web/`. There is no testnet deploy yet, and the contract id in the example env is a placeholder, so a public-chain demo still needs a later deploy.

## How control passes on transfer

1. There is exactly one source of truth for control: `nft_token(token_id).owner_id` in the NEP-171 contract.
2. Every money-moving owner action (`pay_service`) checks `predecessor == owner_id` at call time. Nothing is cached, and there is no session, allowance, sub-account or access key per token.
3. The warranty fund is a field of the token (`Asset.balance`), not of any account. A transfer changes `owner_id` and nothing else, so the fund, service history, cooldown clock and limits stay with the item.
4. Transfer clears all NEP-178 approvals, so a marketplace or helper the seller approved loses its right to move the token.
5. `nft_transfer_call` is disabled, so there is no window where a receiver contract is a temporary owner.
6. Money can only leave to an approved workshop (never the owner) or to the issuer after expiry. A failed payment returns to the token, so whoever owns the token then benefits, never the old owner.
7. The holder-only web page re-reads `owner_id` from the chain on every load and before every action, so the old owner sees "Only the current holder can open this page" right after the sale.

## Try it

- Run `cargo test` in `contract/` - see 61 tests pass.
- Run `cargo test` in `integration-tests/` - see 8 tests pass. Build the release wasm first (the line below). CI runs this on a GitHub-hosted runner with `--test-threads=1`. The sandbox creates its own accounts. It needs a network the first time, because `near-sandbox` downloads its binary.
- Run `cargo fmt --check` in `contract/` and in `integration-tests/` - see no diff. CI runs this.
- Run `cargo clippy --all-targets -- -D warnings` in `contract/` and in `integration-tests/` - see no warnings. CI runs this.
- Run `cargo build --target wasm32-unknown-unknown --release` in `contract/` - see `contract/target/wasm32-unknown-unknown/release/phylaxtag.wasm`. The wasm file is gitignored.
- Run `npm test` in `web/` - see 7 tests pass.
- Run the web e2e tests in `web/` - see 3 tests pass.
- Deploy to testnet - TODO (later). No contract id is deployed from this repository.

## Build

From `contract/`, with Rust 1.99.1 (see `rust-toolchain.toml`; rustup installs it, including `wasm32-unknown-unknown`):

```sh
cargo build --target wasm32-unknown-unknown --release
```

## Test

```sh
cd contract
cargo test
```

61 tests pass. `cargo test` in `contract/` does not need OpenSSL or pkg-config.

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

`different_issuer_may_reuse_serial_hash` checks the accepted residual risk in spec 6.2 S11: a second issuer may mint the same `serial_hash`.

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
- `docs/phylaxtag-spec-v3.7.pdf` - spec v3.7, DRAFT - not final, the reference, read-only for code agents
- `docs/phylaxtag-spec-v3.6.pdf` - spec v3.6, history
- `docs/phylaxtag-spec-v3.5.pdf` - spec v3.5, history
- `docs/phylaxtag-spec-v3.4.pdf` - spec v3.4, history
- `docs/DECISIONS.md` - pinned crate and npm versions, measured gas, and measured storage
- `.github/workflows/ci.yml` - contract fmt, clippy, and test, the sandbox job, and the web job, on pull requests and on pushes to `main`

## Status

In this repository now:

- `new`, `add_issuer`, and `mint` (checks and storage accounting from spec 5.1 and 5.4, including the worst-case record prepay)
- `pay_service` and `on_payout` (idempotent; a failed payout restores the balance, `total_locked`, and the cooldown)
- `expire` and `on_expire_payout` (idempotent; `warranty_expired` once, later attempts `expire_refund_retried`; a call while a refund is already in flight returns 0)
- `nft_transfer` writes the holder log (50-entry ring, drop oldest)
- Views `get_asset` (display status from spec 5.1b), `get_service_history`, `get_holder_history`, `get_storage_info`, and the NEP-171 / NEP-177 / NEP-181 views
- NEP-178 approval methods, delegated to `near-contract-standards`
- `nft_transfer_call` always panics with `nft_transfer_call disabled in MVP`
- Sandbox tests for T10, T17, T19, T20, T22, T26, and T37

The web app has the warranty page, the history page, the issuer page (mint and close), the holder-only page (pay and sell), a workshop payments view, My items, and How it works. It uses only the view and call names in `contract/src/lib.rs`.

Not built yet:

- TODO (later): testnet deploy and a real contract id. T33 is a manual newcomer run.

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
- `@near-wallet-selector/core`, `modal-ui`, `my-near-wallet`, and `meteor-wallet` 10.1.4
- `@near-js/transactions` 2.5.1, `buffer` 6.0.3

## Run the web app locally

Prerequisites: Node.js 26.13.0 (`web/.nvmrc`) and npm. No Rust toolchain is required for the web job. The app never asks for a key or a seed phrase.

```sh
cd web
cp .env.example .env
npm ci
npm run dev
```

`web/.env.example` sets `VITE_CONTRACT_ID=your-contract.testnet`, `VITE_RPC_URL=https://rpc.testnet.near.org`, and `VITE_NETWORK_ID=testnet`. Leave `VITE_TEST_WALLET` unset. Open the printed local URL - see the "Testnet demo" banner. Read-only pages call the RPC without a wallet. Connect uses NEAR Wallet Selector on testnet only. A missing env file shows the banner and the config error. It does not start the test wallet.

- Run `npm run typecheck` in `web/` - see no type errors.
- Run `npm run lint` in `web/` - see no lint errors.
- Run `npm test` in `web/` - see 7 tests pass.
- Run `npm run build` and then `npm run check:bundle` in `web/` - see "Production bundle is clean" and no test-wallet marker.
- Run `npx playwright install chromium` once, then run the web e2e tests in `web/` - see 3 tests pass.

The three browser tests are `T31 gated page access`, `T32 sell button flow`, and `T38 status labels and next claim`. They set `VITE_TEST_WALLET=1`, which is a build flag. That build talks to an in-memory contract and switches account labels. It has no keys. The production build resolves the same import to a disabled module, and `check:bundle` fails if the test marker or a Google Fonts URL is in `web/dist`.

The JSON shapes in `web/src/test-wallet/fixtures/sandbox-views.json` were copied from one local sandbox mint: `get_asset`, `get_service_history`, `get_holder_history`, `get_storage_info`, `nft_token`, and `nft_metadata`. The unit test parses that file as text so the expiry nanoseconds stay exact. The Playwright state is a separate in-memory copy with the same field names and yoctoNEAR strings. A successful sandbox `expire` settles its callback before a test can read `pending_refund`, so the in-flight fixture uses the same yoctoNEAR string encoding as `balance`.

### Deposit shown before mint

The contract has no quote view. For a 7-character issuer and the measured demo metadata, storage is 1,416 bytes written by mint plus 27,218 prepaid bytes = 28,634 bytes = 0.28634 NEAR, at 10^19 yoctoNEAR per byte. The page adds a 2,000 byte margin (0.02 NEAR) for longer metadata. If the title, description, and extra text exceed that margin, the longer count replaces it. A shorter issuer adds two bytes per missing byte, because the owner id is stored twice. Each workshop after the first adds 4 bytes plus the account id length. A token id longer than `EB-001` adds the extra bytes. The attached deposit is the fund plus that storage amount. The page says "Unused storage deposit is refunded by the contract." The worst-case record prepay is not refunded. The formula is `estimateMintDeposit` in `web/src/near/deposit.ts`.

Gas attached by the app, from `web/src/near/gas.ts`: 15 TGas for `mint` (measured burn 3_633_924_445_063 gas) and 30 TGas for `pay_service`, `expire`, and `nft_transfer`. Unused gas is refunded. Details are in `docs/DECISIONS.md`.

## Demo script

About 90 seconds, for the video. A public run needs a deployed testnet contract id, which this task does not create. With `VITE_TEST_WALLET=1` the same screens run locally against the in-memory contract: use the "Demo preset" on the issuer page, then the account buttons `issuer.test`, `alice.test`, and `budi.test`.

1. The issuer opens the issuer page, mints EB-001, and the deposit preview is visible before the wallet opens. It shows the fund and the storage deposit, and it says unused storage deposit is refunded by the contract.
2. The owner opens the holder page for EB-001, requests a service payment inside the cap, and the workshop is paid. The service record reads Paid.
3. A claim over the cap is rejected. The page shows "That amount is over the per-claim cap." and the original contract string "Over cap".
4. Optional: after expiry, close the warranty. While the refund transfer has not settled, the page shows "Refund in flight: X NEAR". The returned amount stays 0 until that transfer finishes.

## AI disclosure

Code written with Cursor AI agents (Cursor Grok 4.7), reviewed by the team. The contract, the sandbox tests, and this web app were produced that way. Library versions are listed above and in `docs/DECISIONS.md`. No other code-generation service was used.

## License

MIT. See [LICENSE](LICENSE).
