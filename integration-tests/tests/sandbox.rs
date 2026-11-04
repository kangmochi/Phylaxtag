//! Sandbox tests for spec 7. Accounts exist only inside this sandbox.

mod common;

use anyhow::Context;
use common::*;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{KeyType, NearToken, SecretKey};
use serde_json::json;

fn require_success(result: ExecutionFinalResult) -> anyhow::Result<ExecutionFinalResult> {
    if result.is_failure() {
        anyhow::bail!("call failed: {result:?}");
    }
    Ok(result)
}

#[tokio::test]
async fn t17_no_top_up_and_locked_follows_funds_only() -> anyhow::Result<()> {
    let env = env().await?;
    let before = storage_info(&env.contract).await?;
    assert_eq!(before.total_locked, NearToken::from_yoctonear(0));

    let missing = env
        .issuer
        .call(env.contract.id(), "top_up")
        .args_json(json!({ "token_id": TOKEN, "amount": NearToken::from_near(1) }))
        .deposit(NearToken::from_near(1))
        .gas(CALL_GAS)
        .transact()
        .await?;
    assert!(missing.is_failure(), "{missing:?}");
    let text = format!("{missing:?}");
    assert!(
        text.contains("MethodNotFound") || text.contains("MethodResolveError"),
        "top_up must be missing, got {text}"
    );
    assert_eq!(
        storage_info(&env.contract).await?.total_locked,
        NearToken::from_yoctonear(0)
    );

    env.issuer
        .transfer_near(env.contract.id(), NearToken::from_near(1))
        .await?
        .into_result()?;
    assert_eq!(
        storage_info(&env.contract).await?.total_locked,
        NearToken::from_yoctonear(0),
        "a plain transfer is reserve, not warranty funds"
    );

    mint_default(&env, TOKEN, env.workshop.id()).await?;
    assert_eq!(
        storage_info(&env.contract).await?.total_locked,
        NearToken::from_near(10)
    );
    assert_chain_invariant(&env).await?;

    env.issuer
        .call(env.contract.id(), "nft_transfer")
        .args_json(json!({
            "receiver_id": env.alice.id(),
            "token_id": TOKEN,
            "approval_id": null,
            "memo": null,
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(CALL_GAS)
        .transact()
        .await?
        .into_result()?;
    assert_eq!(
        storage_info(&env.contract).await?.total_locked,
        NearToken::from_near(10),
        "transfer does not move total_locked"
    );
    assert_chain_invariant(&env).await?;
    Ok(())
}

#[tokio::test]
async fn t10_sandbox_missing_workshop_restores_cooldown() -> anyhow::Result<()> {
    let env = env().await?;
    let missing = absent_account();
    let now = now_ns(&env.worker).await?;
    mint(
        &env,
        TOKEN,
        NearToken::from_near(10),
        NearToken::from_near(3),
        COOLDOWN_NS,
        now + 86_400 * 1_000_000_000,
        &[missing.clone(), env.workshop.id().clone()],
    )
    .await?
    .into_result()?;
    let paid = env
        .issuer
        .call(env.contract.id(), "pay_service")
        .args_json(json!({
            "token_id": TOKEN,
            "workshop": &missing,
            "amount": NearToken::from_near(2),
            "note_hash": NOTE,
            "work_type": "brakes",
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(CALL_GAS)
        .transact()
        .await?;
    let paid = require_success(paid)?;
    println_gas("t10_pay_failure", &paid);
    assert!(
        paid.logs()
            .iter()
            .any(|line| line.contains("payout_failed")),
        "{:?}",
        paid.logs()
    );

    let view = asset(&env.contract, TOKEN).await?;
    assert_eq!(view.balance, NearToken::from_near(10));
    assert_eq!(view.asset.last_claim_at_ns, None);
    assert_eq!(
        storage_info(&env.contract).await?.total_locked,
        NearToken::from_near(10)
    );
    assert_eq!(history(&env.contract, TOKEN).await?[0].status, "Failed");
    assert_chain_invariant(&env).await?;

    let workshop_before = env.workshop.view_account().await?.balance;
    // Still inside the original cooldown window. This succeeds only because
    // the failed callback put `last_claim_at_ns` back.
    let again = env
        .issuer
        .call(env.contract.id(), "pay_service")
        .args_json(json!({
            "token_id": TOKEN,
            "workshop": env.workshop.id(),
            "amount": NearToken::from_near(2),
            "note_hash": NOTE,
            "work_type": "brakes",
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(CALL_GAS)
        .transact()
        .await?;
    let again = require_success(again)?;
    println_gas("t10_pay_success_after_restore", &again);
    assert!(
        again
            .logs()
            .iter()
            .any(|line| line.contains("service_paid"))
    );
    assert_eq!(
        asset(&env.contract, TOKEN).await?.balance,
        NearToken::from_near(8)
    );
    assert_eq!(
        storage_info(&env.contract).await?.total_locked,
        NearToken::from_near(8)
    );
    let gained =
        env.workshop.view_account().await?.balance.as_yoctonear() - workshop_before.as_yoctonear();
    assert_eq!(gained, NearToken::from_near(2).as_yoctonear());
    assert_chain_invariant(&env).await?;
    Ok(())
}

async fn sale_during_payout(workshop_exists: bool) -> anyhow::Result<()> {
    let env = env().await?;
    let workshop_id = if workshop_exists {
        env.workshop.id().clone()
    } else {
        absent_account()
    };
    mint_default(&env, TOKEN, &workshop_id).await?;
    env.issuer
        .call(env.contract.id(), "nft_transfer")
        .args_json(json!({
            "receiver_id": env.alice.id(),
            "token_id": TOKEN,
            "approval_id": null,
            "memo": null,
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(CALL_GAS)
        .transact()
        .await?
        .into_result()?;

    let workshop_before = env.workshop.view_account().await?.balance;
    let alice_before = env.alice.view_account().await?.balance;

    // One transaction: the transfer is applied before the payout callback.
    let result = env
        .alice
        .batch(env.contract.id())
        .call(pay_function(TOKEN, &workshop_id, NearToken::from_near(2)))
        .call(transfer_function(env.budi.id(), TOKEN))
        .transact()
        .await?;
    let result = require_success(result)?;
    println_gas(
        if workshop_exists {
            "t20_success"
        } else {
            "t20_failure"
        },
        &result,
    );

    let view = asset(&env.contract, TOKEN).await?;
    assert_eq!(view.owner_id, *env.budi.id());
    let alice_after = env.alice.view_account().await?.balance;
    let alice_spent = alice_before.as_yoctonear() - alice_after.as_yoctonear();
    assert!(
        alice_spent < NearToken::from_near(1).as_yoctonear(),
        "Alice spent {alice_spent} yoctoNEAR; the warranty fund must not be paid to her"
    );

    if workshop_exists {
        assert_eq!(view.balance, NearToken::from_near(8));
        assert_eq!(
            storage_info(&env.contract).await?.total_locked,
            NearToken::from_near(8)
        );
        assert!(view.asset.last_claim_at_ns.is_some());
        assert_eq!(history(&env.contract, TOKEN).await?[0].status, "Paid");
        let gained = env.workshop.view_account().await?.balance.as_yoctonear()
            - workshop_before.as_yoctonear();
        assert_eq!(gained, NearToken::from_near(2).as_yoctonear());
        assert!(
            result
                .logs()
                .iter()
                .any(|line| line.contains("service_paid"))
        );
    } else {
        assert_eq!(view.balance, NearToken::from_near(10));
        assert_eq!(view.asset.last_claim_at_ns, None);
        assert_eq!(
            storage_info(&env.contract).await?.total_locked,
            NearToken::from_near(10)
        );
        assert_eq!(history(&env.contract, TOKEN).await?[0].status, "Failed");
        assert_eq!(env.workshop.view_account().await?.balance, workshop_before);
        assert!(
            result
                .logs()
                .iter()
                .any(|line| line.contains("payout_failed"))
        );
    }
    assert_chain_invariant(&env).await?;
    Ok(())
}

#[tokio::test]
async fn t19_sandbox_sale_mid_failed_payout() -> anyhow::Result<()> {
    sale_during_payout(false).await
}

#[tokio::test]
async fn t20_sale_mid_payout_missing_workshop() -> anyhow::Result<()> {
    sale_during_payout(false).await
}

#[tokio::test]
async fn t20_sale_mid_payout_workshop_is_paid() -> anyhow::Result<()> {
    sale_during_payout(true).await
}

#[tokio::test]
async fn t22_sandbox_missing_issuer_restores_refund() -> anyhow::Result<()> {
    let env = env().await?;
    let now = now_ns(&env.worker).await?;
    let expiry = now + 3_600 * 1_000_000_000;
    mint(
        &env,
        TOKEN,
        NearToken::from_near(10),
        NearToken::from_near(3),
        1,
        expiry,
        std::slice::from_ref(env.workshop.id()),
    )
    .await?
    .into_result()?;
    // The issuer account is gone, so the refund transfer cannot land.
    env.issuer
        .clone()
        .delete_account(env.alice.id())
        .await?
        .into_result()?;
    fast_forward_past(&env, expiry).await?;

    let first = env
        .alice
        .call(env.contract.id(), "expire")
        .args_json(json!({ "token_id": TOKEN }))
        .gas(CALL_GAS)
        .transact()
        .await?;
    let first = require_success(first)?;
    println_gas("t22_expire_failure", &first);
    assert!(
        first
            .logs()
            .iter()
            .any(|line| line.contains("warranty_expired")),
        "{:?}",
        first.logs()
    );
    assert!(
        !first
            .logs()
            .iter()
            .any(|line| line.contains("expire_refund_retried"))
    );
    assert!(
        first
            .logs()
            .iter()
            .any(|line| line.contains("expire_refund_failed"))
    );
    let restored = asset(&env.contract, TOKEN).await?;
    assert_eq!(restored.balance, NearToken::from_near(10));
    assert_eq!(restored.asset.status, "Expired");
    assert_eq!(restored.asset.pending_refund, None);
    assert_eq!(
        storage_info(&env.contract).await?.total_locked,
        NearToken::from_near(10)
    );
    assert_chain_invariant(&env).await?;

    let retry = env
        .alice
        .call(env.contract.id(), "expire")
        .args_json(json!({ "token_id": TOKEN }))
        .gas(CALL_GAS)
        .transact()
        .await?;
    let retry = require_success(retry)?;
    println_gas("t22_expire_retry", &retry);
    assert!(
        retry
            .logs()
            .iter()
            .any(|line| line.contains("expire_refund_retried"))
    );
    assert!(
        !retry
            .logs()
            .iter()
            .any(|line| line.contains("warranty_expired"))
    );
    // The issuer is still missing, so the retry is restored again.
    assert_eq!(
        asset(&env.contract, TOKEN).await?.balance,
        NearToken::from_near(10)
    );
    assert_eq!(
        storage_info(&env.contract).await?.total_locked,
        NearToken::from_near(10)
    );
    assert_chain_invariant(&env).await?;
    Ok(())
}

#[tokio::test]
async fn t26_storage_invariant_and_byte_cost() -> anyhow::Result<()> {
    let env = env().await?;
    let cost = byte_cost(&env.worker).await?;
    println!("MEASURE byte_cost_yocto={}", cost.as_yoctonear());

    let before_mint = env.contract.view_account().await?.storage_usage;
    let now = now_ns(&env.worker).await?;
    let expiry = now + 3_600 * 1_000_000_000;
    let minted = mint(
        &env,
        "A",
        NearToken::from_near(10),
        NearToken::from_near(10),
        1,
        expiry,
        std::slice::from_ref(env.workshop.id()),
    )
    .await?;
    let minted = require_success(minted)?;
    println_gas("t26_mint", &minted);
    let after_mint = env.contract.view_account().await?.storage_usage;
    let mint_bytes = after_mint - before_mint;
    println!("MEASURE bytes_per_mint={mint_bytes}");
    println!(
        "MEASURE mint_storage_cost_yocto={}",
        cost.as_yoctonear() * u128::from(mint_bytes)
    );
    assert_chain_invariant(&env).await?;

    let pay1 = env
        .issuer
        .call(env.contract.id(), "pay_service")
        .args_json(json!({
            "token_id": "A",
            "workshop": env.workshop.id(),
            "amount": NearToken::from_yoctonear(1),
            "note_hash": NOTE,
            "work_type": "brakes",
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(CALL_GAS)
        .transact()
        .await?;
    let pay1 = require_success(pay1)?;
    println_gas("t26_pay_success", &pay1);
    let after_pay1 = env.contract.view_account().await?.storage_usage;
    let pay2 = env
        .issuer
        .call(env.contract.id(), "pay_service")
        .args_json(json!({
            "token_id": "A",
            "workshop": env.workshop.id(),
            "amount": NearToken::from_yoctonear(1),
            "note_hash": NOTE,
            "work_type": "brakes",
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(CALL_GAS)
        .transact()
        .await?;
    let pay2 = require_success(pay2)?;
    println_gas("t26_pay_success_second", &pay2);
    let after_pay2 = env.contract.view_account().await?.storage_usage;
    let first_service_bytes = after_pay1 - after_mint;
    let service_bytes = after_pay2 - after_pay1;
    println!("MEASURE bytes_first_service_record_including_claim_clock={first_service_bytes}");
    println!("MEASURE bytes_per_service_record={service_bytes}");
    println!(
        "MEASURE service_record_cost_yocto={}",
        cost.as_yoctonear() * u128::from(service_bytes)
    );
    assert_chain_invariant(&env).await?;

    let left = env
        .worker
        .create_tla(
            "holdera".parse().context("id")?,
            SecretKey::from_seed(KeyType::ED25519, "holdera"),
        )
        .await?
        .into_result()?;
    let right = env
        .worker
        .create_tla(
            "holderb".parse().context("id")?,
            SecretKey::from_seed(KeyType::ED25519, "holderb"),
        )
        .await?
        .into_result()?;
    assert_eq!(left.id().len(), right.id().len());
    env.issuer
        .call(env.contract.id(), "nft_transfer")
        .args_json(json!({
            "receiver_id": left.id(),
            "token_id": "A",
            "approval_id": null,
            "memo": null,
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(CALL_GAS)
        .transact()
        .await?
        .into_result()?;
    let after_first_holder = env.contract.view_account().await?.storage_usage;
    left.call(env.contract.id(), "nft_transfer")
        .args_json(json!({
            "receiver_id": right.id(),
            "token_id": "A",
            "approval_id": null,
            "memo": null,
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(CALL_GAS)
        .transact()
        .await?
        .into_result()?;
    let after_second_holder = env.contract.view_account().await?.storage_usage;
    let holder_bytes = after_second_holder - after_first_holder;
    println!(
        "MEASURE bytes_first_holder_record_including_owner_change={}",
        after_first_holder - after_pay2
    );
    println!("MEASURE bytes_per_holder_record={holder_bytes}");
    println!(
        "MEASURE holder_record_cost_yocto={}",
        cost.as_yoctonear() * u128::from(holder_bytes)
    );
    assert_eq!(
        storage_info(&env.contract).await?.total_locked,
        NearToken::from_near(10).saturating_sub(NearToken::from_yoctonear(2))
    );
    assert_chain_invariant(&env).await?;

    // Pay failure on a second token. The missing account is on the workshop list.
    let missing = absent_account();
    mint(
        &env,
        "B",
        NearToken::from_near(10),
        NearToken::from_near(3),
        COOLDOWN_NS,
        expiry + 86_400 * 1_000_000_000,
        &[env.workshop.id().clone(), missing.clone()],
    )
    .await?
    .into_result()?;
    let failed = env
        .issuer
        .call(env.contract.id(), "pay_service")
        .args_json(json!({
            "token_id": "B",
            "workshop": &missing,
            "amount": NearToken::from_near(2),
            "note_hash": NOTE,
            "work_type": "brakes",
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(CALL_GAS)
        .transact()
        .await?;
    let failed = require_success(failed)?;
    println_gas("t26_pay_failure", &failed);
    assert_eq!(
        asset(&env.contract, "B").await?.balance,
        NearToken::from_near(10)
    );
    assert_chain_invariant(&env).await?;

    // Expire success on A (owner is `holderb`, anyone may expire).
    fast_forward_past(&env, expiry).await?;
    let closed = right
        .call(env.contract.id(), "expire")
        .args_json(json!({ "token_id": "A" }))
        .gas(CALL_GAS)
        .transact()
        .await?;
    let closed = require_success(closed)?;
    println_gas("t26_expire_success", &closed);
    assert!(
        closed
            .logs()
            .iter()
            .any(|line| line.contains("warranty_expired"))
    );
    assert_eq!(
        asset(&env.contract, "A").await?.balance,
        NearToken::from_yoctonear(0)
    );
    assert_chain_invariant(&env).await?;

    // Expire refund failure and retry on C, whose issuer account is deleted.
    let now = now_ns(&env.worker).await?;
    let expiry_c = now + 3_600 * 1_000_000_000;
    mint(
        &env,
        "C",
        NearToken::from_near(10),
        NearToken::from_near(3),
        1,
        expiry_c,
        std::slice::from_ref(env.workshop.id()),
    )
    .await?
    .into_result()?;
    // `issuer` still owns C. Deleting the issuer fails the refund.
    // A is already expired and B's owner is the issuer too; deleting is fine
    // because expire and views do not need the issuer account to exist.
    env.issuer
        .clone()
        .delete_account(env.budi.id())
        .await?
        .into_result()?;
    fast_forward_past(&env, expiry_c).await?;
    let refund_fail = env
        .budi
        .call(env.contract.id(), "expire")
        .args_json(json!({ "token_id": "C" }))
        .gas(CALL_GAS)
        .transact()
        .await?;
    let refund_fail = require_success(refund_fail)?;
    println_gas("t26_expire_failure", &refund_fail);
    assert_eq!(
        asset(&env.contract, "C").await?.balance,
        NearToken::from_near(10)
    );
    assert_chain_invariant(&env).await?;
    let retry = env
        .budi
        .call(env.contract.id(), "expire")
        .args_json(json!({ "token_id": "C" }))
        .gas(CALL_GAS)
        .transact()
        .await?;
    let retry = require_success(retry)?;
    println_gas("t26_expire_retry", &retry);
    assert!(
        retry
            .logs()
            .iter()
            .any(|line| line.contains("expire_refund_retried"))
    );
    assert!(
        !retry
            .logs()
            .iter()
            .any(|line| line.contains("warranty_expired"))
    );
    assert_chain_invariant(&env).await?;
    Ok(())
}

#[tokio::test]
async fn t37_sandbox_long_accounts_stay_inside_prepay() -> anyhow::Result<()> {
    let env = env().await?;
    mint_default(&env, TOKEN, env.workshop.id()).await?;
    assert_chain_invariant(&env).await?;

    let mut owner = env.issuer.clone();
    for step in 1..=55u64 {
        let next = if step >= 50 {
            let mut name = format!("h{step}");
            name.extend(std::iter::repeat_n('a', 64 - name.len()));
            let id = name.parse().context("64-byte account")?;
            env.worker
                .create_tla(
                    id,
                    SecretKey::from_seed(KeyType::ED25519, &format!("seed-{step}")),
                )
                .await?
                .into_result()?
        } else {
            env.worker.dev_create_account().await?
        };
        let moved = owner
            .call(env.contract.id(), "nft_transfer")
            .args_json(json!({
                "receiver_id": next.id(),
                "token_id": TOKEN,
                "approval_id": null,
                "memo": null,
            }))
            .deposit(NearToken::from_yoctonear(1))
            .gas(CALL_GAS)
            .transact()
            .await?;
        let _ = require_success(moved)?;
        assert_chain_invariant(&env).await?;
        owner = next;
    }

    let view = asset(&env.contract, TOKEN).await?;
    assert_eq!(view.owner_id.as_str().len(), 64);
    assert_eq!(
        storage_info(&env.contract).await?.total_locked,
        NearToken::from_near(10)
    );
    let holders: serde_json::Value = env
        .contract
        .view("get_holder_history")
        .args_json(json!({ "token_id": TOKEN }))
        .await?
        .json()?;
    assert_eq!(holders["holder_total"], 56);
    assert_eq!(holders["records"].as_array().context("records")?.len(), 50);
    Ok(())
}
