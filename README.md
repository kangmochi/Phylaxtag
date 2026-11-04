# Phylaxtag

This e-bike has its own warranty fund. Sell the bike, and the fund and the service book move with it.

Phylaxtag turns one physical item (MVP: one e-bike) into a NEP-171 NFT on NEAR. The warranty fund is stored on the token, so it moves with the NFT when the item is sold. The issuer funds it once at mint. The owner can never withdraw it. Phylax (φύλαξ) is Greek for "guardian": the warranty is a guardian that lives on the item and transfers with it.

To our knowledge, a working NFT-warranty implementation on NEAR. This repository is a testnet prototype. The NFT is not proof of authenticity and is not a legal title. The contract can mint a warranty, pay an approved workshop, transfer the NFT, and close it after expiry. Those paths are covered by unit tests. There is no testnet deploy and no web UI yet, so the flow cannot be tried on a chain from this repository.

## How control passes on transfer

1. There is exactly one source of truth for control: `nft_token(token_id).owner_id` in the NEP-171 contract.
2. Every money-moving owner action (`pay_service`) checks `predecessor == owner_id` at call time. Nothing is cached, and there is no session, allowance, sub-account or access key per token.
3. The warranty fund is a field of the token (`Asset.balance`), not of any account. A transfer changes `owner_id` and nothing else, so the fund, service history, cooldown clock and limits stay with the item.
4. Transfer clears all NEP-178 approvals, so a marketplace or helper the seller approved loses its right to move the token.
5. `nft_transfer_call` is disabled, so there is no window where a receiver contract is a temporary owner.
6. Money can only leave to an approved workshop (never the owner) or to the issuer after expiry. A failed payment returns to the token, so whoever owns the token then benefits, never the old owner.

The holder-only web page is not built yet (task 004). Spec 6.1 point 7 describes that page.

## Try it

- Run `cargo test` in `contract/` - see 58 tests pass.
- Run `cargo fmt --check` in `contract/` - see no diff. CI runs this.
- Run `cargo clippy --all-targets -- -D warnings` in `contract/` - see no warnings. CI runs this.
- Run `cargo build --target wasm32-unknown-unknown --release` in `contract/` - see `contract/target/wasm32-unknown-unknown/release/phylaxtag.wasm`. The wasm file is gitignored.
- Deploy to testnet - TODO (task 004).
- Open a web demo - TODO (task 004). The `web/` directory is a placeholder.

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

58 tests pass. `cargo test` in `contract/` does not need OpenSSL or pkg-config.

Spec IDs in this run:

- T01 `t01_balance_moves_with_nft`
- T02 `t02_old_owner_cannot_pay`, `t02_new_owner_pays_after_cooldown`, `t02_missing_token_is_not_owner`
- T03 `t03_non_approved_workshop_rejected`
- T04 `t04_cap_enforced`, `t04_cap_enforced_exact_cap_succeeds`, `t04_zero_amount_is_over_cap`
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

Also, not spec IDs: `mint_happy_path`, `add_issuer_rejects_non_admin`, `new_rejects_second_init`, `different_issuer_may_reuse_serial_hash`, `pay_service_requires_one_yocto`, `expire_rejects_missing_token`.

`different_issuer_may_reuse_serial_hash` checks the accepted residual risk in spec 6.2 S11: a second issuer may mint the same `serial_hash`.

Not in this run:

- T17, T20, and the full T26 byte and cost measurement are sandbox tests. TODO (task 003), in a separate `integration-tests/` crate. T10, T19, and T22 are unit-tested here with a mocked failed promise. A repeat against a really missing account is task 003.
- T31, T32, and T38 are web tests. TODO (task 004).
- T33 is a manual newcomer run.

There are no sandbox tests in this repository yet.

T06, T10, T19, T21, T22, and T36 check one part of the T26 invariant after every state change. The test keeps its own ledger from the amounts it passed in (mint deposits, accepted payouts, expiry refunds, and restores). It then checks that `total_locked` matches that ledger and that the sum of `get_asset` balances matches `total_locked`.

## Repo layout

- `contract/` - Rust NEAR contract crate `phylaxtag`
- `web/` - placeholder. Web UI comes in a later task.
- `docs/phylaxtag-spec-v3.5.pdf` - spec v3.5, DRAFT - not final, the reference, read-only for code agents
- `docs/phylaxtag-spec-v3.4.pdf` - spec v3.4, history
- `docs/DECISIONS.md` - pinned crate versions and the fallback
- `.github/workflows/ci.yml` - `cargo fmt`, `cargo clippy`, `cargo test` on pull requests and on pushes to `main`

## Status

In this repository now:

- `new`, `add_issuer`, and `mint` (checks and storage accounting from spec 5.1 and 5.4, including the v3.5 string limits and duplicate-workshop check)
- `pay_service` and `on_payout`
- `expire` and `on_expire_payout`
- `nft_transfer` writes the holder log (50-entry ring, drop oldest)
- Views `get_asset` (display status from spec 5.1b), `get_service_history`, `get_holder_history`, `get_storage_info`, and the NEP-171 / NEP-177 / NEP-181 views
- NEP-178 approval methods, delegated to `near-contract-standards`
- `nft_transfer_call` always panics with `nft_transfer_call disabled in MVP`

Not built yet:

- TODO (task 003): sandbox tests in `integration-tests/` with `near-workspaces` 0.24.0. That covers T17, T20, the full T26 measurement, and sandbox repeats of T10, T19, and T22.
- TODO (task 004): web UI (T31, T32, T38) and testnet deploy. T33 is a manual newcomer run.

Storage bytes per mint are not measured for the README yet. Spec 5.4 leaves that to test T26, which is task 003.

Callback gas is a reserve of 10 TGas. TODO: measure in task 003. See `docs/DECISIONS.md`.

## Libraries used

- Rust 1.99.1
- `near-sdk` 5.30.0
- `near-contract-standards` 5.30.0

`near-workspaces` 0.24.0 is not a dependency of this crate. The pin is recorded in `docs/DECISIONS.md` for the task 003 `integration-tests/` crate.

Versions, the day they were checked, why they were chosen, and the previous stable fallback are in `docs/DECISIONS.md`.

## AI disclosure

Code written with Cursor AI agents, reviewed by the team.

## License

MIT. See [LICENSE](LICENSE).
