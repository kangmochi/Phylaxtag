//! Data model from spec 5.3, plus the view structs from spec 5.1.

use near_sdk::AccountId;
use near_sdk::NearToken;
use near_sdk::near;

/// Stored warranty status. Display status adds "Empty" and "close pending".
///
/// Spec 5.3.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WarrantyStatus {
    Active,
    Expired,
}

/// Outcome of one service payout. Spec 5.3.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ServiceStatus {
    Pending,
    Paid,
    Failed,
}

/// Per-token warranty. The balance lives here, not on an owner account.
///
/// Spec 5.3.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Asset {
    pub issuer: AccountId,
    /// `sha256(salt || serial)`. The salt stays off-chain with the issuer.
    pub serial_hash: String,
    /// Warranty fund, in yoctoNEAR, stored on this token.
    pub balance: NearToken,
    pub expiry_ns: u64,
    pub claim_cap: NearToken,
    pub cooldown_ns: u64,
    /// Per token. A transfer does not reset it.
    pub last_claim_at_ns: u64,
    /// Fixed at mint.
    pub workshops: Vec<AccountId>,
    pub status: WarrantyStatus,
    /// Every transfer, including mint.
    pub holder_total: u32,
    /// Next ring-buffer write index, in `0..50`.
    pub holder_next: u32,
}

/// One service payout attempt. Spec 5.3. At most 50 per token.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ServiceRecord {
    pub workshop: AccountId,
    pub amount: NearToken,
    pub work_type: String,
    pub note_hash: String,
    pub owner_at_claim: AccountId,
    pub timestamp_ns: u64,
    pub block_height: u64,
    pub status: ServiceStatus,
}

/// One holder-log entry. Spec 5.3. The log keeps the latest 50.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HolderRecord {
    pub owner: AccountId,
    pub since_ns: u64,
    pub balance_at_transfer: NearToken,
}

/// `get_asset` payload. Spec 5.1: asset, owner, balance, stored status,
/// display status, and the next claim time. `None` when the token is missing.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AssetView {
    pub asset: Asset,
    pub owner_id: AccountId,
    /// Same value as `asset.balance`. Repeated so the view matches the spec 5.1 wording.
    pub balance: NearToken,
    /// Stored status (`Active` or `Expired`), separate from `display_status`.
    pub status: WarrantyStatus,
    /// `Active`, `Empty (fund used up)`, `Expired, close pending`, or `Expired`.
    /// The mapping is recorded in `docs/DECISIONS.md`.
    pub display_status: String,
    /// When the next claim is allowed, in nanoseconds.
    /// `0` means there has been no claim yet, so a claim is allowed immediately.
    pub next_claim_ns: u64,
}

/// `get_holder_history` payload. Spec 5.1. Oldest stored entry first.
///
/// TODO: spec 5.1 describes the contents and not a struct name. This shape is the
/// view task 002 will fill in.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HolderHistoryView {
    pub holder_total: u32,
    pub holders: Vec<HolderRecord>,
}

/// `get_storage_info` payload. Spec 5.1 and 5.4.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StorageInfo {
    pub storage_usage: u64,
    pub total_locked: NearToken,
    pub contract_balance: NearToken,
}

pub(crate) fn display_status(asset: &Asset) -> String {
    let funded = asset.balance.as_yoctonear() > 0;
    match (asset.status, funded) {
        (WarrantyStatus::Active, true) => "Active",
        (WarrantyStatus::Active, false) => "Empty (fund used up)",
        (WarrantyStatus::Expired, true) => "Expired, close pending",
        (WarrantyStatus::Expired, false) => "Expired",
    }
    .to_string()
}

pub(crate) fn next_claim_ns(asset: &Asset) -> u64 {
    if asset.last_claim_at_ns == 0 {
        0
    } else {
        asset.last_claim_at_ns.saturating_add(asset.cooldown_ns)
    }
}
