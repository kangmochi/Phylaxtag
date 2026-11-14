import { describe, expect, it } from "vitest";

import { explainError } from "./errors";

describe("explainError", () => {
  it("maps a wallet's bare failure sentence to something actionable", () => {
    const explained = explainError("Transaction failed");
    expect(explained.plain).toContain("no reason");
    expect(explained.plain).toContain("account id");
  });

  it("keeps a specific contract panic ahead of the generic sentence", () => {
    // The wallet often puts both in one string; the specific reason wins.
    expect(explainError("Transaction failed: Over cap").plain).toBe("That amount is over the per-claim cap.");
  });
});
