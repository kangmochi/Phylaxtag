/** 1 NEAR = 10^24 yoctoNEAR. All conversion uses integers. */

const YOCTO_PER_NEAR = 10n ** 24n;

export function parseYocto(value: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error("Amount is not a yoctoNEAR integer");
  }
  return BigInt(value);
}

/** Parse a NEAR decimal such as `10` or `2.5` into yoctoNEAR. At most 24 decimal places. */
export function parseNearInput(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a NEAR amount such as 10 or 2.5");
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > 24) {
    throw new Error("At most 24 decimal places");
  }
  return BigInt(whole) * YOCTO_PER_NEAR + BigInt(frac.padEnd(24, "0"));
}

/** Exact decimal, trailing zeros removed. `10000000000000000000000000` becomes `10 NEAR`. */
export function formatNear(yocto: bigint | string): string {
  const value = typeof yocto === "string" ? parseYocto(yocto) : yocto;
  const whole = value / YOCTO_PER_NEAR;
  const frac = (value % YOCTO_PER_NEAR).toString().padStart(24, "0").replace(/0+$/, "");
  const body = frac.length === 0 ? whole.toString() : `${whole.toString()}.${frac}`;
  return `${body} NEAR`;
}
