//! Shared mint setup and the independent warranty ledger.

use near_contract_standards::non_fungible_token::Token;
use near_contract_standards::non_fungible_token::metadata::TokenMetadata;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{VMContextBuilder, accounts, get_created_receipts, get_logs};
use near_sdk::{AccountId, Gas, NearToken, PromiseResult, env, testing_env};

use super::*;

pub(super) const NOW_NS: u64 = 1_700_000_000_000_000_000;
pub(super) const SERIAL: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
pub(super) const NOTE: &str = SERIAL;
pub(super) const TOKEN: &str = "EB-001";

pub(super) fn admin() -> AccountId {
    accounts(1)
}

pub(super) fn issuer() -> AccountId {
    accounts(2)
}

pub(super) fn workshop() -> AccountId {
    accounts(3)
}

pub(super) fn stranger() -> AccountId {
    accounts(4)
}

pub(super) fn account(name: &str) -> AccountId {
    name.parse().expect("account id")
}

/// 64-byte account id: `h{n}` padded with `a`. Used when a ring slot grows.
pub(super) fn account_64(n: u64) -> AccountId {
    let head = format!("h{n}");
    assert!(head.len() <= 64, "prefix fits in an account id");
    let id = format!("{head}{}", "a".repeat(64 - head.len()));
    id.parse().expect("64-byte account id")
}

pub(super) fn alice() -> AccountId {
    account("alice.test")
}

pub(super) fn budi() -> AccountId {
    account("budi.test")
}

pub(super) fn ten_near() -> NearToken {
    NearToken::from_near(10)
}

pub(super) fn three_near() -> NearToken {
    NearToken::from_near(3)
}

pub(super) fn two_near() -> NearToken {
    NearToken::from_near(2)
}

pub(super) fn one_yocto() -> NearToken {
    NearToken::from_yoctonear(1)
}

pub(super) fn cushion_deposit() -> NearToken {
    NearToken::from_near(20)
}

pub(super) fn context_for(predecessor: AccountId) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(accounts(0))
        .signer_account_id(predecessor.clone())
        .predecessor_account_id(predecessor)
        .block_timestamp(NOW_NS)
        .account_balance(NearToken::from_near(100));
    builder
}

pub(super) fn sample_metadata() -> TokenMetadata {
    TokenMetadata {
        title: Some("E-bike EB-001".to_string()),
        description: Some("Warranty NFT for one e-bike".to_string()),
        media: None,
        media_hash: None,
        copies: Some(1),
        issued_at: None,
        expires_at: None,
        starts_at: None,
        updated_at: None,
        extra: Some(format!(
            r#"{{"asset_type":"e-bike","serial_hash":"{SERIAL}"}}"#
        )),
        reference: None,
        reference_hash: None,
    }
}

pub(super) struct MintArgs {
    pub token_id: String,
    pub serial_hash: String,
    pub fund_amount: NearToken,
    pub expiry: u64,
    pub claim_cap: NearToken,
    pub cooldown_ns: u64,
    pub workshops: Vec<AccountId>,
    pub deposit: NearToken,
    pub caller: AccountId,
}

pub(super) fn valid_args() -> MintArgs {
    MintArgs {
        token_id: TOKEN.to_string(),
        serial_hash: SERIAL.to_string(),
        fund_amount: ten_near(),
        // Later than several cooldowns. A one-day expiry would reject the
        // second claim in the cooldown tests with "Expired".
        expiry: NOW_NS + 365 * 86_400 * 1_000_000_000,
        claim_cap: three_near(),
        cooldown_ns: 2_592_000_000_000_000,
        workshops: vec![workshop()],
        deposit: cushion_deposit(),
        caller: issuer(),
    }
}

/// Admin creates the contract and allowlists the issuer.
pub(super) fn setup() -> (Contract, VMContextBuilder) {
    let context = context_for(admin());
    testing_env!(context.build());
    let mut contract = Contract::new(admin(), Vec::new());
    contract.add_issuer(issuer());
    (contract, context)
}

pub(super) fn mint_with(
    contract: &mut Contract,
    context: &mut VMContextBuilder,
    args: MintArgs,
) -> Token {
    testing_env!(
        context
            .storage_usage(env::storage_usage())
            .attached_deposit(args.deposit)
            .predecessor_account_id(args.caller.clone())
            .signer_account_id(args.caller)
            .account_balance(NearToken::from_near(100))
            .build()
    );
    contract.mint(
        args.token_id,
        args.serial_hash,
        args.fund_amount,
        args.expiry,
        args.claim_cap,
        args.cooldown_ns,
        args.workshops,
        sample_metadata(),
    )
}

pub(super) fn mint_default(contract: &mut Contract, context: &mut VMContextBuilder) -> NearToken {
    let fund = valid_args().fund_amount;
    mint_with(contract, context, valid_args());
    fund
}

/// Continue from the balance and storage the previous call left behind.
pub(super) fn at(
    context: &mut VMContextBuilder,
    predecessor: AccountId,
    deposit: NearToken,
    timestamp: u64,
) {
    testing_env!(
        context
            .storage_usage(env::storage_usage())
            .account_balance(env::account_balance())
            .attached_deposit(deposit)
            .predecessor_account_id(predecessor.clone())
            .signer_account_id(predecessor)
            .block_timestamp(timestamp)
            .build()
    );
}

pub(super) fn as_callback(context: &mut VMContextBuilder, timestamp: u64, result: PromiseResult) {
    testing_env!(
        context
            .storage_usage(env::storage_usage())
            .account_balance(env::account_balance())
            .attached_deposit(NearToken::from_yoctonear(0))
            .predecessor_account_id(accounts(0))
            .signer_account_id(accounts(0))
            .block_timestamp(timestamp)
            .build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        std::collections::HashMap::<String, NearToken>::new(),
        vec![result],
    );
}

pub(super) fn pay(
    contract: &mut Contract,
    context: &mut VMContextBuilder,
    caller: AccountId,
    workshop_id: AccountId,
    amount: NearToken,
    timestamp: u64,
) {
    pay_with(
        contract,
        context,
        caller,
        TOKEN,
        workshop_id,
        amount,
        "brakes",
        NOTE,
        timestamp,
    );
}

#[allow(clippy::too_many_arguments)]
pub(super) fn pay_with(
    contract: &mut Contract,
    context: &mut VMContextBuilder,
    caller: AccountId,
    token_id: &str,
    workshop_id: AccountId,
    amount: NearToken,
    work_type: &str,
    note_hash: &str,
    timestamp: u64,
) {
    at(context, caller, one_yocto(), timestamp);
    contract.pay_service(
        token_id.to_string(),
        workshop_id,
        amount,
        note_hash.to_string(),
        work_type.to_string(),
    );
}

pub(super) fn transfer_nft(
    contract: &mut Contract,
    context: &mut VMContextBuilder,
    caller: AccountId,
    receiver: AccountId,
    timestamp: u64,
) {
    at(context, caller, one_yocto(), timestamp);
    contract.nft_transfer(receiver, TOKEN.to_string(), None, None);
}

pub(super) fn transfers_to(account: &AccountId) -> Vec<NearToken> {
    let mut amounts = Vec::new();
    for receipt in get_created_receipts() {
        if &receipt.receiver_id != account {
            continue;
        }
        for action in receipt.actions {
            if let MockAction::Transfer { deposit, .. } = action {
                amounts.push(deposit);
            }
        }
    }
    amounts
}

/// Gas on callback receipts created by the call that just ran.
///
/// Prepaid gas on the callback receipt. The figure is `CALLBACK_GAS`.
pub(super) fn callback_gas(method: &str) -> Vec<Gas> {
    let mut found = Vec::new();
    for receipt in get_created_receipts() {
        for action in receipt.actions {
            if let MockAction::FunctionCallWeight {
                method_name,
                prepaid_gas,
                ..
            } = action
                && method_name == method.as_bytes()
            {
                found.push(prepaid_gas);
            }
        }
    }
    found
}

pub(super) fn event_rows(name: &str) -> Vec<near_sdk::serde_json::Value> {
    get_logs()
        .into_iter()
        .filter_map(|line| {
            let json = line.strip_prefix("EVENT_JSON:")?;
            let value: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(json).ok()?;
            if value.get("standard")?.as_str()? != "phylaxtag" {
                return None;
            }
            if value.get("version")?.as_str()? != "1.0.0" {
                return None;
            }
            if value.get("event")?.as_str()? != name {
                return None;
            }
            Some(value.get("data")?.as_array()?.first()?.clone())
        })
        .collect()
}

pub(super) fn yocto_json(amount: NearToken) -> near_sdk::serde_json::Value {
    near_sdk::serde_json::Value::String(amount.as_yoctonear().to_string())
}

/// Warranty funds tracked from this test's own amounts.
///
/// `deposit` is a mint. `payout` is an accepted `pay_service` (the token is
/// debited before the callback). `refund` is an `expire` that sends NEAR.
/// `restore` is a failed callback putting that amount back. This ledger does
/// not read `total_locked`.
pub(super) struct Ledger {
    total: u128,
}

impl Ledger {
    pub(super) fn new() -> Self {
        Self { total: 0 }
    }

    pub(super) fn deposit(&mut self, amount: NearToken) {
        self.total = self
            .total
            .checked_add(amount.as_yoctonear())
            .expect("ledger deposit");
    }

    pub(super) fn payout(&mut self, amount: NearToken) {
        self.total = self
            .total
            .checked_sub(amount.as_yoctonear())
            .expect("ledger payout");
    }

    pub(super) fn refund(&mut self, amount: NearToken) {
        self.total = self
            .total
            .checked_sub(amount.as_yoctonear())
            .expect("ledger refund");
    }

    pub(super) fn restore(&mut self, amount: NearToken) {
        self.total = self
            .total
            .checked_add(amount.as_yoctonear())
            .expect("ledger restore");
    }
}

pub(super) fn assert_invariant(contract: &Contract, ledger: &Ledger) {
    let locked = contract.get_storage_info().total_locked;
    assert_eq!(
        locked,
        NearToken::from_yoctonear(ledger.total),
        "total_locked does not match the test ledger"
    );
    let supply = contract.nft_total_supply().0;
    let limit = u64::try_from(supply).expect("token supply fits in u64");
    let tokens = if limit == 0 {
        Vec::new()
    } else {
        contract.nft_tokens(Some(U128(0)), Some(limit))
    };
    let sum = tokens.iter().fold(0u128, |acc, token| {
        acc + contract
            .get_asset(token.token_id.clone())
            .expect("minted token has an asset")
            .balance
            .as_yoctonear()
    });
    assert_eq!(
        NearToken::from_yoctonear(sum),
        locked,
        "sum of token balances does not match total_locked"
    );
}
