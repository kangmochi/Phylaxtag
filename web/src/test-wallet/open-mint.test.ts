import { describe, expect, it } from "vitest";

import { FakeContract } from "./fake-contract";

const SERIAL = "b".repeat(64);

function args(over: Record<string, unknown> = {}) {
  return {
    serial_hash: SERIAL,
    fund_amount: "500000000000000000000000",
    claim_cap: "250000000000000000000000",
    cooldown_ns: "60000000000",
    workshops: ["ws-a.practice.testnet"],
    metadata: { title: "Practice tag", copies: 1 },
    ...over,
  };
}

describe("practice mint in the in-memory stand-in", () => {
  it("mints J-1 for an account that is not on the issuer allowlist", () => {
    const fake = new FakeContract("sandbox.practice.testnet");
    const minted = fake.call("mint_open", args(), "you.test", "500000000000000000000000") as { token_id: string; owner_id: string };
    expect(minted.token_id).toBe("J-1");
    expect(minted.owner_id).toBe("you.test");
    expect(fake.view("open_mint_used", { account_id: "you.test" })).toBe(true);
    expect(fake.view("open_mint_used", { account_id: "other.test" })).toBe(false);
  });

  it("sets the expiry to mint time plus thirty days", () => {
    const fake = new FakeContract("sandbox.practice.testnet");
    fake.call("mint_open", args(), "you.test", "500000000000000000000000");
    const view = fake.view("get_asset", { token_id: "J-1" }) as { asset: { expiry_ns: string } };
    const days =
      (BigInt(view.asset.expiry_ns) - BigInt(Date.now()) * 1_000_000n) / (86_400n * 1_000_000_000n);
    // The clock moves during the test, so allow a day either side.
    expect(days >= 29n && days <= 31n).toBe(true);
  });

  it("refuses a second tag from the same account", () => {
    const fake = new FakeContract("sandbox.practice.testnet");
    fake.call("mint_open", args(), "you.test", "500000000000000000000000");
    expect(() => fake.call("mint_open", args({ serial_hash: "c".repeat(64) }), "you.test", "500000000000000000000000")).toThrow(
      "One practice tag per wallet",
    );
  });

  it("stops at the hundredth tag", () => {
    const fake = new FakeContract("sandbox.practice.testnet");
    for (let index = 0; index < 100; index += 1) {
      const serial = index.toString(16).padStart(64, "0");
      fake.call("mint_open", args({ serial_hash: serial }), `user${index}.test`, "500000000000000000000000");
    }
    expect(fake.view("get_open_mint_info", {})).toMatchObject({ minted_total: 100, cap: 100 });
    expect(() => fake.call("mint_open", args({ serial_hash: "d".repeat(64) }), "late.test", "500000000000000000000000")).toThrow(
      "Practice cap reached",
    );
  });
});
