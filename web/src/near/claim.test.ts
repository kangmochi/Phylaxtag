import { describe, expect, it } from "vitest";

import {
  claimBlock,
  claimProblemMessage,
  cooldownLabel,
  cooldownText,
  maxClaimableYocto,
  prefillAmount,
  secondsUntil,
} from "./claim";
import type { AssetView } from "./types";

const NEAR = 10n ** 24n;

function view(overrides: Partial<AssetView["asset"]> & { balance?: string; status?: AssetView["status"]; next_claim_ns?: string | null } = {}): AssetView {
  const asset = {
    issuer: "issuer.test",
    serial_hash: "a".repeat(64),
    balance: overrides.balance ?? (7n * NEAR / 10n).toString(),
    expiry_ns: "9999999999999999999",
    claim_cap: (3n * NEAR / 10n).toString(),
    cooldown_ns: "60000000000",
    last_claim_at_ns: null,
    workshops: ["ws-a.test"],
    status: "Active" as const,
    holder_total: 1,
    holder_next: 1,
    pending_refund: null,
    ...overrides,
  };
  return {
    asset,
    owner_id: "alice.test",
    balance: asset.balance,
    status: overrides.status ?? "Active",
    display_status: overrides.status === "Expired" ? "Expired" : "Active",
    next_claim_ns: overrides.next_claim_ns ?? null,
  };
}

describe("claim prefill", () => {
  it("uses the per-claim cap when the fund is larger", () => {
    expect(maxClaimableYocto(view({ balance: (10n * NEAR).toString() }))).toBe(3n * NEAR / 10n);
  });

  it("uses the remaining fund when it is smaller than the cap", () => {
    expect(maxClaimableYocto(view({ balance: (5n * NEAR / 100n).toString() }))).toBe(5n * NEAR / 100n);
  });

  it("prints at most four decimals and trims zeros", () => {
    expect(prefillAmount(3n * NEAR)).toBe("3");
    expect(prefillAmount(7n * NEAR / 10n)).toBe("0.7");
    expect(prefillAmount(49999999999999999999999n)).toBe("0.0499");
    expect(prefillAmount(0n)).toBe("");
  });
});

describe("claim amount problems", () => {
  it("rejects an empty field", () => {
    expect(claimProblemMessage("", view())?.kind).toBe("empty");
  });

  it("rejects text that is not a number", () => {
    expect(claimProblemMessage("abc", view())?.kind).toBe("not-a-number");
  });

  it("rejects zero", () => {
    expect(claimProblemMessage("0", view())).toEqual({
      kind: "zero",
      message: "The amount must be more than 0 NEAR.",
    });
  });

  it("rejects an amount above the per-claim cap", () => {
    expect(claimProblemMessage("0.5", view())).toEqual({
      kind: "above-cap",
      message: "The amount is above the per-claim limit of 0.3 NEAR.",
    });
  });

  it("rejects an amount above the remaining fund", () => {
    const shower = view({ balance: (1n * NEAR / 10n).toString(), claim_cap: (3n * NEAR).toString() });
    expect(claimProblemMessage("0.5", shower)).toEqual({
      kind: "above-fund",
      message: "The amount is above the remaining fund of 0.1 NEAR.",
    });
  });

  it("accepts an amount inside the cap and the fund", () => {
    expect(claimProblemMessage("0.2", view())).toBeNull();
  });
});

describe("claim gate", () => {
  const now = 1_000n * 1_000_000_000n;

  it("blocks an expired warranty", () => {
    expect(claimBlock(view({ status: "Expired" }), now)).toEqual({
      kind: "expired",
      message: "This warranty has expired.",
    });
  });

  it("blocks an empty fund", () => {
    expect(claimBlock(view({ balance: "0" }), now)).toEqual({
      kind: "empty-fund",
      message: "The fund is empty.",
    });
  });

  it("blocks while the cooldown runs and reports the next claim", () => {
    const next = (now + 42n * 1_000_000_000n).toString();
    const block = claimBlock(view({ next_claim_ns: next }), now);
    expect(block?.kind).toBe("cooldown");
    if (block?.kind !== "cooldown") {
      throw new Error("expected a cooldown block");
    }
    expect(secondsUntil(block.nextClaimNs, now)).toBe(42);
    expect(cooldownLabel(block.nextClaimNs, now)).toMatch(/^Next claim available at \d{2}:\d{2}:\d{2} \(in 42 s\)$/);
  });

  it("says now instead of counting the last second", () => {
    const next = (now + 1n * 1_000_000_000n).toString();
    expect(cooldownLabel(next, now)).toBe("Next claim available now");
    expect(secondsUntil(next, now)).toBe(1);
    expect(cooldownLabel((now - 5n * 1_000_000_000n).toString(), now)).toBe("Next claim available now");
  });

  it("describes the on-chain cooldown in plain words", () => {
    expect(cooldownText("900000000000")).toEqual({ label: "15 minutes", demo: true });
    expect(cooldownText("60000000000")).toEqual({ label: "1 minute", demo: true });
    expect(cooldownText("45000000000")).toEqual({ label: "45 seconds", demo: true });
    expect(cooldownText("5400000000000")).toEqual({ label: "1 hour 30 minutes", demo: false });
    expect(cooldownText("86400000000000")).toEqual({ label: "1 day", demo: false });
    expect(cooldownText("172800000000000")).toEqual({ label: "2 days", demo: false });
  });

  it("allows a claim when nothing blocks it", () => {
    expect(claimBlock(view({ next_claim_ns: (now - 1_000_000_000n).toString() }), now)).toBeNull();
  });
});
