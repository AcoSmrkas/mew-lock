# MewLock x Lithos (LIT lock campaign)

Users lock LIT for a fixed number of blocks and get a reward that is fixed at
the moment they lock and paid out, with their LIT, when the lock ends. There
are no admin keys anywhere.

## Contracts (`contracts/`, compiled as ErgoTree v1)

**campaign.es**: one singleton box per campaign.

- tokens: `[campaign NFT, position markers, LIT budget]`, R4 = `V` (BigInt).
- **Lock** (between `start` and `end`): creates exactly one position in
  `OUTPUTS(1)`, releases one marker, and pays
  `reward <= B * w / (V + w)` with `w = principal * blocks * boostBps`. The
  successor has `B - reward` and `V + w`.
- **Top-up** (until `end`, anyone): adds LIT and/or ERG; nothing else changes.
- **Sweep** (after `end + grace`, anyone): all LIT and ERG go to the fee
  address baked in at compile time; the NFT and markers are burned.

**position.es**: `proveDlog(R4) && HEIGHT >= R5`. Nothing else, so a position
can never get stuck. R6..R8 hold principal, reward and tier for display.

Everything is a compile-time constant: LIT id, fee address, start/end/grace,
tiers and boosts, minimum lock. A change means a new campaign.

### Why this curve

`B * V` never grows through locks, so the budget can't be over-committed, and
splitting one lock into several never earns more (floor rounding makes it
slightly worse). The rate for new locks falls as more weight is locked. The
starting `V` sets the base APR, see `initialVirtualWeight` in `math.ts`, and is
also the whale knob: locking weight equal to `V0` takes half the budget. The
curve never spends the whole budget, so there is always a leftover for the
sweep, and it grows when participation is low.

## Code

| file | what |
|---|---|
| `math.ts` | the curve in BigInt, identical to the contract |
| `params.ts` | campaign parameters + validation (mainnet tiers capped at one year) |
| `compile.ts` | compiles both contracts; tests and scripts only, the app reads pinned trees |
| `boxes.ts` | parse and authenticate campaign/position boxes against a deployment |
| `txs.ts` | builders: mint, create, lock, unlock, top-up, sweep |
| `deployment.ts` | the pinned result of a genesis (`deployments/<network>.json`) |

A position is genuine only if it sits at `positionTree` and holds exactly one
`markerId`. A campaign box is genuine only if it holds `campaignNftId`.
Anyone can create boxes at either address, so never trust the address alone.

## Tests

```
npx vitest run src/lib/lithos/
```

- `lithos.test.ts`: 35 mock-chain (sigmastate) cases. Every attack is a real
  builder transaction with one thing tampered. It must be rejected with
  "Script reduced to false", and the untampered original must then pass.
- `sigmaRust.test.ts`: the same transactions signed by sigma-rust 0.28, the
  engine in Nautilus and the ErgoPay relay. **Known divergence:** sigma-rust
  signs a lock whose position R4 holds the right bytes as the wrong type;
  sigmastate throws, so nodes reject it. Nothing bad can reach the chain.

## Testnet runner

```
npx vite-node scripts/lithos/testnet.ts wallet     # addresses + balances
npx vite-node scripts/lithos/testnet.ts deploy     # tLIT, markers, NFT, 45-block campaign
npx vite-node scripts/lithos/testnet.ts scenario   # locks, top-up, refusals, unlocks, sweep
```

It uses a throwaway testnet key in `/.testnet/` (gitignored), signs with
sigma-rust and broadcasts through public testnet nodes.

## Before mainnet

- Decide: budget, campaign length (`start`/`end`/`grace`), tiers and boosts,
  minimum lock, starting base APR (sets `V0`).
- Fee address for the sweep: Mew devs' fee address (decided); needs the
  exact address.
- Genesis on mainnet must be signed by a wallet, not a script. Nobody should
  put a mainnet seed into a runner.
- External review of `campaign.es` before any budget goes in.
