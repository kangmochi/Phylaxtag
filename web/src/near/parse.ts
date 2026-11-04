/**
 * Contract views return u64 nanoseconds as JSON numbers. Values above 2^53
 * are not safe in JavaScript, so those integers are quoted before JSON.parse.
 * Shorter integers stay numbers and are still exact.
 */

const BIG_INT = /(?<=[:[,]\s*)(-?\d{16,})(?=\s*[,\]}])/g;

export function parseLosslessJson(text: string): unknown {
  return JSON.parse(text.replace(BIG_INT, '"$1"'));
}

/** Normalize a u64 that may arrive as a number (safe range) or a string. */
export function asIntString(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error("Integer was rounded before it could be read");
    }
    return String(value);
  }
  if (!/^\d+$/.test(value)) {
    throw new Error("Integer is not a decimal string");
  }
  return value;
}
