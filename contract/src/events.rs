//! Phylaxtag NEP-297 events. Spec 5.5.
//!
//! Standard `nft_mint` / `nft_transfer` events are emitted with the
//! `near-contract-standards` helpers. This module covers the warranty events.

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

/// `service_paid` on `pay_service`, before the payout callback. Spec 5.5.
pub(crate) fn emit_service_paid(
    token_id: &str,
    owner: &AccountId,
    workshop: &AccountId,
    amount: NearToken,
    work_type: &str,
    note_hash: &str,
) {
    emit(
        "service_paid",
        json!({
            "token_id": token_id,
            "owner": owner,
            "workshop": workshop,
            "amount": amount,
            "work_type": work_type,
            "note_hash": note_hash,
        }),
    );
}

/// `payout_failed` when `on_payout` sees a failed transfer. Spec 5.5.
pub(crate) fn emit_payout_failed(
    token_id: &str,
    amount: NearToken,
    workshop: &AccountId,
    record_index: u64,
) {
    emit(
        "payout_failed",
        json!({
            "token_id": token_id,
            "amount": amount,
            "workshop": workshop,
            "record_index": record_index,
        }),
    );
}

/// `warranty_expired` on the first `expire` and on a later refund retry. Spec 5.5.
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
