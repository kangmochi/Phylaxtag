//! `expire` and payout-callback tests from spec 7.

use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{Gas, NearToken, PromiseResult};

use super::common::*;
use super::*;

fn mint_tracked(
    contract: &mut Contract,
    context: &mut VMContextBuilder,
    ledger: &mut Ledger,
) -> NearToken {
    let fund = mint_default(contract, context);
    ledger.deposit(fund);
    assert_invariant(contract, ledger);
    fund
}

#[test]
fn t06_expiry_returns_funds_to_issuer() {
    let (mut contract, mut context) = setup();
    let mut ledger = Ledger::new();
    let fund = mint_tracked(&mut contract, &mut context, &mut ledger);
    let expiry = valid_args().expiry;

    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        two_near(),
        NOW_NS,
    );
    ledger.payout(two_near());
    assert_invariant(&contract, &ledger);

    at(
        &mut context,
        stranger(),
        NearToken::from_yoctonear(0),
        expiry,
    );
    let pending = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(pending.status, WarrantyStatus::Active);
    assert_eq!(pending.display_status, "Expired, close pending");
    assert_eq!(pending.balance, fund.saturating_sub(two_near()));

    let refund = fund.saturating_sub(two_near());
    let returned = contract.expire(TOKEN.to_string());
    assert_eq!(returned, U128(refund.as_yoctonear()));
    ledger.refund(refund);
    assert_invariant(&contract, &ledger);

    let closed = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(closed.balance, NearToken::from_yoctonear(0));
    assert_eq!(closed.status, WarrantyStatus::Expired);
    assert_eq!(closed.display_status, "Expired");
    assert_eq!(transfers_to(&issuer()), vec![refund]);
    assert_eq!(callback_gas("on_expire_payout"), vec![Gas::from_tgas(10)]);
    let rows = event_rows("warranty_expired");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["amount"], yocto_json(refund));
    assert_eq!(rows[0]["issuer"], issuer().as_str());
    assert_eq!(rows[0]["token_id"], TOKEN);
}

#[test]
fn t09_second_expire_is_noop() {
    let (mut contract, mut context) = setup();
    let expiry = valid_args().expiry;
    mint_default(&mut contract, &mut context);
    at(
        &mut context,
        stranger(),
        NearToken::from_yoctonear(0),
        expiry,
    );
    let first = contract.expire(TOKEN.to_string());
    assert_eq!(first, U128(ten_near().as_yoctonear()));
    assert_eq!(transfers_to(&issuer()), vec![ten_near()]);

    at(
        &mut context,
        stranger(),
        NearToken::from_yoctonear(0),
        expiry,
    );
    let second = contract.expire(TOKEN.to_string());
    assert_eq!(second, U128(0));
    assert!(transfers_to(&issuer()).is_empty());
    assert!(event_rows("warranty_expired").is_empty());
    let view = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(view.status, WarrantyStatus::Expired);
    assert_eq!(view.balance, NearToken::from_yoctonear(0));
    assert_eq!(view.display_status, "Expired");
}

#[test]
fn t10_failed_payout_restores_balance() {
    let (mut contract, mut context) = setup();
    let mut ledger = Ledger::new();
    let fund = mint_tracked(&mut contract, &mut context, &mut ledger);

    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        two_near(),
        NOW_NS,
    );
    ledger.payout(two_near());
    assert_invariant(&contract, &ledger);
    assert_eq!(
        contract
            .get_asset(TOKEN.to_string())
            .expect("asset")
            .balance,
        fund.saturating_sub(two_near())
    );

    as_callback(&mut context, NOW_NS, PromiseResult::Failed);
    assert!(!contract.on_payout(TOKEN.to_string(), workshop(), two_near(), 0));
    ledger.restore(two_near());
    assert_invariant(&contract, &ledger);

    let view = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(view.balance, fund);
    assert_eq!(view.status, WarrantyStatus::Active);
    let history = contract
        .get_service_history(TOKEN.to_string(), None, None)
        .expect("history");
    assert_eq!(history[0].status, ServiceStatus::Failed);
    let rows = event_rows("payout_failed");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["token_id"], TOKEN);
    assert_eq!(rows[0]["amount"], yocto_json(two_near()));
    assert_eq!(rows[0]["workshop"], workshop().as_str());
    assert_eq!(rows[0]["record_index"], 0);
}

#[test]
#[should_panic(expected = "Not yet expired")]
fn t11_expire_before_expiry_rejected() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    at(
        &mut context,
        stranger(),
        NearToken::from_yoctonear(0),
        NOW_NS,
    );
    contract.expire(TOKEN.to_string());
}

#[test]
fn t19_sale_mid_payout_failure_unit() {
    let (mut contract, mut context) = setup();
    let mut ledger = Ledger::new();
    let fund = mint_tracked(&mut contract, &mut context, &mut ledger);

    transfer_nft(&mut contract, &mut context, issuer(), alice(), NOW_NS);
    assert_invariant(&contract, &ledger);

    pay(
        &mut contract,
        &mut context,
        alice(),
        workshop(),
        two_near(),
        NOW_NS,
    );
    ledger.payout(two_near());
    assert_invariant(&contract, &ledger);
    assert_eq!(transfers_to(&workshop()), vec![two_near()]);
    assert!(transfers_to(&alice()).is_empty());

    transfer_nft(&mut contract, &mut context, alice(), budi(), NOW_NS + 1);
    assert_invariant(&contract, &ledger);
    assert_eq!(
        contract
            .nft_token(TOKEN.to_string())
            .expect("token")
            .owner_id,
        budi()
    );

    as_callback(&mut context, NOW_NS + 1, PromiseResult::Failed);
    assert!(!contract.on_payout(TOKEN.to_string(), workshop(), two_near(), 0));
    ledger.restore(two_near());
    assert_invariant(&contract, &ledger);

    let view = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(view.owner_id, budi());
    assert_eq!(view.balance, fund);
    assert_eq!(
        contract
            .get_service_history(TOKEN.to_string(), None, None)
            .expect("history")[0]
            .status,
        ServiceStatus::Failed
    );
    assert!(transfers_to(&alice()).is_empty());
    assert!(event_rows("payout_failed").len() == 1);
}

#[test]
fn t21_failed_payout_after_expire() {
    let (mut contract, mut context) = setup();
    let mut ledger = Ledger::new();
    let fund = mint_tracked(&mut contract, &mut context, &mut ledger);
    let expiry = valid_args().expiry;

    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        two_near(),
        NOW_NS,
    );
    ledger.payout(two_near());
    assert_invariant(&contract, &ledger);

    at(
        &mut context,
        stranger(),
        NearToken::from_yoctonear(0),
        expiry,
    );
    let remainder = fund.saturating_sub(two_near());
    let returned = contract.expire(TOKEN.to_string());
    assert_eq!(returned, U128(remainder.as_yoctonear()));
    ledger.refund(remainder);
    assert_invariant(&contract, &ledger);
    assert_eq!(
        contract.get_asset(TOKEN.to_string()).expect("asset").status,
        WarrantyStatus::Expired
    );

    as_callback(&mut context, expiry, PromiseResult::Failed);
    assert!(!contract.on_payout(TOKEN.to_string(), workshop(), two_near(), 0));
    ledger.restore(two_near());
    assert_invariant(&contract, &ledger);
    let restored = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(restored.balance, two_near());
    assert_eq!(restored.status, WarrantyStatus::Expired);
    assert_eq!(restored.display_status, "Expired, close pending");

    at(
        &mut context,
        stranger(),
        NearToken::from_yoctonear(0),
        expiry,
    );
    let retry = contract.expire(TOKEN.to_string());
    assert_eq!(retry, U128(two_near().as_yoctonear()));
    ledger.refund(two_near());
    assert_invariant(&contract, &ledger);
    let closed = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(closed.balance, NearToken::from_yoctonear(0));
    assert_eq!(closed.status, WarrantyStatus::Expired);
    assert_eq!(closed.display_status, "Expired");
    assert_eq!(transfers_to(&issuer()), vec![two_near()]);
}

#[test]
fn t22_failed_expire_refund_restores() {
    let (mut contract, mut context) = setup();
    let mut ledger = Ledger::new();
    let fund = mint_tracked(&mut contract, &mut context, &mut ledger);
    let expiry = valid_args().expiry;

    at(
        &mut context,
        stranger(),
        NearToken::from_yoctonear(0),
        expiry,
    );
    let returned = contract.expire(TOKEN.to_string());
    assert_eq!(returned, U128(fund.as_yoctonear()));
    ledger.refund(fund);
    assert_invariant(&contract, &ledger);
    assert_eq!(
        contract.get_asset(TOKEN.to_string()).expect("asset").status,
        WarrantyStatus::Expired
    );

    as_callback(&mut context, expiry, PromiseResult::Failed);
    assert!(!contract.on_expire_payout(TOKEN.to_string(), fund));
    ledger.restore(fund);
    assert_invariant(&contract, &ledger);
    let restored = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(restored.balance, fund);
    assert_eq!(restored.status, WarrantyStatus::Expired);
    let rows = event_rows("expire_refund_failed");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["amount"], yocto_json(fund));
    assert_eq!(rows[0]["issuer"], issuer().as_str());
    assert_eq!(rows[0]["token_id"], TOKEN);

    at(
        &mut context,
        stranger(),
        NearToken::from_yoctonear(0),
        expiry,
    );
    let retry = contract.expire(TOKEN.to_string());
    assert_eq!(retry, U128(fund.as_yoctonear()));
    ledger.refund(fund);
    assert_invariant(&contract, &ledger);
    assert_eq!(transfers_to(&issuer()), vec![fund]);
    let closed = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(closed.balance, NearToken::from_yoctonear(0));
    assert_eq!(closed.status, WarrantyStatus::Expired);
    assert_eq!(event_rows("warranty_expired").len(), 1);
}

#[test]
fn t36_expire_empty_fund_marks_expired() {
    let (mut contract, mut context) = setup();
    let mut ledger = Ledger::new();
    let mut args = valid_args();
    args.fund_amount = three_near();
    args.claim_cap = three_near();
    mint_with(&mut contract, &mut context, args);
    ledger.deposit(three_near());
    assert_invariant(&contract, &ledger);

    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        three_near(),
        NOW_NS,
    );
    ledger.payout(three_near());
    assert_invariant(&contract, &ledger);
    let empty = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(empty.balance, NearToken::from_yoctonear(0));
    assert_eq!(empty.display_status, "Empty (fund used up)");
    assert_eq!(empty.status, WarrantyStatus::Active);

    let expiry = valid_args().expiry;
    at(
        &mut context,
        stranger(),
        NearToken::from_yoctonear(0),
        expiry,
    );
    let waiting = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(waiting.display_status, "Expired, close pending");

    let returned = contract.expire(TOKEN.to_string());
    assert_eq!(returned, U128(0));
    assert_invariant(&contract, &ledger);
    assert!(transfers_to(&issuer()).is_empty());
    assert!(callback_gas("on_expire_payout").is_empty());
    let closed = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(closed.status, WarrantyStatus::Expired);
    assert_eq!(closed.display_status, "Expired");
    assert_eq!(closed.balance, NearToken::from_yoctonear(0));
    let rows = event_rows("warranty_expired");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["amount"], yocto_json(NearToken::from_yoctonear(0)));
}

#[test]
#[should_panic(expected = "Token not found")]
fn expire_rejects_missing_token() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    let expiry = valid_args().expiry;
    at(
        &mut context,
        stranger(),
        NearToken::from_yoctonear(0),
        expiry,
    );
    contract.expire("missing".to_string());
}
