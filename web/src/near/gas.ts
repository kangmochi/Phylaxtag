/**
 * Gas attached by the web app. Unused gas is refunded by the network.
 *
 * Measured mint burn on 4 November 2026 (Asia/Jakarta), sandbox, contract
 * receipt that logged `nft_mint` and `warranty_funded`: 3_633_924_445_063 gas
 * (3.634 TGas). Mint has no callback. The app attaches 15 TGas.
 *
 * `pay_service` and `expire` each schedule a 5 TGas callback. The highest
 * measured pair is about 8.22 TGas (`pay_service` 3.22 plus the callback).
 * Spec 8.3 says to attach a fixed value well above 10 TGas. The app attaches
 * 30 TGas to `pay_service`, `expire`, and `nft_transfer`. The transfer burn
 * was not measured in this task; 30 TGas is the same headroom, not a measured
 * transfer figure.
 */

export const MINT_GAS = "15000000000000";
export const CALL_GAS = "30000000000000";
export const ONE_YOCTO = "1";
