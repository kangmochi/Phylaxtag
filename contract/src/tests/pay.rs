//! `pay_service` tests from spec 7.

use near_sdk::{NearToken, PromiseResult};

use super::common::*;
use super::*;

#[test]
fn t01_balance_moves_with_nft() {
    let (mut contract, mut context) = setup();
    let fund = mint_default(&mut contract, &mut context);
    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        two_near(),
        NOW_NS,
    );
    assert_eq!(callback_gas("on_payout"), vec![crate::CALLBACK_GAS]);
    let requested = event_rows("service_requested");
    assert_eq!(requested.len(), 1);
    assert_eq!(requested[0]["token_id"], TOKEN);
    assert_eq!(requested[0]["owner"], issuer().as_str());
    assert_eq!(requested[0]["workshop"], workshop().as_str());
    assert_eq!(requested[0]["amount"], yocto_json(two_near()));
    assert_eq!(requested[0]["work_type"], "brakes");
    assert_eq!(requested[0]["note_hash"], NOTE);
    assert_eq!(requested[0]["record_index"], 0);
    assert!(event_rows("service_paid").is_empty());
    assert_eq!(transfers_to(&workshop()), vec![two_near()]);

    transfer_nft(&mut contract, &mut context, issuer(), budi(), NOW_NS);
    let view = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(view.owner_id, budi());
    assert_eq!(view.balance, fund.saturating_sub(two_near()));
    let history = contract
        .get_service_history(TOKEN.to_string(), None, None)
        .expect("history");
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].status, ServiceStatus::Pending);

    as_callback(&mut context, NOW_NS, PromiseResult::Successful(Vec::new()));
    assert!(contract.on_payout(TOKEN.to_string(), workshop(), two_near(), 0));
    let paid = event_rows("service_paid");
    assert_eq!(paid.len(), 1);
    assert_eq!(paid[0]["token_id"], TOKEN);
    assert_eq!(paid[0]["workshop"], workshop().as_str());
    assert_eq!(paid[0]["amount"], yocto_json(two_near()));
    assert_eq!(paid[0]["record_index"], 0);
    assert!(paid[0].get("owner").is_none());
    assert!(paid[0].get("work_type").is_none());
    assert!(paid[0].get("note_hash").is_none());
    let history = contract
        .get_service_history(TOKEN.to_string(), None, None)
        .expect("history");
    assert_eq!(history[0].status, ServiceStatus::Paid);
    assert_eq!(
        contract
            .get_asset(TOKEN.to_string())
            .expect("asset")
            .balance,
        fund.saturating_sub(two_near())
    );
    assert_eq!(
        contract
            .nft_token(TOKEN.to_string())
            .expect("token")
            .owner_id,
        budi()
    );
}

#[test]
#[should_panic(expected = "Not owner")]
fn t02_old_owner_cannot_pay() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    transfer_nft(&mut contract, &mut context, issuer(), alice(), NOW_NS);
    transfer_nft(&mut contract, &mut context, alice(), budi(), NOW_NS);
    pay(
        &mut contract,
        &mut context,
        alice(),
        workshop(),
        two_near(),
        NOW_NS,
    );
}

#[test]
fn t02_new_owner_pays_after_cooldown() {
    let (mut contract, mut context) = setup();
    let cooldown = valid_args().cooldown_ns;
    mint_default(&mut contract, &mut context);
    transfer_nft(&mut contract, &mut context, issuer(), alice(), NOW_NS);
    pay(
        &mut contract,
        &mut context,
        alice(),
        workshop(),
        two_near(),
        NOW_NS,
    );
    transfer_nft(&mut contract, &mut context, alice(), budi(), NOW_NS);
    let next = NOW_NS + cooldown;
    pay(
        &mut contract,
        &mut context,
        budi(),
        workshop(),
        two_near(),
        next,
    );
    let view = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(view.owner_id, budi());
    assert_eq!(
        view.balance,
        ten_near().saturating_sub(NearToken::from_near(4))
    );
    assert_eq!(view.asset.last_claim_at_ns, Some(next));
    assert_eq!(view.next_claim_ns, Some(next + cooldown));
}

#[test]
#[should_panic(expected = "Token not found")]
fn t02_missing_token_not_found() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    pay_with(
        &mut contract,
        &mut context,
        issuer(),
        "missing",
        workshop(),
        two_near(),
        "brakes",
        NOTE,
        NOW_NS,
    );
}

#[test]
#[should_panic(expected = "Workshop not approved")]
fn t03_non_approved_workshop_rejected() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    pay(
        &mut contract,
        &mut context,
        issuer(),
        account("ws-b.test"),
        two_near(),
        NOW_NS,
    );
}

#[test]
#[should_panic(expected = "Over cap")]
fn t04_cap_enforced() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        NearToken::from_near(4),
        NOW_NS,
    );
}

#[test]
fn t04_cap_enforced_exact_cap_succeeds() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        three_near(),
        NOW_NS,
    );
    assert_eq!(
        contract
            .get_asset(TOKEN.to_string())
            .expect("asset")
            .balance,
        ten_near().saturating_sub(three_near())
    );
}

#[test]
#[should_panic(expected = "Amount must be > 0")]
fn t04_zero_amount_rejected() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        NearToken::from_yoctonear(0),
        NOW_NS,
    );
}

#[test]
#[should_panic(expected = "Insufficient balance")]
fn t05_over_balance_rejected() {
    let (mut contract, mut context) = setup();
    let cooldown = valid_args().cooldown_ns;
    mint_default(&mut contract, &mut context);
    for step in 0..3 {
        pay(
            &mut contract,
            &mut context,
            issuer(),
            workshop(),
            three_near(),
            NOW_NS + step * cooldown,
        );
    }
    assert_eq!(
        contract
            .get_asset(TOKEN.to_string())
            .expect("asset")
            .balance,
        NearToken::from_near(1)
    );
    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        two_near(),
        NOW_NS + 3 * cooldown,
    );
}

#[test]
#[should_panic(expected = "Expired")]
fn t07_pay_after_expiry_rejected() {
    let (mut contract, mut context) = setup();
    let expiry = valid_args().expiry;
    mint_default(&mut contract, &mut context);
    at(&mut context, issuer(), NearToken::from_yoctonear(0), expiry);
    let view = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(view.status, WarrantyStatus::Active);
    assert_eq!(view.display_status, "Expired, close pending");
    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        two_near(),
        expiry,
    );
}

#[test]
#[should_panic(expected = "Not owner")]
fn t12_approved_account_cannot_pay() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    let market = account("market.test");
    at(&mut context, issuer(), NearToken::from_near(1), NOW_NS);
    contract.nft_approve(TOKEN.to_string(), market.clone(), None);
    pay(
        &mut contract,
        &mut context,
        market,
        workshop(),
        two_near(),
        NOW_NS,
    );
}

#[test]
#[should_panic(expected = "Cooldown active")]
fn t15_cooldown_enforced_inside_window() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        two_near(),
        NOW_NS,
    );
    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        two_near(),
        NOW_NS + 1,
    );
}

#[test]
fn t15_cooldown_enforced_succeeds_after() {
    let (mut contract, mut context) = setup();
    let cooldown = valid_args().cooldown_ns;
    mint_default(&mut contract, &mut context);
    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        two_near(),
        NOW_NS,
    );
    let view = contract.get_asset(TOKEN.to_string()).expect("asset");
    assert_eq!(view.next_claim_ns, Some(NOW_NS + cooldown));
    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        two_near(),
        NOW_NS + cooldown,
    );
    assert_eq!(
        contract
            .get_asset(TOKEN.to_string())
            .expect("asset")
            .balance,
        ten_near().saturating_sub(NearToken::from_near(4))
    );
}

#[test]
#[should_panic(expected = "Cooldown active")]
fn t16_cooldown_not_reset_by_transfer() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    transfer_nft(&mut contract, &mut context, issuer(), alice(), NOW_NS);
    pay(
        &mut contract,
        &mut context,
        alice(),
        workshop(),
        two_near(),
        NOW_NS,
    );
    let second = account("alice2.test");
    transfer_nft(&mut contract, &mut context, alice(), second.clone(), NOW_NS);
    pay(
        &mut contract,
        &mut context,
        second,
        workshop(),
        two_near(),
        NOW_NS,
    );
}

#[test]
#[should_panic(expected = "Cannot pay yourself")]
fn t18_owner_cannot_pay_self() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.workshops = vec![alice(), workshop()];
    mint_with(&mut contract, &mut context, args);
    transfer_nft(&mut contract, &mut context, issuer(), alice(), NOW_NS);
    pay(
        &mut contract,
        &mut context,
        alice(),
        alice(),
        two_near(),
        NOW_NS,
    );
}

#[test]
#[should_panic(expected = "History full")]
fn t27_history_cap_50() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.claim_cap = one_yocto();
    args.cooldown_ns = 1;
    mint_with(&mut contract, &mut context, args);
    let wide = "w".repeat(32);
    for step in 0..50u64 {
        let work_type = if step == 49 { wide.as_str() } else { "s" };
        pay_with(
            &mut contract,
            &mut context,
            issuer(),
            TOKEN,
            workshop(),
            one_yocto(),
            work_type,
            NOTE,
            NOW_NS + step,
        );
    }
    let history = contract
        .get_service_history(TOKEN.to_string(), None, None)
        .expect("history");
    assert_eq!(history.len(), 50);
    assert_eq!(history[49].work_type.len(), 32);
    assert_eq!(
        contract
            .get_asset(TOKEN.to_string())
            .expect("asset")
            .balance,
        ten_near().saturating_sub(NearToken::from_yoctonear(50))
    );
    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        one_yocto(),
        NOW_NS + 50,
    );
}

#[test]
#[should_panic(expected = "Bad work_type")]
fn t30_string_limits_work_type() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    pay_with(
        &mut contract,
        &mut context,
        issuer(),
        TOKEN,
        workshop(),
        two_near(),
        &"x".repeat(33),
        NOTE,
        NOW_NS,
    );
}

#[test]
#[should_panic(expected = "Bad note_hash")]
fn t30_string_limits_note_hash() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    pay_with(
        &mut contract,
        &mut context,
        issuer(),
        TOKEN,
        workshop(),
        two_near(),
        "brakes",
        &"A".repeat(64),
        NOW_NS,
    );
}

#[test]
#[should_panic(expected = "Cooldown active")]
fn t35_same_block_double_claim_rejected() {
    let (mut contract, mut context) = setup();
    let fund = mint_default(&mut contract, &mut context);
    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        two_near(),
        NOW_NS,
    );
    assert_eq!(
        contract
            .get_asset(TOKEN.to_string())
            .expect("asset")
            .balance,
        fund.saturating_sub(two_near())
    );
    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        two_near(),
        NOW_NS,
    );
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn pay_service_requires_one_yocto() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    at(&mut context, issuer(), NearToken::from_yoctonear(0), NOW_NS);
    contract.pay_service(
        TOKEN.to_string(),
        workshop(),
        two_near(),
        NOTE.to_string(),
        "brakes".to_string(),
    );
}

/// The release profile sets `panic = "abort"`, so the panic text never reaches a
/// client. The reason has to be in the logs instead; this is the line the web app
/// and a block-explorer reader look for.
#[test]
fn t04_rejection_reason_is_logged() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    let rejected = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        pay(
            &mut contract,
            &mut context,
            issuer(),
            workshop(),
            NearToken::from_near(4),
            NOW_NS,
        );
    }));
    assert!(rejected.is_err(), "an over-cap payment must be rejected");
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter().any(|line| line == "Phylaxtag error: Over cap"),
        "expected the rejection reason in the logs, got {logs:?}"
    );
}
