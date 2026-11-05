import { formatNear, parseNearInput } from "./amounts";
import type { AssetView } from "./types";

const YOCTO_PER_NEAR = 10n ** 24n;
/** Prefill precision. More decimals than this is noise for a claim amount. */
const PREFILL_DECIMALS = 4;

/** The largest amount the holder can claim right now: cap and remaining fund. */
export function maxClaimableYocto(asset: AssetView): bigint {
  const cap = BigInt(asset.asset.claim_cap);
  const balance = BigInt(asset.balance);
  return cap < balance ? cap : balance;
}

/**
 * Prefill text for the amount field: the claimable maximum, cut to four
 * decimals and with trailing zeros removed (`0.7`, `3`, `0.0499`).
 */
export function prefillAmount(maxYocto: bigint): string {
  if (maxYocto <= 0n) {
    return "";
  }
  const whole = maxYocto / YOCTO_PER_NEAR;
  const frac = (maxYocto % YOCTO_PER_NEAR)
    .toString()
    .padStart(24, "0")
    .slice(0, PREFILL_DECIMALS)
    .replace(/0+$/, "");
  return frac.length > 0 ? `${whole.toString()}.${frac}` : whole.toString();
}

export type ClaimProblem =
  | "empty"
  | "not-a-number"
  | "zero"
  | "above-cap"
  | "above-fund";

/** Human-readable reason for a claim amount the contract would reject. */
export function claimProblemMessage(input: string, asset: AssetView): { kind: ClaimProblem; message: string } | null {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { kind: "empty", message: "Enter a NEAR amount." };
  }
  let yocto: bigint;
  try {
    yocto = parseNearInput(trimmed);
  } catch {
    return { kind: "not-a-number", message: "Enter a NEAR amount such as 0.2." };
  }
  if (yocto === 0n) {
    return { kind: "zero", message: "The amount must be more than 0 NEAR." };
  }
  const cap = BigInt(asset.asset.claim_cap);
  if (yocto > cap) {
    return { kind: "above-cap", message: `The amount is above the per-claim limit of ${formatNear(cap)}.` };
  }
  const balance = BigInt(asset.balance);
  if (yocto > balance) {
    return { kind: "above-fund", message: `The amount is above the remaining fund of ${formatNear(balance)}.` };
  }
  return null;
}

export type ClaimBlock =
  | { kind: "expired"; message: string }
  | { kind: "empty-fund"; message: string }
  | { kind: "cooldown"; message: string; nextClaimNs: string };

/**
 * Reasons the claim button must stay disabled, independent of the amount.
 * Ordered the way a holder would hit them: expired, then no money, then time.
 */
export function claimBlock(asset: AssetView, nowNs: bigint): ClaimBlock | null {
  if (asset.status === "Expired") {
    return { kind: "expired", message: "This warranty has expired." };
  }
  if (BigInt(asset.balance) === 0n) {
    return { kind: "empty-fund", message: "The fund is empty." };
  }
  const next = asset.next_claim_ns;
  if (next !== null && BigInt(next) > nowNs) {
    return { kind: "cooldown", message: "The cooldown has not finished yet.", nextClaimNs: next };
  }
  return null;
}

/** Seconds left before the next claim, never negative and rounded up. */
export function secondsUntil(nextNs: string, nowNs: bigint): number {
  const diff = BigInt(nextNs) - nowNs;
  if (diff <= 0n) {
    return 0;
  }
  return Number((diff + 999_999_999n) / 1_000_000_000n);
}

/** Local clock for the next claim, `HH:MM:SS`. */
export function clockOf(nextNs: string): string {
  const date = new Date(Number(BigInt(nextNs) / 1_000_000n));
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":");
}

/**
 * One line for the disabled button: the clock plus a live countdown. With a
 * second or less left the clock would only add noise, so it says "now".
 */
export function cooldownLabel(nextNs: string, nowNs: bigint): string {
  const seconds = secondsUntil(nextNs, nowNs);
  if (seconds <= 1) {
    return "Next claim available now";
  }
  return `Next claim available at ${clockOf(nextNs)} (in ${seconds} s)`;
}

function plural(count: bigint, unit: string): string {
  return `${count.toString()} ${unit}${count === 1n ? "" : "s"}`;
}

/**
 * The on-chain cooldown in plain words, built from the value itself:
 * `900000000000` becomes "15 minutes", `86400000000000` becomes "1 day".
 */
export function cooldownText(cooldownNs: string): { label: string; demo: boolean } {
  const total = BigInt(cooldownNs) / 1_000_000_000n;
  const demo = total < 3_600n;
  const days = total / 86_400n;
  const hours = (total % 86_400n) / 3_600n;
  const minutes = (total % 3_600n) / 60n;
  const seconds = total % 60n;
  const parts: string[] = [];
  if (days > 0n) {
    parts.push(plural(days, "day"));
  }
  if (hours > 0n) {
    parts.push(plural(hours, "hour"));
  }
  if (minutes > 0n) {
    parts.push(plural(minutes, "minute"));
  }
  if (seconds > 0n && days === 0n) {
    parts.push(plural(seconds, "second"));
  }
  return { label: parts.join(" ") || "no wait", demo };
}
