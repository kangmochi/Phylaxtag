import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { refundLine, nextClaimText, serviceOutcome } from "./copy";
import { formatNear, parseNearInput } from "./near/amounts";
import { estimateMintDeposit } from "./near/deposit";
import { KNOWN_PANICS, explainError } from "./near/errors";
import { asIntString, parseLosslessJson } from "./near/parse";
import { normalizeAssetView } from "./near/views";

describe("yocto formatting", () => {
  it("converts NEAR decimals without rounding", () => {
    expect(parseNearInput("10").toString()).toBe("10000000000000000000000000");
    expect(parseNearInput("2.5").toString()).toBe("2500000000000000000000000");
    expect(parseNearInput("0.000000000000000000000001").toString()).toBe("1");
    expect(formatNear("10000000000000000000000000")).toBe("10 NEAR");
    expect(formatNear(1n)).toBe("0.000000000000000000000001 NEAR");
  });
});

describe("lossless u64 parsing", () => {
  it("keeps a timestamp above the safe integer range", () => {
    const parsed = parseLosslessJson('{"expiry_ns":1793877585212666944,"cooldown_ns":2592000000000000}');
    const row = parsed as { expiry_ns: string; cooldown_ns: string | number };
    expect(row.expiry_ns).toBe("1793877585212666944");
    expect(asIntString(row.cooldown_ns)).toBe("2592000000000000");
    expect(String(row.expiry_ns)).not.toBe(String(Number(row.expiry_ns)));
  });

  it("reads the sandbox view fixture without rounding expiry", () => {
    const text = readFileSync(new URL("./test-wallet/fixtures/sandbox-views.json", import.meta.url), "utf8");
    const parsed = parseLosslessJson(text) as { get_asset: unknown };
    const asset = normalizeAssetView(parsed.get_asset);
    expect(asset?.display_status).toBe("Active");
    expect(asset?.asset.pending_refund).toBeNull();
    expect(asset?.asset.expiry_ns).toBe("1793877585212666944");
    expect(asset?.balance).toBe("10000000000000000000000000");
    expect(asset?.next_claim_ns).toBeNull();
  });
});

describe("status and refund display", () => {
  it("shows the contract status and a refund in flight", () => {
    expect(refundLine(null)).toBeNull();
    expect(refundLine("8000000000000000000000000")).toBe("Refund in flight: 8 NEAR");
    expect(nextClaimText(null)).toBe("Next claim: possible now");
    expect(nextClaimText("1700000000000000000")).toContain("Next claim possible at ");
    expect(serviceOutcome("Failed")).toBe("Payment failed, money returned to the warranty fund");
    expect(serviceOutcome("Paid")).toBe("Paid");
    expect(serviceOutcome("Pending")).toBe("Pending");
  });
});

describe("panic strings", () => {
  it("maps every spec 8.4 string and keeps unknown text", () => {
    expect(KNOWN_PANICS).toContain("Over cap");
    expect(KNOWN_PANICS).toContain("Not yet expired");
    expect(explainError("Smart contract panicked: Over cap")).toEqual({
      plain: "That amount is over the per-claim cap.",
      original: "Over cap",
    });
    expect(explainError("execution failed: Not yet expired")).toEqual({
      plain: "This warranty has not expired yet.",
      original: "Not yet expired",
    });
    expect(explainError("something else")).toEqual({
      plain: "something else",
      original: "something else",
    });
  });
});

describe("deposit estimate", () => {
  it("uses the measured base plus the 2000 byte metadata margin", () => {
    const estimate = estimateMintDeposit({
      issuerAccountId: "charlie",
      tokenId: "EB-001",
      fundNear: "10",
      title: "E-bike EB-001",
      description: "Warranty NFT for one e-bike",
      extra: "",
      workshops: ["workshop.test"],
    });
    expect(estimate.storageBytes).toBe(1_416n + 27_218n + 2_000n);
    expect(estimate.storageYocto).toBe(estimate.storageBytes * 10n ** 19n);
    expect(estimate.attachedYocto).toBe(parseNearInput("10") + estimate.storageYocto);
  });

  it("adds owner growth for an issuer shorter than 7 bytes", () => {
    const estimate = estimateMintDeposit({
      issuerAccountId: "ab",
      tokenId: "EB-001",
      fundNear: "1",
      title: "E-bike EB-001",
      description: "Warranty NFT for one e-bike",
      extra: "",
      workshops: ["workshop.test"],
    });
    expect(estimate.storageBytes).toBe(1_416n + 27_218n + 2_000n + 10n);
  });
});
