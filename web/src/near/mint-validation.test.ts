import { describe, expect, it } from "vitest";

import { mintProblems, type MintDraft } from "./mint-validation";

const CONTRACT = "demo.phylaxtag-jiwoo-11041950.testnet";
const ISSUER = "issuer.phylaxtag-jiwoo-11041950.testnet";
const WS_A = "ws-a.phylaxtag-jiwoo-11041950.testnet";

function draft(over: Partial<MintDraft> = {}): MintDraft {
  return {
    tokenId: "EB-001",
    serial: "FRAME-0001",
    fundNear: "10",
    capNear: "0.3",
    cooldownSeconds: "60",
    expiryMinutes: "43200",
    workshops: [WS_A],
    issuerAccountId: ISSUER,
    contractId: CONTRACT,
    ...over,
  };
}

const fields = (value: MintDraft): string[] => mintProblems(value).map((problem) => problem.field);

describe("mint form checks", () => {
  it("accepts a complete form", () => {
    expect(mintProblems(draft())).toEqual([]);
  });

  it("asks for a token id and rejects one longer than 32 bytes", () => {
    expect(fields(draft({ tokenId: "  " }))).toContain("tokenId");
    expect(fields(draft({ tokenId: "x".repeat(33) }))).toContain("tokenId");
    expect(fields(draft({ tokenId: "x".repeat(32) }))).not.toContain("tokenId");
  });

  it("asks for the serial that stays off-chain", () => {
    expect(fields(draft({ serial: "" }))).toContain("serial");
  });

  it("rejects a zero fund and an unparsable amount", () => {
    expect(fields(draft({ fundNear: "0" }))).toContain("fund");
    expect(fields(draft({ fundNear: "abc" }))).toContain("fund");
  });

  it("rejects a cap above the fund and a zero cap", () => {
    expect(fields(draft({ capNear: "11" }))).toContain("cap");
    expect(fields(draft({ capNear: "0" }))).toContain("cap");
  });

  it("requires a positive cooldown and a positive expiry", () => {
    expect(fields(draft({ cooldownSeconds: "0" }))).toContain("cooldown");
    expect(fields(draft({ cooldownSeconds: "-5" }))).toContain("cooldown");
    expect(fields(draft({ expiryMinutes: "0" }))).toContain("expiry");
    expect(fields(draft({ expiryMinutes: "1.5" }))).toContain("expiry");
  });

  it("requires at least one workshop and rejects duplicates", () => {
    expect(fields(draft({ workshops: [] }))).toContain("workshops");
    expect(fields(draft({ workshops: [WS_A, WS_A] }))).toContain("workshops");
  });

  it("rejects the issuer and the contract as workshops", () => {
    expect(fields(draft({ workshops: [ISSUER] }))).toContain("workshops");
    expect(fields(draft({ workshops: [CONTRACT] }))).toContain("workshops");
  });
});
