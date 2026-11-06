//! `mint` from spec 5.1 and the storage accounting from spec 5.4.

use crate::errors::{refuse, refuse_unless};
use near_contract_standards::non_fungible_token::Token;
use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::metadata::TokenMetadata;
use near_sdk::collections::Vector;
use near_sdk::{AccountId, NearToken, Promise, env};

use crate::events;
use crate::storage::prepaid_extra_bytes;
use crate::types::{Asset, HolderRecord, ServiceRecord, WarrantyStatus, is_lowercase_hex_64};
use crate::{Contract, StorageKey};

impl Contract {
    /// Checks run in the spec 5.1 order. State written for the token is measured.
    /// On top of that, mint charges the spec 5.4 worst-case prepay (50 holder
    /// records and 50 service records at maximum sizes, minus the holder slot
    /// this call already wrote, plus the asset-option and owner-id growth
    /// documented in `storage`). The issuer is refunded the rest. The prepay
    /// is not refunded.
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
        refuse_unless!(self.issuers.contains(&issuer), "Not an approved issuer");
        // Spec 5.1 writes "1..32 bytes". That is 1 to 32 inclusive, same style as "1..N".
        refuse_unless!((1..=32).contains(&token_id.len()), "Bad token_id");
        refuse_unless!(is_lowercase_hex_64(&serial_hash), "Bad serial_hash");
        refuse_unless!(
            self.tokens.owner_by_id.get(&token_id).is_none(),
            "Token exists"
        );
        refuse_unless!(
            !self
                .used_serials
                .contains(&(issuer.clone(), serial_hash.clone())),
            "Serial already used"
        );
        refuse_unless!(expiry > env::block_timestamp(), "Bad expiry");
        refuse_unless!(
            claim_cap.as_yoctonear() > 0 && claim_cap <= fund_amount,
            "Bad cap"
        );
        refuse_unless!(cooldown_ns > 0, "Cooldown must be > 0");
        if !workshops_ok(&workshops, &issuer) {
            refuse("Bad workshop list");
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
            last_claim_at_ns: None,
            workshops,
            status: WarrantyStatus::Active,
            holder_total: 1,
            holder_next: 1,
            pending_refund: None,
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
        let first_holder = HolderRecord {
            owner: issuer.clone(),
            since_ns: minted_at,
            balance_at_transfer: fund_amount,
        };
        holders.push(&first_holder);
        self.holders.insert(&token_id, &holders);

        let storage_used = env::storage_usage() - storage_before;
        let prepaid = prepaid_extra_bytes(&issuer, &first_holder);
        let billable = storage_used.saturating_add(prepaid);
        let storage_cost = env::storage_byte_cost().saturating_mul(u128::from(billable));
        let required = fund_amount.saturating_add(storage_cost);
        refuse_unless!(env::attached_deposit() >= required, "Deposit too small");

        let refund = env::attached_deposit().saturating_sub(required);
        if refund.as_yoctonear() > 0 {
            Promise::new(issuer.clone()).transfer(refund).detach();
        }

        self.total_locked = self
            .total_locked
            .checked_add(fund_amount)
            .unwrap_or_else(|| refuse("Fund overflow"));

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

/// Spec 5.1: 1..N accounts, no duplicates, none of them the issuer or this contract.
fn workshops_ok(workshops: &[AccountId], issuer: &AccountId) -> bool {
    if workshops.is_empty() {
        return false;
    }
    let contract_id = env::current_account_id();
    let mut seen = std::collections::HashSet::with_capacity(workshops.len());
    for workshop in workshops {
        if workshop == issuer || workshop == &contract_id || !seen.insert(workshop) {
            return false;
        }
    }
    true
}
