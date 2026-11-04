import { formatNear } from "./near/amounts";
import type { ServiceRecord } from "./near/types";
import { formatTimeNs } from "./near/time";

export function refundLine(pending: string | null): string | null {
  if (pending === null) {
    return null;
  }
  return `Refund in flight: ${formatNear(pending)}`;
}

/** Spec 8.2. A null clock means a claim is possible now. */
export function nextClaimText(nextClaimNs: string | null): string {
  if (nextClaimNs === null) {
    return "Next claim: possible now";
  }
  return `Next claim possible at ${formatTimeNs(nextClaimNs)}`;
}

/** Spec 8.5 / S17. The sell dialog always includes this phrase. */
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
