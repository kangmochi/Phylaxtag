import { describe, expect, it } from "vitest";

import { REASON_PREFIX, loggedRejection, rejectionReason } from "./rejection";

describe("rejection reasons", () => {
  it("reads the reason the contract logged", () => {
    expect(rejectionReason([`${REASON_PREFIX}Over cap`, "other log"])).toBe("Over cap");
  });

  it("ignores receipts without a reason", () => {
    expect(rejectionReason(["nft_mint", ""])).toBeNull();
    expect(rejectionReason(undefined)).toBeNull();
    expect(rejectionReason(null)).toBeNull();
  });

  it("finds the reason in any receipt of the outcome", () => {
    const outcome = {
      receipts_outcome: [
        { outcome: { logs: ["nft_transfer"] } },
        { outcome: { logs: [`${REASON_PREFIX}Not owner`] } },
      ],
    };
    expect(loggedRejection(outcome)).toBe("Not owner");
  });

  it("returns null when the outcome carries no logs at all", () => {
    expect(loggedRejection({ receipts_outcome: [] })).toBeNull();
    expect(loggedRejection(null)).toBeNull();
    expect(loggedRejection({})).toBeNull();
  });
});
