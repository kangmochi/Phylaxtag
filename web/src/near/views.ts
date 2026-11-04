import { asIntString } from "./parse";
import type {
  AssetView,
  HolderHistory,
  NftContractMetadata,
  NftToken,
  ServiceRecord,
  StorageInfo,
} from "./types";

function yocto(value: string | number): string {
  return String(value);
}

export function normalizeAssetView(value: unknown): AssetView | null {
  if (value === null) {
    return null;
  }
  const row = value as AssetView;
  const expiry = asIntString(row.asset.expiry_ns);
  const cooldown = asIntString(row.asset.cooldown_ns);
  if (expiry === null || cooldown === null) {
    throw new Error("Warranty view is missing a timestamp");
  }
  return {
    owner_id: row.owner_id,
    balance: yocto(row.balance),
    status: row.status,
    display_status: row.display_status,
    next_claim_ns: asIntString(row.next_claim_ns),
    asset: {
      ...row.asset,
      balance: yocto(row.asset.balance),
      claim_cap: yocto(row.asset.claim_cap),
      expiry_ns: expiry,
      cooldown_ns: cooldown,
      last_claim_at_ns: asIntString(row.asset.last_claim_at_ns),
      pending_refund: row.asset.pending_refund === null ? null : yocto(row.asset.pending_refund),
    },
  };
}

export function normalizeServiceHistory(value: unknown): ServiceRecord[] | null {
  if (value === null) {
    return null;
  }
  return (value as ServiceRecord[]).map((row) => {
    const timestamp = asIntString(row.timestamp_ns);
    const height = asIntString(row.block_height);
    if (timestamp === null || height === null) {
      throw new Error("Service record is missing a timestamp");
    }
    return {
      ...row,
      amount: yocto(row.amount),
      timestamp_ns: timestamp,
      block_height: height,
      prev_last_claim_at_ns: asIntString(row.prev_last_claim_at_ns),
    };
  });
}

export function normalizeHolderHistory(value: unknown): HolderHistory | null {
  if (value === null) {
    return null;
  }
  const row = value as HolderHistory;
  return {
    holder_total: row.holder_total,
    records: row.records.map((record) => {
      const since = asIntString(record.since_ns);
      if (since === null) {
        throw new Error("Holder record is missing a timestamp");
      }
      return {
        owner: record.owner,
        since_ns: since,
        balance_at_transfer: yocto(record.balance_at_transfer),
      };
    }),
  };
}

export function normalizeStorageInfo(value: unknown): StorageInfo {
  const row = value as StorageInfo;
  const usage = asIntString(row.storage_usage);
  if (usage === null) {
    throw new Error("Storage view is missing storage_usage");
  }
  return {
    storage_usage: usage,
    total_locked: yocto(row.total_locked),
    contract_balance: yocto(row.contract_balance),
  };
}

export function normalizeNftToken(value: unknown): NftToken | null {
  if (value === null) {
    return null;
  }
  return value as NftToken;
}

export function normalizeNftMetadata(value: unknown): NftContractMetadata {
  return value as NftContractMetadata;
}
