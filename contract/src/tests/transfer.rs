//! Transfer, approval, and history-view tests from spec 7.

use near_sdk::NearToken;

use super::common::*;
use super::*;

#[test]
#[should_panic(expected = "nft_transfer_call disabled in MVP")]
fn t13_transfer_call_disabled() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    assert_eq!(
        contract
            .nft_token(TOKEN.to_string())
            .expect("token")
            .owner_id,
        issuer()
    );
    at(&mut context, issuer(), one_yocto(), NOW_NS);
    let _ = contract.nft_transfer_call(alice(), TOKEN.to_string(), None, None, "sale".to_string());
}

#[test]
fn t14_history_view_paginated() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.cooldown_ns = 1;
    mint_with(&mut contract, &mut context, args);
    for (step, work_type) in ["one", "two", "three"].into_iter().enumerate() {
        pay_with(
            &mut contract,
            &mut context,
            issuer(),
            TOKEN,
            workshop(),
            one_yocto(),
            work_type,
            NOTE,
            NOW_NS + step as u64,
        );
    }

    let all = contract
        .get_service_history(TOKEN.to_string(), None, None)
        .expect("history");
    assert_eq!(all.len(), 3);
    assert_eq!(all[0].work_type, "one");
    assert_eq!(all[1].work_type, "two");
    assert_eq!(all[2].work_type, "three");
    assert_eq!(all[0].amount, one_yocto());
    assert_eq!(all[0].workshop, workshop());
    assert_eq!(all[0].owner_at_claim, issuer());
    assert_eq!(all[0].note_hash, NOTE);
    assert_eq!(all[0].timestamp_ns, NOW_NS);
    assert_eq!(all[0].status, ServiceStatus::Pending);

    let page = contract
        .get_service_history(TOKEN.to_string(), Some(1), Some(1))
        .expect("page");
    assert_eq!(page.len(), 1);
    assert_eq!(page[0].work_type, "two");

    let tail = contract
        .get_service_history(TOKEN.to_string(), Some(2), Some(50))
        .expect("tail");
    assert_eq!(tail.len(), 1);
    assert_eq!(tail[0].work_type, "three");

    assert!(
        contract
            .get_service_history(TOKEN.to_string(), Some(3), Some(10))
            .expect("past the end")
            .is_empty()
    );
    assert!(
        contract
            .get_service_history(TOKEN.to_string(), Some(0), Some(0))
            .expect("zero limit")
            .is_empty()
    );
    let capped = contract
        .get_service_history(TOKEN.to_string(), None, Some(100))
        .expect("capped");
    assert_eq!(capped.len(), 3);
    assert!(
        contract
            .get_service_history("missing".to_string(), None, None)
            .is_none()
    );
}

#[test]
#[should_panic(expected = "Token is listed")]
fn t23_listed_token_blocks_claim() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    at(&mut context, issuer(), NearToken::from_near(1), NOW_NS);
    contract.nft_approve(TOKEN.to_string(), account("market.test"), None);
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
fn t23_claim_works_after_revoke() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    let market = account("market.test");
    at(&mut context, issuer(), NearToken::from_near(1), NOW_NS);
    contract.nft_approve(TOKEN.to_string(), market.clone(), None);
    at(&mut context, issuer(), one_yocto(), NOW_NS);
    contract.nft_revoke(TOKEN.to_string(), market);
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
        ten_near().saturating_sub(two_near())
    );
}

#[test]
#[should_panic(expected = "Sender not approved")]
fn t24_approvals_cleared_on_transfer() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    let market = account("market.test");
    at(&mut context, issuer(), NearToken::from_near(1), NOW_NS);
    contract.nft_approve(TOKEN.to_string(), market.clone(), None);
    assert!(contract.nft_is_approved(TOKEN.to_string(), market.clone(), None));

    transfer_nft(&mut contract, &mut context, issuer(), budi(), NOW_NS);
    assert!(!contract.nft_is_approved(TOKEN.to_string(), market.clone(), None));
    assert_eq!(
        contract
            .nft_token(TOKEN.to_string())
            .expect("token")
            .owner_id,
        budi()
    );

    at(&mut context, market.clone(), one_yocto(), NOW_NS);
    contract.nft_transfer(alice(), TOKEN.to_string(), None, None);
}

#[test]
fn t25_holder_history_records_transfers() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    transfer_nft(&mut contract, &mut context, issuer(), alice(), NOW_NS + 1);
    pay(
        &mut contract,
        &mut context,
        alice(),
        workshop(),
        two_near(),
        NOW_NS + 2,
    );
    transfer_nft(&mut contract, &mut context, alice(), budi(), NOW_NS + 3);

    let history = contract
        .get_holder_history(TOKEN.to_string())
        .expect("holders");
    assert_eq!(history.holder_total, 3);
    assert_eq!(history.records.len(), 3);
    assert_eq!(history.records[0].owner, issuer());
    assert_eq!(history.records[0].since_ns, NOW_NS);
    assert_eq!(history.records[0].balance_at_transfer, ten_near());
    assert_eq!(history.records[1].owner, alice());
    assert_eq!(history.records[1].since_ns, NOW_NS + 1);
    assert_eq!(history.records[1].balance_at_transfer, ten_near());
    assert_eq!(history.records[2].owner, budi());
    assert_eq!(history.records[2].since_ns, NOW_NS + 3);
    assert_eq!(
        history.records[2].balance_at_transfer,
        ten_near().saturating_sub(two_near())
    );

    let service = contract
        .get_service_history(TOKEN.to_string(), None, None)
        .expect("service");
    assert_eq!(service.len(), 1);
    assert_eq!(service[0].owner_at_claim, alice());
    assert_eq!(service[0].amount, two_near());
    assert_eq!(
        contract
            .get_asset(TOKEN.to_string())
            .expect("asset")
            .owner_id,
        budi()
    );
}

#[test]
fn t37_holder_log_full_never_blocks_transfer() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    let mut owner = issuer();
    for step in 1..=55u64 {
        // Transfers 50..=55 overwrite the short ids already in the ring.
        let next = if step >= 50 {
            account_64(step)
        } else {
            account(&format!("t{step}.test"))
        };
        transfer_nft(
            &mut contract,
            &mut context,
            owner,
            next.clone(),
            NOW_NS + step,
        );
        owner = next;
    }

    let history = contract
        .get_holder_history(TOKEN.to_string())
        .expect("holders");
    assert_eq!(history.holder_total, 56);
    assert_eq!(history.records.len(), 50);
    assert_eq!(history.records[0].owner, account("t6.test"));
    assert_eq!(history.records[0].since_ns, NOW_NS + 6);
    assert_eq!(history.records[49].owner, account_64(55));
    assert_eq!(history.records[49].since_ns, NOW_NS + 55);
    assert_eq!(history.records[49].balance_at_transfer, ten_near());
    assert_eq!(
        contract
            .nft_token(TOKEN.to_string())
            .expect("token")
            .owner_id,
        account_64(55)
    );
    assert!(contract.get_holder_history("missing".to_string()).is_none());
}
