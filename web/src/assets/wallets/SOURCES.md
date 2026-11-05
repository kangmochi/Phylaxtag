# Wallet logo sources

Every file here is a local copy taken from the wallet's own website. They are
used only to identify the wallet in a list, at 24-28 px, and are not modified
beyond square scaling. Each logo stays the trademark of its owner; this project
claims no rights and no endorsement.

| File | Wallet | Source URL | Licence / permission | Notes |
|---|---|---|---|---|
| `metamask.svg` | MetaMask | https://metamask.io/favicons/default/favicon.svg | Official site asset, MetaMask brand guidelines apply | 2.1 KB, square |
| `here-wallet.svg` | HERE Wallet | https://www.herewallet.app/logo.162cb67d.svg | Official site asset, HERE brand guidelines apply | 1.3 KB, **wordmark** (96x21): rendered at 28 px height with its own width, not squashed into a square |
| `nightly.png` | Nightly | https://nightly.app/favicon.ico | Official site asset, Nightly brand guidelines apply | converted from their favicon, 64x64, 5.3 KB |
| `sender.png` | Sender | https://sender.org/assets/sender-bsk-NPUA.png | Official site asset, Sender brand guidelines apply | downscaled to 64x64, 4.2 KB |
| `intear-wallet.svg` | Intear Wallet | https://wallet.intear.tech/favicon.svg | Official site asset, Intear brand guidelines apply | 1.0 KB, square |
| `ledger.png` | Ledger | https://ledger-wp-website-s3-prd.ledger.com/uploads/2021/11/Ledger_favicon.png | Official site asset, Ledger brand guidelines apply | downscaled to 64x64, **recoloured to white** because the official mark is pure black and disappeared on the dark picker |
| `meteor.png` | Meteor Wallet | https://wallet.meteorwallet.app/assets/apple-touch-icon-DppH1GGq.png | Official site asset, Meteor Wallet brand guidelines apply | 180x180 PNG, square |
| `mynear-wallet.svg` | MyNearWallet | https://app.mynearwallet.com/favicon.835e09ad.svg | Official site asset, MyNearWallet brand guidelines apply | 80x92 vector, shown at 28 px height (retired wallet, table and strip only) |
| `coinbase-wallet.png` | Coinbase Wallet | https://wallet.coinbase.com (site icon, fetched through Google's favicon service) | Official mark, Coinbase brand guidelines apply | 96x96 source downscaled to 64x64 |
| `walletconnect.png` | WalletConnect | https://walletconnect.com/favicon.ico | Official mark, WalletConnect brand guidelines apply | 32x32 source upscaled to 64x64 |

## Wallets that use the neutral initial badge instead

None right now: every listed wallet ships an official file. The neutral badge
stays in the code for wallets added later without a usable file, rather than
inventing a logo.

## Dropped wallets

- **Bitte Wallet** — removed from the picker, the strip and the table. Its site
  answers `402 Payment Required` and the app deployment is paused, so a visitor
  who picked it could not connect at all. Re-add the entry, the loader in
  `src/near/near-wallet.ts` and the logo here if the wallet comes back.
