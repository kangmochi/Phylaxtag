//! Phylaxtag warranty contract.
//!
//! One NEP-171 token per physical item. The warranty fund is stored on the token
//! and moves with the NFT when it is sold. The owner cannot withdraw it.

mod events;
mod mint;
mod types;

pub use types::{
    Asset, AssetView, HolderHistoryView, HolderRecord, ServiceRecord, ServiceStatus, StorageInfo,
    WarrantyStatus,
};

use near_contract_standards::non_fungible_token::NonFungibleToken;
use near_contract_standards::non_fungible_token::Token;
use near_contract_standards::non_fungible_token::TokenId;
use near_contract_standards::non_fungible_token::approval::NonFungibleTokenApproval;
use near_contract_standards::non_fungible_token::core::{
    NonFungibleTokenCore, NonFungibleTokenResolver,
};
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::metadata::{
    NFT_METADATA_SPEC, NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata,
};
use near_sdk::borsh::BorshSerialize;
use near_sdk::collections::{LookupMap, LookupSet, Vector};
use near_sdk::json_types::U128;
use near_sdk::{
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise, PromiseOrValue, env, near,
    require,
};
use std::collections::HashMap;

use types::{display_status, next_claim_ns};

#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Tokens,
    TokenMetadata,
    Enumeration,
    Approval,
    Assets,
    History,
    HistoryFor { token_hash: Vec<u8> },
    Holders,
    HoldersFor { token_hash: Vec<u8> },
    UsedSerials,
    Issuers,
}

/// Spec 5.3.
#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    tokens: NonFungibleToken,
    assets: LookupMap<TokenId, Asset>,
    history: LookupMap<TokenId, Vector<ServiceRecord>>,
    holders: LookupMap<TokenId, Vector<HolderRecord>>,
    used_serials: LookupSet<(AccountId, String)>,
    issuers: LookupSet<AccountId>,
    admin: AccountId,
    total_locked: NearToken,
}

#[near]
impl Contract {
    /// Spec 5.1.
    ///
    /// Sets the admin and the issuer allowlist. Panics with "Already initialized"
    /// when contract state already exists.
    ///
    /// `#[init(ignore_state)]` skips the SDK check, whose panic string is
    /// "The contract has already been initialized" rather than the spec string.
    #[init(ignore_state)]
    pub fn new(admin: AccountId, issuers: Vec<AccountId>) -> Self {
        if env::state_exists() {
            env::panic_str("Already initialized");
        }
        let mut issuer_set = LookupSet::new(StorageKey::Issuers);
        for account in issuers {
            issuer_set.insert(&account);
        }
        Self {
            // `owner_id` is the admin, not an issuer. Mint does not use the
            // standards helper that requires the caller to be this owner.
            tokens: NonFungibleToken::new(
                StorageKey::Tokens,
                admin.clone(),
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
            assets: LookupMap::new(StorageKey::Assets),
            history: LookupMap::new(StorageKey::History),
            holders: LookupMap::new(StorageKey::Holders),
            used_serials: LookupSet::new(StorageKey::UsedSerials),
            issuers: issuer_set,
            admin,
            total_locked: NearToken::from_yoctonear(0),
        }
    }

    /// Spec 5.1. Tests that build the allowlist use this. Panics with "Only admin".
    pub fn add_issuer(&mut self, account: AccountId) {
        require!(env::predecessor_account_id() == self.admin, "Only admin");
        self.issuers.insert(&account);
    }

    /// Spec 5.1, 5.4; tests T08, T17, T26, T28, T29, T34, T39.
    ///
    /// The caller must be an allowlisted issuer and becomes the token owner.
    /// `balance` and `total_locked` both increase by `fund_amount`. Storage is
    /// paid from the attached deposit and the excess is refunded to the issuer.
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn mint(
        &mut self,
        token_id: TokenId,
        serial_hash: String,
        fund_amount: NearToken,
        expiry: u64,
        claim_cap: NearToken,
        cooldown_ns: u64,
        workshops: Vec<AccountId>,
        metadata: TokenMetadata,
    ) -> Token {
        self.perform_mint(
            token_id,
            serial_hash,
            fund_amount,
            expiry,
            claim_cap,
            cooldown_ns,
            workshops,
            metadata,
        )
    }

    /// Spec 5.1, 5.2; tests T01, T02, T03, T04, T05, T07, T12, T15, T16, T18, T23, T27, T30, T35.
    ///
    /// Not in this task.
    #[payable]
    pub fn pay_service(
        &mut self,
        token_id: TokenId,
        workshop: AccountId,
        amount: NearToken,
        note_hash: String,
        work_type: String,
    ) {
        let _ = (token_id, workshop, amount, note_hash, work_type);
        unimplemented!("task 002");
    }

    /// Spec 5.1; tests T06, T09, T11, T21, T22, T36.
    ///
    /// Not in this task. Returns the yoctoNEAR sent back to the issuer.
    pub fn expire(&mut self, token_id: TokenId) -> U128 {
        let _ = token_id;
        unimplemented!("task 003");
    }

    /// Spec 5.1; tests T10, T19, T20, T21.
    ///
    /// TODO: spec 5.1 does not list parameters. These are the values a failed
    /// payout needs in order to restore the token balance and `total_locked`.
    #[private]
    pub fn on_payout(
        &mut self,
        token_id: TokenId,
        workshop: AccountId,
        amount: NearToken,
        record_index: u64,
    ) {
        let _ = (token_id, workshop, amount, record_index);
        unimplemented!("task 003");
    }

    /// Spec 5.1; tests T22, T36.
    ///
    /// TODO: spec 5.1 does not list parameters. These are the values a failed
    /// expiry refund needs in order to restore the token balance and `total_locked`.
    #[private]
    pub fn on_expire_payout(&mut self, token_id: TokenId, amount: NearToken) {
        let _ = (token_id, amount);
        unimplemented!("task 003");
    }

    /// Spec 5.1; tests T01, T25, T38.
    ///
    /// `None` when the token does not exist.
    pub fn get_asset(&self, token_id: TokenId) -> Option<AssetView> {
        let asset = self.assets.get(&token_id)?;
        let owner_id = self.tokens.owner_by_id.get(&token_id)?;
        Some(AssetView {
            owner_id,
            balance: asset.balance,
            status: asset.status,
            display_status: display_status(&asset),
            next_claim_ns: next_claim_ns(&asset),
            asset,
        })
    }

    /// Spec 5.1; tests T14, T25.
    ///
    /// TODO: spec 5.1 names `from` and `limit` without types. This uses the same
    /// optional index and limit shape as a paginated view. Not filled in this task.
    pub fn get_service_history(
        &self,
        token_id: TokenId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<ServiceRecord> {
        let _ = (token_id, from_index, limit);
        unimplemented!("task 002");
    }

    /// Spec 5.1; tests T25, T37.
    ///
    /// Not in this task.
    pub fn get_holder_history(&self, token_id: TokenId) -> Option<HolderHistoryView> {
        let _ = token_id;
        unimplemented!("task 002");
    }

    /// Spec 5.1, 5.4; test T26.
    pub fn get_storage_info(&self) -> StorageInfo {
        StorageInfo {
            storage_usage: env::storage_usage(),
            total_locked: self.total_locked,
            contract_balance: env::account_balance(),
        }
    }
}

#[near]
impl NonFungibleTokenCore for Contract {
    /// Spec 5.1, 5.3, 5.6; tests T01, T02, T16, T19, T24, T25, T37.
    ///
    /// The holder-log wrapper is task 002. This stub does not move the token.
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        let _ = (receiver_id, token_id, approval_id, memo);
        unimplemented!("task 002");
    }

    /// Spec 5.1, 5.6; test T13.
    ///
    /// Always panics. A receiver contract must not become a temporary owner.
    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        let _ = (receiver_id, token_id, approval_id, memo, msg);
        env::panic_str("nft_transfer_call disabled in MVP");
    }

    /// Spec 5.6 (NEP-171); tests T01, T02.
    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenResolver for Contract {
    /// Spec 5.6; test T13.
    ///
    /// `nft_transfer_call` panics before this callback can run. The method is
    /// still part of the NEP-171 resolver interface.
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        self.tokens.nft_resolve_transfer(
            previous_owner_id,
            receiver_id,
            token_id,
            approved_account_ids,
        )
    }
}

#[near]
impl NonFungibleTokenApproval for Contract {
    /// Spec 5.6 (NEP-178); tests T23, T24.
    ///
    /// An approved account may transfer. It may not call `pay_service`.
    /// `pay_service` rejects a token that has any approval ("Token is listed").
    #[payable]
    fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<Promise> {
        self.tokens.nft_approve(token_id, account_id, msg)
    }

    /// Spec 5.6 (NEP-178); test T23.
    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.tokens.nft_revoke(token_id, account_id);
    }

    /// Spec 5.6 (NEP-178); test T23.
    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) {
        self.tokens.nft_revoke_all(token_id);
    }

    /// Spec 5.6 (NEP-178); tests T12, T23, T24.
    fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        self.tokens
            .nft_is_approved(token_id, approved_account_id, approval_id)
    }
}

#[near]
impl NonFungibleTokenEnumeration for Contract {
    /// Spec 5.6 (NEP-181).
    fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    /// Spec 5.6 (NEP-181).
    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit)
    }

    /// Spec 5.6 (NEP-181).
    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }

    /// Spec 5.6 (NEP-181). Drives "My items" and the holder-only page.
    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.tokens
            .nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    /// Spec 5.6 (NEP-177).
    ///
    /// Contract-level name and symbol are not in spec 5.3. Returned as constants
    /// so the stored `Contract` layout stays as specified. See `docs/DECISIONS.md`.
    fn nft_metadata(&self) -> NFTContractMetadata {
        NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Phylaxtag".to_string(),
            symbol: "PHYLAX".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }
}

#[cfg(test)]
mod tests;
