/**
 * The contract builds with `panic = "abort"`, so the panic text is dropped and the wallet
 * only sees a VM trap. Every rejection is logged first as `Phylaxtag error: <reason>`;
 * this module reads that line back out of the transaction outcome.
 */

export const REASON_PREFIX = "Phylaxtag error: ";

/** The reason in one receipt's logs, if it carries one. */
export function rejectionReason(logs: readonly string[] | undefined | null): string | null {
  if (!logs) {
    return null;
  }
  for (const line of logs) {
    if (line.startsWith(REASON_PREFIX)) {
      return line.slice(REASON_PREFIX.length).trim() || null;
    }
  }
  return null;
}

interface ReceiptLike {
  outcome?: { logs?: string[] } | null;
}

interface OutcomeLike {
  receipts_outcome?: ReceiptLike[] | null;
}

/** The first logged reason anywhere in the transaction outcome. */
export function loggedRejection(outcome: OutcomeLike | null | undefined): string | null {
  const receipts = outcome?.receipts_outcome ?? [];
  for (const receipt of receipts) {
    const reason = rejectionReason(receipt?.outcome?.logs);
    if (reason) {
      return reason;
    }
  }
  return null;
}
