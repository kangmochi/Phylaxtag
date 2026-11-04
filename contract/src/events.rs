//! Phylaxtag NEP-297 events. Spec 5.5.
//!
//! Standard `nft_mint` / `nft_transfer` events are emitted with the
//! `near-contract-standards` helpers. This module covers the warranty events.

use near_sdk::env;
use near_sdk::serde::Serialize;
use near_sdk::{AccountId, NearToken};

/// `warranty_funded` on mint. Spec 5.5. There is no later top-up.
pub(crate) fn emit_warranty_funded(token_id: &str, amount: NearToken, issuer: &AccountId) {
    #[derive(Serialize)]
    #[serde(crate = "near_sdk::serde")]
    struct Data<'a> {
        token_id: &'a str,
        amount: NearToken,
        issuer: &'a AccountId,
    }

    #[derive(Serialize)]
    #[serde(crate = "near_sdk::serde")]
    struct Event<'a> {
        standard: &'a str,
        version: &'a str,
        event: &'a str,
        data: [Data<'a>; 1],
    }

    let event = Event {
        standard: "phylaxtag",
        version: "1.0.0",
        event: "warranty_funded",
        data: [Data {
            token_id,
            amount,
            issuer,
        }],
    };
    let json = near_sdk::serde_json::to_string(&event)
        .unwrap_or_else(|_| env::panic_str("Failed to serialize warranty_funded"));
    env::log_str(&format!("EVENT_JSON:{json}"));
}
