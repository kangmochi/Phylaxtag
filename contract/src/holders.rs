//! Holder ring buffer. Spec 5.1, 5.3, and 5.6.
//!
//! Mint writes the first entry. Each `nft_transfer` appends one more. Once 50
//! entries are stored, the oldest slot is overwritten. `holder_total` keeps
//! counting. A problem in the log must not panic: that would revert the transfer.

use near_contract_standards::non_fungible_token::TokenId;
use near_sdk::collections::Vector;
use near_sdk::{AccountId, env};

use crate::types::HolderRecord;
use crate::{Contract, HOLDER_LIMIT};

impl Contract {
    /// Append one holder. Returns without writing if the log cannot be updated
    /// safely. The caller has already moved the token.
    pub(crate) fn record_holder(&mut self, token_id: &TokenId, owner: AccountId) {
        let Some(mut asset) = self.assets.get(token_id) else {
            return;
        };
        let Some(mut holders) = self.holders.get(token_id) else {
            return;
        };

        let record = HolderRecord {
            owner,
            since_ns: env::block_timestamp(),
            balance_at_transfer: asset.balance,
        };
        if holders.len() < u64::from(HOLDER_LIMIT) {
            holders.push(&record);
        } else {
            let index = u64::from(asset.holder_next);
            if index >= holders.len() {
                return;
            }
            holders.replace(index, &record);
        }

        asset.holder_total = asset.holder_total.saturating_add(1);
        asset.holder_next = asset.holder_total % HOLDER_LIMIT;
        self.holders.insert(token_id, &holders);
        self.assets.insert(token_id, &asset);
    }
}

/// Oldest stored entry first. A full ring starts at `holder_next`.
pub(crate) fn ordered_holders(
    holders: &Vector<HolderRecord>,
    holder_next: u32,
) -> Vec<HolderRecord> {
    let len = holders.len();
    if len == 0 {
        return Vec::new();
    }
    let start = if len < u64::from(HOLDER_LIMIT) {
        0
    } else {
        u64::from(holder_next)
    };
    (0..len)
        .map(|offset| {
            holders
                .get((start + offset) % len)
                .unwrap_or_else(|| env::panic_str("holder index"))
        })
        .collect()
}
