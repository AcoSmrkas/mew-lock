# MewLock campaigns (Lithos Lock is the first)

A campaign lets users lock asset A for a fixed number of blocks and earn asset
B. A and B are each any token or ERG, and may be the same (Lithos Lock is
LIT/LIT). The reward is fixed at the moment of locking and paid out, together
with the locked A, when the lock ends. There are no admin keys anywhere.

## Contracts (`contracts/`, compiled as ErgoTree v1)

**campaign.es**: one singleton box per campaign.

- tokens: `[campaign NFT, position markers]`, plus the budget token when B is
  a token. When B is ERG the budget is the box value minus `reserve`.
  R4 = `V` (BigInt).
- **Lock** (between `start` and `end`): creates exactly one position in
  `OUTPUTS(1)`, releases one marker, and pays
  `reward <= budget * w / (V + w)` with `w = principal * blocks * boostBps`.
  The successor has `budget - reward` and `V + w`. The position must hold
  exactly its marker, A and B (merged when they are the same token) and
  `deposit` + any ERG it locks or earns.
- **Top-up** (until `end`, anyone): adds budget and/or ERG; nothing else
  changes.
- **Sweep** (after `end + grace`, anyone): all ERG and every B token go to the
  fee address baked in at compile time; the NFT and markers are burned.

**position.es**: `proveDlog(R4) && HEIGHT >= R5`. Nothing else, so a position
can never get stuck. R6..R8 hold principal, reward and tier. The position
contract is the same for every campaign and asset mix.

Everything is a compile-time constant: A and B ids (empty = ERG), fee address,
start/end/grace, tiers and boosts, minimum lock, deposit, reserve. A change
means a new campaign. The first testnet campaigns ran a LIT-only version whose
positions are identical; `readDeployment` maps them onto this shape.

When A and B differ, `baseAprBps` and the rates are ratios of raw units, not a
price-based APR: the page shows "B per A per year" instead of a percentage.

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

- `lithos.test.ts`: 35 mock-chain (sigmastate) cases on LIT/LIT. Every attack
  is a real builder transaction with one thing tampered. It must be rejected
  with "Script reduced to false", and the untampered original must then pass.
- `modes.test.ts`: the same approach across all five asset modes (LIT/LIT,
  LIT/MEOW, ERG/LIT, LIT/ERG, ERG/ERG): exact lock, unlock payout, top-up and
  sweep, plus mode-specific attacks (over-curve reward, short A, drained
  budget, smuggled token, draining "top-up").
- `sigmaRust.test.ts`: the same transactions signed by sigma-rust 0.28, the
  engine in Nautilus and the ErgoPay relay, in every mode. **Known
  divergence:** sigma-rust signs a lock whose position R4 holds the right bytes
  as the wrong type; sigmastate throws, so nodes reject it (confirmed against a
  real testnet node). Nothing bad can reach the chain.

## Testnet runner

```
npx vite-node scripts/lithos/testnet.ts wallet [--slot N]
npx vite-node scripts/lithos/testnet.ts tokens                      # tLIT + tMEOW, once
npx vite-node scripts/lithos/testnet.ts fund-slot --slots 1,2,3     # parallel scenario wallets
npx vite-node scripts/lithos/testnet.ts deploy --slot N --stake lit|meow|erg --reward lit|meow|erg
npx vite-node scripts/lithos/testnet.ts scenario --slot N           # locks, top-up, refusals, unlocks, sweep
npx vite-node scripts/lithos/testnet.ts deploy --demo               # week-long campaign for the page
npx vite-node scripts/lithos/testnet.ts faucet 20                   # refill the page's test faucet
```

It uses a throwaway testnet key in `/.testnet/` (gitignored), signs with
sigma-rust and broadcasts through public testnet nodes. The page's in-browser
test wallet is proven separately by `scripts/lithos/testwallet-check.ts`.

### Testnet dry run, 2026-09-30: passed

A full campaign ran on the Ergo testnet (blocks 572970–573022): 10- and
20-block tiers at 1.0x / 1.5x, a 1M tLIT budget, and 50% starting base APR.
Every transaction was signed by sigma-rust and mined by the network.

| step | result | tx |
|---|---|---|
| create campaign | NFT + 1e9 markers + 1M tLIT, V0 5.256e24 | [8881daec](https://testnet.ergoplatform.com/en/transactions/8881daec52f1262ad78c41f591094ce1e92fe2d812e15e4c596d24dc45bd434d) |
| lock 100,000 tLIT, 10 blocks | reward 1.902583899 (49.99% APR) | [769ae194](https://testnet.ergoplatform.com/en/transactions/769ae19444b898097fee9dd95aee53b606b14cfdcc1ee316dc6ef11a3d17ac0e) |
| lock 50,000 tLIT, 20 blocks, for another user | reward 2.853862274 (74.99% APR) | [deab8124](https://testnet.ergoplatform.com/en/transactions/deab81245faee0bd65bfd11478a2054cb51c289d93dc24fa79224ba68c985202) |
| lock 500,000,000 tLIT (BigInt path) | reward 9,423.205163505 (49.52% APR) | [782016f2](https://testnet.ergoplatform.com/en/transactions/782016f2f208be26aaf3f83eba346e164ba8e96afe0ab1d90b140e230e89ed02) |
| top-up 10,000 tLIT | budget +10,000, V unchanged | [6f60afb5](https://testnet.ergoplatform.com/en/transactions/6f60afb5fdb3336f52e69a6ddf76262e69534e94299faaded6cbf95b9d4eb94e) |
| unlock the 100,000 position | owner +100,001.902583899 exactly | [80848dbe](https://testnet.ergoplatform.com/en/transactions/80848dbebfa0ee7d7f0600bdcc30d49f13494006608408b03863b0f2a6905fd1) |
| unlock the whale | owner +500,009,423.205163505 exactly | [919e0721](https://testnet.ergoplatform.com/en/transactions/919e0721e7d1c122ebbdcfefd8651fa97e51fcb02e5281cdafd32054545a8af4) |
| unlock the lock-for position, by its recipient | +50,002.853862274 exactly | [a389f426](https://testnet.ergoplatform.com/en/transactions/a389f4265c8479e8c6e65c97bcdbfff71642373f129f9e27ac8446612aea172f) |
| sweep, run by a third party | fee address got the leftover 1,000,572.038390322; NFT + markers burned | [dc1b8ca1](https://testnet.ergoplatform.com/en/transactions/dc1b8ca118a86d57e74c19ee30439c226b6c01db0b948482a81e8e9a9dc4ddc3) |

Refused, and none of it reached the chain:

- a lock taking 1 raw unit over the curve;
- an unlock one block early;
- a non-owner unlock after the unlock height (tried on two positions);
- a sweep before end + grace.

The node rejected the mistyped-R4 lock that sigma-rust signs, with
`InvalidType: Cannot getReg[GroupElement](4)` on the campaign input; its
honest twin checked valid.

Campaign state matched the maths to the raw unit at every step. After the
three locks and the top-up, the budget was 1,000,000 − 9,427.961609678 + 10,000
and V was V0 + 1e19 + 1.5e19 + 5e22.

## Before mainnet

- Decide: budget, campaign length (`start`/`end`/`grace`), tiers and boosts,
  minimum lock, starting base APR (sets `V0`).
- Fee address for the sweep: Mew devs' fee address (decided); needs the
  exact address.
- Genesis on mainnet must be signed by a wallet, not a script. Nobody should
  put a mainnet seed into a runner.
- External review of `campaign.es` before any budget goes in.
