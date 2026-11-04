//! `expire` and `on_expire_payout` from spec 5.1 and 5.1a.

use near_contract_standards::non_fungible_token::TokenId;
use near_sdk::json_types::U128;
use near_sdk::{NearToken, Promise, env, is_promise_success, require};

use crate::events;
use crate::types::WarrantyStatus;
use crate::{CALLBACK_GAS, Contract};

impl Contract {
    pub(crate) fn perform_expire(&mut self, token_id: TokenId) -> U128 {
        let mut asset = self
            .assets
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("Token not found"));
        require!(env::block_timestamp() >= asset.expiry_ns, "Not yet expired");

        let amount = asset.balance;
        // A second call with nothing left to send is a no-op: no write, no event.
        if amount.is_zero() && asset.status == WarrantyStatus::Expired {
            return U128(0);
        }

        asset.status = WarrantyStatus::Expired;
        let issuer = asset.issuer.clone();
        if amount.is_zero() {
            self.assets.insert(&token_id, &asset);
        } else {
            asset.balance = NearToken::from_yoctonear(0);
            self.assets.insert(&token_id, &asset);
            self.sub_locked(amount);
            Promise::new(issuer.clone())
                .transfer(amount)
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(CALLBACK_GAS)
                        .with_unused_gas_weight(0)
                        .on_expire_payout(token_id.clone(), amount),
                )
                .detach();
        }

        // First close, including a zero balance, and any later refund retry.
        events::emit_warranty_expired(&token_id, amount, &issuer);
        U128(amount.as_yoctonear())
    }

    pub(crate) fn perform_on_expire_payout(
        &mut self,
        token_id: TokenId,
        amount: NearToken,
    ) -> bool {
        if is_promise_success() {
            return true;
        }

        let mut asset = self
            .assets
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("Token not found"));
        asset.balance = asset
            .balance
            .checked_add(amount)
            .unwrap_or_else(|| env::panic_str("Fund overflow"));
        let issuer = asset.issuer.clone();
        self.assets.insert(&token_id, &asset);
        self.add_locked(amount);
        events::emit_expire_refund_failed(&token_id, amount, &issuer);
        false
    }
}
