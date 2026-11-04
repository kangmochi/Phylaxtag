# Phylaxtag

This e-bike has its own warranty fund. Sell the bike, and the fund and the service book move with it.

Phylaxtag turns one physical item (MVP: one e-bike) into a NEP-171 NFT on NEAR. The warranty fund is stored on the token, so it moves with the NFT when the item is sold. The issuer funds it once at mint. The owner can never withdraw it. Phylax (φύλαξ) is Greek for "guardian": the warranty is a guardian that lives on the item and transfers with it.

To our knowledge, a working NFT-warranty implementation on NEAR. This repository is a testnet prototype. The NFT is not proof of authenticity and is not a legal title. Paying a workshop and closing the warranty are not in the contract yet, so the full flow cannot be tried end to end.

## Try it

- Run `cargo test` in `contract/` - see 15 tests pass.
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

15 tests pass:

- `t08_only_allowlisted_issuer_can_mint`
- `t28_no_remint_same_token_id`
- `t28_no_remint_same_serial_hash`
- `t29_mint_input_validation_past_expiry`
- `t29_mint_input_validation_cap_zero`
- `t29_mint_input_validation_cap_above_fund`
- `t29_mint_input_validation_empty_workshops`
- `t29_mint_input_validation_issuer_as_workshop`
- `t29_mint_input_validation_deposit_too_small`
- `t34_mint_rejects_zero_cooldown`
- `t39_mint_rejects_contract_as_workshop`
- `mint_happy_path`
- `add_issuer_rejects_non_admin`
- `new_rejects_second_init`
- `different_issuer_may_reuse_serial_hash`

`mint_happy_path`, `add_issuer_rejects_non_admin`, `new_rejects_second_init`, and `different_issuer_may_reuse_serial_hash` are not spec IDs. The last one checks the accepted residual risk in spec 6.2 S11: a second issuer may mint the same `serial_hash`. T01-T05 need `pay_service`, which is task 002. Sandbox tests (`near-workspaces`) are pinned and not run yet.

## Repo layout

- `contract/` - Rust NEAR contract crate `phylaxtag`
- `web/` - placeholder. Web UI comes in a later task.
- `docs/phylaxtag-spec-v3.4.pdf` - spec v3.4, DRAFT - not final, read-only for code agents
- `docs/DECISIONS.md` - pinned crate versions and the fallback
- `.github/workflows/ci.yml` - `cargo fmt`, `cargo clippy`, `cargo test` on pull requests and on pushes to `main`

## Status

In this repository now:

- `new`, `add_issuer`, and `mint` (checks and storage accounting from spec 5.1 and 5.4)
- Views `get_asset`, `get_storage_info`, and the NEP-171 / NEP-177 / NEP-181 views
- NEP-178 approval methods, delegated to `near-contract-standards`
- `nft_transfer_call` always panics with `nft_transfer_call disabled in MVP`

Not built yet:

- TODO (task 002): `pay_service`, the `nft_transfer` holder-log wrapper, `get_service_history`, `get_holder_history`, sandbox tests
- TODO (task 003): `expire`, `on_payout`, `on_expire_payout`
- TODO (task 004): web UI and testnet deploy

Storage bytes per mint are not measured for the README yet. Spec 5.4 leaves that to test T26.

## Libraries used

- Rust 1.99.1
- `near-sdk` 5.30.0
- `near-contract-standards` 5.30.0
- `near-workspaces` 0.24.0 (pinned for later sandbox tests; no test imports it yet)

Versions, the day they were checked, why they were chosen, and the previous stable fallback are in `docs/DECISIONS.md`.

## AI disclosure

Code written with Cursor AI agents, reviewed by the team.

## License

MIT. See [LICENSE](LICENSE).
