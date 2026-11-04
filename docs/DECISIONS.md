# Decisions

## Day 1 version pin

Checked on 4 November 2026 (Asia/Jakarta, UTC+7), against crates.io and the Rust release notes.

| Crate | Pinned | Published (UTC) | MSRV |
| --- | --- | --- | --- |
| near-sdk | 5.30.0 | 2026-10-27 15:06 UTC | 1.95 |
| near-contract-standards | 5.30.0 | 2026-10-27 15:06 UTC | 1.95 |
| near-workspaces | 0.24.0 | 2026-10-26 23:05 UTC | 1.95 |
| Rust toolchain | 1.99.1 | stable since 15 October 2026 (`rustc 1.99.1`, commit `58cf8f9c3`, 2026-10-13) | — |

`near-workspaces` 0.24.0 is a dependency of `integration-tests/` only, pinned `=0.24.0` with the `experimental` feature so a test can read `protocol_config` (the storage byte cost). That crate also depends on `near-primitives` `=0.38.0`, which is the version `near-workspaces` 0.24.0 already uses, so the test can name `BlockReference`. `near-sandbox` 0.4.0 comes in through `near-workspaces` and is the local chain binary. None of these are dependencies of `contract/`. `cargo test` in `contract/` does not need OpenSSL or pkg-config. Checked again in task 003: `cargo tree -i openssl-sys` in `contract/` matches no package. The unit-test feature of `near-sdk` still builds `aws-lc-sys` through `near-crypto`. That crate does not use the system OpenSSL library. The integration crate does compile `openssl-sys` through the sandbox stack.

### Why these versions

These are the current stable releases on the day checked. `near-sdk` 5.30.0 and `near-contract-standards` 5.30.0 are the same near-sdk-rs release, built for nearcore 2.14 (protocol 88). `near-workspaces` 0.24.0 depends on that same nearcore line (`near-primitives` 0.38.0 and `near-sandbox` 0.4.0), so the three pins belong together. Rust 1.99.1 is the current stable toolchain and it satisfies the MSRV of 1.95. Rust 1.100.0 is not stable yet (scheduled for 12 November 2026).

`near-sdk` and `near-contract-standards` are exact (`=5.30.0`) in `contract/Cargo.toml`. `near-workspaces` is exact (`=0.24.0`) in `integration-tests/Cargo.toml`. Both `Cargo.lock` files are committed. `rust-toolchain.toml` pins Rust 1.99.1 and the `wasm32-unknown-unknown` target.

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

History from the default Cargo release profile, before `contract/Cargo.toml` had a `[profile.release]`. The size-profile figures are in the next section. `CALLBACK_GAS` was not changed.

Measured on 4 November 2026 (Asia/Jakarta, UTC+7) against a local sandbox (`near-workspaces` 0.24.0, `near-sandbox` 0.4.0, `near-sdk` 5.30.0, Rust 1.99.1). The number is `gas_burnt` on the receipt whose executor is the contract and whose logs name the event. Gas is in units, not TGas, except the constant.

| Call | Path | Gas burnt (max of the runs) |
| --- | --- | --- |
| `pay_service` | success (`service_requested`, then `service_paid`) | 3_215_722_280_679 |
| `pay_service` | failure (`service_requested`, workshop account missing) | 3_199_685_578_871 |
| `on_payout` | success (`service_paid`) | 2_261_627_777_595 |
| `on_payout` | failure (`payout_failed`) | 2_455_261_370_702 |
| `expire` | success (`warranty_expired`, refund lands) | 2_715_450_958_257 |
| `expire` | refund transfer fails, including the retry (`expire_refund_retried`) | 2_716_725_466_119 |
| `on_expire_payout` | success (no warranty event) | 1_971_720_956_278 |
| `on_expire_payout` | failure (`expire_refund_failed`) | 2_073_643_155_688 |

`CALLBACK_GAS` is `Gas::from_tgas(5)` with `with_unused_gas_weight(0)`. The highest callback burn is the failed `on_payout`, 2_455_261_370_702 gas (2.455 TGas). Twice that is 4.91 TGas, so the constant is the next whole TGas, 5. The margin is 5_000_000_000_000 − 2_455_261_370_702 = 2_544_738_629_298 gas. The success path of that callback burned about 0.20 TGas less than the failure path. The margin is large enough for that gap to happen twice, because a callback that runs out of gas is not retried by the user. The earlier 10 TGas figure was not a measurement. The 30 TGas used while capturing these numbers was only headroom so the callback could run; it is not the attached value anymore.

A caller of `pay_service` or `expire` must attach more than `CALLBACK_GAS` plus the function's own burn (about 3.3 TGas and 2.8 TGas above). The sandbox tests attach 200 TGas.

## Callback gas with the size profile

Measured again on 4 November 2026 (Asia/Jakarta, UTC+7) after `[profile.release]` (`opt-level = "z"`, `lto = true`, `codegen-units = 1`, `panic = "abort"`, `strip = true`, `debug = false`, `overflow-checks = true`). Same sandbox stack and the same rule: `gas_burnt` on the contract receipt whose logs name the event. The wasm the tests loaded was `contract/target/wasm32-unknown-unknown/release/phylaxtag.wasm` from `cargo build --release --target wasm32-unknown-unknown`. `wasm-opt` was not installed, so these figures are not from `wasm-opt`. Each cell is the maximum of the runs printed by the existing sandbox tests.

| Call | Path | Gas burnt (max of the runs) |
| --- | --- | --- |
| `pay_service` | success (`service_requested`) | 3_090_846_458_391 |
| `pay_service` | failure (`service_requested`, workshop account missing) | 3_072_107_003_123 |
| `on_payout` | success (`service_paid`) | 2_095_407_643_551 |
| `on_payout` | failure (`payout_failed`) | 2_305_320_286_874 |
| `expire` | success (`warranty_expired`, refund lands) | 2_545_415_704_641 |
| `expire` | refund transfer fails, including the retry (`expire_refund_retried`) | 2_546_505_092_403 |
| `on_expire_payout` | success (no warranty event) | 1_764_294_733_486 |
| `on_expire_payout` | failure (`expire_refund_failed`) | 1_897_061_232_580 |

The highest callback burn is still the failed `on_payout`, now 2_305_320_286_874 gas (2.305 TGas). Twice that is 4.611 TGas, which is under 5 TGas. `CALLBACK_GAS` stays `Gas::from_tgas(5)`. The margin is 5_000_000_000_000 − 2_305_320_286_874 = 2_694_679_713_126 gas. The constant was not changed.

The same run's mint receipt (`nft_mint` and `warranty_funded`) burned 3_554_608_102_822 gas. That is one run, not a max of several. The web app still attaches 15 TGas to `mint` and 30 TGas to `pay_service`, `expire`, and `nft_transfer`. The highest size-profile pair here is the failed `pay_service` plus the failed `on_payout`, 5_377_427_289_997 gas.

Receipts that logged both `service_requested` and `nft_transfer` are sale-mid-payout transactions. They are not in the `pay_service` row.

## Storage bytes and cost

Same sandbox run, 4 November 2026 (Asia/Jakarta). `storage_amount_per_byte` from the sandbox protocol config was 10_000_000_000_000_000_000 yoctoNEAR (10^19). One byte costs 0.00001 NEAR.

| What | Bytes | Cost |
| --- | --- | --- |
| One mint, bytes actually written (chain `storage_usage` delta) | 1_416 | 0.01416 NEAR |
| One service record (second `pay_service` on the same token; the first record's delta was also 299) | 299 | 0.00299 NEAR |
| One holder record (transfer between two 7-character account ids, so the owner-id length does not change) | 120 | 0.0012 NEAR |

`WORST_CASE_TOKEN_BYTES` is derived in `contract/src/storage.rs` from Borsh lengths plus the 40-byte trie-node overhead. It is 27_200 bytes: 50 max holder slots and 50 max service slots. For the 7-byte issuer used in the unit tests, `prepaid_extra_bytes` is 27_218. That is the 27_200, minus the holder slot mint already wrote, plus 24 bytes of `Asset` option growth and the owner-id growth from 7 bytes to 64. 27_218 bytes cost 0.27218 NEAR. Mint charges this on top of the bytes it writes. The prepay is not refunded. T26 checks `contract balance ≥ total_locked + storage_usage × storage_byte_cost` after mint, pay success, pay failure, transfer, expire success, and expire refund failure plus retry. The unit test `storage_prepay_covers_full_rings` fills 50 service records and the holder ring, including 64-byte replacements, and checks the same inequality.

The size-profile sandbox run on 4 November 2026 (Asia/Jakarta) printed the same deltas: `bytes_per_mint=1416`, `bytes_per_service_record=299`, `bytes_per_holder_record=120`. The 27_218 byte prepay is unchanged because `contract/src/` is unchanged.

## Notes for the spec

Spec v3.6 settled the task 002 readings (token-not-found order, zero amount, cooldown restore, idempotent callbacks, `expire` return, `limit = 0`, event names). Two gaps are still open. They are also in the task 003 pull request. The spec file is unchanged.

- Spec 5.4 names only the 50 holder records and 50 service records. `last_claim_at_ns` (`None` to `Some`) grows the asset by 8 bytes, and `pending_refund` grows it by 16. The NEP-171 owner is stored again in `owner_by_id` and in the `tokens_per_owner` key, so a longer owner id grows storage by twice the Borsh length delta. The prepay includes both, or a full ring plus a 64-byte owner would break the balance invariant. Suggested fix: add those bytes to the worst-case prepay in 5.4.
- Spec 5.1 does not say what a second `expire` does while `pending_refund` is still `Some` and a restored balance is waiting. This code returns 0 and leaves state and transfers alone, so the original callback can still restore its amount. Suggested fix: say that `expire` is a no-op while a refund is in flight. `expire_noop_while_refund_in_flight` covers that path.

Spec v3.7 (4 November 2026) closed both of those notes. Section 5.1 now says `expire` returns 0 and does nothing while `pending_refund` is set. Section 5.4 now includes the option-field growth and the longer owner id, and it publishes the measured 1,416 / 299 / 120 byte figures and the 27,218 byte prepay.

## Web app (task 004)

Checked on 4 November 2026 (Asia/Jakarta, UTC+7). Direct dependencies are exact pins in `web/package.json`. `web/package-lock.json` is committed. CI installs the Node version in `web/.nvmrc`. `engines.node` is the range below, not that exact patch.

| Package | Pinned | License | Purpose |
| --- | --- | --- | --- |
| Node.js | 26.13.0 | — | Runtime. Current LTS on the day checked. |
| vite | 8.3.5 | MIT | Static dev server and production build. |
| @vitejs/plugin-react | 6.2.1 | MIT | React transform for Vite 8. |
| react | 19.3.1 | MIT | UI. |
| react-dom | 19.3.1 | MIT | DOM renderer. |
| react-router | 8.5.1 | MIT | Client routes. |
| typescript | 6.0.3 | Apache-2.0 | Typecheck. Newest compiler that day was 7.0.2, which `typescript-eslint` 8.72.1 rejects (`typescript` `>=4.8.4 <6.1.0`). |
| typescript-eslint | 8.72.1 | MIT | Lint rules for TypeScript. |
| eslint | 10.14.0 | MIT | Lint. |
| vitest | 5.1.0 | MIT | Unit tests. |
| @playwright/test | 1.64.1 | Apache-2.0 | Browser tests for T31, T32, and T38. |
| @types/react | 19.3.0 | MIT | React types. |
| @types/react-dom | 19.3.0 | MIT | React DOM types. |
| @types/node | 26.6.6 | MIT | Node types for the Vite and Playwright configs. |
| @near-wallet-selector/core | 10.1.4 | MIT OR Apache-2.0 | Testnet wallet connection. The user brings their own wallet. |
| @near-wallet-selector/modal-ui | 10.1.4 | MIT OR Apache-2.0 | Wallet picker UI. |
| @near-wallet-selector/my-near-wallet | 10.1.4 | MIT OR Apache-2.0 | MyNearWallet module. |
| @near-wallet-selector/meteor-wallet | 10.1.4 | MIT OR Apache-2.0 | Meteor wallet module. |
| @near-js/transactions | 2.5.1 | ISC | `actionCreators.functionCall`. It is not a named export of this package. |
| buffer | 6.0.3 | MIT | Browser polyfill. Vite 8 does not bundle Node's `buffer`, and the wallet packages need it. |

Apache-2.0 and ISC stay compatible with the MIT project license. CI installs Node with `actions/setup-node` `v7.1.0` (published 8 October 2026).

`npm audit` on this lockfile reported transitive findings. `npm audit fix --force` was not run, because it would move the pins above.

`index.html` sets `globalThis.global = globalThis` in a local inline script. The wallet packages read Node's `global`, and a production page threw `global is not defined` before the wallet modal could open. The production build still warns that `js-sha256` (pulled in by those packages) calls `eval`, and that the wallet chunk is about 1.6 MB. The app source does not call `eval`. Vite also warns that `generate-function` imports Node's `util`. That import stays external. Wallet setup was checked in a browser after the `global` line and the modal opened.

### Mint gas attached by the app

Measured on 4 November 2026 (Asia/Jakarta) on the default release profile, before `[profile.release]`. One mint whose contract receipt logged `nft_mint` and `warranty_funded` burned 3_633_924_445_063 gas (3.634 TGas). Mint has no callback. The temporary measurement test was not kept, so the sandbox suite stays at 8 tests. The size-profile run later the same day burned 3_554_608_102_822 gas on that receipt.

The app attaches 15 TGas (`15000000000000`) to `mint`. That is about four times the measured burn. Unused gas is refunded.

`pay_service` and `expire` each schedule the 5 TGas callback. Before the size profile, the highest measured pair was about 8.22 TGas (`pay_service` success 3.216 TGas plus a callback under 5 TGas). The size-profile pair is lower, and it is in the section above. Spec 8.3 asks for a fixed value well above 10 TGas. The app attaches 30 TGas (`30000000000000`) to `pay_service`, `expire`, and `nft_transfer`. The `nft_transfer` burn was not measured. 30 TGas is the same chosen headroom, not a measured transfer figure.

### Mint deposit estimate

The contract has no quote view (spec open item O10). Before signing, the issuer page shows the fund and this storage estimate, and the sentence "Unused storage deposit is refunded by the contract."

Base, from spec 8.3 / 5.4: 1_416 bytes written by the measured mint plus 27_218 prepaid extra bytes for a 7-character issuer = 28_634 bytes = 0.28634 NEAR, at 10^19 yoctoNEAR per byte.

Margin and adjustments in `web/src/near/deposit.ts`:

- 2_000 extra bytes (0.02 NEAR) for metadata longer than the measured title "E-bike EB-001" (13 bytes) and description "Warranty NFT for one e-bike" (26 bytes). If the form's title, description, and extra field exceed those 2_000 bytes, the longer count replaces the margin. It is not added twice.
- An issuer id shorter than 7 bytes adds `2 * (7 - length)`, because the owner id is stored twice. A longer issuer is already inside the 27_218 figure.
- Each workshop after the first adds 4 bytes plus the account id length (Borsh string). The measured mint had one workshop.
- A token id longer than `EB-001` (6 bytes) adds the extra bytes.

Attached deposit = fund + storage bytes × 10^19. The worst-case record prepay is not refunded. The 1_416 figure was measured with a long sandbox account id, while 27_218 is the prepay for a 7-character issuer. Spec 8.3 adds those two numbers, and the UI follows that sum.

### Test wallet and remote fonts

`VITE_TEST_WALLET=1` is the only switch that resolves the bare specifier `phylaxtag-test-wallet` to the in-memory adapter. A production build resolves it to a module that throws if called. `web/scripts/check-prod-bundle.mjs` fails the build if the marker `PHYLAX_TEST_WALLET_MARKER` or `fonts.googleapis.com` appears in `web/dist`. The wallet modal CSS imports a Google font. A Vite transform removes that import, and the app CSS uses the system font stack. No analytics, trackers, or other remote scripts are loaded. The app talks only to the configured NEAR RPC and to the wallet the user opens.

## Node on Vercel (task 005)

Checked on 4 November 2026 (Asia/Jakarta) against [Vercel’s Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). The majors available that day were 26.x (the default), 24.x, and 22.x. Node.js 20 had been discontinued for new deployments on 1 October 2026. Vercel selects one major. A range such as `>=22.0.0` is documented to deploy the latest 26.x.

`web/package.json` sets `engines.node` to `>=24`. That is the lowest major this app can state without a minor pin: `react-router` 8.5.1 requires Node `>=22.22`, and ESLint 10.14.0 requires `^22.13` or `>=24`. A Vercel 22.x selection is only the major, so 22 is not the minimum this repo advertises. `>=24` includes 24.x and 26.x. `web/.nvmrc` stays `26.13.0`, which satisfies `>=24`. CI still installs that file through `node-version-file`. No Node package was upgraded.

`web/vercel.json` sets `installCommand` to `npm ci`, `buildCommand` to `npm run build`, and `outputDirectory` to `dist`. The SPA rewrite sends `/(.*)` to `/index.html`. Vercel’s project-configuration docs give the filesystem precedence over rewrites, so a real file in `dist` is not replaced. The Vercel project root has to be `web/` for that file to be the project config. There is no deploy yet.
