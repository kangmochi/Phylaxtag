# Threat model

The question this document answers: if a seller wants to keep the money or the access after
selling the bike, what exactly stops them? Every mitigation below points at code in
`contract/` or `web/` and at the test that checks it.

Companion documents: [SPEC.md](SPEC.md) (rules and error strings), [ARCHITECTURE.md](ARCHITECTURE.md)
(where each rule lives), [DECISIONS.md](DECISIONS.md) (measured numbers).

## 1. What is actually trusted

| Trust point | Why it is trusted | What happens if it fails |
| --- | --- | --- |
| The contract account, by `nft_token(token_id).owner_id` | It is the single source of truth for control, read at call time on every money move | Nothing: a wrong owner can only be an owner the chain says is the owner |
| The admin (deployer) | Sets the issuer allowlist | A malicious admin can allowlist a fake issuer; it still cannot touch an existing token's fund |
| The issuer | Chooses the fund, cap, cooldown, expiry and workshops | A stingy or fake warranty, visible on the asset page before purchase |
| The deployed code | The deployer holds the upgrade keys | Testnet only; stated in the README. A production deployment would need locked keys |

What is **not** trusted: the browser, the wallet UI, any cached page state, and the previous
owner. All of them can lie; the contract re-checks.

## 2. How control passes on transfer

1. There is exactly one source of truth: `nft_token(token_id).owner_id`.
2. Every money-moving owner action (`pay_service`) checks `predecessor == owner_id` at call
   time. Nothing is cached, and there is no session, allowance, sub-account or access key per
   token.
3. The fund is `Asset.balance`, a field of the token, not of an account. A transfer changes
   `owner_id` and nothing else, so the fund, the history, the cooldown clock and the limits
   stay with the item.
4. A transfer clears all NEP-178 approvals, so a marketplace or helper the seller approved
   loses its right to move the token.
5. `nft_transfer_call` is disabled, so there is no window where a receiver contract is a
   temporary owner.
6. Money can only leave to an approved workshop (never the owner) or to the issuer after
   expiry. A failed payment returns to the **token**, so whoever owns the token then benefits,
   never the old owner.
7. The holder-only page re-reads `owner_id` from the chain on every load and before every
   action, so the old owner sees "Only the current holder can open this page" right after
   the sale.

## 3. Seller attacks and mitigations

| ID | Seller attack | Mitigation | Test |
| --- | --- | --- | --- |
| S1 | Drain the fund with a colluding approved workshop right before the sale | Per-claim cap plus per-token cooldown bound the drain; the buyer sees the balance, the last claim and "next claim possible at" before paying; the holder log stores `balance_at_transfer` | T01, T15, T25 |
| S2 | Front-run the sale: the buyer pays off-chain, the seller claims before transferring | Same bound as S1. In the MVP the sale price is paid off-chain; the README tells buyers to check the balance after the transfer. Atomic escrow sale is out of scope | T15, T25 |
| S3 | Listing-and-claiming race: approve a marketplace, then claim before the purchase lands | `pay_service` is rejected while any approval exists (`Token is listed`); to claim, the seller must revoke, which kills the listing | T23 |
| S4 | Keep an approval after the sale and pull the NFT back | Approvals are cleared on every transfer | T24 |
| S5 | Claim through an approved, non-owner account | `pay_service` is owner-only | T12 |
| S6 | `nft_transfer_call` tricks: a seller-controlled receiver becomes the temporary owner, claims, then resolves the token back | `nft_transfer_call` is disabled in the MVP | T13 |
| S7 | Keep calling `pay_service` after the sale | The owner is checked at call time | T02 |
| S8 | Sell while a payout is in flight and hope a failed payout refunds to the seller | The callback restores the amount to the token balance, never to an account; the record is marked `Failed` | T19, T20 |
| S9 | Reset the cooldown by transferring to a second wallet | The cooldown is stored per token and is not reset by a transfer | T16 |
| S10 | Be an approved workshop and pay yourself | `workshop ≠ owner`; the issuer picks the workshops | T18 |
| S11 | Re-mint: a second token for the same bike, reuse a token id, or another allowlisted issuer minting the same serial hash | Token ids are never reusable (no burn in the MVP); the serial hash is unique per issuer. A cross-issuer duplicate is an accepted residual risk: the issuer is shown prominently on the asset page | T28 (same issuer only) |
| S12 | Expiry timing: claim just before expiry, or let a failed payout land after `expire` | Claims are allowed only before expiry and inside cap/cooldown; a refund restored after expiry goes to the issuer when `expire` is called again | T07, T11, T21, T36 |
| S13 | Keep using the holder-only page after the sale (cached session) | The page re-checks the on-chain owner on each load and action | T31 |
| S14 | Keep a key that controls the item's wallet | No per-token sub-account or key exists; the fund is a ledger entry inside one contract | Design review |
| S15 | Add money later and claim it back | No deposit function exists after mint; a plain NEAR transfer to the contract is storage reserve only and never part of a token fund; mint excess is refunded at mint only | T17 |
| S16 | Hide previous holders with many self-transfers, pushing them out of the 50-entry log | The `holder_total` counter is shown in the UI ("N transfers, showing the latest 50"); `nft_transfer` events are permanent; service records are unaffected | T37 |
| S17 | Claim at the last moment before selling, so the buyer must wait a full cooldown | Not preventable without reopening S9; "next claim possible at" is shown on the asset page and in the Sell dialog, and the README discloses it | T38 |
| S18 | Double or lost refund: call `expire` again while a refund is in flight and overwrite `pending_refund` | `expire` is a no-op (returns 0, no write, no event, no transfer) while `pending_refund` is set; only the callback clears it; a later `expire` retries any restored balance | T21 |

## 4. General threats and residual risk

| Threat | Mitigation | Residual risk |
| --- | --- | --- |
| Owner withdraws to their own wallet | No withdrawal function; the owner cannot be a payee | Low |
| Owner colludes with an allowlisted workshop (fake repairs) | Cap, cooldown, allowlist and expiry bound it; the issuer chooses workshops and numbers | Real and accepted, bounded by the formula in [SPEC.md](SPEC.md) section 7. No co-sign, by design |
| Fake issuer mints fake items | Issuer allowlist | The admin is a trust point |
| A second allowlisted issuer mints the same serial hash | The issuer is shown prominently on the asset page; the buyer checks it matches the brand or seller | Accepted for the MVP; uniqueness is per issuer |
| No `remove_issuer` and no `set_admin` in the MVP | None; disclosed in the README | Accepted for a testnet MVP. A leaked issuer key can mint forever; a lost admin key cannot be recovered |
| Reentrancy or promise-ordering bugs | State is written before the transfer promise; callbacks are `#[private]` and idempotent | Low while T10, T19, T22 and T35 pass |
| Workshop or issuer account deleted, so the transfer fails | The callback restores the balance, the record becomes `Failed`, `expire` can be retried | Low |
| The deployer can upgrade the code | Testnet only; stated in the README | Trust assumption for the prototype |
| Personal data on chain | Only a salted serial hash and a note hash | Low, as long as the salt stays off-chain with the issuer |
| The NFT read as proof of authenticity or as a legal title | Explicit statements in the UI and the README | Depends on the reader |
| Storage exhaustion | Exact storage at mint, 50-record caps, the holder ring, a storage reserve | Low for the demo |
| A seller claims just before the sale, so the buyer waits a full cooldown | "Next claim possible at" on the asset page and in the Sell dialog, plus the README disclosure. Resetting the cooldown on transfer would reopen S9 | Accepted; visible before paying |
| The holder log hides holders older than the latest 50 | Total counter plus permanent events | Low; needs 50+ transfers (gas only) |

## 5. Honest limits

- Prototype on NEAR testnet, not a product.
- The NFT does not prove physical authenticity and is not a legal title.
- The link between the NFT and the bike (serial number, QR) is outside the contract.
- Nobody verifies that a repair really happened; an approved workshop can collude with an
  owner inside the limits above.
- No keeper and no required off-chain component.

## 6. Deliberately not defended in the MVP

Own token or marketplace, on-chain escrow sale, IoT or price oracle (the fund is denominated
in NEAR, not USD), a dispute system, multiple asset types, cross-chain transfers, NEAR
Intents, deposits after mint, and an issuer co-sign step. Each of these would add surface
that the demo cannot honestly cover in the remaining time.
