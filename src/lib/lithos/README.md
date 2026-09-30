# MewLock campaigns (Lithos Lock is the first)

A campaign lets users lock asset A for a fixed number of blocks and earn asset
B. A and B are each any token or ERG, and may be the same (Lithos Lock is
LIT/LIT). The reward is fixed at the moment of locking and paid out, together
with the locked A, when the lock ends. There are no admin keys anywhere.

## Contracts (`contracts/`, compiled as ErgoTree v1)

**campaign.es** (contract v3): one singleton box per campaign.
`campaign-v2.es` is the v2 source the mainnet test campaign and the testnet
demo were deployed with, kept verbatim so their pinned trees still recompile;
deployment files record `contract` (missing = 2).

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
  fee address baked in at compile time; the NFT and markers are burned. v3
  requires the campaign to be `INPUTS(0)`, so each sweep handles exactly one
  campaign (see the audit below). The fee address must be a wallet (P2PK).

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
| `compile.ts` | compiles the contracts (v3, and v2 for pinned deployments); tests, runner and the deploy page (lazy); the lock page reads pinned trees |
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

- `lithos.test.ts`: 40 mock-chain (sigmastate) cases on LIT/LIT. Every attack
  is a real builder transaction with one thing tampered. It must be rejected
  with "Script reduced to false", and the untampered original must then pass.
- `modes.test.ts`: the same approach across all five asset modes (LIT/LIT,
  LIT/MEOW, ERG/LIT, LIT/ERG, ERG/ERG): exact lock, unlock payout, top-up and
  sweep, plus mode-specific attacks (over-curve reward, short A, drained
  budget, smuggled token, draining "top-up") and zero-reward locks, on v3 and
  on v2.
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

### Generic contract on testnet, 2026-09-30: all five asset modes passed

Each mode ran its own campaign: three locks (one locked for another user, one
large), a top-up, the refusals, three unlocks and a third-party sweep, 12
transactions each. Every unlock paid exactly principal + reward in the right
assets, every sweep paid the leftover to the fee address and burned the NFT and
every marker, and a real node rejected the mistyped-owner lock in every mode.

| mode (lock → earn) | campaign | sweep |
|---|---|---|
| tLIT → tLIT | [18e18e57](https://testnet.ergoplatform.com/en/transactions/18e18e579346ffc0486a7033abb68c4ac1ae7673eee6f5afa9c6b2d8063385ee) | [40e31311](https://testnet.ergoplatform.com/en/transactions/40e313119eb8ee48503478076913a34127aa149d9fad21bd8d1ae619e274d8f6) |
| tLIT → tMEOW | [f35d0034](https://testnet.ergoplatform.com/en/transactions/f35d0034afd1c6279fefff0b180edb6553ecfd3c19c94ccd1f5126103190f985) | [71482ec8](https://testnet.ergoplatform.com/en/transactions/71482ec82edb90c220d01fa49d9c6e96bea840972a953c4918eccb81d1a75e47) |
| tERG → tLIT | [11274f50](https://testnet.ergoplatform.com/en/transactions/11274f50b3459a759a125d74f00b522a17544b67ccabf3588a3746e29318b4a4) | [3c565a2c](https://testnet.ergoplatform.com/en/transactions/3c565a2c30b538ea41e1a01dee211406ad0d2ac8ff74732de1efde4a937094af) |
| tLIT → tERG | [a249ddda](https://testnet.ergoplatform.com/en/transactions/a249ddda3227d3043ad7999284f2e96643fb2a948c6981b0ab4d9cf04164ecd6) | [f2c16f31](https://testnet.ergoplatform.com/en/transactions/f2c16f31f1fb1e30ebbaee35ea333f81659914f8dea9d7011fe4dfb79ac05d18) |
| tERG → tERG | [3a851621](https://testnet.ergoplatform.com/en/transactions/3a85162160bf1371364b216a58d65f3ae21e589555ccd666dbfdeea4905a4ead) | [f3add13c](https://testnet.ergoplatform.com/en/transactions/f3add13c09d682fdde6e35b5c6b66973d52b6b30f35b4ec2eaba5521d99cd3a5) |

The page's in-browser test wallet (Fleet Schnorr signing, empty proof for the
campaign box, explorer GraphQL submit) was proven separately: a faucet drip, a
lock chained on the unconfirmed drip, and its unlock (owner received exactly
principal + reward, marker burned).

## Audit, 2026-09-30

An external quick review (EKB two-pass method, no testing) of v2 found one
real bug. Our response, finding by finding:

| ID | Verdict | What we did |
|---|---|---|
| F-1 HIGH: two expired campaigns sharing a fee address can be swept in one tx that pays the fee address only the larger | Confirmed: on the mock chain against v2, the fee address got 1,000,000 LIT and the builder kept the other campaign's 400,000 | v3 pins the sweep to `INPUTS(0)`; the fee address must be a wallet (P2PK), which also stops a variant the pin alone does not (a contract fee address whose own box, spent in the same tx, accepts the same output) |
| F-2 LOW: when B is its own token, a zero-reward lock cannot be built | Confirmed: v2 refuses it in exactly the LIT/MEOW and ERG/LIT modes | v3 drops the B slot when the reward is 0; the page's parser now reads such positions |
| F-3 INFO: the last marker can never leave | Correct | none: 1e9 markers per campaign |
| F-4 LOW: 1-nanoERG top-ups can keep invalidating pending locks | Correct, inherent to one shared box | none on chain: the page builds on the newest mempool state and re-quotes; griefing costs ~0.0011 ERG a block |
| F-5 LOW: deploy-time checklist | Correct | already enforced by the deploy page, `validateParams`, the builders and the recompile test; only the base APR (V) is a judgment call |
| NV-1: are untaken branches evaluated? | Already tested on the compiled tree (sigmastate and sigma-rust) | the compiler does hoist `OUTPUTS.getOrElse(1, SELF)` and token lookups to the top of the tree; harmless because they are total, and every typed register read stays in its branch. Comment corrected |
| P-1 INFO: anyone with a marker can make look-alike positions | Partly: our unlock burns the marker, but the contract does not force it | none yet (no funds at risk); a UI check that only counts positions created by a lock of this campaign is the follow-up |
| P-2 INFO: stale position header | Correct | comment fixed; the tree is unchanged |
| P-3 INFO: R4 is locker-supplied | Correct | the page always uses the connected wallet's key |

The attack needs two campaigns funded by others with one fee address: pairing
ours with a campaign the attacker funds returns them at most what they put
in. The v2 mainnet test campaign is the only campaign paying its address, and
it should be swept as soon as the sweep opens.

## Deploying a campaign

`lock.mewfinance.com/lithos-deploy` (mainnet; `?network=testnet` for testnet,
which every page uses only when its own URL asks for it) creates
a campaign from a connected Nautilus wallet: it compiles the contract in the
browser with the leftover going to the address you choose (default: your
wallet), then asks for three signatures: markers, NFT, campaign box. If the
page reloads midway, it offers Resume instead of minting again. At the end it
shows the deployment JSON; pin it as `deployments/<network>.json` and redeploy
the site for the page to show the campaign. Keep routes top-level
(`/lithos-deploy`, `/lithos-locks`): a nested route (`/lithos/deploy`) makes the
build emit a `lithos/` directory and Apache then answers `/lithos` with a 301
to a 403.

`deployments.test.ts` recompiles every pinned deployment from its params and
fails unless the trees match byte for byte, so a pinned file can never point
the page at a contract this source does not describe.

### Mainnet test campaign, 2026-09-30: live

HQ deployed it from `/lithos-deploy` with Nautilus, so the three setup
signatures (markers, NFT, campaign box) are the first real-Nautilus ones.
Pinned in `deployments/mainnet.json` and shown at `lock.mewfinance.com/lithos`.

| | |
|---|---|
| Locks / pays | LIT / LIT |
| Tiers | 10 / 30 / 60 / 120 blocks at 1.0 / 1.25 / 1.5 / 2.0x |
| Open | #1,884,522 to #1,886,682 (about 3 days); sweep after #1,886,712 |
| Budget | 1,000 LIT, base APR 50%, minimum lock 1 LIT |
| Leftover | back to the deployer, `9g2QPdXizK17Vquic8v5j9f5coR9yVdxzT4gqFw4Jm9dfdFs68L` |
| Genesis | `5310ccba…fe9219` at #1,884,531 |
| NFT / marker | `bb49b32f…f25054` (supply 1) / `97454689…c1bc51` (supply 1e9, all in the campaign box) |

Checked before pinning: every genesis input came from the leftover address,
the box on chain holds the NFT, every marker and 1,000 LIT with R4 = 5.256e21,
and its tree equals the pinned tree and the recompile. Still to prove with
Nautilus: a lock (spends the campaign box) and an unlock (spends a position).

## Before mainnet

- The mainnet test campaign above must show a Nautilus lock and unlock before
  the real one goes up.
- For the real launch decide: budget, campaign length, tiers and boosts (agreed
  30/90/180/365 days at 1.0/1.25/1.5/2.0x), minimum lock, starting base APR.
- The real campaign's leftover goes to the Mew devs' fee address: get the
  exact address before deploying.
- Ship contract v3 (branch `fix/campaign-audit`) before the real campaign;
  every campaign the deploy page makes until then is v2.
- Sweep the v2 mainnet test campaign right after #1,886,712.
