# Decisions

## Day 1 version pin

Checked on 4 November 2026 (Asia/Jakarta, UTC+7), against crates.io and the Rust release notes.

| Crate | Pinned | Published (UTC) | MSRV |
| --- | --- | --- | --- |
| near-sdk | 5.30.0 | 2026-10-27 15:06 UTC | 1.95 |
| near-contract-standards | 5.30.0 | 2026-10-27 15:06 UTC | 1.95 |
| near-workspaces | 0.24.0 | 2026-10-26 23:05 UTC | 1.95 |
| Rust toolchain | 1.99.1 | stable since 15 October 2026 (`rustc 1.99.1`, commit `58cf8f9c3`, 2026-10-13) | — |

`near-workspaces` is pinned now and is not called yet. Sandbox tests start in task 002.

### Why these versions

These are the current stable releases on the day checked. `near-sdk` 5.30.0 and `near-contract-standards` 5.30.0 are the same near-sdk-rs release, built for nearcore 2.14 (protocol 88). `near-workspaces` 0.24.0 depends on that same nearcore line (`near-primitives` 0.38.0 and `near-sandbox` 0.4.0), so the three pins belong together. Rust 1.99.1 is the current stable toolchain and it satisfies the MSRV of 1.95. Rust 1.100.0 is not stable yet (scheduled for 12 November 2026).

Versions are exact (`=5.30.0`, `=0.24.0`) in `contract/Cargo.toml`. `contract/Cargo.lock` is committed. `rust-toolchain.toml` pins Rust 1.99.1 and the `wasm32-unknown-unknown` target.

### Fallback

If this pin breaks the build or the sandbox tests, switch to the previous stable set and record the reason here and in the README:

| Crate | Fallback | Published (UTC) | MSRV |
| --- | --- | --- | --- |
| near-sdk | 5.29.1 | 2026-09-17 15:01 UTC | 1.93 |
| near-contract-standards | 5.29.1 | 2026-09-17 15:02 UTC | 1.93 |
| near-workspaces | 0.23.0 | 2026-07-09 21:24 UTC | 1.93 |

Do not switch before that failure happens. `near-workspaces` 0.23.0 is the previous stable of that crate. It was published before `near-sdk` 5.29.1, so sandbox compatibility of the fallback set is not proven here.

## NEP-171 transfer hook (spec 5.6 / F5)

Checked in `near-contract-standards` 5.30.0. `NonFungibleToken` has no `on_transfer` callback. The wrapper is the contract's own `NonFungibleTokenCore::nft_transfer`. Task 002 should call `self.tokens.nft_transfer` (or `internal_transfer`) and then append the holder log. `nft_transfer_call` is a separate method. In this MVP it always panics with `nft_transfer_call disabled in MVP`.

## Other choices forced by the pin

- `NonFungibleToken.owner_id` is the admin account. The deprecated `NonFungibleToken::mint` would require that owner to be the caller. This contract does not call it. Issuers live in `issuers`. Mint goes through `internal_mint_with_refund(..., None)` so the warranty fund is not treated as unused deposit and refunded.
- Spec 5.3 has no field for contract-level NEP-177 metadata. `nft_metadata` returns a constant: name `Phylaxtag`, symbol `PHYLAX`, spec `nft-1.0.0`. Token metadata is stored per token inside `NonFungibleToken`, which spec 5.3 already includes.
- `#[init(ignore_state)]` is used on `new` because the SDK's own init check panics with `The contract has already been initialized`. Spec 5.1 requires `Already initialized`, so the function checks `env::state_exists()` itself.

## Readings the spec does not settle

These are recorded so later tasks do not silently change them. They are also listed for Pharita in the task 001 pull request. The spec file is unchanged.

- Display status (spec 5.1 and section 8), from stored status plus balance:
  - Active and balance > 0 → `Active`
  - Active and balance = 0 → `Empty (fund used up)`
  - Expired and balance > 0 → `Expired, close pending`
  - Expired and balance = 0 → `Expired`
- `next_claim_ns` is `0` when `last_claim_at_ns` is `0` (no claim yet, a claim is allowed immediately). Otherwise it is `last_claim_at_ns + cooldown_ns`.
- Mint writes the first holder-log entry (the issuer), sets `holder_total` to 1 and `holder_next` to 1, and creates an empty service-history vector. Spec 5.3 says `holder_total` includes mint. Test T25 starts the log at the issuer.
- Spec 5.4 proposes `serial_hash` of 64 hex characters and `token_id` of at most 32 bytes, and says the code may adjust them with a PR note. Spec 5.1 does not list those checks or their error strings. Task 001 does not enforce them.
- Duplicate workshop accounts are accepted. Spec 5.1 says the list is 1..N accounts and rejects an empty list, the issuer, and the contract account. It does not mention duplicates.
- `on_payout` / `on_expire_payout` parameters are not listed in spec 5.1. The stubs take the values a callback needs in order to put the amount back on the token. `get_service_history` uses `from_index: Option<u64>` and `limit: Option<u64>` because spec 5.1 names `from` and `limit` without types.
