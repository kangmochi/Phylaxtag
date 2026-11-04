//! Mint tests from spec 7: T08, T28, T29, T34, T39, plus `mint_happy_path`.
//!
//! T28 and T29 are split into one `#[should_panic]` test per failure.

use near_sdk::NearToken;
use near_sdk::test_utils::{accounts, get_logs};
use near_sdk::{env, testing_env};

use super::common::*;
use super::*;

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
#[should_panic(expected = "Bad workshop list")]
fn t29_mint_input_validation_duplicate_workshop() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.workshops = vec![workshop(), workshop()];
    mint_with(&mut contract, &mut context, args);
}

#[test]
#[should_panic(expected = "Bad token_id")]
fn t29_mint_input_validation_token_id_empty() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.token_id.clear();
    mint_with(&mut contract, &mut context, args);
}

#[test]
#[should_panic(expected = "Bad token_id")]
fn t29_mint_input_validation_token_id_too_long() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.token_id = "e".repeat(33);
    mint_with(&mut contract, &mut context, args);
}

#[test]
#[should_panic(expected = "Bad serial_hash")]
fn t29_mint_input_validation_serial_hash_short() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.serial_hash = "a".repeat(63);
    mint_with(&mut contract, &mut context, args);
}

#[test]
#[should_panic(expected = "Bad serial_hash")]
fn t29_mint_input_validation_serial_hash_uppercase() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.serial_hash = "A".repeat(64);
    mint_with(&mut contract, &mut context, args);
}

#[test]
#[should_panic(expected = "Bad serial_hash")]
fn t29_mint_input_validation_serial_hash_non_hex() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.serial_hash = "g".repeat(64);
    mint_with(&mut contract, &mut context, args);
}

#[test]
fn t29_mint_accepts_boundary_token_ids() {
    let (mut contract, mut context) = setup();
    let mut short = valid_args();
    short.token_id = "e".to_string();
    short.serial_hash = "b".repeat(64);
    let token = mint_with(&mut contract, &mut context, short);
    assert_eq!(token.token_id, "e");

    let mut long = valid_args();
    long.token_id = "c".repeat(32);
    long.serial_hash = "c".repeat(64);
    let token = mint_with(&mut contract, &mut context, long);
    assert_eq!(token.token_id.len(), 32);
    assert!(contract.get_asset("c".repeat(32)).is_some());
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
        TOKEN.to_string(),
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
    let first_holder = HolderRecord {
        owner: issuer(),
        since_ns: NOW_NS,
        balance_at_transfer: fund,
    };
    let billable = (storage_after - storage_before)
        + crate::storage::prepaid_extra_bytes(&issuer(), &first_holder);
    let storage_cost = env::storage_byte_cost().saturating_mul(u128::from(billable));
    let expected_refund = deposit.saturating_sub(fund).saturating_sub(storage_cost);
    assert!(
        expected_refund.as_yoctonear() > 0,
        "the cushion must cover storage"
    );

    assert_eq!(token.owner_id, issuer());
    assert_eq!(token.token_id, TOKEN);

    let stored = contract.nft_token(TOKEN.to_string()).expect("token view");
    assert_eq!(stored.owner_id, issuer());
    assert_eq!(
        stored.metadata.expect("metadata").title,
        Some("E-bike EB-001".to_string())
    );
    assert_eq!(contract.nft_total_supply(), U128(1));
    assert_eq!(contract.nft_metadata().name, "Phylaxtag");
    assert_eq!(contract.nft_metadata().symbol, "PHYLAX");

    let view = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(view.owner_id, issuer());
    assert_eq!(view.balance, fund);
    assert_eq!(view.asset.balance, fund);
    assert_eq!(view.asset.issuer, issuer());
    assert_eq!(view.asset.serial_hash, SERIAL);
    assert_eq!(view.asset.expiry_ns, expiry);
    assert_eq!(view.asset.claim_cap, cap);
    assert_eq!(view.asset.cooldown_ns, cooldown);
    assert_eq!(view.asset.last_claim_at_ns, None);
    assert_eq!(view.asset.workshops, vec![workshop()]);
    assert_eq!(view.asset.status, WarrantyStatus::Active);
    assert_eq!(view.status, WarrantyStatus::Active);
    assert_eq!(view.display_status, "Active");
    assert_eq!(view.next_claim_ns, None);
    assert_eq!(view.asset.holder_total, 1);
    assert_eq!(view.asset.holder_next, 1);
    assert_eq!(view.asset.pending_refund, None);

    let holders = contract
        .get_holder_history(TOKEN.to_string())
        .expect("holders");
    assert_eq!(holders.holder_total, 1);
    assert_eq!(holders.records.len(), 1);
    assert_eq!(holders.records[0].owner, issuer());
    assert_eq!(holders.records[0].since_ns, NOW_NS);
    assert_eq!(holders.records[0].balance_at_transfer, fund);
    assert_eq!(
        contract
            .get_service_history(TOKEN.to_string(), None, None)
            .expect("history"),
        Vec::<ServiceRecord>::new()
    );

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
    let funded = event_rows("warranty_funded");
    assert_eq!(funded.len(), 1);
    assert_eq!(funded[0]["token_id"], TOKEN);
    assert_eq!(funded[0]["amount"], yocto_json(fund));
    assert_eq!(funded[0]["issuer"], issuer().as_str());
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
