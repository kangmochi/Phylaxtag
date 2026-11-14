# Architecture

How the pieces fit together. The rule for every section: this describes the code that is
in the repository today. Design intent lives in [SPEC.md](SPEC.md); security reasoning lives
in [THREAT_MODEL.md](THREAT_MODEL.md); pinned versions and measured numbers live in
[DECISIONS.md](DECISIONS.md).

## 1. Shape of the system

Three parts, one repository:

| Part | Path | What it is |
| --- | --- | --- |
| Contract | `contract/` | One NEAR smart contract (Rust, `near-sdk`). Holds every warranty, every fund and every history entry |
| Web app | `web/` | Static Vite + React + TypeScript client. Reads the chain over RPC, signs through NEAR Wallet Selector |
| Sandbox tests | `integration-tests/` | `near-workspaces` tests against a real local chain |

There is no backend, no database, no keeper and no bot. The only server that matters is the
NEAR RPC, and the only state that matters is the contract's. Deleting the web app would
leave the warranties fully usable through the CLI; deleting the contract would leave nothing.

```
        browser (React)                NEAR testnet
  ┌──────────────────────┐        ┌────────────────────────────┐
  │ pages/ (routes)      │  view  │ contract (single account)  │
  │  ├ AssetPage         ├───────►│  assets:  token_id → Asset │
  │  ├ HistoryPage       │        │  history: token_id → Vec   │
  │  ├ OwnerPage (gated) │        │  holders: token_id → ring  │
  │  ├ IssuerPage        │ change │  tokens:  NonFungibleToken │
  │  ├ WorkshopPage      ├───────►│  used_serials, issuers     │
  │  └ HowPage           │ wallet │  admin, total_locked       │
  │ near/ (chain, rpc,   │        └────────────────────────────┘
  │      amounts, gas)   │                    │
  └──────────────────────┘                    │ 1. pay_service: debit, record,
                                              │    then promise → workshop
                                              │ 2. on_payout callback: mark Paid
                                              │    or restore the amount
```

## 2. Contract layout and responsibilities

| File | Responsibility |
| --- | --- |
| `contract/src/lib.rs` | Storage keys, the `Contract` struct, `new`/`add_issuer`, the public NEP-171 surface and the view methods |
| `contract/src/types.rs` | `Asset`, `ServiceRecord`, `HolderRecord`, view structs, `display_status`, `next_claim_ns` |
| `contract/src/mint.rs` | `perform_mint`: validation, storage measurement, fund accounting, first holder record |
| `contract/src/open_mint.rs` | `perform_mint_open`: the practice mint (`mint_open`), with the per-account set, the 100-tag cap and the fixed 30-day expiry |
| `contract/src/pay.rs` | `perform_pay_service`, `on_payout`, the claim-limit checks and the callback restore path |
| `contract/src/expire.rs` | `perform_expire`, `on_expire_payout`, the `pending_refund` no-op rule |
| `contract/src/holders.rs` | The 50-entry drop-oldest holder ring and the `holder_total` counter |
| `contract/src/storage.rs` | Worst-case prepay constants and the storage invariant helper |
| `contract/src/events.rs` | NEP-297 event emission for the warranty events |
| `contract/src/tests/` | Unit tests: `mint`, `open_mint`, `pay`, `expire`, `transfer`, `storage`, `common` |

Three rules that shape this layout:

1. **The fund is a field of the token** (`Asset.balance`), not a balance per account. A
   transfer changes `owner_id` and nothing else, so nothing has to move and nothing can be
   left behind.
2. **State is written before the promise.** `pay_service` debits the token, appends a
   `Pending` record and sets `last_claim_at_ns` before it creates the payout. The callback
   only closes the record; it never decides whether the money may move.
3. **Callbacks are `#[private]` and idempotent.** `on_payout` acts only while its record is
   `Pending`; `on_expire_payout` only while `pending_refund == Some(amount)`. A repeated or
   late callback changes nothing.

## 3. Data model

`Asset` (one per token): `issuer`, `serial_hash`, `balance`, `expiry_ns`, `claim_cap`,
`cooldown_ns`, `last_claim_at_ns` (`None` until the first claim, never reset by a transfer),
`workshops` (fixed at mint), `status` (`Active` or `Expired`), `holder_total`, `holder_next`
(ring write index) and `pending_refund` (an outstanding expiry refund).

`ServiceRecord` (at most 50 per token): `workshop`, `amount`, `work_type`, `note_hash`,
`owner_at_claim`, `prev_last_claim_at_ns`, `timestamp_ns`, `block_height`, `status`
(`Pending`, `Paid`, `Failed`).

`HolderRecord` (ring of the latest 50): `owner`, `since_ns`, `balance_at_transfer`. When the
ring is full the oldest slot is overwritten and `holder_total` keeps counting, so a transfer
can never fail because of the log. Full transfer history stays reconstructable from the
permanent `nft_transfer` events.

Contract-level: `tokens` (the NEP-171/177/181/178 `NonFungibleToken`), `assets`, `history`,
`holders`, `used_serials` (unique per issuer), `issuers`, `admin`, `total_locked`.

## 4. One payment, end to end

1. The owner calls `pay_service` with 1 yoctoNEAR. The contract checks, in order: token
   exists, caller is the owner, not expired, no approvals, workshop allowlisted, workshop ≠
   owner, amount > 0, amount ≤ cap, amount ≤ balance, cooldown elapsed, fewer than 50
   records, string limits.
2. It debits `balance` and `total_locked`, appends a `Pending` record, sets
   `last_claim_at_ns`, emits `service_requested`, and creates a transfer of `amount` to the
   workshop with `CALLBACK_GAS` (5 TGas) attached to `on_payout`.
3. Success: `on_payout` marks the record `Paid` and emits `service_paid`.
   Failure: it restores `amount` to the token balance and to `total_locked`, marks the record
   `Failed`, emits `payout_failed`, and restores the previous `last_claim_at_ns` when no
   newer claim exists.

The same shape applies to `expire`: mark `Expired`, move the balance into `pending_refund`,
promise the refund to the issuer, and let `on_expire_payout` settle or restore it.

## 5. Invariant that ties the money to the storage

`contract_balance ≥ total_locked + storage_usage × storage_byte_cost`

Every path that moves money is written to keep it: `mint` (fund in, excess refunded),
`pay_service` (debit then payout or restore), `expire` (move to `pending_refund`, send or
restore). The worst case for a token is prepaid at mint, so `pay_service` and `nft_transfer`
never need new money. `get_storage_info` exposes the numbers so a test can check the
invariant after every path. Details and measured byte counts: [SPEC.md](SPEC.md) section 8
and [DECISIONS.md](DECISIONS.md).

## 6. Web app layout

| Path | Responsibility |
| --- | --- |
| `web/src/main.tsx` | Boot, config load, the config-error screen |
| `web/src/App.tsx` | Wallet state and routing |
| `web/src/ui.tsx` | The `Shell` every page renders: top nav, `Testnet` badge, wallet picker, footer |
| `web/src/pages/` | `HomePage`, `AssetPage`, `HistoryPage`, `OwnerPage` (gated), `IssuerPage`, `WorkshopPage`, `HowPage`, `NotFoundPage` |
| `web/src/near/chain.ts`, `client.ts`, `rpc.ts` | Contract and RPC access, wallet wiring |
| `web/src/near/views.ts`, `types.ts`, `parse.ts` | View shapes and lossless parsing of yoctoNEAR strings and u64 timestamps |
| `web/src/near/amounts.ts`, `deposit.ts`, `gas.ts` | Exact decimal arithmetic, the mint deposit estimate, attached gas |
| `web/src/near/claim.ts`, `errors.ts`, `hash.ts`, `time.ts` | Claim availability, panic-string mapping, serial hashing, relative time |
| `web/src/near/evm.ts`, `near-wallet.ts`, `wallets.ts` | Wallet list, NEAR wallets and the EVM group |
| `web/src/test-wallet/` | The in-memory contract used with `VITE_TEST_WALLET=1`; the production build resolves it to a module that throws |

The browser is never the authority: every rule above is checked again by the contract. The
gated holder page controls the interface, not the money, and it re-reads `owner_id` on every
load and action.

## 7. Build, test, deploy

- **Contract:** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
  `cargo test` in `contract/`; then `cargo build --target wasm32-unknown-unknown --release`.
  Rust 1.99.1 and the `wasm32-unknown-unknown` target are pinned in `rust-toolchain.toml`.
- **Sandbox:** `cargo test` in `integration-tests/` against a local `near-sandbox`.
- **Web:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, then
  `npm run check:bundle`, which fails if the test-wallet marker or a CDN font URL appears in
  `web/dist`. `npm run e2e` runs Playwright against a test-wallet build.
- **CI:** `.github/workflows/ci.yml` runs the contract, sandbox and web jobs on every push to
  `main` and on every pull request.
- **Deployment:** Vercel builds `web/` on every push to `main` and needs `VITE_CONTRACT_ID`,
  `VITE_RPC_URL`, `VITE_NETWORK_ID` and, for the EVM group, `VITE_WALLETCONNECT_PROJECT_ID`.
  The live values and the full deploy procedure are in
  [TESTNET_DEPLOY_GUIDE.md](TESTNET_DEPLOY_GUIDE.md).

## 8. What is deliberately outside the contract

Physical identity (serial number, QR link), repair proof, dispute handling, the sale payment
itself, and any price or IoT oracle. These are stated as limits in [SPEC.md](SPEC.md)
section 13 and in the README, not hidden.
