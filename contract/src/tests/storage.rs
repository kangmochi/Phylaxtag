//! Checks the spec 5.4 prepay against `env::storage_usage`.

use near_sdk::NearToken;
use near_sdk::borsh::BorshSerialize;
use near_sdk::env;

use super::common::*;
use super::*;
use crate::storage::{
    asset_option_growth_bytes, new_record_bytes, prepaid_extra_bytes, worst_case_token_bytes,
};

fn borsh_len<T: BorshSerialize>(value: &T) -> u64 {
    u64::try_from(near_sdk::borsh::to_vec(value).expect("borsh").len()).expect("len")
}

fn assert_storage_safe(contract: &Contract) {
    let info = contract.get_storage_info();
    let lock = env::storage_byte_cost().saturating_mul(u128::from(info.storage_usage));
    assert!(
        info.contract_balance >= info.total_locked.saturating_add(lock),
        "balance {} locked {} storage lock {}",
        info.contract_balance.as_yoctonear(),
        info.total_locked.as_yoctonear(),
        lock
    );
}

#[test]
fn storage_prepay_matches_one_service_record() {
    let (mut contract, mut context) = setup();
    mint_default(&mut contract, &mut context);
    let before = env::storage_usage();
    pay(
        &mut contract,
        &mut context,
        issuer(),
        workshop(),
        two_near(),
        NOW_NS,
    );
    let record = contract
        .get_service_history(TOKEN.to_string(), None, None)
        .expect("history")
        .pop()
        .expect("record");
    // The first claim grows `last_claim_at_ns` only. `pending_refund` stays `None`.
    let refund_growth =
        borsh_len(&Some(NearToken::from_yoctonear(0))) - borsh_len(&None::<NearToken>);
    let claim_growth = asset_option_growth_bytes() - refund_growth;
    let expected = new_record_bytes(borsh_len(&record)) + claim_growth;
    assert_eq!(
        env::storage_usage() - before,
        expected,
        "service-record bytes must match the Borsh slot plus the claim-clock growth"
    );
    assert_storage_safe(&contract);
}

#[test]
fn storage_prepay_covers_full_rings() {
    let (mut contract, mut context) = setup();
    let mut args = valid_args();
    args.fund_amount = NearToken::from_near(10);
    args.claim_cap = NearToken::from_near(10);
    args.cooldown_ns = 1;
    args.deposit = NearToken::from_near(30);
    mint_with(&mut contract, &mut context, args);
    let after_mint = env::storage_usage();
    let first = HolderRecord {
        owner: issuer(),
        since_ns: NOW_NS,
        balance_at_transfer: NearToken::from_near(10),
    };
    let extra = prepaid_extra_bytes(&issuer(), &first);
    println!(
        "DERIVED worst_case_token_bytes={} prepaid_extra_bytes={} asset_option_growth={}",
        worst_case_token_bytes(),
        extra,
        asset_option_growth_bytes()
    );
    assert!(worst_case_token_bytes() > new_record_bytes(borsh_len(&first)));
    assert_storage_safe(&contract);

    let yocto = NearToken::from_yoctonear(1);
    for step in 0..50u64 {
        pay(
            &mut contract,
            &mut context,
            issuer(),
            workshop(),
            yocto,
            NOW_NS + step,
        );
        assert_storage_safe(&contract);
    }

    let mut owner = issuer();
    for step in 1..=55u64 {
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
            NOW_NS + 100 + step,
        );
        owner = next;
        assert_storage_safe(&contract);
    }

    // Both optional asset fields are `Some` after a claim and an expiry refund.
    let expiry = valid_args().expiry;
    at(
        &mut context,
        stranger(),
        NearToken::from_yoctonear(0),
        expiry,
    );
    let _ = contract.expire(TOKEN.to_string());
    assert_storage_safe(&contract);

    let history = contract
        .get_service_history(TOKEN.to_string(), None, None)
        .expect("history");
    assert_eq!(history.len(), 50);
    assert_eq!(history[49].status, ServiceStatus::Pending);
    let grown = env::storage_usage() - after_mint;
    assert!(
        grown <= extra,
        "storage grew by {grown} bytes, prepay covers {extra}"
    );
}
