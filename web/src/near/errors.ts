/** Spec 8.4. Longer strings are matched first so one panic is not hidden by a shorter one. */

const PANIC_PLAIN: ReadonlyArray<readonly [string, string]> = [
  ["Requires attached deposit of exactly 1 yoctoNEAR", "This action needs a deposit of exactly 1 yoctoNEAR."],
  ["Amount must be > 0", "Enter an amount greater than 0."],
  ["Workshop not approved", "That workshop is not on the allowlist."],
  ["Cannot pay yourself", "The owner cannot be the workshop that gets paid."],
  ["Insufficient balance", "The warranty fund does not have that much left."],
  ["Not an approved issuer", "This account is not an allowlisted issuer."],
  ["Cooldown must be > 0", "The cooldown must be greater than 0."],
  ["Serial already used", "This issuer already used that serial hash."],
  ["Bad workshop list", "The workshop list is empty, has a duplicate, or includes the issuer or the contract."],
  ["Deposit too small", "The attached deposit is smaller than the fund plus storage."],
  ["Not yet expired", "This warranty has not expired yet."],
  ["Token not found", "No warranty exists with this id."],
  ["Token is listed", "This item is listed for sale, so a service payment is blocked."],
  ["Cooldown active", "The cooldown has not finished yet."],
  ["Bad serial_hash", "The serial hash must be 64 lowercase hex characters."],
  ["Bad work_type", "The work type must be 32 bytes or shorter."],
  ["Bad note_hash", "The note hash must be 64 lowercase hex characters."],
  ["History full", "The service history already has 50 records."],
  ["Token exists", "A warranty with this id already exists."],
  ["Bad token_id", "The token id must be 1 to 32 bytes."],
  ["Not owner", "Only the current holder can do that."],
  ["Bad expiry", "The expiry must be in the future."],
  ["Over cap", "That amount is over the per-claim cap."],
  ["Bad cap", "The cap must be greater than 0 and no more than the fund."],
  ["Expired", "This warranty has expired."],
];

export interface ExplainedError {
  plain: string;
  original: string;
}

export function explainError(raw: string): ExplainedError {
  for (const [panic, plain] of PANIC_PLAIN) {
    if (raw.includes(panic)) {
      return { plain, original: panic };
    }
  }
  return { plain: raw, original: raw };
}

export const KNOWN_PANICS: readonly string[] = PANIC_PLAIN.map(([panic]) => panic);
