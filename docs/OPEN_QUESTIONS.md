# OPEN_QUESTIONS — Phylaxtag docs, 5 Nov 2026 (Asia/Jakarta)

What is unverified, what must be confirmed by the project owner, and what changed after the drafts were checked against `main` = `6d4fcdd` and against the live testnet contract.

Status legend: **VERIFIED** (checked today, evidence named) · **OWNER DECIDES** (placeholder stays) · **UNVERIFIED** (no evidence yet).

## Must confirm (placeholders in the documents)

1. **AI-use disclosure wording** — **WRITTEN AND APPROVED by the owner, 5 Nov 2026**, in the README section "Team and AI disclosure": the contract, unit tests and sandbox tests by Cursor's coding agent; the web app by Jiwoo (Hermes agent); spec, schedule and submission text by Pharita (Grok agent). An earlier README revision said all code came from Cursor AI agents ("Cursor Grok 4.7") and that no other code-generation service was used; that sentence is replaced.
2. **Exact model names** — **DECIDED by the owner, 5 Nov 2026**: Jiwoo (Hermes agent) runs `deepseek-v4.1-flash` through OpenRouter, which is what the running config uses; Pharita is a Grok agent on xAI and names its exact version; the Cursor coding agent is described as "model as reported by the Cursor team", because an earlier README said "Cursor Grok 4.7" and nobody here can confirm that number.
3. **Team size** — **DECIDED by the owner, 5 Nov 2026**: **3 members** (1 human lead + 2 AI agents). The submission form has no value `3`, so the `size` field is `2 - 4`; every document states "3 members" explicitly so the range is never read as three humans.
4. **Team lead name** — **DECIDED by the owner, 5 Nov 2026**: `pranesta kresa` (human lead). Members: Pharita (AI agent), Jiwoo (AI agent). Correct the lead name here if the submission should use a different legal name.
5. **Mainnet payout address** — **OWNER DECIDES**. Not created, not in any document. Do not invent one.
6. **Licence** — **VERIFIED**: `LICENSE` is MIT, "Copyright (c) 2026 mochii".

## Checked in this pass

7. **Faucet amount** — **UNVERIFIED**. The CLI `sponsor-by-faucet-service` path has credited about 10 NEAR in practice; docs.near.org lists a smaller, rate-limited amount. The guide tells the reader to read the balance instead of trusting a number.
8. **PR #9 (EVM wallets, logos, WalletConnect)** — **VERIFIED as merged** (`main` = `6d4fcdd`, "Add more wallet options and group the wallet list (#9)"). Still **not verified** in behaviour: no EVM sign-in, no meta-transaction, no EVM claim.
9. **`VITE_WALLETCONNECT_PROJECT_ID` on production** — **VERIFIED absent**: the live picker at https://phylaxtag.vercel.app shows only "NEAR wallets" at 1280 px and 375 px, so the EVM group is not enabled in the current production build. Enable it in Vercel (Production) and redeploy if the demo needs EVM entries.
10. **Exact Vercel env values** — **UNVERIFIED**: project settings were not readable from here. What is verified in code: `VITE_CONTRACT_ID`, `VITE_NETWORK_ID` and `VITE_RPC_URL` are required at build time, and `VITE_RPC_FALLBACK_URL` defaults to `https://rpc.testnet.fastnear.com`.
11. **EB-005 remaining balance** — **VERIFIED**: fund 0.7 NEAR, cap 0.3 NEAR, cooldown 900 s, one Paid record (ws-a, `brakes`, 2026-11-05 06:05:37Z), owner `pinkflower5746.testnet`, expiry 2030-01-01T00:00:00Z.
12. **EB-004 balance** — **VERIFIED**: fund 0.05 NEAR, cap 0.3 NEAR, cooldown 60 s, 5 claims, owner `pinkflower5746.testnet`.
13. **"14/14 red-team attempts rejected"** — **UNVERIFIED**: no artifact in the repository. Documents say "simulation only, not an audit"; keep that qualifier or drop the number.
14. **README said "no testnet deploy yet"** — fixed in this change: it now lists the live contract, the web URL and the demo tokens.
15. **Spec v3.8 markdown vs the PDFs** — **UNVERIFIED**: v3.8 exists only as draft text; the repository still ships v3.4–v3.7 PDFs. Any v3.8 file in this branch is draft text, not camera-ready.
16. **X handle / phylaxtag.com** — **UNVERIFIED**: still listed as "to be registered"; no DNS record found for the domains.
17. **Node version on Vercel** — **PARTLY VERIFIED**: `web/package.json` says `engines.node >= 24` and `web/.nvmrc` pins 26.13.0; the Vercel runtime version was not readable.
18. **Disconnect timeout** — **VERIFIED**: `web/src/near/near-wallet.ts` clears the local session, then races `signOut()` against a 3,000 ms timer.
19. **Web test counts** — **VERIFIED, supersedes the earlier checklist figures**: `npm test` = 56 Vitest tests, `npm run e2e` = 26 Playwright tests on `6d4fcdd`. The 7/3 and 33/18 figures in older notes are stale.
20. **Above-cap issuer approval** — **VERIFIED absent** from the contract and from the spec's MVP scope; described as future work only.

## Out of scope for this change

- No contract code, no CI workflow, no Vercel setting touched.
- No keys, seeds or tokens printed, embedded or committed.
- No invented mainnet address, audit claim, ranking language, or "first"/"insured"/"insurance" wording.
