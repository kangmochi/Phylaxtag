import { formatNear } from "./near/amounts";
import type { ServiceRecord } from "./near/types";
import { formatTimeNs } from "./near/time";

export function refundLine(pending: string | null): string | null {
  if (pending === null) {
    return null;
  }
  return `Refund in flight: ${formatNear(pending)}`;
}

/**
 * Never show a claim time that already passed:
 * a past clock on an open warranty means a claim is possible now.
 */
export function nextClaimText(
  nextClaimNs: string | null,
  options: { expired?: boolean; empty?: boolean; nowNs?: bigint } = {},
): string {
  if (options.expired) {
    return "Next claim: expired";
  }
  if (options.empty) {
    return "Next claim: —";
  }
  if (nextClaimNs === null) {
    return "Next claim: possible now";
  }
  const nowNs = options.nowNs ?? BigInt(Date.now()) * 1_000_000n;
  if (BigInt(nextClaimNs) <= nowNs) {
    return "Next claim: possible now";
  }
  return `Next claim possible at ${formatTimeNs(nextClaimNs)}`;
}

/** The sell dialog always includes this phrase, so the buyer sees it before signing. */
export function sellDisclosure(nextClaimNs: string | null): string {
  const when = nextClaimNs === null ? "possible now" : formatTimeNs(nextClaimNs);
  return `A seller can claim just before selling, so check next claim possible at: ${when}.`;
}

export function holderSummary(total: number): string {
  return `${total} transfers in total, showing the latest 50`;
}

export function serviceOutcome(status: ServiceRecord["status"]): string {
  if (status === "Failed") {
    return "Payment failed, money returned to the warranty fund";
  }
  if (status === "Paid") {
    return "Paid";
  }
  return "Pending";
}

export const GATE_MESSAGE = "Only the current holder can open this page";

/**
 * Table version of the same rule: the column header already says "Next claim",
 * so no repeated prefix.
 */
export function nextClaimShort(
  nextClaimNs: string | null,
  options: { expired?: boolean; empty?: boolean; nowNs?: bigint } = {},
): string {
  if (options.expired) {
    return "expired";
  }
  if (options.empty) {
    return "—";
  }
  if (nextClaimNs === null) {
    return "possible now";
  }
  const nowNs = options.nowNs ?? BigInt(Date.now()) * 1_000_000n;
  if (BigInt(nextClaimNs) <= nowNs) {
    return "possible now";
  }
  return formatTimeNs(nextClaimNs);
}

/**
 * A 1-2 character title is placeholder noise, not a name.
 */
export function itemName(title: string | null | undefined, tokenId: string): string {
  const clean = (title ?? "").trim();
  if (clean.length <= 2) {
    return `E-bike ${tokenId}`;
  }
  return clean;
}
