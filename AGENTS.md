# Stake & Sweat

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

Habit-staking app. Players lock USDC in a challenge; an admin (contract owner) verifies completions; finishers get stake plus an equal share of quitters' stakes; if nobody finishes the admin recovers the pool.

Contract: `contracts/StakeAndSweat.sol` (constructor: usdc, admin). Reviewed, Slither-checked, 62 Foundry tests pass. Fixed stake per challenge, 500 players max, admin cannot join, verification only between endTime and verifyDeadline, anyone can settle after verifyDeadline, owner can cancel before endTime (refunds).

Deployment model: the admin deploys from the browser (SetupCard) so the connected wallet is the owner; the platform deployer wallet is NOT used because it cannot call owner functions. Arena address resolution: `?arena=` query > `VITE_STAKE_SWEAT_ADDRESS` > localStorage. ABI/bytecode live in `src/contract/stakeSweat.ts` (regenerate with `bun run scripts/gen-contract.ts` after `forge build`).

Deployed arena address: not pinned yet (record here and in `.env` as VITE_STAKE_SWEAT_ADDRESS once chosen).

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep shareable state in the URL path or query, not in the `#fragment`.
- Never put a secret (private key, claim secret, seed phrase, session token, API key) in the URL path or query, encoded or not: every in-app path and query is mirrored to the visitor's studio.arc.io address bar and browser history and reaches servers. A bearer claim secret goes only in the `#fragment` appended to the share link (`` `${await buildShareLink('/claim')}#${secret}` ``) and is read from `location.hash` on load. A link to the app's own share URL shown inside the app must be copy-only or open in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Build every link a user copies or sends with `buildShareLink()` from `src/lib/share.ts`.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it; it keeps the Studio address bar in step with in-app navigation.
- Navigate inside the app with relative links.

## To Run

```bash
bun install
bun run dev
```

## Habit proofs (offchain)

- Players submit a link/note per challenge; admin reads it while verifying. Contract is unchanged.
- API: `server/api.ts` (`POST /api/proofs/submit`, `POST /api/proofs/list`). Served inside the Vite dev server by `server/vitePlugin.ts`, or standalone with `bun run server`.
- Auth is wallet signatures (message formats in `src/lib/proofAuth.ts`). Submit requires the signer to have joined onchain and the challenge to be Active before its verify deadline. List: the contract owner sees all proofs, anyone else only their own.
- Storage: `data/proofs.json` (atomic writes, max 5 proofs per player per challenge, 500 chars each). No database, so it is not shared across hosts.
