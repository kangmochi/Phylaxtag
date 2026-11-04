//! Mint tests from spec 7: T08, T28, T29, T34, T39, plus `mint_happy_path`.
//!
//! T28 and T29 are split into one `#[should_panic]` test per failure. A single
//! test function cannot assert two different panic strings.

use near_contract_standards::non_fungible_token::metadata::TokenMetadata;
use near_sdk::test_utils::{VMContextBuilder, accounts, get_created_receipts, get_logs};
use near_sdk::{NearToken, testing_env};
use near_sdk::{env, mock::MockAction};

use super::*;

const NOW_NS: u64 = 1_700_000_000_000_000_000;
const SERIAL: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

fn admin() -> AccountId {
    accounts(1)
}

fn issuer() -> AccountId {
    accounts(2)
}

fn workshop() -> AccountId {
    accounts(3)
}

fn stranger() -> AccountId {
    accounts(4)
}

fn ten_near() -> NearToken {
    NearToken::from_near(10)
}

fn three_near() -> NearToken {
    NearToken::from_near(3)
}

fn cushion_deposit() -> NearToken {
    NearToken::from_near(20)
}

fn context_for(predecessor: AccountId) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(accounts(0))
        .signer_account_id(predecessor.clone())
        .predecessor_account_id(predecessor)
        .block_timestamp(NOW_NS)
        .account_balance(NearToken::from_near(100));
    builder
}

fn sample_metadata() -> TokenMetadata {
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

struct MintArgs {
    token_id: String,
    serial_hash: String,
    fund_amount: NearToken,
    expiry: u64,
    claim_cap: NearToken,
    cooldown_ns: u64,
    workshops: Vec<AccountId>,
    deposit: NearToken,
    caller: AccountId,
}

fn valid_args() -> MintArgs {
    MintArgs {
        token_id: "EB-001".to_string(),
        serial_hash: SERIAL.to_string(),
        fund_amount: ten_near(),
        expiry: NOW_NS + 86_400_000_000_000,
        claim_cap: three_near(),
        cooldown_ns: 2_592_000_000_000_000,
        workshops: vec![workshop()],
        deposit: cushion_deposit(),
        caller: issuer(),
    }
}

/// Admin creates the contract and allowlists the issuer.
fn setup() -> (Contract, VMContextBuilder) {
    let context = context_for(admin());
    testing_env!(context.build());
    let mut contract = Contract::new(admin(), Vec::new());
    contract.add_issuer(issuer());
    (contract, context)
}

fn mint_with(contract: &mut Contract, context: &mut VMContextBuilder, args: MintArgs) -> Token {
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

fn transfers_to(account: &AccountId) -> Vec<NearToken> {
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

#[test]
#[should_panic(expected = "Not an approved issuer")]
fn t08_only_allowlisted_issuer_can_mint() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.caller = stranger();
    mint_with(&mut contract, &mut context, args);
}

#[test]
#[should_panic(expected = "Token exists")]
fn t28_no_remint_same_token_id() {
    let (mut contract, mut context) = setup();
    mint_with(&mut contract, &mut context, valid_args());
    mint_with(&mut contract, &mut context, valid_args());
}

#[test]
#[should_panic(expected = "Serial already used")]
fn t28_no_remint_same_serial_hash() {
    let (mut contract, mut context) = setup();
    mint_with(&mut contract, &mut context, valid_args());
    let mut args = valid_args();
    args.token_id = "EB-002".to_string();
    mint_with(&mut contract, &mut context, args);
}

#[test]
#[should_panic(expected = "Bad expiry")]
fn t29_mint_input_validation_past_expiry() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.expiry = NOW_NS;
    mint_with(&mut contract, &mut context, args);
}

#[test]
#[should_panic(expected = "Bad cap")]
fn t29_mint_input_validation_cap_zero() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.claim_cap = NearToken::from_yoctonear(0);
    mint_with(&mut contract, &mut context, args);
}

#[test]
#[should_panic(expected = "Bad cap")]
fn t29_mint_input_validation_cap_above_fund() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.claim_cap = NearToken::from_near(11);
    mint_with(&mut contract, &mut context, args);
}

#[test]
#[should_panic(expected = "Bad workshop list")]
fn t29_mint_input_validation_empty_workshops() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.workshops.clear();
    mint_with(&mut contract, &mut context, args);
}

#[test]
#[should_panic(expected = "Bad workshop list")]
fn t29_mint_input_validation_issuer_as_workshop() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.workshops = vec![issuer()];
    mint_with(&mut contract, &mut context, args);
}

#[test]
#[should_panic(expected = "Deposit too small")]
fn t29_mint_input_validation_deposit_too_small() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.deposit = ten_near().saturating_sub(NearToken::from_yoctonear(1));
    mint_with(&mut contract, &mut context, args);
}

#[test]
#[should_panic(expected = "Cooldown must be > 0")]
fn t34_mint_rejects_zero_cooldown() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.cooldown_ns = 0;
    mint_with(&mut contract, &mut context, args);
}

#[test]
#[should_panic(expected = "Bad workshop list")]
fn t39_mint_rejects_contract_as_workshop() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.workshops = vec![accounts(0)];
    mint_with(&mut contract, &mut context, args);
}

#[test]
fn mint_happy_path() {
    let (mut contract, mut context) = setup();
    let args = valid_args();
    let fund = args.fund_amount;
    let deposit = args.deposit;
    let expiry = args.expiry;
    let cap = args.claim_cap;
    let cooldown = args.cooldown_ns;

    testing_env!(
        context
            .storage_usage(env::storage_usage())
            .attached_deposit(deposit)
            .predecessor_account_id(issuer())
            .signer_account_id(issuer())
            .account_balance(NearToken::from_near(100))
            .build()
    );
    let storage_before = env::storage_usage();
    let token = contract.mint(
        "EB-001".to_string(),
        SERIAL.to_string(),
        fund,
        expiry,
        cap,
        cooldown,
        vec![workshop()],
        sample_metadata(),
    );
    let storage_after = env::storage_usage();

    assert!(storage_after > storage_before, "mint must write storage");
    let storage_cost =
        env::storage_byte_cost().saturating_mul(u128::from(storage_after - storage_before));
    let expected_refund = deposit.saturating_sub(fund).saturating_sub(storage_cost);
    assert!(
        expected_refund.as_yoctonear() > 0,
        "the cushion must cover storage"
    );

    assert_eq!(token.owner_id, issuer());
    assert_eq!(token.token_id, "EB-001");

    let stored = contract
        .nft_token("EB-001".to_string())
        .expect("token view");
    assert_eq!(stored.owner_id, issuer());
    assert_eq!(
        stored.metadata.expect("metadata").title,
        Some("E-bike EB-001".to_string())
    );
    assert_eq!(contract.nft_total_supply(), U128(1));
    assert_eq!(contract.nft_metadata().name, "Phylaxtag");

    let view = contract.get_asset("EB-001".to_string()).expect("asset");
    assert_eq!(view.owner_id, issuer());
    assert_eq!(view.balance, fund);
    assert_eq!(view.asset.balance, fund);
    assert_eq!(view.asset.issuer, issuer());
    assert_eq!(view.asset.serial_hash, SERIAL);
    assert_eq!(view.asset.expiry_ns, expiry);
    assert_eq!(view.asset.claim_cap, cap);
    assert_eq!(view.asset.cooldown_ns, cooldown);
    assert_eq!(view.asset.last_claim_at_ns, 0);
    assert_eq!(view.asset.workshops, vec![workshop()]);
    assert_eq!(view.asset.status, WarrantyStatus::Active);
    assert_eq!(view.status, WarrantyStatus::Active);
    assert_eq!(view.display_status, "Active");
    assert_eq!(view.next_claim_ns, 0);
    assert_eq!(view.asset.holder_total, 1);
    assert_eq!(view.asset.holder_next, 1);
    let holders = contract
        .holders
        .get(&"EB-001".to_string())
        .expect("holder log");
    assert_eq!(holders.len(), 1);
    let holder = holders.get(0).expect("mint holder");
    assert_eq!(holder.owner, issuer());
    assert_eq!(holder.since_ns, NOW_NS);
    assert_eq!(holder.balance_at_transfer, fund);
    let history = contract
        .history
        .get(&"EB-001".to_string())
        .expect("service history");
    assert_eq!(history.len(), 0);

    let info = contract.get_storage_info();
    assert_eq!(info.total_locked, fund);
    assert_eq!(info.storage_usage, storage_after);
    // The test runtime credits the attached deposit and debits the refund.
    // The balance that remains is the starting balance plus the fund plus storage.
    let expected_balance = NearToken::from_near(100)
        .saturating_add(fund)
        .saturating_add(storage_cost);
    assert_eq!(info.contract_balance, expected_balance);
    let storage_lock = env::storage_byte_cost().saturating_mul(u128::from(info.storage_usage));
    assert!(info.contract_balance >= info.total_locked.saturating_add(storage_lock));

    let refunds = transfers_to(&issuer());
    assert_eq!(refunds, vec![expected_refund]);

    let logs = get_logs();
    assert!(
        logs.iter().any(|line| line.contains("nft_mint")),
        "{logs:?}"
    );
    assert!(
        logs.iter().any(|line| line.contains("warranty_funded")),
        "{logs:?}"
    );
}

#[test]
#[should_panic(expected = "Only admin")]
fn add_issuer_rejects_non_admin() {
    let (mut contract, mut context) = setup();
    testing_env!(
        context
            .storage_usage(env::storage_usage())
            .predecessor_account_id(stranger())
            .signer_account_id(stranger())
            .attached_deposit(NearToken::from_yoctonear(0))
            .build()
    );
    contract.add_issuer(accounts(5));
}

#[test]
#[should_panic(expected = "Already initialized")]
fn new_rejects_second_init() {
    let mut context = context_for(admin());
    testing_env!(context.build());
    let contract = Contract::new(admin(), vec![issuer()]);
    env::state_write(&contract);
    testing_env!(context.storage_usage(env::storage_usage()).build());
    let _ = Contract::new(admin(), vec![issuer()]);
}

#[test]
fn different_issuer_may_reuse_serial_hash() {
    // Spec 6.2 S11: cross-issuer duplicate serials are an accepted residual risk.
    let (mut contract, mut context) = setup();
    mint_with(&mut contract, &mut context, valid_args());

    testing_env!(
        context
            .storage_usage(env::storage_usage())
            .predecessor_account_id(admin())
            .signer_account_id(admin())
            .attached_deposit(NearToken::from_yoctonear(0))
            .build()
    );
    contract.add_issuer(stranger());

    let mut args = valid_args();
    args.token_id = "EB-002".to_string();
    args.caller = stranger();
    let token = mint_with(&mut contract, &mut context, args);
    assert_eq!(token.owner_id, stranger());
    assert_eq!(
        contract
            .get_asset("EB-002".to_string())
            .expect("second asset")
            .asset
            .serial_hash,
        SERIAL
    );
}
