# Phylaxtag specification

This is the design reference for the contract in `contract/` and the web app in `web/`.
It describes what the code does today. Where the code and this document disagree, the
code is authoritative and this document is a bug.

Related documents: [ARCHITECTURE.md](ARCHITECTURE.md) (how the pieces fit together),
[THREAT_MODEL.md](THREAT_MODEL.md) (how a seller could try to keep the money),
[DECISIONS.md](DECISIONS.md) (version pins and measured numbers),
[TESTNET_DEPLOY_GUIDE.md](TESTNET_DEPLOY_GUIDE.md) (how the live contract was deployed).

## 1. What Phylaxtag is

One physical item (MVP: one e-bike) becomes a NEP-171 NFT on NEAR. The NFT carries two
things that normally die at resale: a **warranty fund** and a **service history**.

The issuer (seller or manufacturer) deposits the fund once, at mint, and names the
approved workshops. The owner pays an approved workshop straight from the fund with one
call, inside limits the contract enforces. The owner can never withdraw the fund to their
own wallet. When the bike is sold the NFT moves to the buyer, and the remaining fund and
the full service history move with it. After expiry the remainder returns to the issuer.

Phylax (φύλαξ) is Greek for "guardian". The claim we make is: "to our knowledge, a working
NFT-warranty implementation on NEAR". Not "the first".

- Network: NEAR testnet, prototype only.
- Core calls: `mint`, `pay_service`, `nft_transfer`, `expire`.
- Views: `get_asset`, `get_service_history`, `get_holder_history`, `get_storage_info`, plus NEP-171/177/181.
- Off-chain parts: none required. The web app is static; only hashes go on chain.

## 2. Problem

- **Warranties do not follow the item.** They are tied to the first buyer's name or receipt.
- **Service history cannot be checked.** A used-item buyer cannot see what was serviced.
- **Warranty value is invisible.** Nobody can see how much repair budget is left.
- **Claims are slow.** Forms and approvals are heavy for a small repair.
- **Fraud risk.** If the fund were freely cashable, an owner could stage fake repairs and drain it.

## 3. Actors and permissions

| Actor | Who | May | May not |
| --- | --- | --- | --- |
| Admin | Contract deployer | Set the issuer allowlist in `new`; `add_issuer` | Touch any token's fund |
| Issuer | Allowlisted seller or manufacturer | Mint with a one-time deposit; choose workshops, expiry, per-claim cap and cooldown; receive the remainder after expiry | Change limits or workshops after mint; add money later |
| Owner | Current NFT holder (`nft_token(id).owner_id`) | `pay_service` to an approved workshop within limits; transfer the NFT; open the holder-only page | Withdraw the fund; pay a non-approved account; pay themselves; claim while the token is listed |
| Workshop | Account on the token's allowlist | Receive payments | Trigger a payment |
| Buyer | Next owner | Inspect fund and history before buying; becomes owner on transfer | — |
| Anyone | Any account | Call `expire` after expiry; read all views | Change asset data |

## 4. Design principles

- **One call per service.** No submit/approve stages; the contract checks the limits.
- **Money never reaches the owner.** It can only go to an approved workshop, or to the issuer after expiry.
- **No pending state** between calls, except an in-flight payout or expiry refund, whose
  result always lands back on the token.
- **Limits are code, not people.** Cap, cooldown, remaining fund, allowlist, expiry. No co-signer.
- **One deposit.** The issuer funds the warranty once, at mint. There is no `top_up`.

An owner-funded service wallet was considered and rejected: that is personal savings, not
a warranty. The value of a warranty comes from the seller's promise, so the issuer funds it.

## 5. Lifecycle

Example values, illustrative only: fund 10 NEAR, one service 2 NEAR, per-claim cap 3 NEAR,
cooldown 30 days, expiry 2027-11-03. Demo tokens use a short cooldown and expiry instead;
that is a mint parameter, not a contract flag.

| # | Step | Who | Call | Result |
| --- | --- | --- | --- | --- |
| 1 | Allowlist the issuer | Admin | `new(admin, [issuer])` or `add_issuer` | Issuer may mint |
| 2 | Mint EB-001 with the fund | Issuer | `mint(...)` + fund + storage deposit | Fund exactly 10 NEAR; storage paid from the deposit; excess refunded |
| 3 | Transfer to the first buyer | Issuer | `nft_transfer(alice, "EB-001")` | Owner = Alice; holder log records Alice |
| 4 | Pay a workshop from the fund | Owner | `pay_service("EB-001", ws-a, 2 NEAR, note_hash, "brakes")` | ws-a receives 2 NEAR; fund 8; next claim after the cooldown |
| 5 | Try 4 NEAR, another workshop, or a second claim inside the cooldown | Owner | `pay_service(...)` | Rejected: `Over cap` / `Workshop not approved` / `Cooldown active` |
| 6 | Sell to Budi | Owner | `nft_transfer(budi, "EB-001")` | Fund 8 and the history move; Alice's holder page now says "not the current holder" |
| 7 | Previous owner tries to pay again | Alice | `pay_service(...)` | Rejected: `Not owner` |
| 8 | After expiry, anyone closes the warranty | Anyone | `expire("EB-001")` | Remaining fund goes to the issuer; status `Expired`; history stays readable |

## 6. Contract interface

Rust, `near-sdk` and `near-contract-standards` pinned in [DECISIONS.md](DECISIONS.md).
All amounts are yoctoNEAR (1 NEAR = 10^24 yocto); all times are block timestamps in
nanoseconds. `u64` arguments (`expiry`, `cooldown_ns`) and yoctoNEAR amounts are sent as JSON
strings, which is what the web app does; the contract types them as `U64` and `NearToken` so the
encoding is explicit and cannot silently lose precision.

### 6.1 Change methods

| Function | Caller | Effect | Checks (in order) |
| --- | --- | --- | --- |
| `new(admin, issuers)` | Deployer | Set admin and issuer allowlist | Once only |
| `add_issuer(account)` | Admin | Add an issuer | Caller = admin |
| `mint(token_id, serial_hash, fund_amount, expiry, claim_cap, cooldown_ns, workshops, metadata)` payable | Allowlisted issuer | Create an NFT owned by the issuer; store the asset; `balance = fund_amount`; write the first holder record and an empty history; refund deposit excess; return the minted `Token` | Issuer allowlisted; token id 1..=32 bytes; serial hash exactly 64 lowercase hex; token id new; serial new for this issuer; expiry in the future; `0 < claim_cap <= fund`; `cooldown_ns > 0`; workshops 1..N, no duplicates, not the issuer, not the contract; deposit ≥ fund + storage + worst-case prepay |
| `mint_open(serial_hash, fund_amount, claim_cap, cooldown_ns, workshops, metadata)` payable | Anyone (practice deployment only) | Same mint as above, without the allowlist: the caller becomes the issuer and owner, the contract picks `token_id = J-<n>`, and the expiry is fixed at `block_timestamp + 30 days` | One tag per account; `n < 100`; every other mint check from the row above; the caller pays fund, storage and prepay |
| `pay_service(token_id, workshop, amount, note_hash, work_type)` payable, 1 yocto | Current owner | Deduct balance, append a `Pending` record, emit `service_requested`, send NEAR to the workshop, callback `on_payout` | Token exists; exactly 1 yocto; caller = owner; not expired; no active approvals; workshop on the list; workshop ≠ owner; amount > 0; amount ≤ cap; amount ≤ balance; cooldown elapsed; fewer than 50 records; work type ≤ 32 bytes; note hash 64 lowercase hex |
| `nft_transfer` | Owner or approved account | Standard NEP-171 transfer; fund and history stay on the token; holder log appended (drop-oldest) | Standard (1 yocto), approvals cleared, never fails because of the log |
| `nft_transfer_call` | — | Disabled in the MVP | Always panics: `nft_transfer_call disabled in MVP` |
| `expire(token_id)` → `U128` | Anyone | If a refund is in flight (`pending_refund` set): return 0 and change nothing. Otherwise set status `Expired`; if balance > 0, move it to `pending_refund` and send it to the issuer; return the amount attempted | Now ≥ expiry; token exists |
| `on_payout` `#[private]` | Contract itself | Act only while the record is `Pending` (idempotent). Success: record `Paid`, emit `service_paid`. Failure: restore amount to balance and `total_locked`, mark the record `Failed`, restore the cooldown when no newer claim exists | Reads the promise result |
| `on_expire_payout` `#[private]` | Contract itself | Act only while `pending_refund == Some(amount)`. Success: clear it. Failure: restore amount to balance and `total_locked`, emit `expire_refund_failed`; a later `expire` retries | Reads the promise result |

### 6.2 View methods

| View | Arguments | Returns |
| --- | --- | --- |
| `get_asset` | `token_id` | Asset, owner, balance, stored status, display status, `next_claim_ns`; `null` when missing |
| `get_service_history` | `token_id`, `from_index?`, `limit?` (default and max 50) | Records in order; empty page when `from_index` is past the end; `null` when missing |
| `get_holder_history` | `token_id` | Latest ≤ 50 holders, oldest first, with `since` and balance at transfer, plus `holder_total`; `null` when missing |
| `get_storage_info` | — | `storage_usage`, `total_locked`, contract balance |
| NEP-171/177/181 | — | `nft_token`, `nft_metadata`, `nft_tokens_for_owner`, `nft_tokens` |

`nft_metadata` returns constants, not stored state: name `Phylaxtag`, symbol `PHYLAX`,
spec `nft-1.0.0`, no icon, no base URI, no reference.

### 6.3 Display status and next claim

Display status is computed in `get_asset` from the stored status, the balance and the
clock. The UI shows it as returned and never recomputes it:

| Stored status | Condition | Display status |
| --- | --- | --- |
| Active | now < expiry and balance > 0 | `Active` |
| Active | now < expiry and balance = 0 | `Empty (fund used up)` |
| Active | now ≥ expiry (any balance, `expire` not called) | `Expired, close pending` |
| Expired | balance > 0 (failed refund or late failed payout restored) | `Expired, close pending` |
| Expired | balance = 0 | `Expired` |

`next_claim_ns` is `null` before the first claim (a claim is possible now), otherwise
`last_claim_at_ns + cooldown_ns`. It is informational: a claim also needs display status
`Active`.

### 6.4 Error strings

The contract panics with these strings, and because the release profile uses
`panic = "abort"` the text does not reach the client on its own. Every rejection is
therefore logged first as `Phylaxtag error: <reason>`; the web app reads that line from the
transaction outcome and shows the reason, falling back to the trap text only when the log is
missing. The web app shows the original string next to its
plain-English mapping and never guesses.

- `mint_open`: `Practice cap reached`, `One practice tag per wallet`, plus the `mint` reasons
  below, except `Not an approved issuer`.
- `mint`: `Not an approved issuer`, `Bad token_id`, `Bad serial_hash`, `Token exists`,
  `Serial already used`, `Bad expiry`, `Bad cap`, `Cooldown must be > 0`,
  `Bad workshop list`, `Deposit too small`, `Already initialized`.
- `pay_service`: `Token not found`, `Requires attached deposit of exactly 1 yoctoNEAR`,
  `Not owner`, `Expired`, `Token is listed`, `Workshop not approved`, `Cannot pay yourself`,
  `Amount must be > 0`, `Over cap`, `Insufficient balance`, `Cooldown active`,
  `History full`, `Bad work_type`, `Bad note_hash`.
- `expire`: `Token not found`, `Not yet expired`.
- `add_issuer`: `Only admin`.

## 7. Limits enforced by the contract

| Limit | Set by | Enforced in |
| --- | --- | --- |
| Per-claim cap: amount ≤ `claim_cap` | Issuer at mint | `pay_service` |
| Cooldown: now ≥ `last_claim_at + cooldown_ns`, `cooldown_ns > 0` required at mint, per token, never reset by a transfer | Issuer at mint | `pay_service` |
| No claims while the token has active approvals (listed for sale) | Contract rule | `pay_service` |
| Cumulative cap: total paid ≤ remaining fund (balance never goes negative, no top-ups) | Implicit | `pay_service` |
| Workshop allowlist, fixed at mint; the owner is never a valid payee | Issuer at mint | `pay_service` |
| Expiry: no claims at or after expiry; the remainder returns to the issuer | Issuer at mint | `pay_service`, `expire` |

Upper bound on what an owner plus one colluding approved workshop can extract:
`min(balance, claim_cap × (1 + floor((expiry − now) / cooldown)))`. The issuer chooses all
three numbers, and `cooldown_ns > 0` keeps the formula defined.

**Concurrency.** Calls to one contract run one at a time, and `pay_service` deducts the
balance, writes the record and sets `last_claim_at` before it creates the payout promise.
With `cooldown_ns > 0`, a second claim in the same block (same timestamp) or before the
cooldown ends is rejected, so the balance can never be spent twice. A per-token
`payout_pending` flag was considered and not adopted: it adds an admin unlock path (a new
trust and attack surface) and no money safety, because the balance is already deducted.
The `Pending` record status is what the UI shows instead.

## 8. Storage accounting and invariants

- `mint` takes an explicit `fund_amount`, measures `env::storage_usage()` before and after,
  requires `deposit ≥ fund + cost + worst-case prepay`, and refunds the excess.
- The worst case for a token is prepaid at mint: 50 holder records and 50 service records at
  maximum sizes, plus the growth of the option fields (`last_claim_at_ns` +8,
  `pending_refund` +16) and of a longer future owner id. Prepaid extra is **27,218 bytes**
  (0.27218 NEAR) for a 7-character issuer. So `pay_service` and `nft_transfer` never need
  new money, and the prepay is not refunded (records are never deleted).
- Measured at mint: 1,416 bytes of token state (0.01416 NEAR); one service record 299 bytes
  (0.00299 NEAR); one holder record 120 bytes (0.0012 NEAR) with 7-character ids. Byte cost
  is 10^19 yoctoNEAR.
- A plain NEAR transfer to the contract account tops up the storage reserve. No function is
  needed; reserve money is never part of any token's fund.
- **Invariant:** contract balance ≥ `total_locked` + `storage_usage × storage_byte_cost`.
  Every path that moves money keeps it: `mint`, `pay_service` and its failed payout, `expire`
  and its failed refund.

## 9. Events (NEP-297)

| Event | Emitted by | Fields |
| --- | --- | --- |
| `nft_mint`, `nft_transfer` | mint / transfer | standard NEP-297 fields |
| `warranty_funded` | `mint`, the only funding event | `token_id`, `amount`, `issuer` |
| `service_requested` | `pay_service` (record Pending) | `token_id`, `owner`, `workshop`, `amount`, `work_type`, `note_hash`, `record_index` |
| `service_paid` | `on_payout` success | `token_id`, `workshop`, `amount`, `record_index` |
| `payout_failed` | `on_payout` failure | `token_id`, `workshop`, `amount`, `record_index` |
| `warranty_expired` | `expire`, once, on the first transition to Expired | `token_id`, `amount` (attempted, may be 0), `issuer` |
| `expire_refund_retried` | later `expire` calls with balance > 0 | `token_id`, `amount`, `issuer` |
| `expire_refund_failed` | `on_expire_payout` failure | `token_id`, `amount`, `issuer` |

## 10. Standards

- **NEP-171:** the standard `NonFungibleToken`. `near-contract-standards` 5.30.0 has no
  transfer hook, so the contract's own `nft_transfer` calls the inner transfer and then
  appends the holder record.
- **NEP-171 call variant:** `nft_transfer_call` is disabled. It would make a receiver
  contract the temporary owner, which opens a claim-during-transfer window.
- **NEP-178 approvals:** kept for marketplace compatibility but restricted. An approved
  account may transfer, never pay. `pay_service` is rejected while any approval exists
  (`Token is listed`), and approvals are cleared on transfer.
- **NEP-177:** token metadata holds title, description and extra JSON (asset type, serial
  hash). No image is required.
- **NEP-181:** `nft_tokens_for_owner` drives the "Your side" view and the gated page.
- **No sub-account or access key per token.** A per-token ledger inside one contract
  replaces the per-token wallet the track prompt suggests, so there is no key for a seller
  to keep.

## 11. Test coverage

| Suite | Count | Command |
| --- | --- | --- |
| Contract unit tests | 62 | `cargo test` in `contract/` |
| Contract sandbox tests | 8 | `cargo test` in `integration-tests/` (needs the release wasm) |
| Web unit tests (Vitest) | 80 | `npm test` in `web/` |
| Web end-to-end tests (Playwright) | 28 | `npm run e2e` in `web/` |

The contract suites cover 35 contract-level plan IDs (T01–T30, T34–T37, T39). One ID can map
to several test functions, and a few tests carry no ID. The ID-to-function list is in the
README. The web suites cover T31 (gated page), T32 (sell flow) and T38 (status labels and
next claim). T33 is the manual newcomer run of the README.

Areas covered by the contract suites: balance and history moving with the token, owner-only
payments, the workshop allowlist, cap, cooldown and expiry, refunds and their failure paths,
a sale in the middle of a payout, approvals blocking claims, approval cleanup on transfer,
the 50-record cap, the holder ring never blocking a transfer, exact storage accounting, and
mint input validation (including a zero cooldown and the contract account as a workshop).

## 12. Web application contract

Vite + React + TypeScript in `web/`, NEAR Wallet Selector on testnet. Plain language for
newcomers; technical detail lives on the "How it works" page.

| Page | Content |
| --- | --- |
| Asset (public) | Name, issuer, display status, remaining fund, expiry, cap, cooldown, next claim, workshops, last 5 services, "Close warranty" when expired with a balance |
| History (public) | Funded, paid out, who held it (latest 50 with dates and balance at transfer, plus the total), explorer links |
| Holder-only (gated) | Pay a workshop from the fund; "Sell this item"; note hashes computed in the browser. Re-checks the on-chain owner on every load and action |
| Issuer | Mint form with a deposit preview; "Close warranty / refund" for expired tokens, including "Refund in flight" |
| Workshop | Payments received |
| How it works | The transfer rules, the function table, explorer links, honest limits |

**Wallet and configuration.** NEAR testnet only. Read-only pages work without a wallet. The
app never asks for, stores or logs a key or seed phrase. One build-time contract id, one RPC
URL, one network id; the committed example file holds placeholders only.

**Display rules.** Show the display status exactly as returned. When `pending_refund` is not
null, also show "Refund in flight". Amounts are yoctoNEAR strings converted with exact
decimal arithmetic, never floating point. Times are u64 nanoseconds returned as JSON
numbers, which exceed JavaScript's safe integer range; parse them losslessly or accept
rounding for display only.

**Mint deposit preview.** The contract has no quote view, so the UI shows the fund plus an
upper estimate of the storage deposit before the wallet opens, and states that unused
storage deposit is refunded by the contract.

**Gas.** The app attaches 15 TGas to `mint` and 30 TGas to `pay_service`, `expire` and
`nft_transfer`; unused gas is refunded. `CALLBACK_GAS` is 5 TGas. Measurements are in
[DECISIONS.md](DECISIONS.md).

**Copy rules.** English only. "to our knowledge, a working NFT-warranty implementation on
NEAR", never "first", "insured" or "insurance". Near "Sell this item", disclose that a
seller can claim just before selling, so a buyer should check "next claim possible at".

**The UI must never:** ask for or transmit keys or seed phrases; hold funds; sign for the
user; send the raw serial or the salt anywhere (only the hash); hide a failed transaction or
show a payout as paid before the record is `Paid`; load analytics, trackers or remote
scripts; treat a browser check as authority.

## 13. Honest limits and non-goals

- A prototype on NEAR testnet, not a product.
- The NFT does not prove physical authenticity and is not a legal title.
- The link between the NFT and the bike (serial number, QR) is outside the contract.
- Nobody verifies that a repair happened; an approved workshop can collude with an owner
  inside the limits above.
- No keeper and no required off-chain component.
- Deliberately not in the MVP: own token or marketplace, on-chain escrow sale, IoT or price
  oracle, dispute system, multiple asset types, cross-chain, NEAR Intents, deposits after
  mint, issuer co-sign, `remove_issuer` or `set_admin`.

## Appendix: where the old section numbers went

Earlier revisions of this document used the numbering below. Code comments in `contract/`
and `web/` still cite those numbers, and this is what each one points at now.

| Old reference | Now |
| --- | --- |
| 1 Pitch, 2 Problem | Sections 1 and 2 |
| 3 Solution and actors, 4 End-to-end flow | Sections 3, 4 and 5 |
| 5.1 Function table, 5.1a Signatures | Section 6.1 and 6.2 |
| 5.1b Display status and next claim | Section 6.3 |
| 5.2 Claim-limit rules | Section 7 |
| 5.3 Storage layout | Section 3 of [ARCHITECTURE.md](ARCHITECTURE.md) |
| 5.4 Storage accounting | Section 8 |
| 5.5 Events | Section 9 |
| 5.6 NEP notes | Section 10 |
| 6 Threat model | [THREAT_MODEL.md](THREAT_MODEL.md) |
| 7 Test plan | Section 11 |
| 8 Web pages and UI contract | Section 12 |
| 14 Open items | Section 13 |
