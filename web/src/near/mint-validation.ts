/**
 * Checks the mint form before the wallet opens.
 *
 * The contract rejects all of these anyway; doing it here saves a signature, a fee and a
 * round trip, and the messages match the contract's own wording.
 */

import { parseNearInput } from "./amounts";

export interface MintDraft {
  tokenId: string;
  serial: string;
  fundNear: string;
  capNear: string;
  cooldownSeconds: string;
  expiryMinutes: string;
  workshops: string[];
  issuerAccountId: string;
  contractId: string;
}

export interface MintProblem {
  field: string;
  message: string;
}

const byteLength = (value: string): number => new TextEncoder().encode(value).length;

function positiveWhole(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = BigInt(trimmed);
  return parsed > 0n ? parsed : null;
}

function nearAmount(value: string): bigint | null {
  try {
    return parseNearInput(value);
  } catch {
    return null;
  }
}

export function mintProblems(draft: MintDraft): MintProblem[] {
  const problems: MintProblem[] = [];

  const tokenId = draft.tokenId.trim();
  if (tokenId.length === 0) {
    problems.push({ field: "tokenId", message: "Enter a token id, for example EB-001." });
  } else if (byteLength(tokenId) > 32) {
    problems.push({ field: "tokenId", message: "A token id can be at most 32 bytes." });
  }

  if (draft.serial.trim().length === 0) {
    problems.push({ field: "serial", message: "Enter the serial that stays off-chain." });
  }

  const fund = nearAmount(draft.fundNear);
  if (fund === null || fund <= 0n) {
    problems.push({ field: "fund", message: "Enter a fund greater than 0 NEAR." });
  }

  const cap = nearAmount(draft.capNear);
  if (cap === null || cap <= 0n) {
    problems.push({ field: "cap", message: "Enter a per-claim cap greater than 0 NEAR." });
  } else if (fund !== null && cap > fund) {
    problems.push({ field: "cap", message: "The per-claim cap cannot be larger than the fund." });
  }

  if (positiveWhole(draft.cooldownSeconds) === null) {
    problems.push({ field: "cooldown", message: "Enter a cooldown in whole seconds, greater than 0." });
  }

  if (positiveWhole(draft.expiryMinutes) === null) {
    problems.push({ field: "expiry", message: "Enter an expiry in whole minutes, greater than 0." });
  }

  const workshops = draft.workshops.map((entry) => entry.trim()).filter(Boolean);
  if (workshops.length === 0) {
    problems.push({ field: "workshops", message: "Add at least one workshop account." });
  }
  const seen = new Set<string>();
  for (const workshop of workshops) {
    if (seen.has(workshop)) {
      problems.push({ field: "workshops", message: `${workshop} is listed twice.` });
      break;
    }
    seen.add(workshop);
  }
  if (draft.issuerAccountId.length > 0 && workshops.includes(draft.issuerAccountId)) {
    problems.push({ field: "workshops", message: "The issuer cannot be a workshop: the fund would pay itself." });
  }
  if (workshops.includes(draft.contractId)) {
    problems.push({ field: "workshops", message: "The contract account cannot be a workshop." });
  }

  return problems;
}
