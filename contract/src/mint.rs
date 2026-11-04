//! `mint` from spec 5.1 and the storage accounting from spec 5.4.

use near_contract_standards::non_fungible_token::Token;
use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::metadata::TokenMetadata;
use near_sdk::collections::Vector;
use near_sdk::{AccountId, NearToken, Promise, env, require};

use crate::events;
use crate::types::{Asset, HolderRecord, ServiceRecord, WarrantyStatus};
use crate::{Contract, StorageKey};

impl Contract {
    /// Checks run in the spec 5.1 order. State written for the token is measured
    /// and the issuer is refunded `deposit - fund_amount - storage_cost`.
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn perform_mint(
        &mut self,
        token_id: String,
        serial_hash: String,
        fund_amount: NearToken,
        expiry: u64,
        claim_cap: NearToken,
        cooldown_ns: u64,
        workshops: Vec<AccountId>,
        metadata: TokenMetadata,
    ) -> Token {
        let issuer = env::predecessor_account_id();
        require!(self.issuers.contains(&issuer), "Not an approved issuer");
        require!(
            self.tokens.owner_by_id.get(&token_id).is_none(),
            "Token exists"
        );
        require!(
            !self
                .used_serials
                .contains(&(issuer.clone(), serial_hash.clone())),
            "Serial already used"
        );
        require!(expiry > env::block_timestamp(), "Bad expiry");
        require!(
            claim_cap.as_yoctonear() > 0 && claim_cap <= fund_amount,
            "Bad cap"
        );
        require!(cooldown_ns > 0, "Cooldown must be > 0");
        if !workshops_ok(&workshops, &issuer) {
            env::panic_str("Bad workshop list");
        }

        let storage_before = env::storage_usage();

        // `None` keeps the attached deposit intact so the fund is not refunded
        // as leftover storage deposit. The standard `nft_mint` event is emitted
        // below; this helper does not emit it.
        let token = self.tokens.internal_mint_with_refund(
            token_id.clone(),
            issuer.clone(),
            Some(metadata),
            None,
        );

        let minted_at = env::block_timestamp();
        let asset = Asset {
            issuer: issuer.clone(),
            serial_hash: serial_hash.clone(),
            balance: fund_amount,
            expiry_ns: expiry,
            claim_cap,
            cooldown_ns,
            last_claim_at_ns: 0,
            workshops,
            status: WarrantyStatus::Active,
            holder_total: 1,
            holder_next: 1,
        };
        self.assets.insert(&token_id, &asset);
        self.used_serials.insert(&(issuer.clone(), serial_hash));

        let history: Vector<ServiceRecord> = Vector::new(StorageKey::HistoryFor {
            token_hash: env::sha256(token_id.as_bytes()),
        });
        self.history.insert(&token_id, &history);

        let mut holders: Vector<HolderRecord> = Vector::new(StorageKey::HoldersFor {
            token_hash: env::sha256(token_id.as_bytes()),
        });
        holders.push(&HolderRecord {
            owner: issuer.clone(),
            since_ns: minted_at,
            balance_at_transfer: fund_amount,
        });
        self.holders.insert(&token_id, &holders);

        let storage_used = env::storage_usage() - storage_before;
        let storage_cost = env::storage_byte_cost().saturating_mul(u128::from(storage_used));
        let required = fund_amount.saturating_add(storage_cost);
        require!(env::attached_deposit() >= required, "Deposit too small");

        let refund = env::attached_deposit().saturating_sub(required);
        if refund.as_yoctonear() > 0 {
            Promise::new(issuer.clone()).transfer(refund).detach();
        }

        self.total_locked = self
            .total_locked
            .checked_add(fund_amount)
            .unwrap_or_else(|| env::panic_str("Fund overflow"));

        NftMint {
            owner_id: issuer.as_ref(),
            token_ids: &[token_id.as_str()],
            memo: None,
        }
        .emit();
        events::emit_warranty_funded(&token_id, fund_amount, &issuer);

        token
    }
}

/// Spec 5.1: 1..N accounts, none of them the issuer or this contract.
fn workshops_ok(workshops: &[AccountId], issuer: &AccountId) -> bool {
    if workshops.is_empty() {
        return false;
    }
    let contract_id = env::current_account_id();
    workshops
        .iter()
        .all(|workshop| workshop != issuer && workshop != &contract_id)
}
