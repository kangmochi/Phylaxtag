/**
 * NEAR account id rules, checked before the wallet opens.
 *
 * The contract takes `Vec<AccountId>`; if one entry is not a valid account id the
 * SDK cannot read the arguments at all, so the call traps before any of the
 * contract's own checks run and the wallet only shows a VM trap. Catching it here
 * turns that into a sentence.
 */

/** Lowercase named account, with dots for sub-accounts and `-`/`_` inside a part. */
const NAMED = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/** An implicit account: the 64-hex public key written out. */
const IMPLICIT = /^[0-9a-f]{64}$/;

export function isNearAccountId(value: string): boolean {
  const id = value.trim();
  if (id.length < 2 || id.length > 64) {
    return false;
  }
  return IMPLICIT.test(id) || NAMED.test(id);
}
