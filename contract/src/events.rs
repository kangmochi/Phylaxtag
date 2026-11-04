//! Phylaxtag NEP-297 events. Spec 5.5.
//!
//! Standard `nft_mint` / `nft_transfer` events are emitted with the
//! `near-contract-standards` helpers. This module covers the warranty events.
//! Field names match spec 5.5. `data` is a one-element array.

use near_sdk::env;
use near_sdk::serde_json::{Value, json};
use near_sdk::{AccountId, NearToken};

fn emit(event: &str, data: Value) {
    let payload = json!({
        "standard": "phylaxtag",
        "version": "1.0.0",
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{payload}"));
}

/// `warranty_funded` on mint. Spec 5.5. There is no later top-up.
pub(crate) fn emit_warranty_funded(token_id: &str, amount: NearToken, issuer: &AccountId) {
    emit(
        "warranty_funded",
        json!({
            "token_id": token_id,
            "amount": amount,
            "issuer": issuer,
        }),
    );
}

/// `service_requested` on `pay_service`, while the record is Pending. Spec 5.5.
pub(crate) fn emit_service_requested(
    token_id: &str,
    owner: &AccountId,
    workshop: &AccountId,
    amount: NearToken,
    work_type: &str,
    note_hash: &str,
    record_index: u64,
) {
    emit(
        "service_requested",
        json!({
            "token_id": token_id,
            "owner": owner,
            "workshop": workshop,
            "amount": amount,
            "work_type": work_type,
            "note_hash": note_hash,
            "record_index": record_index,
        }),
    );
}

/// `service_paid` on `on_payout` success only. Spec 5.5.
pub(crate) fn emit_service_paid(
    token_id: &str,
    workshop: &AccountId,
    amount: NearToken,
    record_index: u64,
) {
    emit(
        "service_paid",
        json!({
            "token_id": token_id,
            "workshop": workshop,
            "amount": amount,
            "record_index": record_index,
        }),
    );
}

/// `payout_failed` when `on_payout` sees a failed transfer. Spec 5.5.
pub(crate) fn emit_payout_failed(
    token_id: &str,
    workshop: &AccountId,
    amount: NearToken,
    record_index: u64,
) {
    emit(
        "payout_failed",
        json!({
            "token_id": token_id,
            "workshop": workshop,
            "amount": amount,
            "record_index": record_index,
        }),
    );
}

/// `warranty_expired` once, on the first transition to Expired. Spec 5.5.
pub(crate) fn emit_warranty_expired(token_id: &str, amount: NearToken, issuer: &AccountId) {
    emit(
        "warranty_expired",
        json!({
            "token_id": token_id,
            "amount": amount,
            "issuer": issuer,
        }),
    );
}

/// `expire_refund_retried` on a later `expire` that still has a balance. Spec 5.5.
pub(crate) fn emit_expire_refund_retried(token_id: &str, amount: NearToken, issuer: &AccountId) {
    emit(
        "expire_refund_retried",
        json!({
            "token_id": token_id,
            "amount": amount,
            "issuer": issuer,
        }),
    );
}

/// `expire_refund_failed` when `on_expire_payout` sees a failed transfer. Spec 5.5.
pub(crate) fn emit_expire_refund_failed(token_id: &str, amount: NearToken, issuer: &AccountId) {
    emit(
        "expire_refund_failed",
        json!({
            "token_id": token_id,
            "amount": amount,
            "issuer": issuer,
        }),
    );
}
