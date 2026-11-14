//! `mint_open` tests: the practice mint on the judge sandbox contract.

use near_sdk::json_types::U64;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{NearToken, env, testing_env};

use super::common::*;
use super::*;

const MONTH_NS: u64 = 30 * 24 * 60 * 60 * 1_000_000_000;

fn open_mint_with(
    contract: &mut Contract,
    context: &mut VMContextBuilder,
    caller: AccountId,
    serial_hash: &str,
    deposit: NearToken,
) -> Token {
    testing_env!(
        context
            .storage_usage(env::storage_usage())
            .attached_deposit(deposit)
            .predecessor_account_id(caller.clone())
            .signer_account_id(caller)
            .account_balance(NearToken::from_near(100))
            .build()
    );
    contract.mint_open(
        serial_hash.to_string(),
        NearToken::from_near(1),
        NearToken::from_millinear(300),
        U64(60_000_000_000),
        vec![workshop()],
        sample_metadata(),
    )
}

#[test]
fn open_mint_lets_a_visitor_mint_a_thirty_day_tag() {
    let (mut contract, mut context) = setup();
    let token = open_mint_with(
        &mut contract,
        &mut context,
        stranger(),
        SERIAL,
        cushion_deposit(),
    );

    assert_eq!(token.token_id, "J-1");
    assert_eq!(token.owner_id, stranger());

    let view = contract.get_asset("J-1".to_string()).expect("asset exists");
    assert_eq!(view.asset.issuer, stranger());
    assert_eq!(view.asset.expiry_ns, NOW_NS + MONTH_NS);
    assert_eq!(view.balance, NearToken::from_near(1));
    assert_eq!(
        contract.get_storage_info().total_locked,
        NearToken::from_near(1)
    );

    let info = contract.get_open_mint_info();
    assert_eq!(info.minted_total, 1);
    assert_eq!(info.cap, OPEN_MINT_CAP);
    assert_eq!(info.expiry_ns, MONTH_NS);
    assert!(contract.open_mint_used(stranger()));
    assert!(!contract.open_mint_used(alice()));
}

#[test]
#[should_panic(expected = "One practice tag per wallet")]
fn open_mint_is_one_per_account() {
    let (mut contract, mut context) = setup();
    open_mint_with(
        &mut contract,
        &mut context,
        stranger(),
        SERIAL,
        cushion_deposit(),
    );
    open_mint_with(
        &mut contract,
        &mut context,
        stranger(),
        &"b".repeat(64),
        cushion_deposit(),
    );
}

#[test]
#[should_panic(expected = "Practice cap reached")]
fn open_mint_stops_at_the_cap() {
    let (mut contract, mut context) = setup();
    contract.open_mint_total = OPEN_MINT_CAP;
    open_mint_with(
        &mut contract,
        &mut context,
        stranger(),
        SERIAL,
        cushion_deposit(),
    );
}

#[test]
#[should_panic(expected = "Deposit too small")]
fn open_mint_needs_the_visitor_to_fund_the_warranty() {
    let (mut contract, mut context) = setup();
    open_mint_with(
        &mut contract,
        &mut context,
        stranger(),
        SERIAL,
        NearToken::from_millinear(100),
    );
}

#[test]
fn open_minted_tag_behaves_like_a_real_tag() {
    let (mut contract, mut context) = setup();
    open_mint_with(
        &mut contract,
        &mut context,
        stranger(),
        SERIAL,
        cushion_deposit(),
    );

    // The visitor owns the tag, so they can spend from its fund.
    pay_with(
        &mut contract,
        &mut context,
        stranger(),
        "J-1",
        workshop(),
        NearToken::from_millinear(300),
        "brakes",
        NOTE,
        NOW_NS + 1_000,
    );

    let view = contract.get_asset("J-1".to_string()).expect("asset exists");
    assert_eq!(
        view.balance,
        NearToken::from_yoctonear(
            NearToken::from_near(1).as_yoctonear() - 300_000_000_000_000_000_000_000
        )
    );
}
