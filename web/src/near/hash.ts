function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Salt must be an even-length hex string");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomSaltHex(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice());
  return bytesToHex(new Uint8Array(digest));
}

/** `sha256(salt || serial)`. The salt and the serial stay in the browser. */
export async function serialHash(saltHex: string, serial: string): Promise<string> {
  const salt = hexToBytes(saltHex.trim());
  const serialBytes = new TextEncoder().encode(serial);
  const joined = new Uint8Array(salt.length + serialBytes.length);
  joined.set(salt, 0);
  joined.set(serialBytes, salt.length);
  return sha256Hex(joined);
}

/** SHA-256 of the note text, 64 lowercase hex characters. */
export async function noteHash(note: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(note));
}
