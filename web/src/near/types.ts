export type Yocto = string;
export type Ns = string;

export interface Asset {
  issuer: string;
  serial_hash: string;
  balance: Yocto;
  expiry_ns: Ns;
  claim_cap: Yocto;
  cooldown_ns: Ns;
  last_claim_at_ns: Ns | null;
  workshops: string[];
  status: "Active" | "Expired";
  holder_total: number;
  holder_next: number;
  pending_refund: Yocto | null;
}

export interface AssetView {
  asset: Asset;
  owner_id: string;
  balance: Yocto;
  status: "Active" | "Expired";
  display_status: string;
  next_claim_ns: Ns | null;
}

export interface ServiceRecord {
  workshop: string;
  amount: Yocto;
  work_type: string;
  note_hash: string;
  owner_at_claim: string;
  prev_last_claim_at_ns: Ns | null;
  timestamp_ns: Ns;
  block_height: Ns;
  status: "Pending" | "Paid" | "Failed";
}

export interface HolderRecord {
  owner: string;
  since_ns: Ns;
  balance_at_transfer: Yocto;
}

export interface HolderHistory {
  records: HolderRecord[];
  holder_total: number;
}

export interface StorageInfo {
  storage_usage: Ns;
  total_locked: Yocto;
  contract_balance: Yocto;
}

export interface TokenMetadata {
  title: string | null;
  description: string | null;
  media: string | null;
  media_hash: string | null;
  copies: number | null;
  issued_at: Ns | null;
  expires_at: Ns | null;
  starts_at: Ns | null;
  updated_at: Ns | null;
  extra: string | null;
  reference: string | null;
  reference_hash: string | null;
}

export interface NftToken {
  token_id: string;
  owner_id: string;
  metadata: TokenMetadata | null;
  approved_account_ids: Record<string, number>;
}

export interface NftContractMetadata {
  spec: string;
  name: string;
  symbol: string;
  icon: string | null;
  base_uri: string | null;
  reference: string | null;
  reference_hash: string | null;
}
