//! Worst-case per-token storage from spec 5.4.
//!
//! `worst_case_token_bytes` is the spec's `WORST_CASE_TOKEN_BYTES`. Every term
//! is a Borsh length or the protocol's per-record overhead. Nothing here is a
//! guessed byte count.
//!
//! Trie accounting matches `near-vm-runner` 0.38 (`storage_write`): a new key
//! adds `key_len + value_len + num_extra_bytes_record`, and replacing a value
//! adds only the value-length delta. `num_extra_bytes_record` is 40 in
//! `near-parameters` 0.38 `StorageUsageConfig` (the nearcore line pinned with
//! `near-sdk` 5.30.0). Unit tests check a real `env::storage_usage` delta
//! against this formula.
//!
//! A vector element key is the Borsh `StorageKey` prefix (`HistoryFor` /
//! `HoldersFor`: enum tag + `Vec` length + 32-byte token hash) plus the
//! 8-byte little-endian index used by `collections::Vector`. The vector header
//! stored in the parent `LookupMap` is a fixed-width `u64` length, so pushing
//! does not grow that header.

use near_sdk::borsh::BorshSerialize;
use near_sdk::borsh::to_vec;
use near_sdk::{AccountId, NearToken};

use crate::StorageKey;
use crate::types::{HolderRecord, ServiceRecord, ServiceStatus};

/// Protocol `StorageUsageConfig::num_extra_bytes_record` for nearcore 2.14 / protocol 88.
pub(crate) const TRIE_RECORD_EXTRA_BYTES: u64 = 40;

/// How many holder and service records the prepay covers. Spec 5.4.
const RECORDS_PER_TOKEN: u64 = 50;

/// Maximum NEAR account id length, in bytes. Spec 5.4.
const MAX_ACCOUNT_ID_LEN: usize = 64;

/// `work_type` limit from spec 5.1.
const MAX_WORK_TYPE_LEN: usize = 32;

/// `note_hash` length from spec 5.1.
const NOTE_HASH_LEN: usize = 64;

fn borsh_len<T: BorshSerialize>(value: &T) -> u64 {
    u64::try_from(to_vec(value).expect("borsh").len()).expect("len fits")
}

fn prefix_len(key: &StorageKey) -> u64 {
    borsh_len(key)
}

/// Bytes of one `collections::Vector` element key. Holder and service prefixes
/// are the same length (different enum tags, same hash width).
pub(crate) fn vector_element_key_len() -> u64 {
    let sample_hash = vec![0u8; 32];
    let history = prefix_len(&StorageKey::HistoryFor {
        token_hash: sample_hash.clone(),
    });
    let holders = prefix_len(&StorageKey::HoldersFor {
        token_hash: sample_hash,
    });
    assert_eq!(
        history, holders,
        "holder and service vector prefixes must be the same length"
    );
    // `Vector::index_to_lookup_key` appends `index.to_le_bytes()` (8 bytes).
    history + 8
}

/// Bytes a brand-new trie record costs: key, Borsh value, and the 40-byte node.
pub(crate) fn new_record_bytes(value_len: u64) -> u64 {
    vector_element_key_len() + value_len + TRIE_RECORD_EXTRA_BYTES
}

fn max_account_id() -> AccountId {
    "a".repeat(MAX_ACCOUNT_ID_LEN)
        .parse()
        .expect("64-byte account id")
}

/// Largest `HolderRecord` spec 5.4 asks us to prepay (64-byte account id).
pub(crate) fn max_holder_record() -> HolderRecord {
    HolderRecord {
        owner: max_account_id(),
        since_ns: 0,
        balance_at_transfer: NearToken::from_yoctonear(0),
    }
}

/// Largest `ServiceRecord`: 64-byte accounts, 32-byte `work_type`, 64-char
/// `note_hash`, and `Some` for `prev_last_claim_at_ns` (9 bytes, not 1).
pub(crate) fn max_service_record() -> ServiceRecord {
    ServiceRecord {
        workshop: max_account_id(),
        amount: NearToken::from_yoctonear(0),
        work_type: "w".repeat(MAX_WORK_TYPE_LEN),
        note_hash: "a".repeat(NOTE_HASH_LEN),
        owner_at_claim: max_account_id(),
        prev_last_claim_at_ns: Some(0),
        timestamp_ns: 0,
        block_height: 0,
        status: ServiceStatus::Pending,
    }
}

/// Spec 5.4 `WORST_CASE_TOKEN_BYTES`: 50 max holder slots + 50 max service slots.
///
/// This is the gross size, including the one holder slot mint already wrote.
/// [`prepaid_extra_bytes`] subtracts that slot.
pub(crate) fn worst_case_token_bytes() -> u64 {
    let holder_slot = new_record_bytes(borsh_len(&max_holder_record()));
    let service_slot = new_record_bytes(borsh_len(&max_service_record()));
    RECORDS_PER_TOKEN * holder_slot + RECORDS_PER_TOKEN * service_slot
}

/// Bytes `Asset` grows after mint when both optional fields become `Some`.
///
/// `last_claim_at_ns`: `None` to `Some(u64)` adds the `u64`.
/// `pending_refund`: `None` to `Some(NearToken)` adds the `u128`.
/// Both are in-place value replacements, so they do not add a trie node.
/// Spec 5.4 names only the two record vectors. These fields still grow the
/// stored asset, so the prepay includes them. See the spec note in the PR.
pub(crate) fn asset_option_growth_bytes() -> u64 {
    let claim = borsh_len(&Some(0u64)) - borsh_len(&None::<u64>);
    let refund = borsh_len(&Some(NearToken::from_yoctonear(0))) - borsh_len(&None::<NearToken>);
    claim + refund
}

/// Extra bytes when the NFT owner id lengthens from `issuer` to 64 bytes.
///
/// Two stored copies change size and nothing else: the `owner_by_id` value
/// (`TreeMap` replace) and the `tokens_per_owner` key (`LookupMap` remove +
/// insert; the 40-byte node and the `UnorderedSet` body cancel because the
/// set prefix is a hash). Spec 5.4 does not name this growth. A transfer to a
/// longer account would still need it, so the prepay includes the delta.
pub(crate) fn owner_bookkeeping_growth_bytes(issuer: &AccountId) -> u64 {
    let max_len = borsh_len(&max_account_id());
    let actual = borsh_len(issuer);
    2 * max_len.saturating_sub(actual)
}

/// Bytes mint must charge on top of the bytes it just wrote.
///
/// `first_holder` is the record mint stored. Its trie slot is already inside
/// the measured delta, so it is subtracted from the 50 max holder slots.
pub(crate) fn prepaid_extra_bytes(issuer: &AccountId, first_holder: &HolderRecord) -> u64 {
    let first_slot = new_record_bytes(borsh_len(first_holder));
    worst_case_token_bytes() - first_slot
        + asset_option_growth_bytes()
        + owner_bookkeeping_growth_bytes(issuer)
}
