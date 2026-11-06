//! Sandbox helpers. Every account is created by the local sandbox.

use anyhow::Context;
use near_workspaces::operations::Function;
use near_workspaces::types::{AccountId, Gas, NearToken};
use near_workspaces::{Account, Contract, Worker, network::Sandbox};
use serde::Deserialize;
use serde_json::{Value, json};

pub const TOKEN: &str = "EB-001";
pub const CALL_GAS: Gas = Gas::from_tgas(200);
pub const NOTE: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
/// Long enough that a restored cooldown is the only way a second claim succeeds.
pub const COOLDOWN_NS: u64 = 2_592_000_000_000_000;

pub struct Env {
    pub worker: Worker<Sandbox>,
    pub contract: Contract,
    pub issuer: Account,
    pub workshop: Account,
    pub alice: Account,
    pub budi: Account,
}

#[derive(Debug, Deserialize)]
pub struct StorageInfo {
    pub storage_usage: u64,
    pub total_locked: NearToken,
    pub contract_balance: NearToken,
}

#[derive(Debug, Deserialize)]
pub struct AssetView {
    pub owner_id: AccountId,
    pub balance: NearToken,
    pub asset: Asset,
}

#[derive(Debug, Deserialize)]
pub struct Asset {
    pub last_claim_at_ns: Option<u64>,
    pub status: String,
    pub pending_refund: Option<NearToken>,
}

#[derive(Debug, Deserialize)]
pub struct ServiceRow {
    pub status: String,
}

pub async fn env() -> anyhow::Result<Env> {
    let wasm_path = format!(
        "{}/../contract/target/wasm32-unknown-unknown/release/phylaxtag.wasm",
        env!("CARGO_MANIFEST_DIR")
    );
    let wasm = std::fs::read(&wasm_path)
        .with_context(|| format!("read {wasm_path}; build the release wasm first"))?;
    let worker = near_workspaces::sandbox().await?;
    let contract = worker.dev_deploy(&wasm).await?;
    let admin = worker.dev_create_account().await?;
    let issuer = worker.dev_create_account().await?;
    let workshop = worker.dev_create_account().await?;
    let alice = worker.dev_create_account().await?;
    let budi = worker.dev_create_account().await?;

    let init = admin
        .call(contract.id(), "new")
        .args_json(json!({
            "admin": admin.id(),
            "issuers": [issuer.id()],
        }))
        .gas(CALL_GAS)
        .transact()
        .await?
        .into_result()?;
    let _ = init;

    Ok(Env {
        worker,
        contract,
        issuer,
        workshop,
        alice,
        budi,
    })
}

pub async fn now_ns(worker: &Worker<Sandbox>) -> anyhow::Result<u64> {
    Ok(worker.view_block().await?.timestamp())
}

pub fn serial(token_id: &str) -> String {
    let mut hex = String::new();
    for byte in token_id.bytes() {
        hex.push_str(&format!("{byte:02x}"));
    }
    hex.extend(std::iter::repeat_n('0', 64 - hex.len().min(64)));
    hex.truncate(64);
    hex
}

pub async fn mint(
    env: &Env,
    token_id: &str,
    fund: NearToken,
    cap: NearToken,
    cooldown_ns: u64,
    expiry_ns: u64,
    workshops: &[AccountId],
) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    let result = env
        .issuer
        .call(env.contract.id(), "mint")
        .args_json(json!({
            "token_id": token_id,
            "serial_hash": serial(token_id),
            "fund_amount": fund,
            "expiry": expiry_ns.to_string(),
            "claim_cap": cap,
            // The web app sends u64 arguments as JSON strings; the sandbox does the same so
            // this suite fails if the contract stops accepting them.
            "cooldown_ns": cooldown_ns.to_string(),
            "workshops": workshops,
            "metadata": {
                "title": "E-bike EB-001",
                "description": "Warranty NFT for one e-bike",
                "copies": 1,
            },
        }))
        .gas(CALL_GAS)
        .deposit(NearToken::from_near(30))
        .transact()
        .await?;
    Ok(result)
}

pub async fn mint_default(env: &Env, token_id: &str, workshop: &AccountId) -> anyhow::Result<()> {
    let now = now_ns(&env.worker).await?;
    let result = mint(
        env,
        token_id,
        NearToken::from_near(10),
        NearToken::from_near(3),
        COOLDOWN_NS,
        now + 86_400 * 1_000_000_000,
        std::slice::from_ref(workshop),
    )
    .await?;
    result.into_result()?;
    Ok(())
}

pub fn pay_function(token_id: &str, workshop: &AccountId, amount: NearToken) -> Function {
    Function::new("pay_service")
        .args_json(json!({
            "token_id": token_id,
            "workshop": workshop,
            "amount": amount,
            "note_hash": NOTE,
            "work_type": "brakes",
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(CALL_GAS)
}

pub fn transfer_function(receiver: &AccountId, token_id: &str) -> Function {
    Function::new("nft_transfer")
        .args_json(json!({
            "receiver_id": receiver,
            "token_id": token_id,
            "approval_id": null,
            "memo": null,
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(CALL_GAS)
}

pub async fn storage_info(contract: &Contract) -> anyhow::Result<StorageInfo> {
    Ok(contract
        .view("get_storage_info")
        .args_json(json!({}))
        .await?
        .json()?)
}

pub async fn asset(contract: &Contract, token_id: &str) -> anyhow::Result<AssetView> {
    let value: Value = contract
        .view("get_asset")
        .args_json(json!({ "token_id": token_id }))
        .await?
        .json()?;
    Ok(serde_json::from_value(value)?)
}

pub async fn history(contract: &Contract, token_id: &str) -> anyhow::Result<Vec<ServiceRow>> {
    Ok(contract
        .view("get_service_history")
        .args_json(json!({ "token_id": token_id }))
        .await?
        .json()?)
}

pub async fn byte_cost(worker: &Worker<Sandbox>) -> anyhow::Result<NearToken> {
    let config = worker
        .protocol_config(near_primitives::types::BlockReference::latest())
        .await?;
    Ok(config.runtime_config.storage_amount_per_byte)
}

/// `contract balance >= total_locked + storage_usage * storage_byte_cost`,
/// using the account record from the sandbox, not a unit-test mock.
pub async fn assert_chain_invariant(env: &Env) -> anyhow::Result<()> {
    let account = env.contract.view_account().await?;
    let info = storage_info(&env.contract).await?;
    let cost = byte_cost(&env.worker).await?;
    let storage_lock = cost.saturating_mul(u128::from(account.storage_usage));
    assert!(
        account.balance >= info.total_locked.saturating_add(storage_lock),
        "balance {} < locked {} + storage {} bytes * {} yocto",
        account.balance.as_yoctonear(),
        info.total_locked.as_yoctonear(),
        account.storage_usage,
        cost.as_yoctonear()
    );
    assert_eq!(info.contract_balance, account.balance);
    assert_eq!(info.storage_usage, account.storage_usage);
    Ok(())
}

pub fn println_gas(label: &str, result: &near_workspaces::result::ExecutionFinalResult) {
    for (index, outcome) in result.outcomes().iter().enumerate() {
        let events: Vec<&str> = outcome
            .logs
            .iter()
            .filter(|line| line.starts_with("EVENT_JSON:"))
            .map(|line| {
                line.split("\"event\":\"")
                    .nth(1)
                    .and_then(|rest| rest.split('"').next())
                    .unwrap_or("log")
            })
            .collect();
        println!(
            "MEASURE {label} outcome={index} executor={} gas_burnt={} events={}",
            outcome.executor_id,
            outcome.gas_burnt.as_gas(),
            events.join(",")
        );
    }
}

pub async fn fast_forward_past(env: &Env, expiry_ns: u64) -> anyhow::Result<()> {
    for _ in 0..30 {
        if now_ns(&env.worker).await? >= expiry_ns {
            return Ok(());
        }
        // One jump is many blocks. The loop stops as soon as the clock passes expiry.
        env.worker.fast_forward(5_000).await?;
    }
    anyhow::bail!("block time did not reach {expiry_ns}")
}

/// An account id that the sandbox never created.
pub fn absent_account() -> AccountId {
    "absent.test.near".parse().expect("account id")
}
