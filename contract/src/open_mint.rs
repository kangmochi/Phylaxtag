//! `mint_open`: the practice mint used by the judge sandbox contract.
//!
//! The allowlisted `mint` stays the only production path. `mint_open` exists so
//! a visitor can create a tag themselves on the sandbox deployment: the caller
//! funds the warranty (there is no house pool to drain), the contract picks the
//! token id, and the expiry is fixed at mint time + 30 days.

use near_contract_standards::non_fungible_token::Token;
use near_contract_standards::non_fungible_token::metadata::TokenMetadata;
use near_sdk::{AccountId, NearToken, env};

use crate::Contract;
use crate::errors::refuse_unless;

/// Lifetime of a practice tag: 30 days, fixed at mint.
pub const OPEN_MINT_EXPIRY_NS: u64 = 30 * 24 * 60 * 60 * 1_000_000_000;

/// Total practice tags this contract will ever mint. Bounds the token list a
/// reviewer has to scroll, not the money: every tag is caller-funded.
pub const OPEN_MINT_CAP: u64 = 100;

impl Contract {
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn perform_mint_open(
        &mut self,
        serial_hash: String,
        fund_amount: NearToken,
        claim_cap: NearToken,
        cooldown_ns: u64,
        workshops: Vec<AccountId>,
        metadata: TokenMetadata,
    ) -> Token {
        let caller = env::predecessor_account_id();
        refuse_unless!(self.open_mint_total < OPEN_MINT_CAP, "Practice cap reached");
        refuse_unless!(
            !self.open_mints.contains(&caller),
            "One practice tag per wallet"
        );

        let next = self.open_mint_total + 1;
        let expiry = env::block_timestamp().saturating_add(OPEN_MINT_EXPIRY_NS);
        let token = self.perform_mint(
            format!("J-{next}"),
            serial_hash,
            fund_amount,
            expiry,
            claim_cap,
            cooldown_ns,
            workshops,
            metadata,
            false,
        );

        self.open_mints.insert(&caller);
        self.open_mint_total = next;
        token
    }
}
