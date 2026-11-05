/**
 * EVM wallets for the picker: the official selector module plus a wagmi config
 * with the connectors that the installed @wagmi/connectors actually exports.
 * Loaded only when the build has a WalletConnect project id, so a build
 * without it downloads none of this.
 */
import type { WalletModuleFactory } from "@near-wallet-selector/core";
import { setupEthereumWallets } from "@near-wallet-selector/ethereum-wallets";
import { createConfig, http } from "@wagmi/core";
import { mainnet } from "@wagmi/core/chains";
import { coinbaseWallet, metaMask, walletConnect } from "@wagmi/connectors";

/** Every EVM entry in the picker opens this one selector module. */
export const EVM_WALLET_MODULE_ID = "ethereum-wallets";

export function createEthereumWalletModule(projectId: string): WalletModuleFactory {
  const config = createConfig({
    chains: [mainnet],
    connectors: [
      metaMask(),
      coinbaseWallet({ appName: "Phylaxtag" }),
      // Rainbow, OKX, Zerion, Trust and Rabby all speak WalletConnect, so the
      // QR entry covers them even though @wagmi/connectors 5 ships no branded
      // connector for them.
      walletConnect({ projectId, showQrModal: false }),
    ],
    transports: { [mainnet.id]: http() },
  });

  return setupEthereumWallets({
    wagmiConfig: config,
    chainId: mainnet.id,
    alwaysOnboardDuringSignIn: false,
  }) as unknown as WalletModuleFactory;
}
