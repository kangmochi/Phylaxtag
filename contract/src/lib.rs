//! Phylaxtag warranty contract.
//!
//! One NEP-171 token per physical item. The warranty fund is stored on the token
//! and moves with the NFT when it is sold. The owner cannot withdraw it.

mod events;
mod expire;
mod holders;
mod mint;
mod pay;
mod storage;
mod types;

pub use types::{
    Asset, AssetView, HolderHistory, HolderRecord, ServiceRecord, ServiceStatus, StorageInfo,
    WarrantyStatus,
};

/// Static gas attached to `on_payout` and `on_expire_payout`.
///
/// Measured on 4 November 2026 (Asia/Jakarta) with `near-workspaces` 0.24.0.
/// The highest callback burn was `on_payout` failure at 2_455_261_370_702 gas.
/// 5 TGas is twice that maximum, rounded up to the next whole TGas
/// (2 × 2.455 TGas = 4.91). The extra 2.545 TGas covers the 0.20 TGas gap
/// between the success and failure paths, twice, so a similar protocol gas
/// change still leaves the callback able to finish. A callback that runs out
/// of gas is not retried by the user. Figures are in `docs/DECISIONS.md`.
pub(crate) const CALLBACK_GAS: near_sdk::Gas = near_sdk::Gas::from_tgas(5);

/// Service history stops at 50 records. The 51st `pay_service` fails.
const HISTORY_LIMIT: u64 = 50;

/// Holder log keeps the latest 50 entries and then overwrites the oldest.
const HOLDER_LIMIT: u32 = 50;

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
use near_sdk::json_types::{U64, U128};
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

    /// Spec 5.1, 5.4; tests T08, T28, T29, T34, T39.
    ///
    /// The caller must be an allowlisted issuer and becomes the token owner.
    /// `balance` and `total_locked` both increase by `fund_amount`. Storage,
    /// including the worst-case record prepay, is paid from the attached
    /// deposit and the excess is refunded to the issuer. There is no `top_up`.
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn mint(
        &mut self,
        token_id: TokenId,
        serial_hash: String,
        fund_amount: NearToken,
        expiry: U64,
        claim_cap: NearToken,
        cooldown_ns: U64,
        workshops: Vec<AccountId>,
        metadata: TokenMetadata,
    ) -> Token {
        self.perform_mint(
            token_id,
            serial_hash,
            fund_amount,
            expiry.0,
            claim_cap,
            cooldown_ns.0,
            workshops,
            metadata,
        )
    }

    /// Spec 5.1, 5.2; tests T01, T02, T03, T04, T05, T07, T12, T15, T16, T18, T23, T27, T30, T35.
    ///
    /// Deducts the token balance and `total_locked`, appends a Pending record,
    /// emits `service_requested`, then transfers `amount` to the workshop.
    /// `on_payout` emits `service_paid` only when that transfer succeeds.
    #[payable]
    pub fn pay_service(
        &mut self,
        token_id: TokenId,
        workshop: AccountId,
        amount: NearToken,
        note_hash: String,
        work_type: String,
    ) {
        self.perform_pay_service(token_id, workshop, amount, note_hash, work_type);
    }

    /// Spec 5.1; tests T06, T09, T11, T21, T22, T36.
    ///
    /// Returns the yoctoNEAR this call attempted to send. `0` when the balance
    /// is already zero, and when `pending_refund` is already set (that call
    /// changes nothing). The first transition emits `warranty_expired`. A later
    /// call that still has a balance, and no refund in flight, emits
    /// `expire_refund_retried`.
    pub fn expire(&mut self, token_id: TokenId) -> U128 {
        self.perform_expire(token_id)
    }

    /// Spec 5.1, 5.1a; tests T10, T19, T21. T20 is the sandbox repeat (task 003).
    ///
    /// Acts only while the record is Pending. `true` marks it Paid and emits
    /// `service_paid`. `false` restores `amount` to the token balance and to
    /// `total_locked`, and restores the cooldown when no newer claim exists.
    /// A second call returns `false` and changes nothing.
    #[private]
    pub fn on_payout(
        &mut self,
        token_id: TokenId,
        workshop: AccountId,
        amount: NearToken,
        record_index: u64,
    ) -> bool {
        self.perform_on_payout(token_id, workshop, amount, record_index)
    }

    /// Spec 5.1, 5.1a; tests T22, T36.
    ///
    /// Acts only while `pending_refund == Some(amount)`, then clears it.
    /// `true` when the issuer received the refund. `false` restores `amount`
    /// to the token balance and to `total_locked`. A second call returns
    /// `false` and changes nothing. Stored status is unchanged.
    #[private]
    pub fn on_expire_payout(&mut self, token_id: TokenId, amount: NearToken) -> bool {
        self.perform_on_expire_payout(token_id, amount)
    }

    /// Spec 5.1, 5.1b; tests T01, T06, T25, T36. T38 is the web check (task 004).
    ///
    /// `None` when the token does not exist.
    pub fn get_asset(&self, token_id: TokenId) -> Option<AssetView> {
        let asset = self.assets.get(&token_id)?;
        let owner_id = self.tokens.owner_by_id.get(&token_id)?;
        Some(AssetView {
            owner_id,
            balance: asset.balance,
            status: asset.status,
            display_status: display_status(&asset, env::block_timestamp()),
            next_claim_ns: next_claim_ns(&asset),
            asset,
        })
    }

    /// Spec 5.1, 5.1a; tests T14, T25.
    ///
    /// `from_index` defaults to 0. `limit` defaults to 50 and is capped at 50.
    /// `None` when the token is missing. An empty page when `from_index` is
    /// past the end, and when `limit` is 0.
    pub fn get_service_history(
        &self,
        token_id: TokenId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Option<Vec<ServiceRecord>> {
        self.assets.get(&token_id)?;
        let Some(history) = self.history.get(&token_id) else {
            return Some(Vec::new());
        };
        let from = from_index.unwrap_or(0);
        let page = limit.unwrap_or(HISTORY_LIMIT).min(HISTORY_LIMIT);
        if from >= history.len() || page == 0 {
            return Some(Vec::new());
        }
        let end = from.saturating_add(page).min(history.len());
        Some(
            (from..end)
                .map(|index| {
                    history
                        .get(index)
                        .unwrap_or_else(|| env::panic_str("history index"))
                })
                .collect(),
        )
    }

    /// Spec 5.1, 5.1a; tests T25, T37.
    ///
    /// Latest 50 holders, oldest first, plus the lifetime counter.
    /// `None` when the token is missing.
    pub fn get_holder_history(&self, token_id: TokenId) -> Option<HolderHistory> {
        let asset = self.assets.get(&token_id)?;
        let records = self
            .holders
            .get(&token_id)
            .map(|holders| holders::ordered_holders(&holders, asset.holder_next))
            .unwrap_or_default();
        Some(HolderHistory {
            records,
            holder_total: asset.holder_total,
        })
    }

    /// Spec 5.1, 5.4. The full T26 measurement (bytes, cost, and the on-chain
    /// balance check) is in `integration-tests/`. Unit tests T06, T10, T19,
    /// T21, T22, and T36 check `total_locked` against an independent ledger.
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
    /// Moves the token with the standard transfer, which clears approvals,
    /// then appends a holder-log entry. The log does not change `total_locked`.
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        self.tokens
            .nft_transfer(receiver_id.clone(), token_id.clone(), approval_id, memo);
        self.record_holder(&token_id, receiver_id);
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
    /// Contract-level metadata is constant, not stored: name `Phylaxtag`,
    /// symbol `PHYLAX`, spec `nft-1.0.0`. See `docs/DECISIONS.md`.
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

impl Contract {
    pub(crate) fn add_locked(&mut self, amount: NearToken) {
        self.total_locked = self
            .total_locked
            .checked_add(amount)
            .unwrap_or_else(|| env::panic_str("Fund overflow"));
    }

    pub(crate) fn sub_locked(&mut self, amount: NearToken) {
        self.total_locked = self
            .total_locked
            .checked_sub(amount)
            .unwrap_or_else(|| env::panic_str("Fund underflow"));
    }

    /// Any stored approval means the token is listed. An empty map is not stored.
    fn token_is_listed(&self, token_id: &TokenId) -> bool {
        self.tokens
            .approvals_by_id
            .as_ref()
            .and_then(|by_id| by_id.get(token_id))
            .is_some_and(|approvals| !approvals.is_empty())
    }
}

#[cfg(test)]
mod tests;
