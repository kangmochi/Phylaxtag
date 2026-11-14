import { describe, expect, it } from "vitest";

import { isNearAccountId } from "./account-id";

describe("isNearAccountId", () => {
  it("accepts the ids the demo uses", () => {
    expect(isNearAccountId("ws-a.phylaxtag-jiwoo-11041950.testnet")).toBe(true);
    expect(isNearAccountId("budi.test")).toBe(true);
    expect(isNearAccountId("my_account-1.testnet")).toBe(true);
    expect(isNearAccountId("a".repeat(64))).toBe(true);
  });

  it("rejects a label that is not an account", () => {
    // "E-bike" is the mistake a visitor made: uppercase letters are not allowed.
    expect(isNearAccountId("E-bike")).toBe(false);
    expect(isNearAccountId("E-bike.testnet")).toBe(false);
    expect(isNearAccountId("practice tag")).toBe(false);
    expect(isNearAccountId(".testnet")).toBe(false);
    expect(isNearAccountId("a")).toBe(false);
    expect(isNearAccountId("a".repeat(65))).toBe(false);
    expect(isNearAccountId("trailing-.testnet")).toBe(false);
  });
});
