/**
 * Mint storage deposit from spec 8.3 and 5.4.
 *
 * The contract has no quote view. The base is the measured pair spec 8.3 adds:
 * 1,416 bytes written by mint plus 27,218 bytes of prepaid extra for a
 * 7-character issuer = 28,634 bytes = 0.28634 NEAR, at 10^19 yoctoNEAR per byte.
 *
 * On top of that:
 * - 2,000 bytes (0.02 NEAR) for metadata longer than the measured title and
 *   description. If the form is longer still, the extra bytes are added too.
 * - Owner-id growth above the 7-character case: the owner id is stored twice,
 *   so each byte shorter than 7 adds 2 bytes. A longer issuer is already
 *   inside the 27,218 figure.
 * - Each workshop after the first adds 4 bytes plus the account id length
 *   (the Borsh string prefix and body). The measured mint had one workshop.
 * - A token id longer than `EB-001` (6 bytes) adds the extra bytes.
 *
 * Unused storage deposit is refunded by the contract. The worst-case record
 * prepay is not refunded.
 */

import { parseNearInput } from "./amounts";

export const STORAGE_BYTE_COST = 10n ** 19n;
export const MEASURED_MINT_BYTES = 1_416n;
export const MEASURED_PREPAY_BYTES = 27_218n;
export const METADATA_MARGIN_BYTES = 2_000n;
const MEASURED_METADATA_BYTES = 13n + 26n;
const MEASURED_TOKEN_ID_BYTES = 6n;

export interface DepositInput {
  issuerAccountId: string;
  tokenId: string;
  fundNear: string;
  title: string;
  description: string;
  extra: string;
  workshops: string[];
}

export interface DepositEstimate {
  fundYocto: bigint;
  storageBytes: bigint;
  storageYocto: bigint;
  attachedYocto: bigint;
}

function utf8Length(value: string): bigint {
  return BigInt(new TextEncoder().encode(value).length);
}

export function estimateMintDeposit(input: DepositInput): DepositEstimate {
  const fundYocto = parseNearInput(input.fundNear);
  const issuerLen = utf8Length(input.issuerAccountId.trim());
  const ownerExtra = issuerLen < 7n ? (7n - issuerLen) * 2n : 0n;
  const metaBytes =
    utf8Length(input.title) + utf8Length(input.description) + utf8Length(input.extra);
  const metaExtra = metaBytes > MEASURED_METADATA_BYTES ? metaBytes - MEASURED_METADATA_BYTES : 0n;
  const margin = metaExtra > METADATA_MARGIN_BYTES ? metaExtra : METADATA_MARGIN_BYTES;
  let workshopExtra = 0n;
  input.workshops.slice(1).forEach((workshop) => {
    const id = workshop.trim();
    if (id.length > 0) {
      workshopExtra += 4n + utf8Length(id);
    }
  });
  const tokenLen = utf8Length(input.tokenId.trim());
  const tokenExtra = tokenLen > MEASURED_TOKEN_ID_BYTES ? tokenLen - MEASURED_TOKEN_ID_BYTES : 0n;
  const storageBytes =
    MEASURED_MINT_BYTES + MEASURED_PREPAY_BYTES + margin + ownerExtra + workshopExtra + tokenExtra;
  const storageYocto = storageBytes * STORAGE_BYTE_COST;
  return {
    fundYocto,
    storageBytes,
    storageYocto,
    attachedYocto: fundYocto + storageYocto,
  };
}
