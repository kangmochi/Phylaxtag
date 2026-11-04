//! `pay_service` and `on_payout` from spec 5.1, 5.1a, and 5.2.

use near_contract_standards::non_fungible_token::TokenId;
use near_sdk::{AccountId, NearToken, Promise, assert_one_yocto, env, is_promise_success, require};

use crate::events;
use crate::types::{ServiceRecord, ServiceStatus, WarrantyStatus, is_lowercase_hex_64};
use crate::{CALLBACK_GAS, Contract, HISTORY_LIMIT};

impl Contract {
    pub(crate) fn perform_pay_service(
        &mut self,
        token_id: TokenId,
        workshop: AccountId,
        amount: NearToken,
        note_hash: String,
        work_type: String,
    ) {
        // Checks run in the spec 5.1 order. Token existence is before the
        // 1-yocto check, so a missing token does not report the SDK string.
        let owner = self
            .tokens
            .owner_by_id
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("Token not found"));
        assert_one_yocto();
        require!(env::predecessor_account_id() == owner, "Not owner");

        let mut asset = self
            .assets
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("Token not found"));
        let now = env::block_timestamp();
        require!(
            asset.status != WarrantyStatus::Expired && now < asset.expiry_ns,
            "Expired"
        );
        require!(!self.token_is_listed(&token_id), "Token is listed");
        require!(
            asset.workshops.iter().any(|allowed| allowed == &workshop),
            "Workshop not approved"
        );
        require!(workshop != owner, "Cannot pay yourself");
        require!(amount.as_yoctonear() > 0, "Amount must be > 0");
        require!(amount <= asset.claim_cap, "Over cap");
        require!(amount <= asset.balance, "Insufficient balance");
        if let Some(last) = asset.last_claim_at_ns {
            require!(
                now >= last.saturating_add(asset.cooldown_ns),
                "Cooldown active"
            );
        }

        let mut history = self
            .history
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("Token not found"));
        require!(history.len() < HISTORY_LIMIT, "History full");
        require!(work_type.len() <= 32, "Bad work_type");
        require!(is_lowercase_hex_64(&note_hash), "Bad note_hash");

        // Saved before the clock moves, so a failed callback can put it back
        // only when no newer claim has replaced it.
        let prev_last_claim_at_ns = asset.last_claim_at_ns;
        asset.balance = asset
            .balance
            .checked_sub(amount)
            .unwrap_or_else(|| env::panic_str("Insufficient balance"));
        asset.last_claim_at_ns = Some(now);
        self.sub_locked(amount);

        let record_index = history.len();
        history.push(&ServiceRecord {
            workshop: workshop.clone(),
            amount,
            work_type: work_type.clone(),
            note_hash: note_hash.clone(),
            owner_at_claim: owner.clone(),
            prev_last_claim_at_ns,
            timestamp_ns: now,
            block_height: env::block_height(),
            status: ServiceStatus::Pending,
        });
        self.assets.insert(&token_id, &asset);
        self.history.insert(&token_id, &history);

        events::emit_service_requested(
            &token_id,
            &owner,
            &workshop,
            amount,
            &work_type,
            &note_hash,
            record_index,
        );

        Promise::new(workshop.clone())
            .transfer(amount)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .with_unused_gas_weight(0)
                    .on_payout(token_id, workshop, amount, record_index),
            )
            .detach();
    }

    pub(crate) fn perform_on_payout(
        &mut self,
        token_id: TokenId,
        workshop: AccountId,
        amount: NearToken,
        record_index: u64,
    ) -> bool {
        let mut history = self
            .history
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("Token not found"));
        let mut record = history
            .get(record_index)
            .unwrap_or_else(|| env::panic_str("Token not found"));
        // A second callback is a no-op. Checked before the promise result so
        // it does not touch balances and does not need a fresh result.
        if record.status != ServiceStatus::Pending {
            return false;
        }

        if is_promise_success() {
            record.status = ServiceStatus::Paid;
            history.replace(record_index, &record);
            self.history.insert(&token_id, &history);
            events::emit_service_paid(&token_id, &workshop, amount, record_index);
            return true;
        }

        record.status = ServiceStatus::Failed;
        history.replace(record_index, &record);
        self.history.insert(&token_id, &history);

        // Status is left as stored, including when the token is already Expired.
        let mut asset = self
            .assets
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("Token not found"));
        asset.balance = asset
            .balance
            .checked_add(amount)
            .unwrap_or_else(|| env::panic_str("Fund overflow"));
        // A newer claim has its own timestamp. Restoring this one would wipe it.
        if asset.last_claim_at_ns == Some(record.timestamp_ns) {
            asset.last_claim_at_ns = record.prev_last_claim_at_ns;
        }
        self.assets.insert(&token_id, &asset);
        self.add_locked(amount);
        events::emit_payout_failed(&token_id, &workshop, amount, record_index);
        false
    }
}
