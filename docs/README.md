# Phylaxtag documentation

The [README](../README.md) is the entry point: live demo, quick start, test commands and the
transfer rules. These files go deeper.

| File | What it covers |
| --- | --- |
| [SPEC.md](SPEC.md) | The design reference: actors, permissions, lifecycle, contract interface, enforced limits, storage accounting, events, standards, test coverage, web app contract, honest limits |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the contract, the web app and the sandbox tests fit together, including the file map and the build pipeline |
| [THREAT_MODEL.md](THREAT_MODEL.md) | How a seller could try to keep the money or the access after a sale, the mitigation for each attempt, and the residual risks |
| [DECISIONS.md](DECISIONS.md) | Pinned crate, toolchain and npm versions, why those versions, and the measured gas and storage numbers |
| [TESTNET_DEPLOY_GUIDE.md](TESTNET_DEPLOY_GUIDE.md) | How the live testnet contract was created and deployed, the faucet notes, and how to mint and check a token |
| [screenshots/](screenshots/) | Seven pages captured from the live site on 6 November 2026 at a 1280×800 desktop viewport and a 375×812 phone viewport: home, asset, history, holder page, issuer, workshop, How it works |

The screenshots are viewport captures, not full-page images: each one shows what a visitor
sees before scrolling. They were taken against the deployed app, not a local build. The phone
images are captured at 2× device pixel density, so the files are 750 px wide.

Reading order for a review: README, then SPEC.md, then THREAT_MODEL.md. Every claim is backed
by a test or by a measurement recorded in DECISIONS.md; anything still unverified is labelled
as such in place.
