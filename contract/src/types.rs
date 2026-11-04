//! Data model from spec 5.3, plus the view structs from spec 5.1 and 5.1a.

use near_sdk::AccountId;
use near_sdk::NearToken;
use near_sdk::near;

/// Stored warranty status. Display status adds "Empty" and "close pending".
///
/// Spec 5.3. The display mapping, including the clock, is spec 5.1b.
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
    /// Per token. A transfer does not reset it. `None` until the first claim.
    pub last_claim_at_ns: Option<u64>,
    /// Fixed at mint.
    pub workshops: Vec<AccountId>,
    pub status: WarrantyStatus,
    /// Every transfer, including mint.
    pub holder_total: u32,
    /// Next ring-buffer write index, in `0..50`.
    pub holder_next: u32,
    /// Outstanding `expire` refund. `None` when no refund transfer is in flight.
    /// The callback acts only while this is `Some(amount)`. Spec 5.3.
    pub pending_refund: Option<NearToken>,
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
    /// `last_claim_at_ns` from before this claim. Restored on payout failure
    /// only when the asset clock still equals this record's `timestamp_ns`.
    pub prev_last_claim_at_ns: Option<u64>,
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

/// `get_asset` payload. Spec 5.1 and 5.1b.
///
/// `None` from the view when the token is missing.
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
    pub display_status: String,
    /// When the next claim is allowed, in nanoseconds.
    /// `None` means there has been no claim yet, so a claim is allowed immediately.
    pub next_claim_ns: Option<u64>,
}

/// `get_holder_history` payload. Spec 5.1a.
///
/// `records` is oldest first, at most 50. `holder_total` counts mint as well.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HolderHistory {
    pub records: Vec<HolderRecord>,
    pub holder_total: u32,
}

/// `get_storage_info` payload. Spec 5.1 and 5.4.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StorageInfo {
    pub storage_usage: u64,
    pub total_locked: NearToken,
    pub contract_balance: NearToken,
}

/// Spec 5.1b. `now_ns` is the block timestamp.
pub(crate) fn display_status(asset: &Asset, now_ns: u64) -> String {
    let funded = !asset.balance.is_zero();
    let past_expiry = now_ns >= asset.expiry_ns;
    match (asset.status, past_expiry, funded) {
        (WarrantyStatus::Active, false, true) => "Active",
        (WarrantyStatus::Active, false, false) => "Empty (fund used up)",
        (WarrantyStatus::Active, true, _) => "Expired, close pending",
        (WarrantyStatus::Expired, _, true) => "Expired, close pending",
        (WarrantyStatus::Expired, _, false) => "Expired",
    }
    .to_string()
}

/// Spec 5.1b. `None` before the first claim.
pub(crate) fn next_claim_ns(asset: &Asset) -> Option<u64> {
    asset
        .last_claim_at_ns
        .map(|last| last.saturating_add(asset.cooldown_ns))
}

/// Spec 5.1: `serial_hash` and `note_hash` are exactly 64 lowercase hex characters.
pub(crate) fn is_lowercase_hex_64(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
}
