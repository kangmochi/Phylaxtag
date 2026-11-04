# Decisions

## Day 1 version pin

Checked on 4 November 2026 (Asia/Jakarta, UTC+7), against crates.io and the Rust release notes.

| Crate | Pinned | Published (UTC) | MSRV |
| --- | --- | --- | --- |
| near-sdk | 5.30.0 | 2026-10-27 15:06 UTC | 1.95 |
| near-contract-standards | 5.30.0 | 2026-10-27 15:06 UTC | 1.95 |
| near-workspaces | 0.24.0 | 2026-10-26 23:05 UTC | 1.95 |
| Rust toolchain | 1.99.1 | stable since 15 October 2026 (`rustc 1.99.1`, commit `58cf8f9c3`, 2026-10-13) | — |

`near-workspaces` 0.24.0 stays the pin for sandbox tests. It is not a dependency of `contract/`. Task 003 adds it in a separate `integration-tests/` crate. `cargo test` in `contract/` does not need OpenSSL or pkg-config. Checked in task 002: `cargo tree -i openssl-sys` matches no package. The unit-test feature of `near-sdk` still builds `aws-lc-sys` through `near-crypto`. That crate does not use the system OpenSSL library.

### Why these versions

These are the current stable releases on the day checked. `near-sdk` 5.30.0 and `near-contract-standards` 5.30.0 are the same near-sdk-rs release, built for nearcore 2.14 (protocol 88). `near-workspaces` 0.24.0 depends on that same nearcore line (`near-primitives` 0.38.0 and `near-sandbox` 0.4.0), so the three pins belong together. Rust 1.99.1 is the current stable toolchain and it satisfies the MSRV of 1.95. Rust 1.100.0 is not stable yet (scheduled for 12 November 2026).

`near-sdk` and `near-contract-standards` are exact (`=5.30.0`) in `contract/Cargo.toml`. `near-workspaces` is not in that file; task 003 will pin `=0.24.0` in `integration-tests/`. `contract/Cargo.lock` is committed. `rust-toolchain.toml` pins Rust 1.99.1 and the `wasm32-unknown-unknown` target.

### Fallback

If this pin breaks the build or the sandbox tests, switch to the previous stable set and record the reason here and in the README:

| Crate | Fallback | Published (UTC) | MSRV |
| --- | --- | --- | --- |
| near-sdk | 5.29.1 | 2026-09-17 15:01 UTC | 1.93 |
| near-contract-standards | 5.29.1 | 2026-09-17 15:02 UTC | 1.93 |
| near-workspaces | 0.23.0 | 2026-07-09 21:24 UTC | 1.93 |

Do not switch before that failure happens. `near-workspaces` 0.23.0 is the previous stable of that crate. It was published before `near-sdk` 5.29.1, so sandbox compatibility of the fallback set is not proven here.

## NEP-171 transfer hook (spec 5.6 / F5)

Checked in `near-contract-standards` 5.30.0. `NonFungibleToken` has no `on_transfer` callback. The wrapper is the contract's own `NonFungibleTokenCore::nft_transfer`. It calls `self.tokens.nft_transfer` and then appends the holder log. `nft_transfer_call` is a separate method. In this MVP it always panics with `nft_transfer_call disabled in MVP`.

## Other choices forced by the pin

- `NonFungibleToken.owner_id` is the admin account. The deprecated `NonFungibleToken::mint` would require that owner to be the caller. This contract does not call it. Issuers live in `issuers`. Mint goes through `internal_mint_with_refund(..., None)` so the warranty fund is not treated as unused deposit and refunded.
- Spec 5.6: contract-level NEP-177 metadata is not stored. `nft_metadata` returns constants: name `Phylaxtag`, symbol `PHYLAX`, spec `nft-1.0.0`, no icon, no base URI, no reference. Token metadata is stored per token inside `NonFungibleToken`.
- `#[init(ignore_state)]` is used on `new` because the SDK's own init check panics with `The contract has already been initialized`. Spec 5.1 requires `Already initialized`, so the function checks `env::state_exists()` itself.

## Callback gas

`on_payout` and `on_expire_payout` are attached with `Gas::from_tgas(10)` and `with_unused_gas_weight(0)`.

TODO: measure in task 003. 10 TGas is a reserve so the callback still has gas after the NEAR transfer. It is not a measured figure.

## Readings kept for later tasks

Spec v3.5 settled the nine readings from the task 001 pull request. The notes below are the choices this code makes where v3.5 is still thin. They are also in the task 002 pull request for Pharita. The spec file is unchanged.

- `token_id` of 1 to 32 bytes is inclusive. A 32-byte id is accepted. A 33-byte id fails with `Bad token_id`.
- `pay_service` on a missing token fails with `Not owner`. Spec 5.1 does not list `Token not found` for that method.
- An amount of 0 fails the `0 < amount ≤ cap` check with `Over cap`, the only error spec 5.1 lists for that line.
- The 1-yocto check uses the SDK string `Requires attached deposit of exactly 1 yoctoNEAR`. Spec 5.1 does not name one.
- A failed payout does not clear `last_claim_at_ns`. Spec 5.1 sets it in `pay_service` and does not list it in the failure callback.
- `on_payout` and `on_expire_payout` are not idempotent. A second failure would add `amount` again. Spec 5.1a does not say to restore only while the record is `Pending`.
- `expire` returns the yoctoNEAR sent on that call. The failure callback can put it back afterwards.
- `get_service_history` with `limit: Some(0)` returns an empty page. Spec 5.1a says the default and the max are 50, and not what 0 means.
- `payout_failed` uses the JSON field `record_index`. Spec 5.5 says "record index".
- The holder ring does not pre-allocate max-length account ids. Spec 5.4 says an overwrite changes storage only by the size difference. A longer new account id can still grow storage. The log code does not panic when the ring is full. It cannot stop the runtime from failing the receipt if the reserve cannot pay that byte delta.
