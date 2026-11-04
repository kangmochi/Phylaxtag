/**
 * In-memory stand-in for the views and calls in spec 8.2 and 8.3.
 * Account ids are labels. This object never holds a key.
 */

import { nowNs } from "../near/time";
import type { Asset, AssetView, HolderRecord, NftToken, ServiceRecord } from "../near/types";

const NEAR = 10n ** 24n;
const TEN = (10n * NEAR).toString();
const EIGHT = (8n * NEAR).toString();
const THREE = (3n * NEAR).toString();
const HISTORY_LIMIT = 50;

export const TEST_ACCOUNTS = ["alice.test", "budi.test", "issuer.test"] as const;

interface TokenState {
  asset: Asset;
  ownerId: string;
  history: ServiceRecord[];
  holders: HolderRecord[];
  metadataTitle: string;
  listed: boolean;
}

function displayStatus(asset: Asset, now: bigint): string {
  const funded = BigInt(asset.balance) !== 0n;
  const past = now >= BigInt(asset.expiry_ns);
  if (asset.status === "Active" && !past && funded) {
    return "Active";
  }
  if (asset.status === "Active" && !past && !funded) {
    return "Empty (fund used up)";
  }
  if (asset.status === "Active" && past) {
    return "Expired, close pending";
  }
  if (asset.status === "Expired" && funded) {
    return "Expired, close pending";
  }
  return "Expired";
}

function nextClaim(asset: Asset): string | null {
  if (asset.last_claim_at_ns === null) {
    return null;
  }
  return (BigInt(asset.last_claim_at_ns) + BigInt(asset.cooldown_ns)).toString();
}

function viewOf(token: TokenState): AssetView {
  const now = BigInt(nowNs());
  return {
    asset: structuredClone(token.asset),
    owner_id: token.ownerId,
    balance: token.asset.balance,
    status: token.asset.status,
    display_status: displayStatus(token.asset, now),
    next_claim_ns: nextClaim(token.asset),
  };
}

function panic(message: string): never {
  throw new Error(message);
}

export class FakeContract {
  private tokens = new Map<string, TokenState>();
  private issuers = new Set<string>(["issuer.test"]);
  private serials = new Set<string>();
  private height = 1n;
  readonly contractId: string;

  constructor(contractId: string) {
    this.contractId = contractId;
    const now = BigInt(nowNs());
    const day = 86_400_000n;
    this.tokens.set("EB-001", this.make({
      tokenId: "EB-001",
      ownerId: "alice.test",
      balance: TEN,
      expiryNs: (now + 365n * day * 1_000_000n).toString(),
      lastClaim: (now - 10_000_000_000n).toString(),
      status: "Active",
      pending: null,
      history: [],
    }));
    this.tokens.set("EB-EMPTY", this.make({
      tokenId: "EB-EMPTY",
      ownerId: "alice.test",
      balance: "0",
      expiryNs: (now + 365n * day * 1_000_000n).toString(),
      lastClaim: null,
      status: "Active",
      pending: null,
      history: [],
    }));
    this.tokens.set("EB-PENDING", this.make({
      tokenId: "EB-PENDING",
      ownerId: "alice.test",
      balance: EIGHT,
      expiryNs: (now - day * 1_000_000n).toString(),
      lastClaim: null,
      status: "Active",
      pending: null,
      history: [],
    }));
    this.tokens.set("EB-DONE", this.make({
      tokenId: "EB-DONE",
      ownerId: "alice.test",
      balance: "0",
      expiryNs: (now - day * 1_000_000n).toString(),
      lastClaim: null,
      status: "Expired",
      pending: null,
      history: [],
    }));
    this.tokens.set("EB-FLIGHT", this.make({
      tokenId: "EB-FLIGHT",
      ownerId: "alice.test",
      balance: "0",
      expiryNs: (now - day * 1_000_000n).toString(),
      lastClaim: null,
      status: "Expired",
      pending: EIGHT,
      history: [],
    }));
  }

  private make(input: {
    tokenId: string;
    ownerId: string;
    balance: string;
    expiryNs: string;
    lastClaim: string | null;
    status: "Active" | "Expired";
    pending: string | null;
    history: ServiceRecord[];
  }): TokenState {
    const since = nowNs();
    return {
      ownerId: input.ownerId,
      metadataTitle: `E-bike ${input.tokenId}`,
      listed: false,
      history: input.history,
      holders: [
        {
          owner: input.ownerId,
          since_ns: since,
          balance_at_transfer: input.balance,
        },
      ],
      asset: {
        issuer: "issuer.test",
        serial_hash: "a".repeat(64),
        balance: input.balance,
        expiry_ns: input.expiryNs,
        claim_cap: THREE,
        cooldown_ns: "60000000000",
        last_claim_at_ns: input.lastClaim,
        workshops: ["workshop.test"],
        status: input.status,
        holder_total: 1,
        holder_next: 1,
        pending_refund: input.pending,
      },
    };
  }

  view(method: string, args: Record<string, unknown>): unknown {
    if (method === "get_storage_info") {
      return {
        storage_usage: "1000",
        total_locked: TEN,
        contract_balance: (100n * NEAR).toString(),
      };
    }
    if (method === "nft_metadata") {
      return {
        spec: "nft-1.0.0",
        name: "Phylaxtag",
        symbol: "PHYLAX",
        icon: null,
        base_uri: null,
        reference: null,
        reference_hash: null,
      };
    }
    if (method === "nft_tokens" || method === "nft_tokens_for_owner") {
      const owner = typeof args.account_id === "string" ? args.account_id : null;
      return [...this.tokens.entries()]
        .filter(([, token]) => owner === null || token.ownerId === owner)
        .map(([tokenId, token]) => this.nft(tokenId, token));
    }
    const tokenId = String(args.token_id ?? "");
    const token = this.tokens.get(tokenId);
    if (method === "get_asset") {
      return token ? viewOf(token) : null;
    }
    if (method === "get_service_history") {
      if (!token) {
        return null;
      }
      const from = Number(args.from_index ?? 0);
      const limit = args.limit === undefined ? 50 : Number(args.limit);
      if (limit === 0) {
        return [];
      }
      return token.history.slice(from, from + Math.min(limit, 50));
    }
    if (method === "get_holder_history") {
      if (!token) {
        return null;
      }
      return { records: token.holders.slice(-50), holder_total: token.asset.holder_total };
    }
    if (method === "nft_token") {
      return token ? this.nft(tokenId, token) : null;
    }
    panic("Token not found");
  }

  call(method: string, args: Record<string, unknown>, signer: string, depositYocto: string): unknown {
    if (method === "mint") {
      return this.mint(args, signer, depositYocto);
    }
    if (method === "pay_service") {
      return this.pay(args, signer, depositYocto);
    }
    if (method === "nft_transfer") {
      return this.transfer(args, signer, depositYocto);
    }
    if (method === "expire") {
      return this.expire(args);
    }
    panic("Token not found");
  }

  private nft(tokenId: string, token: TokenState): NftToken {
    return {
      token_id: tokenId,
      owner_id: token.ownerId,
      approved_account_ids: token.listed ? { "market.test": 1 } : {},
      metadata: {
        title: token.metadataTitle,
        description: "Warranty NFT for one e-bike",
        media: null,
        media_hash: null,
        copies: 1,
        issued_at: null,
        expires_at: null,
        starts_at: null,
        updated_at: null,
        extra: null,
        reference: null,
        reference_hash: null,
      },
    };
  }

  private requireOneYocto(depositYocto: string): void {
    if (depositYocto !== "1") {
      panic("Requires attached deposit of exactly 1 yoctoNEAR");
    }
  }

  private mint(args: Record<string, unknown>, signer: string, depositYocto: string): unknown {
    if (!this.issuers.has(signer)) {
      panic("Not an approved issuer");
    }
    const tokenId = String(args.token_id ?? "");
    if (tokenId.length < 1 || tokenId.length > 32) {
      panic("Bad token_id");
    }
    const serial = String(args.serial_hash ?? "");
    if (!/^[0-9a-f]{64}$/.test(serial)) {
      panic("Bad serial_hash");
    }
    if (this.tokens.has(tokenId)) {
      panic("Token exists");
    }
    if (this.serials.has(`${signer}:${serial}`)) {
      panic("Serial already used");
    }
    const expiry = BigInt(String(args.expiry));
    if (expiry <= BigInt(nowNs())) {
      panic("Bad expiry");
    }
    const fund = BigInt(String(args.fund_amount));
    const cap = BigInt(String(args.claim_cap));
    if (cap <= 0n || cap > fund) {
      panic("Bad cap");
    }
    const cooldown = BigInt(String(args.cooldown_ns));
    if (cooldown <= 0n) {
      panic("Cooldown must be > 0");
    }
    const workshops = Array.isArray(args.workshops) ? args.workshops.map(String) : [];
    const seen = new Set<string>();
    if (
      workshops.length === 0 ||
      workshops.some((workshop) => {
        if (workshop === signer || workshop === this.contractId || seen.has(workshop)) {
          return true;
        }
        seen.add(workshop);
        return false;
      })
    ) {
      panic("Bad workshop list");
    }
    if (BigInt(depositYocto) < fund) {
      panic("Deposit too small");
    }
    const metadata = (args.metadata ?? {}) as { title?: string };
    const token = this.make({
      tokenId,
      ownerId: signer,
      balance: fund.toString(),
      expiryNs: expiry.toString(),
      lastClaim: null,
      status: "Active",
      pending: null,
      history: [],
    });
    token.asset.claim_cap = cap.toString();
    token.asset.cooldown_ns = cooldown.toString();
    token.asset.serial_hash = serial;
    token.asset.issuer = signer;
    token.asset.workshops = workshops;
    token.holders[0].owner = signer;
    token.metadataTitle = metadata.title ?? token.metadataTitle;
    this.tokens.set(tokenId, token);
    this.serials.add(`${signer}:${serial}`);
    return { token_id: tokenId, owner_id: signer };
  }

  private pay(args: Record<string, unknown>, signer: string, depositYocto: string): unknown {
    const tokenId = String(args.token_id ?? "");
    const token = this.tokens.get(tokenId);
    if (!token) {
      panic("Token not found");
    }
    this.requireOneYocto(depositYocto);
    if (signer !== token.ownerId) {
      panic("Not owner");
    }
    const now = BigInt(nowNs());
    if (token.asset.status === "Expired" || now >= BigInt(token.asset.expiry_ns)) {
      panic("Expired");
    }
    if (token.listed) {
      panic("Token is listed");
    }
    const workshop = String(args.workshop ?? "");
    if (!token.asset.workshops.includes(workshop)) {
      panic("Workshop not approved");
    }
    if (workshop === token.ownerId) {
      panic("Cannot pay yourself");
    }
    const amount = BigInt(String(args.amount));
    if (amount <= 0n) {
      panic("Amount must be > 0");
    }
    if (amount > BigInt(token.asset.claim_cap)) {
      panic("Over cap");
    }
    if (amount > BigInt(token.asset.balance)) {
      panic("Insufficient balance");
    }
    if (token.asset.last_claim_at_ns !== null) {
      const ready = BigInt(token.asset.last_claim_at_ns) + BigInt(token.asset.cooldown_ns);
      if (now < ready) {
        panic("Cooldown active");
      }
    }
    if (token.history.length >= HISTORY_LIMIT) {
      panic("History full");
    }
    const workType = String(args.work_type ?? "");
    if (new TextEncoder().encode(workType).length > 32) {
      panic("Bad work_type");
    }
    const note = String(args.note_hash ?? "");
    if (!/^[0-9a-f]{64}$/.test(note)) {
      panic("Bad note_hash");
    }
    const prev = token.asset.last_claim_at_ns;
    token.asset.balance = (BigInt(token.asset.balance) - amount).toString();
    token.asset.last_claim_at_ns = now.toString();
    this.height += 1n;
    const failed = workshop === "fail.test";
    if (failed) {
      token.asset.balance = (BigInt(token.asset.balance) + amount).toString();
      token.asset.last_claim_at_ns = prev;
    }
    token.history.push({
      workshop,
      amount: amount.toString(),
      work_type: workType,
      note_hash: note,
      owner_at_claim: signer,
      prev_last_claim_at_ns: prev,
      timestamp_ns: now.toString(),
      block_height: this.height.toString(),
      status: failed ? "Failed" : "Paid",
    });
    return null;
  }

  private transfer(args: Record<string, unknown>, signer: string, depositYocto: string): unknown {
    const tokenId = String(args.token_id ?? "");
    const token = this.tokens.get(tokenId);
    if (!token) {
      panic("Token not found");
    }
    this.requireOneYocto(depositYocto);
    if (signer !== token.ownerId) {
      panic("Not owner");
    }
    const receiver = String(args.receiver_id ?? "");
    if (receiver.length === 0) {
      panic("Not owner");
    }
    token.ownerId = receiver;
    token.listed = false;
    token.asset.holder_total += 1;
    token.holders.push({
      owner: receiver,
      since_ns: nowNs(),
      balance_at_transfer: token.asset.balance,
    });
    if (token.holders.length > 50) {
      token.holders.shift();
    }
    return null;
  }

  private expire(args: Record<string, unknown>): string {
    const tokenId = String(args.token_id ?? "");
    const token = this.tokens.get(tokenId);
    if (!token) {
      panic("Token not found");
    }
    if (BigInt(nowNs()) < BigInt(token.asset.expiry_ns)) {
      panic("Not yet expired");
    }
    if (token.asset.pending_refund !== null) {
      return "0";
    }
    const amount = token.asset.balance;
    if (amount === "0" && token.asset.status === "Expired") {
      return "0";
    }
    token.asset.status = "Expired";
    if (amount === "0") {
      return "0";
    }
    token.asset.balance = "0";
    token.asset.pending_refund = amount;
    return amount;
  }
}
