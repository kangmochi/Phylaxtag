/** Display only. Sub-millisecond rounding is not used for comparisons. */

export function formatTimeNs(ns: string): string {
  const ms = BigInt(ns) / 1_000_000n;
  if (ms > BigInt(Number.MAX_SAFE_INTEGER)) {
    return `${ns} ns`;
  }
  const date = new Date(Number(ms));
  if (Number.isNaN(date.getTime())) {
    return `${ns} ns`;
  }
  return date.toISOString().replace("T", " ").replace(".000Z", " UTC").replace("Z", " UTC");
}

export function nsFromNow(deltaMs: bigint): string {
  return (BigInt(Date.now()) * 1_000_000n + deltaMs * 1_000_000n).toString();
}

export function nowNs(): string {
  return (BigInt(Date.now()) * 1_000_000n).toString();
}
