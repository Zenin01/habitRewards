# Stake & Sweat

Put your USDC where your mouth is. Players lock USDC to commit to a habit challenge. When it ends, an admin verifies who finished. Finishers get their stake back plus an equal share of everything the quitters staked. If nobody finishes, the admin recovers the pool.

Built with [Arc Studio](https://studio.arc.io)

## What you can do

- Players: join an open challenge by locking its USDC stake, then claim your payout if you were verified. If a challenge is cancelled you can refund your stake.
- Admin: create challenges, verify who completed after the finish, settle, cancel before the end, and recover the pool when nobody completed.
- Players can attach proof of their habit (a link or a short note) while a challenge is running. Submitting is free: it only needs a wallet signature. Only the player and the admin can see it.
- The admin sees each player's proof while verifying and can select everyone who sent proof in one tap.
- Anyone can settle a challenge once its verification window has passed.
- The admin is the wallet that deployed the arena contract. The admin cannot play in their own challenges.

## Tech stack

React, Vite, TypeScript, Tailwind CSS, wagmi, viem, ConnectKit. Solidity 0.8.28 with Foundry and OpenZeppelin. Network: Arc Testnet, token: USDC.

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://getfoundry.sh).

```bash
bun install
bun run dev
```

Open the app, connect a wallet on Arc Testnet and press Deploy arena. Your wallet becomes the admin. Use Copy invite link to send players to your arena.

Other commands:

```bash
bun run server            # run the proofs API on its own (bun run dev already serves it)
bun run contracts:build   # compile the contract
bun run contracts:test    # run the Foundry tests
bun run scripts/gen-contract.ts   # refresh src/contract/stakeSweat.ts after changing the contract
bun run check             # lint and typecheck
```

### Environment variables

- `VITE_STAKE_SWEAT_ADDRESS` (optional): contract address of the arena every visitor should use. Without it the app uses an invite link (`?arena=0x...`) or the arena saved in the visitor's browser.
- `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS` (optional outside Arc Studio): provisioned by Arc Studio. The proofs API uses them to read the chain, and falls back to the public Arc Testnet RPC without them.
- `PORT` (optional): port for `bun run server` (default 3001).

Submitted proofs are stored in `data/proofs.json` on the machine running the app. Back that file up if you care about it.
