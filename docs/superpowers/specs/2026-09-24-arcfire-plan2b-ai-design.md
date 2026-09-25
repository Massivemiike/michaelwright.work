# Arcfire Plan 2B — the AI opponent: final design

**Status:** the final, synthesized design for Plan 2B, ready to be turned into a plan. **Base:** `worktree-games+arcfire` at `e77161d` (Plan 1 merged to master; Plan 2A complete on the branch).

**Status note (2026-09-24, before execution).**
- **The owner items are settled.** Owner decisions B1–B5 of 2026-09-24 settle ⚑ O1–O19. Each takes its recommended default, with O2 the spec Veteran, O12 no homing change in 2B, O15 the 4,000-sim Ace and O19 the both-seats resume blob.
- **The spec is already synced.** It was synced to this design and those decisions before execution, in the plan's Pre-flight commit. So the spec edits that D2, D17, §3.3, §12 ("T16's spec and addendum edits") and §13.1's O18 and O19 leave to T16 are done. The Node 22 baseline moves to after the first CI run.
- **The plan governs where it differs.** The plan (`docs/superpowers/plans/2026-09-24-arcfire-plan-2b.md`) applies review fixes on top of this document's blocks, and where they differ, the plan's blocks govern. None moves a pin:
  - the probe follows an apex split once: §4.2's `flyShell` re-spawned at every apex and looped forever on a legal apex-in-apex weapon. A probe test now fires one;
  - `copyInto.test.ts` compares every `MatchState` field by value (§7.2's `Object.keys` comparison could not fail);
  - the quiet settle's shared `falls` is frozen, and `resolve.ts` documents that a quiet Timeline is for `.points` only;
  - `turnTimes` names its states, and `ai.perf.test.ts` prints the 4 full-hand openings apart (the 8 "full-hand" states include 4 after 9 shots);
  - `host.ts`'s `start` builds its match before replacing the current one, and a bad start (bad settings, an unknown opponent) is `bad_log`. `host.test.ts` covers that and `not_your_move`;
  - `worker.bundle.test.ts` has a 60 s timeout.
- **The counts.** With the extra probe test, the Arcfire suite is 260 tests and the whole suite 513. The worker bundle is 40.1 KiB.
- **A vs-AI re-pin that flips a golden's outcome** (a `power` write-back, or a loosened daily Veteran) fails §10.5's checks and writes nothing. It moves that golden's seed by hand first (spec §8).
- **The Plan 2B final-review fix wave governs where the code now differs from this document's blocks** (commits `6b8ee0a`, `4552804`, `b903a3d`, `17a5f77`, `2b690d7` and `177b1ad`; no pin moves): the host's `start` error path and its seed and log checks, the client's robustness, and the sweep's knob validation and merge completeness, plus the tests it adds and the comments it narrows to what the code guarantees.
**Authority:** the spec `docs/superpowers/specs/2026-09-22-arcfire-design.md` (§1.3 turn contract, §1.4 threads, §2 rules, §3 sim model, §4.3 balance harness, §5 AI, §6.4/§6.5 flow and resume, §7 leaderboard, §8 testing, §9.1 the 2B hand-off) and the Plan 2A addendum `docs/superpowers/specs/2026-09-23-arcfire-plan2a-weapons-design.md` (engine, quiet path, K10/K12, §11 hand-off). Where this design reads the spec one way among several, §0 says so and §13 asks the owner.

**Scope (2B):** the three AI tiers; the draft AI; vs-AI matches with human-only replay, a search-free resume and the verifier-facing result Plan 4 wraps; the performance work (`copyMatchInto`, K12, an exact quick-reject sweep); the Web Worker host, protocol and client; the balance harness with its `power` write-back and gating; the AI tests and pins; the parked 2A minors. **Not in scope:** renderers, HUD, UI, audio, resume UI (Plan 3); the route, migration, daily seed and board UI (Plan 4). §6.6 is the function Plan 4's `TitleDef` wraps, and §8.5 is the contract Plan 3 drives.

**Base design and what changed.** This starts from the "strength" design (the winner by total score) and fixes every defect the three judges found in it, grafting the best ideas of the "minimal" and "engine" designs. The headline changes against strength:
- **No second integrator, no Timeline dependency.** Strength's hand-written fast probe (`flyOne`, 99.3–99.6% exact) and its Timeline-reading calibration are gone. The probe is the weapon's own flight model (engine's `probeModelOf`, plus minimal's apex-centre-child rule) flown by the sim's own `stepShell`, so it is exact by construction and reads nothing presentational. The speed strength bought with its fast probe comes instead from an **exact** quick-reject inside `stepShell` (engine's B16a), which speeds up every sim too, moves no pin and changes no AI decision (proven in §1).
- **Spec-literal where strength deviated:** the literal "sum of 3 uniform integers" noise (minimal/engine), a Veteran that ranks by exact value ("best by evaluation"), budgets as fixed per-component sim counts with fixed per-weapon shares (minimal), and the Ace's move search on "the best shot" (spec §5 step 3). The Ace keeps strength's noise-aware ranking (the one lever that matters: §1), now with the exact integer kernel of the literal noise, as an owner decision.
- **Smaller modules:** strength's single 540-line `search.ts` is five files (`model`, `probe`, `search`, `plan`, `policy`), each under 260 lines, with a 16-field tier table.
- **Fixed edges:** the stamp table can't wrap into history-dependence, `resumeVsAi` checks its input and never throws, the host catches errors, posts transfer lists and carries request ids and `seq`, `client.ts` compiles, the vs-AI golden's human is verbatim code, the verification test is a cold run, the harness gates by an allow-list, and the AI corpus has two digests and coverage gates.

**How to read the code.** Every code block is **mechanically extracted** from a throwaway prototype of this exact design (§1), which was then deleted.
- `ts` blocks are whole files; `diff` blocks are `diff -u` of the repo's file at `e77161d` against the prototype's.
- Revision 1 (the revision log at the end) regenerated every block from its revised prototype, including the validator diff (§11) that the first version lacked. It then re-applied the document to a fresh copy of `e77161d`: the result is the prototype, file for file.
- Every file lands whole in one task and no later task edits it, so each task's checkpoint was built and run green on its own (§12).
- The new pins are the transcription checks: **AI corpus turn digest `55df93ca`** (45 cases), **draft digest `c0d402d4`** (12 cases), **vs-AI win golden `be9db94d`** and **loss golden `2097c8fc`**. A changed constant, operator or tie-break moves one of them.
- The only blocks that are not prototype files are the cross-engine additions and the workflow (§10.8, §9.6), and they say so.

---

## 0 · Decisions at a glance

| # | Decision | Why (measured where it says so) |
|---|---|---|
| D1 | **A "sim" is one full weapon resolve** (`copyMatchInto` + `resolveTurnPoints`). The spec's budgets are **fixed per-component sim counts**: `tierBudget = stay + 2 × moveEach + dirt` = **300 / 1,500 / 4,000**, pinned by a test. Probe flights are a separate count, fixed by the grid and the hand | The spec's Ace grid alone is 91 × 50 = 4,550 probe flights, more than its 4,000 budget, so the budget can only count full resolves. Every turn of every sweep asserts `sims ≤ tierBudget` (never exceeded in any of the ~4,900 prototype matches that checked it) |
| D2 | **Fixed per-weapon shares:** each weapon in hand gets `⌊stay / max(10, hand)⌋` sims (Rookie 30, Veteran 120, Ace 300), spent box by box around its centres in rank order. A share is a hard cap: a full hand spends the whole stationary budget, and a late-match hand spends less (Rookie in sudden death: 30). **So the spec's "Budget (sims/turn)" is read as a cap, not a spend** (⚑ O18; T16 writes it into spec §5). Sweep means, over 20,004 decisions: Rookie 144 of 300, Veteran 651 of 1,500 (maximum 1,200: the move top-up never pushed past it), Ace 2,123 of 4,000 | Spec-literal ("fixed sim counts") and data-independent; splitting the budget over the remaining hand would be data-independent too. Halving the Ace's share measured strength-neutral (55.0%, §1), so the spec's number is not a strength constraint, only a cap |
| D3 | **The probe is the weapon's own flight** (`model.ts` derives it from the `WeaponDef`: speed and gravity scales, homing, terrain bounces, wall bounces, stop at the apex, and an apex split's centre child), flown by the sim's own `muzzle` / `launchShell` / `stepShell` over a scratch copy of the board. No second integrator, no Timeline | Exact by construction: a plain probe lands on Pulse's blast pixel on 1,520 of 1,520 aims, and a beam probe reaches the enemy exactly when Lancer damages it on every dial angle (tests, §10). The apex rule makes Hailstorm aimable (a Veteran with only Hailstorm scores on every test board). Appended weapons need no AI code |
| D4 | **Refine centres:** each angle row's aim that lands nearest the enemy's hitbox centre, rows in (distance², cell) order and at least one refine box apart (`⌈(2·refineA + 1) / angleStep⌉` rows); Rookie has no box, so every cell competes | Spreads the budget along the whole firing-solution curve (direct shots and lobs); boxes never overlap |
| D5 | **Refine boxes are the spec's, at step 1:** Veteran ±2° × ±4 (45 cells), Ace ±1° × ±2 (15 cells); beams are angle-only. Every cell is fully resolved once per weapon (a stamp table whose generation wraps safely before 2^30) | Spec §5 literally (engine's power step 2 box was flagged by a judge) |
| D6 | **Evaluation = `points[me] − points[foe]`** of one full resolve, exactly spec §5's "points to the enemy − points gifted by self-damage". **The Ace ranks aims by their exact expected value under its own noise** (integer kernel, over the aims whose whole noise support was resolved; the best exact aim's support is completed only when the share has room left, which it seldom has: §3.3); Rookie and Veteran rank by the value at the exact aim (⚑ O1) | The one lever that matters: a point-evaluating Ace wins only **19.4%** against the noise-aware Ace (160 seeds, −13.4 net points a shot). The literal ±1 noise misses a knife-edge aim 2 times in 3, and the EV knows it |
| D7 | **Noise is the literal "seeded sum of 3 uniform integers":** part `i` is uniform on `[−a_i, a_i]`, `a_i = ⌊(bound + i) / 3⌋`, so the parts sum to the bound. Every call draws exactly 3 values (a part of 0 still draws `nextRange(rng, 1)`) (⚑ O3) | Spec §5 literally. Kernels: Ace ±1 uniform; Veteran ±2 = 1 2 3 2 1 and ±3 = 1 3 6 7 6 3 1; Rookie bells over 125 and 245 |
| D8 | **The RNG order is fixed and tier-independent:** an AI pick draws **exactly 1** value and an AI turn **exactly 7** (1 choice, 3 angle, 3 power), after the search. `planTurn` itself draws nothing and never writes the match | Replay is exact; a resume can skip an AI entry's draws without searching (D17); hints and previews can call `planTurn` freely (engine) |
| D9 | **Moves:** Rookie never; Veteran only while its best stationary value is below 25; Ace always. The best stationary weapon ("the best shot", spec §5 step 3) is re-searched from each legal side, **re-probed from the moved tank**, with `moveEach` sims a side; a move must gain ≥ 8 points (⚑ O4) | Spec-literal; re-probing (unlike minimal's reuse of the stationary ranking) lets moves happen: Ace 80–82 moves and Veteran 13–26 per 200 matches. Moves measured strength-neutral (52.2%), as in strength's ablation |
| D10 | **Tier-3 saving (Ace):** a tier-3 pick is fired only if it strictly beats the best non-tier-3 alternative with ev > 0 **and** `5·ev ≥ 6·alt` (≥ 20%) | Spec §5, in exact integers; ties and all-zero turns never burn a tier-3 weapon. Fired on 561 of ~16,000 harness shots; strength-neutral (53.1%) |
| D11 | **DIRT (Ace, battle, DIRT in hand):** estimate the enemy's best reply **after the Ace's planned shot** (`r0`, strength's reading); when `r0 ≥ 60`, try each DIRT weapon (at most 2) at 2 placements (90 px in front, midway to the enemy), and fire the one that leaves the lowest reply if it cuts `r0` by ≥ 20; forced when only DIRT is left. At most 300 sims (⚑ O5) | "Uses DIRT when the enemy's best reply would score ≥ 60" (spec §5). Every weapon is fired exactly once, so DIRT is only ever deferred; the rule decides when. Fired 363 times in the 400-match harness; strength-neutral (53.8%) |
| D12 | **Weapon choice:** Rookie uniform among its top 4 by value (DIRT counts 0; 1 draw); Veteran the best; Ace the best, then D10, then D11. Ties: ev descending, then the lower tier (an equal shot spends the cheaper weapon), then roster index | Spec §5; total, engine-independent orders |
| D13 | **The draft AI** sorts the available pool slots by (`power` descending, pool index ascending) and draws `nextRange(rng, min(draftTop, n))`: Rookie top 8, Veteran top 3, Ace top 1 (still a draw) | Spec §5; one draw at every tier keeps D8 tier-independent |
| D14 | **vs-AI seating and interleaving:** the human is player 0 (left, red), the AI player 1; the coin flip still decides who picks first. The AI acts whenever it is its move — after `createMatch` and after every human command — so between two human commands it makes 0, 1 or 2 actions. A vs-AI match is `seed + settings + tier + the human's commands` (at most `2 × weaponsEach + 1` = 21) | Spec §1.3/§6.2/§7. One rule serves live play, replay, resume and verification |
| D15 | **`replayVsAi` never throws on commands**, rejects `too_long` before any AI work, and accepts an unfinished log; an illegal AI action is a bug and throws (the route's 500, never a verdict on the player) | Engine's pre-check; minimal's and strength's throw (engine's silent `advanceAi` could hang a verifier) |
| D16 | **`scoreVsAi` (`verify.ts`) is the verifier-facing function:** `ReplayOutcome` (`score` = margin, `stat` = the human's points, `hash`) or `{ rejected }`, cheapest first: shape, `too_long`, shape per entry, `invalid_command`, `not_a_win` | Strength's; Plan 4's binding is two lines |
| D17 | **Search-free resume:** `resumeVsAi` re-applies the local blob's full log (both seats, plus the opponent), skipping each AI entry's fixed draws; it drops a bad entry and everything after it, and never throws. This departs from spec §1.3/§6.5's binding line that the resume blob is the human-only command format (the submission stays human-only), so **the owner confirms it** (⚑ O19) | Strength D14 + engine's fallback spirit. Measured: equal to replay on 41/41 prefixes of both goldens; 1.4–1.7 ms against ≈ 0.7 s to regenerate |
| D18 | **Performance, all pin-neutral:** `copyMatchInto` (a reused scratch instead of `cloneMatch` per candidate), K12 (strength's exact edits) and the **exact quick-reject sweep** in `stepShell` (engine's B16a, with a reference property test) | Quick-reject: shell probe flights 2.2–6.3× faster, a Pulse sim 66 → 28 µs, an Ace turn 457 → 153 ms on the same match; **AI decisions bit-identical with it compiled out** (§1). Every 2A pin unchanged |
| D19 | **The worker:** a pure host module (`createArcfireHost(post)`, Node-tested), a 5-line entry, a compiling `client.ts` with an injectable factory. Request ids, `seq`, transfer lists; every pick and turn request goes through `applyCommand`, so a malformed one is `rejected{invalid_command}`, and try/catch → `error` is left for bugs; the human's event is posted before the AI searches | Measured in real Chromium and WebKit Workers (§1); the bundle is 39.9 KiB with no Node, React or Next inputs |
| D20 | **The balance harness:** Ace vs Ace, **random draft** (one match-RNG draw per pick), seeds 1..400; per weapon net points per shot, sd, hit rate, win-rate contribution ± 95% CI, mean turn, pick rate with the proposed powers, a verdict and a suggestion. **Allow-list gating** (ACK / STALE ACK), never a merge blocker, 4 CI shards + a merge job; the sweep plays **one job queue** (slowest matches first), and its report adds each tier's decision costs | Strength's report and shards + engine's allow-list. 64 s locally on 64 threads (84–93 s with one queue per group); a quarter shard 164 s on 4 threads, 315 s on 2 |
| D21 | **`power` = round(net points per shot)** for a damaging weapon; for DIRT, its win-rate contribution converted to points by the least-squares line through the damaging weapons. Written back only locally (`ARCFIRE_BALANCE_WRITE=1`) by an anchored exactly-once rewrite | `defDigest` excludes `power` (an always-on test now pins that), so no 2A pin moves; a write-back moves exactly the AI draft section and the vs-AI goldens |
| D22 | **New pins, none moved:** the AI corpus (two digests, coverage gates: a move, a tier-3 save, DIRT by the rule, a beam, sudden death, wind) and the vs-AI win and loss goldens, all in the cross-engine table, plus a real-Worker smoke | Chromium and WebKit reproduce all four (§1) |
| D23 | **The AI is a verification input:** after launch any change to `ai/**`, `TIERS` or a `power` changes regenerated decisions and needs an `ARCFIRE_SIM_VERSION` bump | The AI pins make any such change loud |

---

## 1 · How this design was validated

A throwaway prototype (`.superpowers/plan2b/synth-proto/`, deleted afterwards; tracked files were never modified) copied the 2A sim at `e77161d`, applied every change in this document, and ran:
- `tsc --strict` (clean) and the purity guard with Arcfire's root (clean: `ai/**` uses no banned word, even in comments);
- the whole Plan 1/2A suite plus every 2B test in this document (the gated sweep skipped by default, then run on its own);
- bundled benches with esbuild (the `perf.test.ts` pattern) on the dev machine: Windows 11, Node 24.11.1, 64 hardware threads; Chromium and WebKit through Playwright, in pages and in real Web Workers (Firefox can't launch locally, the known issue: CI only).

**Revision 1** rebuilt the prototype from this document (`.superpowers/plan2b/revise-proto/`, deleted afterwards). It started from `git archive e77161d`, applied every diff and file here, and regenerated every block from the result.
- **The Arcfire suite:** 32 files, **259 tests passing**, and the gated sweep. The Arcfire suite is `titles/arcfire`, `test/arcfire`, `runtime/arcfire` and the purity guard.
- **The whole repository suite:** 512 passing, 11 skipped (the gated sweeps and the like).
- **`tsc --noEmit`** is clean over the whole tree.
- **Every task's checkpoint** (T1–T12, T14) was rebuilt from `e77161d` with only its tasks' files and ended green on its own (§12).
- **Unchanged by the revision:** the four AI pins, the 2A pins, the tier separation and the whole harness table all reproduced exactly (below, §9.5).

**Nothing existing moved.** With `copyMatchInto`, K12, the quick-reject sweep, `endStep`, the `fanOffset` fix, the validator fixes, `toAct` and the `applyCommand` refactor all in place, the prototype reproduced **golden `389a1340` [31, 83]**, **windless `8d7dc831`**, **corpus `a7100140` (483 cases, 32 definition digests)** and **full-roster golden `3f614265` [359, 448]**. No file under `src/game/sim` or `circle-td` changes, so Circle TD's `5167b43d` is untouched.
- **Quick-reject exactness,** three ways: a reference property test (20,000 random shells on randomly edited terrain, with bounces, wall bounces, homing, ignore bits and flight caps: every one of > 500,000 steps equal to the per-sample sweep; the test catches a dropped hitbox check and an off-by-one surface check, both mutation-tested); every pin; and **identical AI decisions** with the quick-reject compiled out of the bundle: turn digest `55df93ca`, draft digest `c0d402d4`, win `be9db94d`, loss `2097c8fc` either way (corpus 2.7 s against 7.5 s; two verifications 0.85 s against 1.67 s).
- **`copyMatchInto` parity:** the quiet path on a reused `copyMatchInto` scratch equals `resolveTurn` on a clone (points, `hashMatch`, live spans) over 5 boards × 32 weapons × 8 aims.

**The new pins** (the transcription checks), identical in **Node, Chromium and WebKit**:

| Pin | Value |
|---|---|
| AI corpus, turn section (45 cases, power-independent) | **`55df93ca`** |
| AI corpus, draft section (12 cases, reads `power`) | **`c0d402d4`** |
| vs-AI win golden: seed 20260934, `STANDARD_SETTINGS`, Veteran, 20 human commands | **`be9db94d`**, human 254, AI 169; `scoreVsAi` = `{ score: 85, stat: 254, hash: "be9db94d" }` |
| vs-AI loss golden: seed 20260928, the same human | **`2097c8fc`**, human 234, AI 329; `scoreVsAi` = `{ rejected: "not_a_win" }` |

A sample of the pinned corpus cases, for checking a transcription case by case (`[w, move, angle, power, sims, probes, ev, rng.state]`):

| Case | Fingerprint |
|---|---|
| `turn\|ace\|s11t0` | `[8, 0, 150, 72, 3332, 21201, 1011, 2015813115]` |
| `turn\|veteran\|s11t0` | `[8, 0, 167, 95, 1080, 2391, 115, 2015813115]` |
| `turn\|rookie\|sudden` | `[0, 0, 165, 100, 30, 190, 40, 2015813127]` |
| `turn\|ace\|dirt` (Rampart by the rule) | `[23, 0, 151, 87, 1021, 14220, 0, 2015813171]` |
| `turn\|ace\|move` | `[0, -1, 157, 86, 1000, 13650, 345, 2015813134]` |
| `turn\|ace\|saveT3` (Fan saved over Cascade) | `[6, 0, 140, 70, 1300, 13650, 590, 2015813115]` |
| `turn\|veteran\|beam` (Lancer) | `[26, 0, 87, 51, 240, 1241, 60, 2015813141]` |
| `draft\|ace\|s11` | `[2, 8, 10, 18, 21, 27, 184247302]` |

**Tier separation** (spec §8: 200 seeds each, `STANDARD_SETTINGS`, each tier drafting with its own draft AI, seats swapped on odd seeds):

| Pairing | Win rate of the first | Spec | Net points / shot, hit rate | Moves |
|---|---|---|---|---|
| Ace vs Rookie | **99.5%** (199/200), mean margin +371 | ≥ 85% | Ace 54.7 (92%), Rookie 17.6 (42%) | Ace 82 |
| Ace vs Veteran | **93.5%** (187/200), +221 | ≥ 60% | Ace 52.4 (91%), Veteran 30.3 (63%) | Ace 80, Veteran 26 |
| Veteran vs Rookie | **85.5%** (171/200), +144 | (monotone) | Veteran 33.8 (64%), Rookie 19.5 (45%) | Veteran 13 |

Free play (`SHORT_SETTINGS` with wind, 100 seeds): Ace–Veteran 90%, Veteran–Rookie 86%, Ace–Rookie 100%. Results depend on the seeds only: 40 Ace-vs-Veteran matches run on 4 and on 40 threads gave identical records (every final hash, command, sim and probe count).

**What each Ace feature is worth** (the final Ace against a variant, 160 seeds, random draft, seats alternated; the variant's win rate, 95% CI ±7.7 points; sims per turn variant vs base):

| Variant | Variant wins | Net / shot (variant, base) | Sims / turn |
|---|---|---|---|
| **point evaluation** (noise-blind) | **19.4%** | 31.2, 44.6 | 2,081 vs 2,013 |
| no move search | 52.2% | 42.0, 41.6 | 1,423 vs 2,050 |
| no DIRT rule | 53.8% | 44.9, 43.4 | 1,948 vs 2,045 |
| no tier-3 saving | 53.1% | 44.5, 43.5 | 2,070 vs 2,059 |
| 2 movers instead of 1 | 53.8% | 45.0, 43.4 | 2,086 vs 2,043 |
| half the stationary budget (1,500) | 55.0% | 45.0, 43.4 | 1,377 vs 2,048 |

So noise-aware ranking is the only strength lever; the spec's heuristics (moves, tier-3 saving, DIRT) are strength-neutral and stay for fidelity and feel, as strength also found.

**Cost per decision.**
- **Counts** (sims and probe flights) are exact: the maxima come from **every decision of the weekly sweep**, 20,004 in all (4,000 Rookie, 4,000 Veteran, 12,004 Ace), which `ShotRecord` now records with a per-decision `ms` (§9.2).
- **Times** are bundled Node on the dev machine:
  - *typical:* the 8 full-hand corpus states (`ai.perf.test.ts`, three runs);
  - *worst:* the sweep's heaviest decisions (by probe flights, by sims and by in-sweep time), re-timed **alone**, one thread, the best of 3 replays per decision. The column gives the range of the maximum over three passes.

| Tier | sims: mean, max (budget) | probe flights: mean, max | ms: corpus states, mean (max) | ms: worst decision, alone |
|---|---|---|---|---|
| Rookie | 144, 300 (300) | 564, 1,737 | 8.3–8.5 (11.8) | 32–37 |
| Veteran | 651, 1,200 (1,500) | 3,559, 9,357 | 36.4–37.1 (49.6) | 127–128 |
| Ace | 2,123, 3,700 (4,000) | 21,773, **49,900** | 273–317 (392) | **605–650** |

The first version quoted maxima from a 240-decision sample, and they were low: Ace 40,900 probe flights and 447 ms, Veteran 94 ms. Single heavy decisions also vary from pass to pass on this machine, even when it is idle: one Ace decision timed 280–640 ms across passes. The in-sweep `ms` (a p99 of 1,067 ms and a maximum of 7.3 s for the Ace) is wall time with every core busy, so it only bounds from above.

**In browsers.**
- *The 8 full-hand corpus states (first version):* Chromium Rookie 9 ms, Veteran 42, Ace 211 (max 337); WebKit 17 / 78 / 356 (max 448). **At 4× CPU throttling (a mid-range phone proxy): Rookie 65, Veteran 288, Ace 1,335 ms (max 1,650); at 6×: 105 / 457 / 2,120 (max 2,570).**
- *The worst case (Revision 1):* the sweep's five heaviest Ace decisions that open a match (3,336–3,700 sims, 38,630–47,382 probe flights) took 277–371 ms in Node and 292–479 ms in Chromium. **At 4× throttling they took 1.65–2.18 s, and at 6× 2.58–3.39 s**: about 30% above the corpus states' maxima (⚑ O15).
- *Before the quick-reject,* the same Ace match averaged 457 ms a turn in Node.

**Daily verification** (spec §5/§8: 10 Veteran turns + 10 AI picks + 20 human commands).
- *Each log in a fresh Node process* (bundle load and JIT cold, the verifier's real case): **mean 414 ms, max 530 ms over 12 logs**.
- *`ai.perf.test.ts`, three runs in Revision 1:* the win golden 507–526 ms cold, 408–417 ms warm.
- *In browsers:* 660 ms (Chromium) and 507 ms (WebKit).
- **Worst-case bound.** 11 Veteran decisions at the sweep's worst single Veteran decision (128 ms) take 1.4 s; the draft and the human's 21 resolves add a few ms. That is under 1.5 s here, 3.5× inside the budget.
- **The < 5 s test** replays one typical log, so its measured margin is the typical ≈ 10×.
- **CI:** the first CI run's printed numbers become the Node 22 baseline (T16).

**Human-only replay:** every live vs-AI match replayed from the human's commands alone to its live hash (both goldens, 12 daily logs, every vs-AI test match). **Resume:** `resumeVsAi` + `advanceAi` equalled `replayVsAi` of the human sub-log on 41/41 prefixes of each golden. **The Worker:** the bundled `worker.ts` in a real browser Worker played the win golden to `be9db94d` (Chromium 579 ms, WebKit 850 ms; 51 messages; the longest gap, one Veteran think, 144–160 ms), and a **fresh** Worker resumed after 25 log entries in 11 ms (Chromium) and 22 ms (WebKit), then finished on `be9db94d`.

**The balance harness** (400 seeds, Ace vs Ace, random draft):
- **The whole gated sweep** (600 separation matches + 400 harness matches) took **64 s** wall on 64 threads with one job queue, slowest matches first. It took 84–93 s when each group ran as its own queue, because threads sat idle at the end of each group.
- **One quarter shard,** the CI-runner proxy, took **164 s on 4 threads** (178 s before the single queue) and **315 s on 2 threads**. The 2-thread figure is the proxy for a private repository's 2-vCPU `ubuntu-latest`.
- **First run:** **9 weapons fail** (§9.5), each with an actionable suggestion. Revision 1's rerun reproduced the tier separation and every cell of the 32-row table.

**Daily difficulty data** (for ⚑ O2): a noise-free scripted "grid human" (the best of a 5° × 5 grid over its hand, found on clones) against each tier, 60 seeds: it beat **Veteran 25/60**, a noise-aware Veteran 23/60, a Veteran with ±3°/±5 noise 41/60, Rookie 55/60, Ace 3/60.

**The 2A carry-overs reproduced as described and are fixed** (§11):
- A self-containing `delay.then` makes `weaponErrors` throw `RangeError` today; with the fix it is one report.
- A 4-stage ring with 40 back-references per stage took 1,006–1,168 ms and produced 40^4 reports. It now walks each stage once, 4 effect-list walks against 65,641, with exactly 40 reports.
- A 30,000-graph fuzz found the fixed validator agrees with 2A's on validity.
- −0 child angles are gone from every corpus Timeline (> 900 shell angles checked), and the backstop's `out` events are pinned.

**The Ace's re-centring step is nearly inert** (Revision 1, instrumented, 20 Ace-vs-Ace matches, 400 decisions, 2,745 noise-aware weapon searches):
- The best exact aim was not the best-EV aim in 2,524 searches. Its noise support was already complete in 1,401 of them; that comparison cannot change the answer, because the EV loop has already scored that aim.
- Only 226 searches had any of the share left after the refine boxes. The step resolved new cells in 4 searches, and changed the answer in 2.

§3.3 now describes the step as it behaves.

---

## 2 · Module layout and public APIs (deliverable a)

```
src/game/titles/arcfire/                        (pure: under the purity guard)
  state.ts            + copyMatchInto(dst, src)                                        T1
  match.ts            + toAct(m)                                                       T1
  replay.ts           + applyCommand(m, entry), CommandResult; replayMatch uses it     T1
  terrain.ts          K12: quiet settle returns the live heights; a reused capsule table  T1
  weapons/primitives.ts  K12: walks count columns, paths/children only when recording;
                      fanOffset never returns -0                                      T1, T3
  ballistics.ts       the exact quick-reject sweep (clearStep); endStep shared with endBounce  T2
  weapons/validate.ts no descent into a forbidden delay entry; (stage, depth) memo    T3
  ai/tiers.ts         TierSpec, TIERS, tierBudget, the §5 constants                    T4
  ai/noise.ts         drawNoise, noiseKernel, kernelTotal                             T4
  ai/model.ts         probeModelOf, dealsDamage: the AI's only weapon knowledge         T4
  ai/probe.ts         ProbeBoard, Grid, landingGrid (the weapon's own flight)          T5
  ai/search.ts        one weapon's search: SearchCtx, scratch, centres, searchWeapon   T6
  ai/plan.ts          planTurn / planWith (RNG-free), chooseOffence, byValue           T6
  ai/policy.ts        aiPick, aiTurn: the only RNG draws; AI_PICK_DRAWS / AI_TURN_DRAWS  T7
  vsai.ts             HUMAN, AI, aiToAct, stepAi, advanceAi, replayVsAi, resumeVsAi    T8
  verify.ts           scoreVsAi, isArcfireCommand, DAILY_TIER                          T9
  ai.corpus.golden.json, determinism.vsai.golden.json                                  T10
  balance.allow.json  acknowledged harness failures ({} until the first sweep)        T14, T15
src/game/runtime/arcfire/                       (runtime: outside the purity roots; decides nothing)
  protocol.ts         HostRequest, HostEvent, Snapshot, Opponent                       T12
  host.ts             createArcfireHost(post), snapshot(m)                             T12
  worker.ts           the Web Worker entry                                             T12
  client.ts           ArcfireWorkerClient (Plan 3's handle), WorkerLike                T12
src/game/test/arcfire/                          (test support: outside the purity roots)
  fixtures.ts         + corpusState, battleBoards, rngAfter (no AI: the engine and AI tests share them)  T1
  aiCorpus.ts         the AI corpus (Node + browsers)                                 T10
  vsaiGolden.ts       the goldens' scripted human; playVsAi                           T10
  ai.entry.ts         bundled by the AI tests                                         T10
  aiMatch.ts          one AI-vs-AI match, recorded                                     T14
  sweep.entry.ts, sweep.ts  the bundled worker_threads sweep runner, shards            T14
  balance.ts          aggregation, verdicts, report, costs, powers, the roster write-back  T14
  arcfire.sweep.test.ts  BALANCE_SWEEP=1: tier separation + the harness               T14
src/game/test/cross-engine/harness.entry.ts     + runArcfireAiCorpus(Cases), runArcfireVsAi  T13
e2e/cross-engine-determinism.spec.ts            + 2 PINS rows + a Worker smoke per engine    T13
.github/workflows/balance-sweep.yml             + the Arcfire shards and the merge job       T14
```

**Public API** (what Plan 3, Plan 4, the harness and tests import; the sources are verbatim in §3–§9):

```ts
// ai/tiers.ts
export type AiTier = "rookie" | "veteran" | "ace";
export interface TierSpec { angleStep; powerStep; refineA; refineP; stay; moveEach; movers; moveBelow; moveGain; dirt;
  noiseA; noiseP; noiseAware; pickTop; draftTop; saveTier3 }            // all numbers/booleans: §3.1
export const TIERS: Readonly<Record<AiTier, TierSpec>>;
export const tierBudget: (t: TierSpec) => number;                       // 300 / 1,500 / 4,000

// ai/plan.ts: the search, RNG-free and pure with respect to m
export interface Plan { choices: Cand[]; ranked: Cand[]; stats: AiStats }
export function planTurn(m: MatchState, tier: AiTier): Plan;            // hints and analysis may call it freely
export function planWith(m: MatchState, t: TierSpec): Plan;             // tests and ablations

// ai/search.ts
export interface Cand { w: number; move: -1 | 0 | 1; angle: number; power: number; ev: number; raw: number }
export interface AiStats { sims; probes; staySims; moveSims; dirtSims; reply; replyDirt; reason: AiReason }

// ai/policy.ts: the only functions that draw from m.rng
export const AI_PICK_DRAWS = 1, AI_TURN_DRAWS = 7;
export function aiPick(m: MatchState, tier: AiTier): number;            // a pool index; 1 draw
export function aiTurn(m: MatchState, tier: AiTier): { cmd: TurnCommand; plan: Plan }; // 7 draws

// vsai.ts
export const HUMAN = 0, AI = 1;
export type AiAction = { k: "pick"; w: number } | { k: "turn"; cmd: TurnCommand; timeline: Timeline; plan: Plan };
export function aiToAct(m: MatchState): boolean;
export function maxHumanCommands(s: MatchSettings): number;            // 2 × weaponsEach + 1
export function stepAi(m: MatchState, tier: AiTier): AiAction | null;
export function advanceAi(m: MatchState, tier: AiTier): AiAction[];
export function replayVsAi(r: { seed; settings; tier; commands: unknown }): VsAiResult;   // the human's commands only
export function resumeVsAi(r: { seed; settings; log: unknown }): VsAiResume;             // the full log, no search

// verify.ts: what Plan 4's TitleDef binding wraps
export const DAILY_TIER: AiTier = "veteran";
export function isArcfireCommand(c: unknown): c is ArcfireCommand;
export function scoreVsAi(seed: number, commands: unknown, settings?: MatchSettings, tier?: AiTier):
  ReplayOutcome | { rejected: ReplayRejection };

// state.ts, match.ts, replay.ts
export function copyMatchInto(dst: MatchState, src: MatchState): void;
export function toAct(m: MatchState): number;                           // 0 | 1, or -1 when over
export function applyCommand(m: MatchState, entry: unknown): CommandResult; // never throws

// runtime/arcfire (§8)
export function createArcfireHost(post: Post): { receive(req: HostRequest): void };
export class ArcfireWorkerClient { start; pick; turn; preview; on; dispose }
```

`createVsAiMatch` is not a separate function: a vs-AI match is `createMatch(seed, settings)` followed by `advanceAi(m, tier)`, and `replayVsAi`, `resumeVsAi` and the host all do exactly that.

---

## 3 · The search, per tier (deliverable b)

### 3.1 The tier table: `ai/tiers.ts`

```ts
// src/game/titles/arcfire/ai/tiers.ts
//
// The three AI tiers (spec §5) as data: the AI's one tuning surface. A budget
// is a FIXED count of full weapon resolves ("sims"), never a clock:
// tierBudget = stay + 2 x moveEach + dirt, pinned to 300 / 1,500 / 4,000 by a
// test. Probe flights are a separate count, fixed by the grid and the hand.
// After launch, any change here changes the regenerated AI of a vs-AI replay:
// it is a simVersion bump (the AI pins make it loud).
export type AiTier = "rookie" | "veteran" | "ace";

export interface TierSpec {
  angleStep: number; // probe grid: facing degrees 0..90 in this step (a wall bouncer 0..180; a beam the whole dial 0..180)
  powerStep: number; // probe grid: powers powerStep..100 in this step (beams: one power)
  refineA: number; // refine box: +-refineA degrees around a centre, step 1 (0 with refineP 0: no box, a centre is one cell)
  refineP: number; // refine box: +-refineP power, step 1 (beams: the angle only)
  stay: number; // sims from where the tank stands: each weapon in hand gets stay / max(BUDGET_HAND, hand size)
  moveEach: number; // sims from each legal moved position (0 = the tier never moves)
  movers: number; // the best stationary weapons re-searched from a moved position, sharing moveEach
  moveBelow: number; // look at moves only while the best stationary value is below this many points (MOVE_ALWAYS: always)
  moveGain: number; // a move must beat staying by at least this many points
  dirt: number; // sims for the DIRT decision (0 = the tier never defends)
  noiseA: number; // aim noise: a sum of 3 uniform integers within +-noiseA degrees (noise.ts)
  noiseP: number; // power noise, within +-noiseP
  noiseAware: boolean; // rank aims by their expected value under this tier's own noise (else by the value at the exact aim)
  pickTop: number; // weapon choice: uniform among the pickTop best weapons (1 = the best)
  draftTop: number; // draft: uniform among the draftTop available weapons with the highest roster power
  saveTier3: boolean; // fire a tier-3 weapon only when it beats the best other weapon by >= 20%
}

/** A moveBelow that every value is below: moves are always considered. */
export const MOVE_ALWAYS = 1 << 30;

export const TIERS: Readonly<Record<AiTier, TierSpec>> = Object.freeze({
  rookie: Object.freeze({
    angleStep: 5, powerStep: 10, refineA: 0, refineP: 0, stay: 300, moveEach: 0, movers: 0, moveBelow: 0, moveGain: 0,
    dirt: 0, noiseA: 6, noiseP: 8, noiseAware: false, pickTop: 4, draftTop: 8, saveTier3: false,
  }),
  veteran: Object.freeze({
    angleStep: 2, powerStep: 4, refineA: 2, refineP: 4, stay: 1200, moveEach: 150, movers: 1, moveBelow: 25, moveGain: 8,
    dirt: 0, noiseA: 2, noiseP: 3, noiseAware: false, pickTop: 1, draftTop: 3, saveTier3: false,
  }),
  ace: Object.freeze({
    angleStep: 1, powerStep: 2, refineA: 1, refineP: 2, stay: 3000, moveEach: 350, movers: 1, moveBelow: MOVE_ALWAYS, moveGain: 8,
    dirt: 300, noiseA: 1, noiseP: 1, noiseAware: true, pickTop: 1, draftTop: 1, saveTier3: true,
  }),
});

/** A tier's worst-case sims per turn: the stationary search, both move sides and the DIRT decision (spec §5: 300 / 1,500 / 4,000). */
export const tierBudget = (t: TierSpec): number => t.stay + 2 * t.moveEach + t.dirt;

// --- shared AI constants (spec §5)
export const BUDGET_HAND = 10; // stay is split into this many equal weapon shares at least (STANDARD hands hold 10): a smaller hand spends less
export const DIRT_THREAT = 60; // Ace considers DIRT when the enemy's estimated best reply to its planned shot is at least this
export const DIRT_GAIN = 20; // ... and fires DIRT when a build cuts that estimate by at least this many points
export const DIRT_FRONT = 90; // a DIRT placement: this many px in front of the AI's tank (the other is midway to the enemy)
export const THREAT_AIMS = 2; // the enemy's reply estimate: each enemy weapon at its THREAT_AIMS nearest probe aims on Rookie's grid
export const BEAM_POWER = 50; // the power an AI beam command carries (beams ignore power)
```

How the spec §5 table maps onto it:

| Spec column | Rookie | Veteran | Ace |
|---|---|---|---|
| Probe grid | 5° × 10: facing 0..90 step 5 (19) × powers 10..100 (10) = **190** flights per model | 2° × 4: 46 × 25 = **1,150** | 1° × 2: 91 × 50 = **4,550** |
| | (a wall bouncer flies the facing half, 0..180: ×2; a beam sweeps the dial 0..180 at one power: 37 / 91 / 181) | | |
| Refine | none: every cell is its own centre | ±2° × ±4 at step 1: a **45-cell box** | ±1° × ±2 at step 1: a **15-cell box** |
| Budget (sims/turn) | stay **300** | stay 1,200 + 2 × 150 (moves) = **1,500** | stay 3,000 + 2 × 350 (moves) + 300 (DIRT) = **4,000** |
| Aim noise | ±6° / ±8 | ±2° / ±3 | ±1° / ±1 |
| Moves | never (`moveEach` 0) | while the best stationary value is < 25 | always considered |
| Weapon choice | uniform among the top 4 (`pickTop`) | the best | the best + tier-3 saving + DIRT |
| Draft | uniform among the top 8 by `power` | top 3 | the best |

### 3.2 One turn, step by step

`planWith(m, t)` for the shooter `me = m.shooter` (source: §3.5):

1. **Hand.** In sudden death the hand is `[Pulse]`; otherwise `m.hands[me]`. `dealsDamage` splits it into **offence** and **inert** (the three DIRT weapons: nothing in their stage tree can hurt).
2. **Stationary search.** Each offensive weapon gets `share = ⌊stay / max(10, hand size)⌋` sims (§3.3). Inert weapons are worth 0 as attacks and are aimed at their probe cell nearest the enemy.
3. **Rookie stops here:** its `choices` are its `pickTop` = 4 best candidates by value (DIRT at 0), and `policy.ts` draws one.
4. **Moves** (Veteran while its best stationary value is below `moveBelow` = 25; Ace always): the best `movers` = 1 stationary weapon is searched again from each legal side (left, then right), **re-probed from the moved tank**, with `moveEach` sims per side. A moved candidate is kept only if it beats the best stationary one by `moveGain` = 8 points.
5. **The offensive pick** (`chooseOffence`): the first best ev (a paying move goes first in the list, so it wins an ev tie); the Ace then applies tier-3 saving (D10).
6. **DIRT** (Ace, battle, DIRT in hand; §4.5).
7. **Fallback:** only DIRT in hand and no DIRT decision (Veteran): fire the best-ranked DIRT weapon at its nearest landing to the enemy.

### 3.3 One weapon: `searchWeapon`

1. **Grid:** the weapon's probe model (§4.2) flown over the tier's grid from the side being searched, once per decision per (side, model); weapons with equal models share it.
2. **Centres:** for each angle row, the power whose landing is nearest the enemy's hitbox centre; the rows sorted by (squared distance, cell index); any row closer than `⌈(2·refineA + 1) / angleStep⌉` rows to one already taken is skipped (the boxes never overlap: Ace 3 rows = 3°, Veteran 3 rows = 6°). Rookie (no box) takes every cell in (distance, cell) order. Rows that land nowhere useful (off the world, the flight cap, the shooter's own tank) sort last but stay, so a share is always spent on something.
3. **Refine:** every cell of each centre's box, in (angle offset, power offset) order, is resolved in full on the scratch copy (`copyMatchInto` + `resolveTurnPoints`: `points[me] − points[foe]`), skipping cells off the wire ranges or already resolved for this weapon, until the share is spent (a box may end partly resolved).
4. **Answer:**
   - Rookie and Veteran: the best exact aim (the first of equals), `ev = value × scale` with `scale = 1`;
   - Ace (noise-aware): among the resolved aims whose whole noise support (the clamped 3 × 3 neighbourhood) was resolved, the largest `Σ k_a[i]·k_p[j]·value` (`scale` = 3 × 3 = 9: points × 9). A beam puts all its power weight on the one power it fires.
   - **The best exact aim's own EV (what the first version called "one re-centring step").** If the best exact aim is not the best-EV aim, its missing support (≤ 8 cells) is resolved **only if the share still has that many sims left**, and it is kept if its EV is higher. The boxes spend the share first, so this almost never acts. Measured over 2,745 noise-aware searches (20 Ace-vs-Ace matches): the share had sims left in 226; the step resolved new cells 4 times and changed the answer twice. When the support is already complete (1,401 times), the comparison cannot change anything: the EV loop has already scored that aim. It stays because removing it would move the Ace pins for no measurable gain. The lever it would need, reserving up to 8 sims of each share for it, is untested and not taken.

**Sim accounting per tier** (exact and data-independent; every sweep turn asserts `stats.sims ≤ tierBudget`):

| | Rookie | Veteran | Ace |
|---|---|---|---|
| share per weapon (hand ≤ 10) | 30 cells | 120: 2 full boxes of 45 + 30 cells | 300: 20 boxes of 15 (the best exact aim's support only from what is left) |
| stationary total | ≤ 300 | ≤ 1,200 | ≤ 3,000 |
| moves | — | only while weak: ≤ 2 sides × 150 | always: ≤ 2 sides × 350 |
| DIRT | — | — | ≤ 300: (options + 1) estimates of `⌊300 / (options + 1)⌋ − 1` sims, each after its 1 resolve |
| cap / sweep mean / sweep max (20,004 decisions) | 300 / 144 / 300 | 1,500 / 651 / 1,200 | 4,000 / 2,123 / 3,700 |

**The budget column is a cap** (D2, ⚑ O18). Fixed shares make late-match turns spend a fraction of it: Rookie spends 30 sims in sudden death, and the sweep means are about half of each cap. Splitting the stationary budget over the remaining hand would also be data-independent. The fixed share is kept because it is spec-literal ("fixed sim counts") and strength-neutral: the Ace at half its stationary budget won 55.0% against the full one (§1). T16 writes this reading into spec §5, unless the owner rules otherwise.

**Probe accounting:** per decision, one grid per distinct model in hand from where the tank stands, one per side for the mover's model, and Rookie-grid threat grids on the DIRT boards (at most 5 boards). Sweep means and maxima: Rookie 564 / 1,737, Veteran 3,559 / 9,357, Ace 21,773 / 49,900 flights. A plain Ace grid costs 11.5 ms (2.5 µs a flight; Pinball 12.2 µs, Seeker 12.8 µs).

### 3.4 Noise: `ai/noise.ts`

```ts
// src/game/titles/arcfire/ai/noise.ts
//
// Aim noise (spec §5): "a seeded sum of 3 uniform integers" from the MATCH
// RNG. Part i is uniform on [-a_i, a_i] with a_i = floor((bound + i) / 3), so
// the three half-ranges sum to the bound and |noise| <= bound:
//   bound 1 (Ace):     parts 0, 0, 1  -> uniform on -1..1
//   bound 2 (Veteran): parts 0, 1, 1  -> weights 1 2 3 2 1 (of 9)
//   bound 3 (Veteran): parts 1, 1, 1  -> weights 1 3 6 7 6 3 1 (of 27)
//   bound 6 (Rookie):  parts 2, 2, 2  -> a bell over -6..6 (of 125)
//   bound 8 (Rookie):  parts 2, 3, 3  -> a bell over -8..8 (of 245)
// Every call draws exactly 3 values (a part of 0 still draws nextRange(rng,
// 1)), so the RNG order never depends on the tier. noiseKernel is the exact
// integer distribution the noise-aware search ranks aims by.
import { nextRange, type Rng } from "@/game/sim/math/rng";
import { idiv } from "../imath";

/** The half-range of part i (0..2) of a noise of maximum `bound`. */
export const noisePart = (bound: number, i: number): number => idiv(bound + i, 3);

/** One noise value of maximum `bound`: exactly three draws from rng. */
export function drawNoise(rng: Rng, bound: number): number {
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const a = noisePart(bound, i);
    n += nextRange(rng, 2 * a + 1) - a;
  }
  return n;
}

/** The exact distribution of drawNoise(rng, bound): integer weights for -bound..bound, summing to the product of (2 a_i + 1). */
export function noiseKernel(bound: number): Int32Array {
  let k = new Int32Array(1);
  k[0] = 1;
  for (let i = 0; i < 3; i++) {
    const a = noisePart(bound, i);
    const next = new Int32Array(k.length + 2 * a);
    for (let j = 0; j < k.length; j++) for (let d = 0; d <= 2 * a; d++) next[j + d] += k[j];
    k = next;
  }
  return k;
}

/** The sum of a kernel's weights (its denominator). */
export function kernelTotal(k: Int32Array): number {
  let s = 0;
  for (let i = 0; i < k.length; i++) s += k[i];
  return s;
}
```

| Bound | Parts | Distribution | P(exact aim) |
|---|---|---|---|
| ±1 (Ace, both axes) | 0, 0, 1 | uniform −1..1 (of 3) | 33% |
| ±2 (Veteran angle) | 0, 1, 1 | 1 2 3 2 1 (of 9) | 33% |
| ±3 (Veteran power) | 1, 1, 1 | 1 3 6 7 6 3 1 (of 27) | 26% |
| ±6 (Rookie angle) | 2, 2, 2 | a bell over −6..6 (of 125) | 15% |
| ±8 (Rookie power) | 2, 3, 3 | a bell over −8..8 (of 245) | 12% |

Every value in −bound..bound is reachable (no holes, unlike strength's scaled bell), and the draw count never depends on the tier. `nextRange(rng, n)` is `nextU32 % n`: for n ∈ {1, 3, 5, 7} its bias is below 10^−9 and is deterministic in any case.

### 3.5 The per-weapon search and the turn: `ai/search.ts`, `ai/plan.ts`

```ts
// src/game/titles/arcfire/ai/search.ts
//
// One weapon's search (spec §5 steps 1-2), under a fixed allowance of full
// resolves ("sims"):
//   1. its probe model's landing grid from the shooter's position (probe.ts);
//   2. refine centres: each angle row's aim that lands nearest the enemy,
//      rows in (distance, cell) order and at least one refine box apart, so
//      the boxes spread along the whole firing-solution curve (direct shots
//      and lobs); Rookie has no box, so its centres are single cells;
//   3. every cell of each centre's refine box, in order, fully resolved on a
//      scratch copy (copyMatchInto + resolveTurnPoints), each (angle, power)
//      at most once, until the allowance is spent;
//   4. the answer: the best value at an exact aim, or (a noise-aware tier)
//      the best expected value under the tier's own noise over the aims whose
//      whole noise support was resolved, compared with the best exact aim's
//      expected value when its support is resolved (completing it only if the
//      share still has room, which it seldom has: the boxes spend it).
// A candidate's value is points to the enemy minus points gifted by
// self-damage (spec §5). Pure with respect to the match: nothing here writes
// the searched state or draws from its RNG. Every comparison is a strict >
// in a fixed order, so ties keep the earlier candidate. Integer math only.
import { fromInt } from "@/game/sim/math/fixed";
import { cloneMatch, copyMatchInto, type MatchState } from "../state";
import { resolveTurnPoints } from "../resolve";
import { spansFromHeight } from "../terrain";
import { hitCircles, moveTarget } from "../tanks";
import { ROSTER } from "../weapons/roster";
import { idiv } from "../imath";
import { STEPS_PER_SEC, TANK_HIT_DY } from "../constants";
import { probeModelOf, type ProbeModel } from "./model";
import { landingGrid, type Grid, type ProbeBoard } from "./probe";
import { kernelTotal, noiseKernel } from "./noise";
import type { TierSpec } from "./tiers";

/** A candidate command and its worth: ev = value x ctx.scale (the expected value under noise for a noise-aware tier), raw = the value at exactly this aim. */
export interface Cand {
  w: number; // roster index
  move: -1 | 0 | 1;
  angle: number;
  power: number;
  ev: number;
  raw: number;
}

export type AiReason = "random" | "best" | "move" | "saveT3" | "dirt" | "forcedDirt" | "inertOnly";

/** What one AI decision cost and why it chose: counts only, never a clock. */
export interface AiStats {
  sims: number; // full resolves: never above the tier's budget
  probes: number; // probe flights
  staySims: number;
  moveSims: number;
  dirtSims: number;
  reply: number; // the enemy's estimated best reply to the offensive pick (-1: not estimated)
  replyDirt: number; // ... after the best DIRT option (-1: none tried)
  reason: AiReason;
}

export interface SearchCtx {
  m: MatchState; // the state searched: never written
  t: TierSpec;
  me: number;
  foe: number;
  base: MatchState; // m's scratch copy with spans built: every probe of this decision flies over it
  windStep: number;
  ka: Int32Array; // the angle noise kernel ([1] when the tier is not noise-aware)
  kp: Int32Array; // the power noise kernel ([1] likewise)
  scale: number; // the kernels' combined total: every ev is points x scale
  stats: AiStats;
  grids: Map<string, Grid>; // (side, model key) -> landing grid; get/set only, never iterated
}

// --- module scratch: the AI runs one decision at a time on its thread (worker or verifier), and never re-enters

const SLOTS: (MatchState | null)[] = [null, null, null];
export const BASE_SLOT = 0; // the probe board of a decision
export const RESOLVE_SLOT = 1; // every candidate resolve
export const POST_SLOT = 2; // a board after the AI's own shot (the DIRT rule)

/** A reused scratch match holding a copy of src (spans stale until a resolve or spansFromHeight). */
export function scratch(slot: number, src: MatchState): MatchState {
  const s = SLOTS[slot];
  if (s === null) {
    const c = cloneMatch(src);
    SLOTS[slot] = c;
    return c;
  }
  copyMatchInto(s, src);
  return s;
}

const CELLS = 181 * 101; // every (angle, power) a command can name: key a * 101 + p
const VALS = new Int32Array(CELLS); // the value of each resolved aim of the current weapon ...
const STAMP = new Int32Array(CELLS); // ... valid while STAMP[key] === GEN
const ORDER = new Int32Array(CELLS); // the keys resolved for the current weapon, in resolution order
let GEN = 0;
let COUNT = 0;

/** A fresh generation: forget every value (the stamp wraps before 2^31, so decisions never depend on history). */
function newWeapon(): void {
  GEN++;
  if (GEN > 0x3fffffff) {
    STAMP.fill(0);
    GEN = 1;
  }
  COUNT = 0;
}

export const newStats = (): AiStats => ({
  sims: 0, probes: 0, staySims: 0, moveSims: 0, dirtSims: 0, reply: -1, replyDirt: -1, reason: "best",
});

export function makeCtx(m: MatchState, t: TierSpec, stats: AiStats): SearchCtx {
  const base = scratch(BASE_SLOT, m);
  spansFromHeight(base.terrain);
  const ka = noiseKernel(t.noiseAware ? t.noiseA : 0);
  const kp = noiseKernel(t.noiseAware ? t.noiseP : 0);
  return {
    m, t, me: m.shooter, foe: 1 - m.shooter, base, windStep: idiv(fromInt(m.wind), STEPS_PER_SEC),
    ka, kp, scale: kernelTotal(ka) * kernelTotal(kp), stats, grids: new Map(),
  };
}

/** The probe board with the shooter where it stands (side 0) or after a legal one-step move to `side`. */
export function boardAt(ctx: SearchCtx, side: -1 | 0 | 1): ProbeBoard {
  const b = ctx.base;
  const tanks = hitCircles(b);
  if (side !== 0) {
    const nx = moveTarget(b, ctx.me, side);
    tanks[ctx.me] = { x: nx, y: b.terrain.height[nx] - TANK_HIT_DY };
  }
  return { t: b.terrain, tanks, me: ctx.me, windStep: ctx.windStep };
}

/** The tier's landing grid for `model` from `side`, flown once per decision. */
export function gridFor(ctx: SearchCtx, side: -1 | 0 | 1, model: ProbeModel): Grid {
  const key = `${side}|${model.key}`;
  let g = ctx.grids.get(key);
  if (g === undefined) {
    g = landingGrid(boardAt(ctx, side), model, ctx.t, ctx.stats);
    ctx.grids.set(key, g);
  }
  return g;
}

/** Resolve one candidate on the scratch copy: points scored minus points gifted (spec §5). */
export function valueOf(ctx: SearchCtx, from: MatchState, w: number, move: -1 | 0 | 1, angle: number, power: number): number {
  const r = scratch(RESOLVE_SLOT, from);
  const shooter = r.shooter;
  const pts = resolveTurnPoints(r, { move, weapon: w, angle, power });
  ctx.stats.sims++;
  return pts[shooter] - pts[1 - shooter];
}

/** The grid's cells in (metric, cell) order: every cell (perCell), or each angle row's nearest cell with rows at least `gap` apart. */
export function centres(g: Grid, gap: number, perCell: boolean): number[] {
  const np = g.powers.length;
  const cand: number[] = [];
  for (let i = 0; i < g.angles.length; i++) {
    if (perCell) {
      for (let j = 0; j < np; j++) cand.push(i * np + j);
      continue;
    }
    let bc = i * np;
    for (let j = 1; j < np; j++) if (g.metric[i * np + j] < g.metric[bc]) bc = i * np + j;
    cand.push(bc);
  }
  cand.sort((x, y) => g.metric[x] - g.metric[y] || x - y);
  if (perCell || gap <= 1) return cand;
  const out: number[] = [];
  for (const c of cand) {
    const row = idiv(c, np);
    let ok = true;
    for (const o of out) {
      const d = idiv(o, np) - row;
      if (d < gap && d > 0 - gap) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(c);
  }
  return out;
}

const clampA = (a: number): number => (a < 0 ? 0 : a > 180 ? 180 : a);
const clampP = (p: number): number => (p < 0 ? 0 : p > 100 ? 100 : p);

/** The value at (a, p) if resolved for the current weapon, else null. */
function known(a: number, p: number): number | null {
  const k = a * 101 + p;
  return STAMP[k] === GEN ? VALS[k] : null;
}

/** The expected value x scale of aiming at (a, p) under the tier's noise (clamped as the command is), or null while its support is not all resolved. A beam ignores power: all its power weight sits on p. */
function evAt(ctx: SearchCtx, a: number, p: number, beam: boolean): number | null {
  const ka = ctx.ka;
  const kp = ctx.kp;
  const na = (ka.length - 1) >> 1;
  const np = (kp.length - 1) >> 1;
  let sum = 0;
  for (let i = 0; i < ka.length; i++) {
    const aa = clampA(a + i - na);
    for (let j = 0; j < kp.length; j++) {
      const v = known(aa, beam ? p : clampP(p + j - np));
      if (v === null) return null;
      sum += ka[i] * kp[j] * v;
    }
  }
  return sum;
}

/** Resolve (a, p) for weapon w if it is new and the allowance has room; true when it was resolved. */
function tryResolve(ctx: SearchCtx, w: number, move: -1 | 0 | 1, a: number, p: number, left: { n: number }): boolean {
  if (a < 0 || a > 180 || p < 0 || p > 100) return false;
  const k = a * 101 + p;
  if (STAMP[k] === GEN || left.n <= 0) return false;
  left.n--;
  VALS[k] = valueOf(ctx, ctx.m, w, move, a, p);
  STAMP[k] = GEN;
  ORDER[COUNT++] = k;
  return true;
}

/** Weapon w's best candidate after `move` (the move is part of every resolve), spending at most `share` sims. */
export function searchWeapon(ctx: SearchCtx, w: number, move: -1 | 0 | 1, share: number): Cand {
  const t = ctx.t;
  const model = probeModelOf(ROSTER[w]);
  const beam = model.beam !== null;
  const g = gridFor(ctx, move, model);
  const rA = t.refineA;
  const rP = beam ? 0 : t.refineP;
  const perCell = t.refineA === 0 && t.refineP === 0;
  const cs = centres(g, perCell ? 0 : idiv(2 * rA + t.angleStep, t.angleStep), perCell); // ceil((2 rA + 1) / angleStep) rows: the boxes never overlap
  const left = { n: share };
  newWeapon();
  for (const c of cs) {
    if (left.n <= 0) break;
    const a0 = g.angles[idiv(c, g.powers.length)];
    const p0 = g.powers[c % g.powers.length];
    for (let da = 0 - rA; da <= rA; da++) for (let dp = 0 - rP; dp <= rP; dp++) tryResolve(ctx, w, move, a0 + da, p0 + dp, left);
  }
  if (COUNT === 0) { // nothing resolved (a zero allowance): the nearest aim, unscored
    const c = cs[0];
    return { w, move, angle: g.angles[idiv(c, g.powers.length)], power: g.powers[c % g.powers.length], ev: 0, raw: 0 };
  }
  // the best exact aim (the first of equals)
  let top = ORDER[0];
  for (let i = 1; i < COUNT; i++) if (VALS[ORDER[i]] > VALS[top]) top = ORDER[i];
  const ta = idiv(top, 101);
  const tp = top % 101;
  if (!t.noiseAware) return { w, move, angle: ta, power: tp, ev: VALS[top] * ctx.scale, raw: VALS[top] };
  // noise-aware: the best expected value among aims whose support is resolved
  let best: Cand | null = null;
  const n = COUNT;
  for (let i = 0; i < n; i++) {
    const k = ORDER[i];
    const ev = evAt(ctx, idiv(k, 101), k % 101, beam);
    if (ev !== null && (best === null || ev > best.ev)) best = { w, move, angle: idiv(k, 101), power: k % 101, ev, raw: VALS[k] };
  }
  // the best exact aim's own EV: compared when its support is resolved (completed first only if the allowance still has room)
  if (best === null || best.angle !== ta || best.power !== tp) {
    const na = (ctx.ka.length - 1) >> 1;
    const np = beam ? 0 : (ctx.kp.length - 1) >> 1;
    let missing = 0;
    for (let i = 0 - na; i <= na; i++) {
      for (let j = 0 - np; j <= np; j++) if (known(clampA(ta + i), clampP(tp + j)) === null) missing++;
    }
    if (missing <= left.n) {
      for (let i = 0 - na; i <= na; i++) for (let j = 0 - np; j <= np; j++) tryResolve(ctx, w, move, clampA(ta + i), clampP(tp + j), left);
      const ev = evAt(ctx, ta, tp, beam);
      if (ev !== null && (best === null || ev > best.ev)) best = { w, move, angle: ta, power: tp, ev, raw: VALS[top] };
    }
  }
  return best ?? { w, move, angle: ta, power: tp, ev: VALS[top] * ctx.scale, raw: VALS[top] };
}
```

```ts
// src/game/titles/arcfire/ai/plan.ts
//
// The AI turn search (spec §5), RNG-free: planTurn(m, tier) never writes m
// and never draws from m.rng, so hints, previews and tests can call it
// freely; policy.ts draws the choice and the noise afterwards.
//   1. every damaging weapon in hand, from where the tank stands, with an
//      equal share of the tier's stationary budget (search.ts);
//   2. Rookie: its choices are the pickTop best by value (DIRT at 0);
//   3. moves (Veteran while its best is below moveBelow, Ace always): the
//      best `movers` weapons re-searched from each legal side, re-probed from
//      the moved tank; a move must gain moveGain points;
//   4. the offensive pick: the best value, then Ace's tier-3 saving;
//   5. DIRT (Ace, holding DIRT, in battle): when the enemy's estimated best
//      reply to the pick is >= DIRT_THREAT and a build cuts it by >= DIRT_GAIN.
// Every weapon in a hand is fired exactly once, so saving a tier-3 weapon or
// building a wall only reorders shots: the rules decide WHEN, not whether.
import { copyMatchInto, type MatchState } from "../state";
import { resolveTurnPoints } from "../resolve";
import { hitCircles, moveTarget } from "../tanks";
import { ROSTER } from "../weapons/roster";
import { idiv } from "../imath";
import { SUDDEN_DEATH_WEAPON, WORLD_W } from "../constants";
import { dealsDamage, probeModelOf } from "./model";
import { FAR, LAND_TERRAIN, landingGrid, type Grid, type ProbeBoard } from "./probe";
import {
  POST_SLOT, gridFor, makeCtx, newStats, scratch, searchWeapon, valueOf,
  type AiStats, type Cand, type SearchCtx,
} from "./search";
import {
  BUDGET_HAND, DIRT_FRONT, DIRT_GAIN, DIRT_THREAT, THREAT_AIMS, TIERS, type AiTier, type TierSpec,
} from "./tiers";

export interface Plan {
  choices: Cand[]; // policy.ts draws one uniformly: Rookie's top pickTop, otherwise exactly one
  ranked: Cand[]; // every weapon in hand from where the tank stands, best first (DIRT at 0)
  stats: AiStats;
}

/** Candidates best first: ev descending, then the lower tier (an equal shot spends the cheaper weapon), then roster index. */
export const byValue = (a: Cand, b: Cand): number => b.ev - a.ev || ROSTER[a.w].tier - ROSTER[b.w].tier || a.w - b.w;

/** The offensive pick: the first best ev; a saveTier3 tier then fires a tier-3 pick only if it beats the best other weapon (ev > 0) strictly and by >= 20%. */
export function chooseOffence(cands: readonly Cand[], t: TierSpec): { pick: Cand | null; saved: boolean } {
  let pick: Cand | null = null;
  for (const c of cands) if (pick === null || c.ev > pick.ev) pick = c;
  if (pick === null || !t.saveTier3 || ROSTER[pick.w].tier !== 3) return { pick, saved: false };
  let alt: Cand | null = null;
  for (const c of cands) if (ROSTER[c.w].tier !== 3 && c.ev > 0 && (alt === null || c.ev > alt.ev)) alt = c;
  if (alt === null || (pick.ev > alt.ev && pick.ev * 5 >= alt.ev * 6)) return { pick, saved: false };
  return { pick: alt, saved: true };
}

/** The first grid cell (in cell order) whose terrain landing is nearest column x: a DIRT placement aim. */
function aimNear(g: Grid, x: number): number {
  let bc = 0;
  let bd = FAR;
  for (let c = 0; c < g.metric.length; c++) {
    if (g.kind[c] !== LAND_TERRAIN) continue;
    const d = g.x[c] < x ? x - g.x[c] : g.x[c] - x;
    if (d < bd) {
      bd = d;
      bc = c;
    }
  }
  return bc;
}

const cellCand = (g: Grid, w: number, c: number): Cand => ({
  w, move: 0, angle: g.angles[idiv(c, g.powers.length)], power: g.powers[c % g.powers.length], ev: 0, raw: 0,
});

/**
 * The enemy's best reply on `post` (a board after the AI's shot, spans built, post.shooter = the enemy):
 * each damaging enemy weapon at its THREAT_AIMS nearest aims on Rookie's grid, fully resolved; at most
 * `allowance` sims. An estimate, deliberately cheap: it decides only whether a wall is worth building.
 */
function threat(ctx: SearchCtx, post: MatchState, allowance: number): number {
  const foe = post.shooter;
  const board: ProbeBoard = { t: post.terrain, tanks: hitCircles(post), me: foe, windStep: ctx.windStep };
  const grids = new Map<string, Grid>();
  let best = 0;
  let spent = 0;
  for (const w of post.hands[foe]) {
    if (!dealsDamage(ROSTER[w])) continue;
    const model = probeModelOf(ROSTER[w]);
    let g = grids.get(model.key);
    if (g === undefined) {
      g = landingGrid(board, model, TIERS.rookie, ctx.stats);
      grids.set(model.key, g);
    }
    const taken: number[] = [];
    for (let k = 0; k < THREAT_AIMS; k++) {
      let bc = -1;
      for (let c = 0; c < g.metric.length; c++) {
        if (taken.includes(c)) continue;
        if (bc < 0 || g.metric[c] < g.metric[bc]) bc = c;
      }
      if (bc < 0 || g.metric[bc] >= FAR || spent >= allowance) break;
      taken.push(bc);
      spent++;
      const v = valueOf(ctx, post, w, 0, g.angles[idiv(bc, g.powers.length)], g.powers[bc % g.powers.length]);
      if (v > best) best = v;
    }
  }
  ctx.stats.dirtSims += spent;
  return best;
}

/** Resolve `c` for the AI on the post-shot scratch and hand that board to the enemy. */
function afterShot(ctx: SearchCtx, c: Cand): MatchState {
  const post = scratch(POST_SLOT, ctx.m);
  resolveTurnPoints(post, { move: c.move, weapon: c.w, angle: c.angle, power: c.power });
  ctx.stats.sims++;
  ctx.stats.dirtSims++;
  post.shooter = ctx.foe;
  return post;
}

/** Search the turn of m.shooter at `tier`. Pure with respect to m (and m.rng). */
export function planTurn(m: MatchState, tier: AiTier): Plan {
  return planWith(m, TIERS[tier]);
}

export function planWith(m: MatchState, t: TierSpec): Plan {
  const stats = newStats();
  const ctx = makeCtx(m, t, stats);
  const me = ctx.me;
  const hand = m.phase === "suddenDeath" ? [SUDDEN_DEATH_WEAPON] : m.hands[me].slice();
  const offence = hand.filter((w) => dealsDamage(ROSTER[w]));
  const inert = hand.filter((w) => !dealsDamage(ROSTER[w]));

  // 1. every damaging weapon from where the tank stands, an equal fixed share each
  const share = idiv(t.stay, hand.length > BUDGET_HAND ? hand.length : BUDGET_HAND);
  const per: Cand[] = [];
  for (const w of offence) per.push(searchWeapon(ctx, w, 0, share));
  stats.staySims = stats.sims;
  per.sort(byValue);
  const ranked = per.slice();
  for (const w of inert) { // DIRT: worth 0 as an attack, aimed at its nearest landing to the enemy
    const g = gridFor(ctx, 0, probeModelOf(ROSTER[w]));
    let bc = 0;
    for (let c = 1; c < g.metric.length; c++) if (g.metric[c] < g.metric[bc]) bc = c;
    ranked.push(cellCand(g, w, bc));
  }
  ranked.sort(byValue);

  // 2. Rookie: uniform among its pickTop best (policy.ts draws)
  if (t.pickTop > 1) {
    stats.reason = "random";
    return { choices: ranked.slice(0, Math.min(t.pickTop, ranked.length)), ranked, stats };
  }

  // 3. moves: the best weapons again from each legal side, re-probed from the moved tank
  let bestMove: Cand | null = null;
  const stayBest = per.length > 0 ? per[0] : null;
  if (t.moveEach > 0 && stayBest !== null && stayBest.ev < t.moveBelow * ctx.scale) {
    const movers = per.slice(0, Math.min(t.movers, per.length));
    const mshare = idiv(t.moveEach, movers.length);
    const before = stats.sims;
    for (const d of [-1, 1] as const) {
      if (moveTarget(m, me, d) === -1) continue;
      for (const c of movers) {
        const r = searchWeapon(ctx, c.w, d, mshare);
        if (bestMove === null || r.ev > bestMove.ev) bestMove = r;
      }
    }
    stats.moveSims = stats.sims - before;
  }
  const cands = per.slice();
  const moved = bestMove !== null && stayBest !== null && bestMove.ev >= stayBest.ev + t.moveGain * ctx.scale;
  if (moved && bestMove !== null) cands.unshift(bestMove); // first: it wins an ev tie

  // 4. the offensive pick
  const chosen = chooseOffence(cands, t);
  let pick = chosen.pick;
  stats.reason = chosen.saved ? "saveT3" : pick !== null && pick.move !== 0 ? "move" : "best";

  // 5. DIRT: when the enemy's best reply to the pick is big and a build cuts it (or when only DIRT is left)
  if (t.dirt > 0 && m.phase === "battle" && inert.length > 0) {
    const options: Cand[] = [];
    const dir = m.tankX[ctx.foe] > m.tankX[me] ? 1 : -1;
    const spots = [m.tankX[me] + dir * DIRT_FRONT, (m.tankX[me] + m.tankX[ctx.foe]) >> 1];
    for (const w of inert.slice(0, 2)) {
      const g = gridFor(ctx, 0, probeModelOf(ROSTER[w]));
      for (const x of spots) options.push(cellCand(g, w, aimNear(g, x < 0 ? 0 : x > WORLD_W - 1 ? WORLD_W - 1 : x)));
    }
    const each = idiv(t.dirt, options.length + 1) - 1; // each estimate's allowance: the resolve before it is the 1
    let r0 = DIRT_THREAT; // with no offensive weapon left, DIRT is forced
    if (pick !== null) {
      r0 = threat(ctx, afterShot(ctx, pick), each);
      stats.reply = r0;
    }
    if (r0 >= DIRT_THREAT) {
      let bestD: Cand | null = null;
      let bestR = 0;
      for (const o of options) {
        const r = threat(ctx, afterShot(ctx, o), each);
        if (bestD === null || r < bestR) {
          bestD = o;
          bestR = r;
        }
      }
      stats.replyDirt = bestD === null ? -1 : bestR;
      if (bestD !== null && (pick === null || r0 - bestR >= DIRT_GAIN)) {
        stats.reason = pick === null ? "forcedDirt" : "dirt";
        pick = bestD;
      }
    }
  }
  if (pick === null) { // only DIRT in hand and no DIRT decision: fire the best-ranked
    stats.reason = "inertOnly";
    pick = ranked[0];
  }
  return { choices: [pick], ranked, stats };
}
```

Notes for the implementer:
- **The purity guard scans comments** (2A K6): these files say "refine box", never the w-word, and avoid `performance`, `document` and `navigator`.
- **`Array.prototype.sort` only with total comparators** (every tie falls through to a cell index or a roster index), so the engine's sort algorithm and stability can't matter; `Map` is used for lookups only, never iterated for a decision.
- **Products stay small:** the largest is an EV term, 3 × 3 kernel weights × a value ≤ ~300 points (Veteran's ranking is not noise-aware); `moveBelow × scale` is at most 2^30 × 9 < 2^34; every integer is far below 2^53.
- **The module scratch** (`SLOTS`, `VALS`, `STAMP`, `ORDER`) assumes one synchronous decision at a time per thread: true in the worker, in the verifier and in each `worker_threads` sweep worker (module instances are per thread). The stamp generation wraps (a `fill(0)`) before 2^30, so no decision can depend on how many ran before it (strength's `GEN` could).
- **`planWith`** exists for tests and ablations; production code calls `planTurn` (through `aiTurn`).

### 3.6 The decision and its RNG: `ai/policy.ts`

```ts
// src/game/titles/arcfire/ai/policy.ts
//
// An AI decision = a pure search + a FIXED number of match-RNG draws. The RNG
// order is normative (hashMatch folds rng.state), and it never depends on the
// tier, so a resume can skip an AI entry's draws without searching:
//   an AI draft pick consumes exactly AI_PICK_DRAWS = 1 draw:
//     nextRange(rng, k) over the k available weapons with the highest power;
//   an AI turn consumes exactly AI_TURN_DRAWS = 7 draws, after its search:
//     1 choosing among plan.choices, then 3 for the angle noise, then 3 for
//     the power noise.
// Nothing else in the AI touches the RNG.
import { nextRange } from "@/game/sim/math/rng";
import { ROSTER } from "../weapons/roster";
import type { MatchState } from "../state";
import type { TurnCommand } from "../match";
import { drawNoise } from "./noise";
import { planTurn, type Plan } from "./plan";
import { TIERS, type AiTier } from "./tiers";

export const AI_PICK_DRAWS = 1;
export const AI_TURN_DRAWS = 7;

/** The pool index the AI drafts (spec §5: by roster power; Rookie among the top 8, Veteran the top 3, Ace the best). Exactly 1 draw. */
export function aiPick(m: MatchState, tier: AiTier): number {
  const avail: number[] = [];
  for (let i = 0; i < m.pool.length; i++) if (m.poolOwner[i] === -1) avail.push(i);
  avail.sort((a, b) => ROSTER[m.pool[b]].power - ROSTER[m.pool[a]].power || a - b); // ties: pool order (= roster order)
  return avail[nextRange(m.rng, Math.min(TIERS[tier].draftTop, avail.length))];
}

/** The AI's turn command and the plan it came from. Exactly 7 draws; the command is legal by construction. */
export function aiTurn(m: MatchState, tier: AiTier): { cmd: TurnCommand; plan: Plan } {
  const t = TIERS[tier];
  const plan = planTurn(m, tier);
  const c = plan.choices[nextRange(m.rng, plan.choices.length)];
  const a = c.angle + drawNoise(m.rng, t.noiseA);
  const p = c.power + drawNoise(m.rng, t.noiseP);
  return { cmd: { move: c.move, w: c.w, angle: a < 0 ? 0 : a > 180 ? 180 : a, power: p < 0 ? 0 : p > 100 ? 100 : p }, plan };
}
```

**Why the command is always legal.** The angle and power are clamped to the wire ranges; the weapon comes from the hand (every candidate does), or is Pulse in sudden death; a move comes only from a side where `moveTarget` accepted it on this very state. `stepAi` asserts it anyway (§6.3), and every sweep turn re-checks it on a clone.

### 3.7 Tie-breaking, completely

- **Probe cells:** row-major (facing angle from the horizon first, then power).
- **Centres:** each row keeps its first nearest power; rows by (squared distance, cell index).
- **Refine:** box cells in (angle offset ascending, power offset ascending) order; the best exact aim and the best EV keep the first maximum in resolution order.
- **Weapons:** `byValue` = ev descending, then tier ascending, then roster index ascending.
- **Moves:** sides −1 then +1; a moved candidate replaces the best so far only if strictly better; a paying move goes first in `cands`.
- **`chooseOffence`** keeps the first maximum; the DIRT options go in (hand order, front before midway) order and the lowest reply keeps the first.
- **The draft:** power descending, then pool index ascending (= roster index, the pool is ascending).

---

## 4 · Evaluation and the probe model (deliverable c)

### 4.1 The value of a candidate

`value = points[me] − points[foe]` of one quiet resolve of the real state (`copyMatchInto` into a scratch, then `resolveTurnPoints`). `resolveWeapon` credits the shooter with the damage the enemy took and the enemy with the shooter's self-damage, so this is exactly spec §5's "points to the enemy − points gifted by self-damage". A move is part of the candidate: the resolve performs it first, so a moved candidate is valued from its new position with its own hitboxes. Terrain, settle, homing, bounces, rolls, fire, quakes, beams and splits are the real sim's; the AI never models a weapon's effect itself.

The tier heuristics sit on top of the value, never inside it: the Ace's expected value under its noise (§4.4), the move rule, the tier-3 rule and the DIRT rule (§4.5).

### 4.2 The probe: `ai/model.ts`, `ai/probe.ts`

```ts
// src/game/titles/arcfire/ai/model.ts
//
// The AI's only knowledge of weapons, derived from WeaponDef data (no weapon
// ids anywhere in the AI), so an appended weapon needs no AI code:
//   probeModelOf: what the probe flies for a weapon (spec §5 step 1): the
//     launch's speed and gravity scales plus the first stage's flight
//     modifiers (homing, terrain bounces, wall bounces, stop at the apex),
//     and for an apex split the centre child it continues along;
//   dealsDamage: whether a weapon can score at all (the DIRT weapons cannot).
import type { Effect, Stage, WeaponDef } from "../weapons/types";

/** How a probe shell flies until its terminal trigger: the ballistics.ts Shell fields a Stage arms. */
export interface FlightMods {
  stopAtApex: boolean;
  homeDeg: number;
  bounces: number;
  wallBounces: number;
  restitutionPct: number;
}

export interface ProbeModel {
  key: string; // equal keys fly identically, so one landing grid serves every weapon with that key
  beam: { length: number; width: number; count: number; spreadDeg: number } | null; // beams: straight lines on the beam dial
  speedPct: number;
  gravityPct: number;
  mods: FlightMods;
  apex: { from: "up" | "ahead" | "cone"; speedPct: number; child: FlightMods } | null; // an apex split: its centre child
}

const modsOf = (st: Stage): FlightMods => ({
  stopAtApex: st.on === "apex",
  homeDeg: st.homing ? st.homing.degPerStep : 0,
  bounces: st.bounce && !st.bounce.walls ? st.bounce.times : 0,
  wallBounces: st.bounce && st.bounce.walls ? st.bounce.times : 0,
  restitutionPct: st.bounce ? st.bounce.restitutionPct : 100,
});

const modsKey = (f: FlightMods): string => `${f.stopAtApex ? 1 : 0}/${f.homeDeg}/${f.bounces}/${f.wallBounces}/${f.restitutionPct}`;

const PLAIN: FlightMods = { stopAtApex: false, homeDeg: 0, bounces: 0, wallBounces: 0, restitutionPct: 100 };

export function probeModelOf(def: WeaponDef): ProbeModel {
  const l = def.launch;
  if (l.kind === "beam") {
    const beam = { length: l.length, width: l.width, count: l.count ?? 1, spreadDeg: l.spreadDeg ?? 0 };
    return { key: `beam/${beam.length}/${beam.width}/${beam.count}/${beam.spreadDeg}`, beam, speedPct: 0, gravityPct: 0, mods: PLAIN, apex: null };
  }
  const speedPct = l.speedPct ?? 100;
  const gravityPct = l.gravityPct ?? 100;
  const st = def.stage;
  if (!st) return { key: `s/${speedPct}/${gravityPct}`, beam: null, speedPct, gravityPct, mods: PLAIN, apex: null };
  const mods = modsOf(st);
  let apex: ProbeModel["apex"] = null;
  if (st.on === "apex") {
    for (const e of st.effects) {
      if ("split" in e) {
        apex = { from: e.split.from, speedPct: e.split.speedPct, child: modsOf(e.split.child) };
        break;
      }
    }
  }
  const key = `s/${speedPct}/${gravityPct}/${modsKey(mods)}` + (apex ? `/${apex.from}/${apex.speedPct}/${modsKey(apex.child)}` : "");
  return { key, beam: null, speedPct, gravityPct, mods, apex };
}

/** Can this weapon score points at all? False exactly for pure DIRT (a build and nothing that hurts, anywhere in its stages). */
export function dealsDamage(def: WeaponDef): boolean {
  if (def.launch.kind === "beam") return def.launch.damage > 0;
  const seen = new Set<Stage>(); // a cyclic definition adds nothing new
  const listHurts = (list: readonly Effect[] | undefined): boolean => {
    for (const e of list ?? []) {
      if ("blast" in e || "roll" in e || "burn" in e || "quake" in e) return true;
      if ("dig" in e && (e.dig.then !== undefined || e.dig.each !== undefined)) return true;
      if ("split" in e && stageHurts(e.split.child)) return true;
      if ("delay" in e && listHurts(e.delay.then)) return true;
    }
    return false;
  };
  const stageHurts = (st: Stage): boolean => {
    if (seen.has(st)) return false;
    seen.add(st);
    return st.bounce?.blastEach !== undefined || listHurts(st.effects) || listHurts(st.early);
  };
  return def.stage !== undefined && stageHurts(def.stage);
}
```

```ts
// src/game/titles/arcfire/ai/probe.ts
//
// The coarse probe (spec §5 step 1): where does an aim land? It flies the
// weapon's probe model (model.ts) with the sim's OWN flight code (muzzle,
// launchShell, stepShell: no second integrator), effect-free, over a settled
// board whose spans are built, and writes nothing to the board. A plain
// model lands exactly where a plain shell's blast would; bounces, wall
// bounces and homing fly exactly as the first shell of the weapon does; an
// apex split continues along its centre child from the apex (Hailstorm's
// cone lands 100-160 px short of a plain shell, and this follows it). A beam
// probe is the fireBeams line on the beam dial, every beam of the fan. The
// probe only ORDERS aims: every value the AI acts on comes from a full
// resolve, so a probe that differs from the real weapon costs search
// quality, never correctness. Pure integer math.
import type { Fx } from "@/game/sim/types";
import { fromInt, mul, toInt } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "../aimTable";
import { launchShell, muzzle, shellAt, stepShell, type HitCircle, type Shell } from "../ballistics";
import { beamDir, fanOffset } from "../weapons/primitives";
import { idiv } from "../imath";
import { TANK_HIT_R, WORLD_H, WORLD_W } from "../constants";
import type { Terrain } from "../terrain";
import type { FlightMods, ProbeModel } from "./model";
import { BEAM_POWER, type TierSpec } from "./tiers";

/** What a probe flies over: settled terrain with its spans built, both hitbox centres (the shooter's possibly moved), the wind step. */
export interface ProbeBoard {
  t: Terrain;
  tanks: HitCircle[];
  me: number;
  windStep: Fx;
}

export const LAND_OUT = 0; // left the world, or its flight cap
export const LAND_TERRAIN = 1;
export const LAND_FOE = 2;
export const LAND_SELF = 3;
/** The metric of a landing that is no use: out, or on the shooter's own tank. Above every real squared distance. */
export const FAR = 1 << 30;

/** One landing grid: every (angle, power) of a tier's probe grid for one model from one position. Cell c = ia * powers.length + ip. */
export interface Grid {
  angles: Int32Array; // command angles
  powers: Int32Array;
  kind: Uint8Array; // LAND_*
  x: Int32Array; // the landing px (first solid or hitbox px; for a beam, its sample nearest the foe)
  y: Int32Array;
  metric: Int32Array; // squared px from the landing to the foe's hitbox centre: 0 = on the foe, FAR = no use
}

function arm(s: Shell, f: FlightMods, board: ProbeBoard): void {
  const foe = board.tanks[1 - board.me];
  s.stopAtApex = f.stopAtApex;
  s.homeDeg = f.homeDeg;
  s.homeX = foe.x; // addShell's homing target: the foe's hitbox centre, fixed for the shot
  s.homeY = foe.y;
  s.bounces = f.bounces;
  s.wallBounces = f.wallBounces;
  s.restitutionPct = f.restitutionPct;
}

/** Fly one shell probe; writes (kind, x, y) into out. */
function flyShell(board: ProbeBoard, model: ProbeModel, angle: number, power: number, out: Int32Array): void {
  const me = board.tanks[board.me];
  const mz = muzzle(me.x, me.y, angle);
  let s = launchShell(mz.x, mz.y, angle, power, model.speedPct, model.gravityPct);
  arm(s, model.mods, board);
  for (;;) {
    const hit = stepShell(s, board.t, board.tanks, board.windStep);
    if (hit === null || hit.kind === "bounce") continue;
    if (hit.kind === "apex") {
      const a = model.apex;
      if (a === null) { // an apex stage with no split acts where it stops
        out[0] = LAND_TERRAIN;
        out[1] = hit.x;
        out[2] = hit.y;
        return;
      }
      // the centre child (fan offset 0, no gap), launched as primitives.split launches it
      const speed = idiv(s.speed * a.speedPct, 100);
      const vx = a.from === "up" ? 0 : a.from === "cone" ? s.vx : idiv(s.vx * a.speedPct, 100);
      const vy = a.from === "up" ? 0 - speed : a.from === "cone" ? s.vy + speed : idiv(s.vy * a.speedPct, 100);
      s = shellAt(hit.fx, hit.fy, vx, vy, speed, s.gravityStep);
      arm(s, a.child, board);
      continue;
    }
    if (hit.kind === "out") {
      out[0] = LAND_OUT;
      out[1] = hit.x;
      out[2] = hit.y;
      return;
    }
    out[0] = hit.kind === "tank" ? (hit.tank === board.me ? LAND_SELF : LAND_FOE) : LAND_TERRAIN;
    out[1] = hit.x;
    out[2] = hit.y;
    return;
  }
}

/** A beam fan on the beam dial: the fireBeams line of every beam; writes (kind, x, y) of the sample nearest the foe, and returns its squared distance. */
function flyBeam(board: ProbeBoard, beam: NonNullable<ProbeModel["beam"]>, angle: number, out: Int32Array): number {
  const me = board.tanks[board.me];
  const foe = board.tanks[1 - board.me];
  let best = FAR;
  out[1] = me.x;
  out[2] = me.y;
  for (let b = 0; b < beam.count; b++) {
    const a = beamDir(board.me, angle + fanOffset(b, beam.count, beam.spreadDeg));
    const mz = muzzle(me.x, me.y, a);
    const dx = toInt(mul(fromInt(beam.length), cosDeg(a)));
    const dy = 0 - toInt(mul(fromInt(beam.length), sinDeg(a)));
    const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let i = 0; i <= n; i++) {
      const sx = mz.x + idiv(dx * i, n);
      const sy = mz.y + idiv(dy * i, n);
      if (sx < 0 || sx >= WORLD_W || sy >= WORLD_H) break; // fireBeams' stops: the side edges and the floor
      const ex = sx - foe.x;
      const ey = sy - foe.y;
      if (ex * ex + ey * ey < best) {
        best = ex * ex + ey * ey;
        out[1] = sx;
        out[2] = sy;
      }
    }
  }
  const reach = TANK_HIT_R + idiv(beam.width, 2);
  out[0] = best <= reach * reach ? LAND_FOE : LAND_TERRAIN;
  return best;
}

const LAND = new Int32Array(3);

/**
 * The tier's landing grid for one model from the board's shooter position. Shells fly the facing
 * quarter (facing degrees 0..90: command angle f for player 0, 180 - f for player 1), a wall bouncer
 * the facing half (0..180), at powers powerStep..100. A beam sweeps the whole dial 0..180 at BEAM_POWER
 * (dial 90 is level at the opponent for both players). counter.probes counts the flights.
 */
export function landingGrid(board: ProbeBoard, model: ProbeModel, spec: TierSpec, counter: { probes: number }): Grid {
  const span = model.beam !== null || model.mods.wallBounces > 0 ? 180 : 90;
  const na = idiv(span, spec.angleStep) + 1;
  const np = model.beam !== null ? 1 : idiv(100, spec.powerStep);
  const angles = new Int32Array(na);
  const powers = new Int32Array(np);
  for (let i = 0; i < na; i++) angles[i] = model.beam !== null || board.me === 0 ? i * spec.angleStep : 180 - i * spec.angleStep;
  if (model.beam !== null) powers[0] = BEAM_POWER;
  else for (let j = 0; j < np; j++) powers[j] = (j + 1) * spec.powerStep;
  const n = na * np;
  const g: Grid = { angles, powers, kind: new Uint8Array(n), x: new Int32Array(n), y: new Int32Array(n), metric: new Int32Array(n) };
  const foe = board.tanks[1 - board.me];
  for (let c = 0; c < n; c++) {
    const a = angles[idiv(c, np)];
    let d: number;
    if (model.beam !== null) d = flyBeam(board, model.beam, a, LAND);
    else {
      flyShell(board, model, a, powers[c % np], LAND);
      const ex = LAND[1] - foe.x;
      const ey = LAND[2] - foe.y;
      d = LAND[0] === LAND_FOE ? 0 : LAND[0] === LAND_TERRAIN ? ex * ex + ey * ey : FAR;
    }
    counter.probes++;
    g.kind[c] = LAND[0];
    g.x[c] = LAND[1];
    g.y[c] = LAND[2];
    g.metric[c] = d; // < FAR for every real landing (at most about 1,300^2 px), so it always ranks before a useless one
  }
  return g;
}
```

**"Lands near the enemy"** is the squared pixel distance from the probe's first contact pixel (the first solid or hitbox pixel, Plan 1's blast centre) to the enemy's hitbox centre, 0 for a hit on the enemy's hitbox; a probe that leaves a side edge, reaches the flight cap or hits the shooter's own tank is `FAR` (2^30) and sorts last. A beam's metric is the squared distance from its nearest in-world sample (of every beam of the fan) to the enemy's hitbox centre.

The roster flies **12 models**: the plain family (20 weapons: every impact weapon without flight modifiers, DIRT included), Needle (115/100), Railshot (180/40), Hydra and Barrage (apex, `ahead` 100%, sharing one grid), Hailstorm (apex, `cone` 50%), Skipper, Pinball, Ricochet (walls: the facing half), Seeker, Swarm, Lancer and Prism.

### 4.3 How each weapon family is handled

The rule is the same for every family: the probe orders, the full resolve decides.

| Family (roster) | Probe model | What the full resolve adds |
|---|---|---|
| Impact blasts (Pulse, Pulse II, Nova, Crater, Twin Nova), volleys (Triad, Fan), impact splits (Cascade, Shrapnel), rolls (Tumbler, Juggernaut), digs (Burrow, Auger), fire (Inferno, Wildfire), quakes (Quake, Aftershock), DIRT | plain (speed and gravity scales of the launch) | every shell of a volley, the whole split tree, the roll downhill, the pitch-clamped tunnel, the flows, the horizontal shockwave, self-damage |
| Needle, Railshot | their own speed/gravity classes | the knife-edged 10 px / 18 px blasts: the Ace's EV prefers aims that still hit under its noise |
| Apex splits (Hydra, Barrage; Hailstorm) | the parent to its apex, then the **centre child** (offset 0, no gap) with `split()`'s `ahead`/`cone` velocity rule | every child, the gaps, `early` blasts, duds. Without the child rule Hailstorm lands 100–160 px short of a plain probe and is unaimable (minimal measured Ace finding 14.7 of 79.5 points) |
| Bouncers (Skipper, Pinball) | the first shell with its terrain bounces (the radius-8 normal of the real `stepShell`) | `blastEach`, the final blast wherever the last bounce ends |
| Ricochet | the first shell with its wall bounces, over the facing **half** (0..180): bank shots are searched (a judge's defect in strength and minimal) | the wall reflections and the blast |
| Homing (Seeker, Swarm) | the first shell steering toward the enemy after its apex (Swarm: the centre shell of the fan) | every shell's steering and blast |
| Beams (Lancer, Prism) | the `fireBeams` line of every beam of the fan on the beam dial (`beamDir`), 0..180 at `BEAM_POWER` | carving, both tanks, the floor stop |
| Sudden death | the plain model (the hand is `[Pulse]`) | — |

### 4.4 Expected value under the Ace's own noise

For an aim `(a, p)`, `EV × 9 = Σ_{i,j} k_a[i] · k_p[j] · value(clamp(a + i − 1), clamp(p + j − 1))`, with the uniform kernels [1, 1, 1] of the literal ±1 noise (§3.4). The clamps are the ones the command will get. It is computed only for resolved aims whose whole support was resolved (the centre column of each 3 × 5 box has it); the best exact aim's support is completed only from a share's leftover sims, which is almost never (§3.3). Everything is an integer.

**Why it matters for strength:** the spec applies noise after the choice. A point-evaluating Ace picks the knife-edge aim (Needle's 10 px blast, a lob grazing a crest, Pinball's lucky sixth bounce) and then misses it two times in three with the literal ±1 noise. Measured: the point-evaluating Ace wins **19.4%** against this one (−13.4 net points a shot).
**Why it matters for feel:** the Ace prefers the middle of a hit plateau, so it hits 91–92% of its shots and its misses are near misses, not "psychic" pinpoint shots.

Rookie and Veteran rank by the value at the exact aim ("best by evaluation", spec §5). A noise-aware Veteran is one flag (`noiseAware: true`): measured, the grid human beat it 23/60 instead of 25/60 (⚑ O2).

### 4.5 The tier heuristics

- **Moves** (`moveBelow`, `movers`, `moveGain`): Veteran looks only while its best stationary value is below 25 points; the Ace always looks. The best stationary weapon is searched again from each legal side with a fresh probe grid from the moved tank; a move must gain ≥ 8 points (of ev). Measured per 200 matches: Ace 80–82 moves, Veteran 13–26. Moves are scarce (4 a match); strength-neutral (52.2%).
- **Tier-3 saving** (Ace, `chooseOffence`): fire a tier-3 pick only if `ev > alt` and `5·ev ≥ 6·alt`, where `alt` is the best non-tier-3 candidate with ev > 0; otherwise fire `alt`. Every weapon is fired eventually, so this only orders shots. 561 saves in ~16,000 harness shots; strength-neutral (53.1%).
- **DIRT** (Ace, battle, DIRT in hand): `r0` = `threat` on a copy after the planned shot (each damaging enemy weapon at its 2 nearest aims on Rookie's grid, fully resolved as the enemy: an optimistic estimate). If `r0 ≥ 60` (or no offensive weapon is left), each of the first two DIRT weapons is resolved at its aim landing nearest 90 px in front of the tank and nearest the midpoint between the tanks, and `threat` is estimated again on each. The option with the lowest reply is fired if it cuts `r0` by ≥ 20 (forced: whatever is least bad). Budget ≤ 300 sims, split `⌊300 / (options + 1)⌋ − 1` per estimate. Harness: 363 defensive and 468 forced DIRT shots in 400 matches; strength-neutral (53.8%).

---

## 5 · The draft AI (deliverable d)

`aiPick(m, tier)` (§3.6) sorts the available pool indices by (`ROSTER[pool[i]].power` descending, pool index ascending) and draws `nextRange(m.rng, min(draftTop, n))`: **Rookie among the top 8, Veteran among the top 3, Ace the first**. It consumes exactly one draw even when `k = 1`, so the RNG order is the same at every tier (D8). It reads only `power` and the pool; hand composition and denial are not modelled, as the spec defines the draft AI by `power`, and a `power` that measures points per shot (D21) already ranks what a weapon adds to a match.

**`power` is an AI input.** A change to any weapon's `power` changes the AI's drafts, so it moves the AI corpus's draft section and the vs-AI goldens (a declared re-pin, §9.4) and, after launch, needs a `simVersion` bump (D23). It moves none of the existing pins: `defDigest` excludes `power` (a new always-on assertion in `corpus.test.ts` pins that), and the Plan 1 and full-roster goldens draft by fixed slot rules.

With the first-run powers (§9.5), the Ace would draft Twin Nova (100), Swarm (93), Nova (90), Juggernaut (84), Needle (79) and Aftershock (76) first, and never Auger (12) or the DIRT weapons (Rampart 10, Bastion 20, Leveler 1) unless the pool leaves nothing else.

---

## 6 · vs-AI matches, replay, resume and the verifier result (deliverable e)

### 6.1 The flow

- **Seats.** The human is `HUMAN = 0` (left, red) and the AI `AI = 1` (right, blue; spec §6.2's colours). The seeded coin flip decides who picks first; the other seat shoots first (spec §2).
- **The interleaving rule.** The AI acts whenever it is its move: once right after `createMatch`, and again after every human command, until the human is to act or the match is over (`toAct(m)`: the picker in the draft, the shooter after it, −1 when over).
- **When the AI acts twice in a row.** The draft makes `2 × weaponsEach` picks, so the last pick belongs to the seat that did not pick first, which also shoots first. When the human picked first, the AI therefore makes the last pick and then fires the opening shot. Sudden death starts with the same opener, which is never a double. A test pins both cases (§10.3).
- **A vs-AI match** is `seed + settings + tier + the human's commands`: at most `2 × weaponsEach + 1` of them (21 for the daily: 10 picks, 10 shots, 1 sudden-death shot).

### 6.2 `match.ts` and `replay.ts` edits (inert)

`toAct` names "whose command the match waits for" once, for `vsai.ts` and the host; `applyCommand` is the one never-throwing way to apply a log entry, shared by `replayMatch`, `replayVsAi`, `resumeVsAi` and the host. The Plan 1 and full-roster goldens prove the refactor inert.

```diff
--- a/src/game/titles/arcfire/match.ts
+++ b/src/game/titles/arcfire/match.ts
@@ -66,6 +66,12 @@
   };
 }
 
+/** Whose command the match waits for: the picker in the draft, the shooter after it, or -1 once it is over. */
+export function toAct(m: MatchState): number {
+  if (m.phase === "over") return -1;
+  return m.phase === "draft" ? pickerAt(m.firstPicker, m.picksMade) : m.shooter;
+}
+
 /** Draft pick (by pool index) for whoever's pick it is. */
 export function applyPick(m: MatchState, poolIndex: number): PickResult {
   if (m.phase !== "draft") return { ok: false, reason: "invalid_command" };
```

```diff
--- a/src/game/titles/arcfire/replay.ts
+++ b/src/game/titles/arcfire/replay.ts
@@ -1,8 +1,9 @@
 // src/game/titles/arcfire/replay.ts
 //
 // The Arcfire command log (spec §1.3, §7): one entry per draft pick or turn,
-// in order. A 2-player log holds BOTH players' commands; a vs-AI log (Plan 2)
-// holds only the human's, with the AI's regenerated during replay. Any illegal
+// in order. A 2-player log holds BOTH players' commands and replays here; a
+// vs-AI log holds only the human's and replays in vsai.ts (replayVsAi), which
+// regenerates every AI pick and shot. Both apply entries with applyCommand. Any illegal
 // command rejects the whole log, and a malformed log (not an array, a
 // non-object entry, an unknown `k`) is rejected the same way — replayMatch
 // never throws on one. An UNFINISHED log is accepted (resume re-simulates a
@@ -14,6 +15,7 @@
 import { createMatch, applyPick, applyTurn } from "./match";
 import { hashMatch } from "./hash";
 import type { MatchSettings, MatchState } from "./state";
+import type { Timeline } from "./timeline";
 
 export type ArcfireCommand =
   | { k: "pick"; w: number } // w = pool index
@@ -29,19 +31,26 @@
   | { ok: true; state: MatchState; hash: string }
   | { ok: false; reason: "invalid_command"; atIndex: number };
 
+export type CommandResult = { ok: true; timeline: Timeline | null } | { ok: false };
+
+/** Apply one log entry for whoever is to act (a pick has no Timeline). Never throws: a malformed entry is { ok: false } and changes nothing. */
+export function applyCommand(m: MatchState, entry: unknown): CommandResult {
+  if (typeof entry !== "object" || entry === null) return { ok: false };
+  const c = entry as ArcfireCommand;
+  if (c.k === "pick") return applyPick(m, c.w).ok ? { ok: true, timeline: null } : { ok: false };
+  if (c.k === "turn") {
+    const r = applyTurn(m, { move: c.move, w: c.w, angle: c.angle, power: c.power });
+    return r.ok ? { ok: true, timeline: r.timeline } : { ok: false };
+  }
+  return { ok: false };
+}
+
 /** Replay a 2-player command log from a fresh match. */
 export function replayMatch(r: ArcfireReplay): ReplayMatchResult {
   if (!Array.isArray(r.commands)) return { ok: false, reason: "invalid_command", atIndex: 0 };
   const m = createMatch(r.seed, r.settings);
   for (let i = 0; i < r.commands.length; i++) {
-    const entry: unknown = r.commands[i];
-    if (typeof entry !== "object" || entry === null) return { ok: false, reason: "invalid_command", atIndex: i };
-    const c = entry as ArcfireCommand;
-    let res: { ok: boolean };
-    if (c.k === "pick") res = applyPick(m, c.w);
-    else if (c.k === "turn") res = applyTurn(m, { move: c.move, w: c.w, angle: c.angle, power: c.power });
-    else return { ok: false, reason: "invalid_command", atIndex: i };
-    if (!res.ok) return { ok: false, reason: "invalid_command", atIndex: i };
+    if (!applyCommand(m, r.commands[i]).ok) return { ok: false, reason: "invalid_command", atIndex: i };
   }
   return { ok: true, state: m, hash: hashMatch(m) };
 }
```

### 6.3 `vsai.ts`

```ts
// src/game/titles/arcfire/vsai.ts
//
// vs-AI matches (spec §1.3, §7). The human is player 0 (left, red), the AI
// player 1 (right, blue); the seeded coin flip still decides who picks first.
// A vs-AI match is seed + settings + tier + the HUMAN's commands only: the
// AI's picks and shots are regenerated. The interleaving rule: the AI acts
// whenever it is its move, right after createMatch and after every human
// command, until the human is to act or the match is over (between two human
// commands it makes 0, 1 or 2 actions: its last pick, then the opening shot).
// The AI's commands are legal by construction; an illegal one is a bug and
// throws (the verifier's route answers 500, never a verdict on the player).
import { nextU32 } from "@/game/sim/math/rng";
import { applyPick, applyTurn, createMatch, toAct, type TurnCommand } from "./match";
import { applyCommand, type ArcfireCommand } from "./replay";
import { hashMatch } from "./hash";
import type { MatchSettings, MatchState } from "./state";
import type { Timeline } from "./timeline";
import { AI_PICK_DRAWS, AI_TURN_DRAWS, aiPick, aiTurn } from "./ai/policy";
import type { Plan } from "./ai/plan";
import type { AiTier } from "./ai/tiers";

export const HUMAN = 0;
export const AI = 1;

export type AiAction =
  | { k: "pick"; w: number }
  | { k: "turn"; cmd: TurnCommand; timeline: Timeline; plan: Plan };

export const aiToAct = (m: MatchState): boolean => toAct(m) === AI;

/** The most commands a human can send in a vs-AI match: every pick and shot, plus one sudden-death shot (21 for the daily). */
export const maxHumanCommands = (s: MatchSettings): number => 2 * s.weaponsEach + 1;

/** One AI action if it is the AI's move, else null. */
export function stepAi(m: MatchState, tier: AiTier): AiAction | null {
  if (!aiToAct(m)) return null;
  if (m.phase === "draft") {
    const w = aiPick(m, tier);
    if (!applyPick(m, w).ok) throw new Error("arcfire AI made an illegal pick");
    return { k: "pick", w };
  }
  const { cmd, plan } = aiTurn(m, tier);
  const r = applyTurn(m, cmd);
  if (!r.ok) throw new Error("arcfire AI made an illegal turn");
  return { k: "turn", cmd, timeline: r.timeline, plan };
}

/** Let the AI act until it is the human's move or the match is over. */
export function advanceAi(m: MatchState, tier: AiTier): AiAction[] {
  const out: AiAction[] = [];
  for (let a = stepAi(m, tier); a !== null; a = stepAi(m, tier)) out.push(a);
  return out;
}

export interface VsAiReplay {
  seed: number;
  settings: MatchSettings; // trusted (the verifier derives them from the mode)
  tier: AiTier; // trusted, likewise
  commands: unknown; // the human's commands only
}

export type VsAiResult =
  | { ok: true; state: MatchState; hash: string; finished: boolean; humanPoints: number; aiPoints: number; margin: number; humanWon: boolean }
  | { ok: false; reason: "invalid_command" | "too_long"; atIndex: number };

/**
 * Replay a vs-AI match from the human's commands alone, regenerating every AI pick and shot (the
 * leaderboard's core guarantee). Never throws on the commands: a non-array or an illegal or malformed
 * entry is invalid_command at its index, and more than maxHumanCommands is too_long before any AI
 * work. Like replayMatch it accepts an unfinished log, so a verifier also requires `finished`.
 */
export function replayVsAi(r: VsAiReplay): VsAiResult {
  if (!Array.isArray(r.commands)) return { ok: false, reason: "invalid_command", atIndex: 0 };
  const max = maxHumanCommands(r.settings);
  if (r.commands.length > max) return { ok: false, reason: "too_long", atIndex: max };
  const m = createMatch(r.seed, r.settings);
  advanceAi(m, r.tier);
  for (let i = 0; i < r.commands.length; i++) {
    if (toAct(m) !== HUMAN || !applyCommand(m, r.commands[i]).ok) return { ok: false, reason: "invalid_command", atIndex: i };
    advanceAi(m, r.tier);
  }
  const hp = m.scores[HUMAN];
  const ap = m.scores[AI];
  return {
    ok: true, state: m, hash: hashMatch(m), finished: m.phase === "over",
    humanPoints: hp, aiPoints: ap, margin: hp - ap, humanWon: m.phase === "over" && m.winner === HUMAN,
  };
}

export type VsAiResume =
  | { ok: true; state: MatchState; log: ArcfireCommand[]; humanLog: ArcfireCommand[]; droppedFrom: number }
  | { ok: false };

/**
 * Resume a vs-AI match from its local blob's FULL log (both seats, in order) without a single
 * search: an AI entry is applied as recorded after advancing the RNG by the draws its decision
 * consumed (AI_PICK_DRAWS / AI_TURN_DRAWS). The state equals replayVsAi of the human sub-log whenever
 * the AI entries came from this code at this simVersion (the blob key carries it). Never throws: the
 * first entry that is malformed or illegal, and everything after it, is dropped (droppedFrom; -1 when
 * none was), and a non-array log is { ok: false }. It does not run the AI: if the log ends on the AI's
 * move, the caller's advanceAi continues. Local resume only: a submission is the human sub-log, and
 * the server regenerates every AI decision from it.
 */
export function resumeVsAi(r: { seed: number; settings: MatchSettings; log: unknown }): VsAiResume {
  if (!Array.isArray(r.log)) return { ok: false };
  const m = createMatch(r.seed, r.settings);
  const log: ArcfireCommand[] = [];
  const humanLog: ArcfireCommand[] = [];
  for (let i = 0; i < r.log.length; i++) {
    const entry: unknown = r.log[i];
    const ai = aiToAct(m);
    const before = m.rng.state;
    if (ai) for (let d = 0; d < (m.phase === "draft" ? AI_PICK_DRAWS : AI_TURN_DRAWS); d++) nextU32(m.rng);
    if (!applyCommand(m, entry).ok) {
      m.rng.state = before; // an illegal entry changed nothing else
      return { ok: true, state: m, log, humanLog, droppedFrom: i };
    }
    log.push(entry as ArcfireCommand);
    if (!ai) humanLog.push(entry as ArcfireCommand);
  }
  return { ok: true, state: m, log, humanLog, droppedFrom: -1 };
}
```

**`replayVsAi` never throws on the commands.** Every entry goes through `applyCommand`; a command sent when it is not the human's move, or after the match is over, is `invalid_command` at its index; more than `maxHumanCommands` is `too_long` before any AI work. The `throw` in `stepAi` is a programming-error assertion: the AI's commands are legal by construction (§3.6), every sweep turn re-checks legality, and a throw inside the route becomes its generic 500, never a verdict on the player. Like `replayMatch`, it accepts an unfinished log, so a verifier also requires `finished` (which `scoreVsAi` does).

**`replayMatch` is unchanged in behaviour.** 2-player logs keep their own replay; the goldens keep replaying through it.

### 6.4 The RNG consumption order (normative: `hashMatch` folds `rng.state`)

| When | Draws | Source |
|---|---|---|
| `createMatch` | 9 terrain control points; one per guaranteed tag plus the Fisher–Yates shuffle of the rest; 1 coin flip | Plan 1/2A, unchanged |
| an AI pick | **exactly 1**: `nextRange(rng, min(draftTop, available))`, before `applyPick` | `aiPick` |
| a human pick | 0 | |
| the last pick, and each resolved turn | 1 wind draw in `beginTurn`, **only** when `settings.wind` | Plan 1, unchanged |
| an AI turn | **exactly 7**, after its search and before `applyTurn`: 1 `nextRange(rng, choices.length)`, then the angle noise (3 draws), then the power noise (3 draws) | `aiTurn` |
| a human turn | 0 (then the wind draw above) | |
| the search (probes, candidate resolves, threat estimates) | **0**: every resolve runs on a scratch copy, and weapons consume no RNG (2A D16) | `plan.ts`, `search.ts` |

So one exchange is: the human's command (+ its wind draw) → the AI's 7 draws → the AI's `applyTurn` (+ its wind draw). Because the counts are fixed and tier-independent, `resumeVsAi` can skip them with `nextU32` without knowing the drawn values.

### 6.5 Resume without a search

A Plan 3 resume blob is `{ v: ARCFIRE_SIM_VERSION, seed, settings, mode, opponent, log }`, where `log` holds both seats' commands in order (the host's `state.log` plus every `picked`/`shot` event since; §8.5). `resumeVsAi` re-applies it: at each AI entry (`aiToAct` says so; the log needs no tags) it advances the RNG by `AI_PICK_DRAWS` or `AI_TURN_DRAWS` before applying the recorded command. The state is then bit-identical to the regenerating replay of the human sub-log whenever the AI entries came from this code at this `simVersion`; the blob key carries `simVersion` and a mismatched save is discarded (spec §6.5). It never throws: a non-array log is `{ ok: false }` (the host answers `bad_log`), and the first malformed or illegal entry and everything after it are dropped (`droppedFrom`), so a damaged save resumes at its last good command.

Measured: `resumeVsAi` + `advanceAi` equalled `replayVsAi` of the human sub-log on **41/41 prefixes** of each golden; a full-log resume takes 1.4–1.7 ms against ≈ 0.7 s to regenerate a Veteran log (an Ace log would take ≈ 2 s on a desktop and ≈ 13–21 s at 4–6× CPU throttle: the cost minimal left open). A tampered blob can only change the tamperer's local game: the daily submission is the human sub-log (`humanLog`), and the server regenerates every AI decision from it.

### 6.6 The verifier-facing result: `verify.ts`

```ts
// src/game/titles/arcfire/verify.ts
//
// The verifier-facing result of a vs-AI match (spec §7): the function Plan
// 4's Arcfire TitleDef binding wraps. Input: the seed and the HUMAN's
// commands only; the settings and the tier are trusted (the binding derives
// them from the mode: the daily challenge is STANDARD_SETTINGS vs Veteran).
// Every AI pick and shot is regenerated. Never throws on any `commands` value.
import type { ReplayOutcome, ReplayRejection } from "@/game/sim/title";
import { STANDARD_SETTINGS, type MatchSettings } from "./state";
import { maxHumanCommands, replayVsAi } from "./vsai";
import type { ArcfireCommand } from "./replay";
import type { AiTier } from "./ai/tiers";

/** The daily challenge's opponent (spec §6.4, §7). */
export const DAILY_TIER: AiTier = "veteran";

const isInt = (v: unknown): boolean => typeof v === "number" && Number.isInteger(v);

/** A structurally valid command (spec §7's shape); legality (whose move, which weapon, the ranges) is the replay's job. */
export function isArcfireCommand(c: unknown): c is ArcfireCommand {
  if (typeof c !== "object" || c === null) return false;
  const o = c as Record<string, unknown>;
  if (o.k === "pick") return isInt(o.w);
  if (o.k === "turn") return (o.move === -1 || o.move === 0 || o.move === 1) && isInt(o.w) && isInt(o.angle) && isInt(o.power);
  return false;
}

/**
 * Score a finished vs-AI match from the human's log: score = the margin (human - AI points), stat = the
 * human's points, hash = hashMatch of the final state. Rejections, cheapest first: invalid_command_shape
 * (not an array), too_long (more than 2 x weaponsEach + 1 commands, before any AI work),
 * invalid_command_shape (an entry of the wrong shape), invalid_command (an illegal command at any index),
 * not_a_win (unfinished, lost, or drawn).
 */
export function scoreVsAi(
  seed: number, commands: unknown, settings: MatchSettings = STANDARD_SETTINGS, tier: AiTier = DAILY_TIER,
): ReplayOutcome | { rejected: ReplayRejection } {
  if (!Array.isArray(commands)) return { rejected: "invalid_command_shape" };
  if (commands.length > maxHumanCommands(settings)) return { rejected: "too_long" };
  for (const c of commands) if (!isArcfireCommand(c)) return { rejected: "invalid_command_shape" };
  const r = replayVsAi({ seed, settings, tier, commands });
  if (!r.ok) return { rejected: r.reason };
  if (!r.finished || !r.humanWon) return { rejected: "not_a_win" };
  return { score: r.margin, stat: r.humanPoints, hash: r.hash };
}
```

Measured on the prototype (§10.5 pins each): the win golden gives `{ score: 85, stat: 254, hash: "be9db94d" }`; the loss golden, the first 15 commands, and an empty log give `not_a_win`; the win log under the next seed and one angle set to 181 give `invalid_command`; a `null` entry, `move: 2`, a string and `7` give `invalid_command_shape`; 22 commands give `too_long`.

**What Plan 4 writes** (its `titles/arcfire/title.ts`; a sketch, not part of 2B):

```ts
export const arcfireTitle: TitleDef<ArcfireCommand> = {
  slug: ARCFIRE_SLUG,
  simVersion: ARCFIRE_SIM_VERSION,
  replay(input) { // verifyScore has already checked the version, the daily mode and the seed (spec §1.2)
    return scoreVsAi(input.seed, input.commands, STANDARD_SETTINGS, DAILY_TIER);
  },
};
```

- The settings and the tier come from the mode, never from the submission (spec §7); Arcfire has only the daily board, so the generic `verifyScore` must refuse a non-daily Arcfire submission before `replay` (Plan 4 item), rather than mapping it to a replay rejection.
- `limits.maxTicks` does not apply: the run is bounded by `too_long` (21 commands) and the fixed sim budgets, at most 11 Veteran turns × 1,500 sims.
- The zod schema's command shape (spec §7) mirrors `isArcfireCommand`.
- `replay_hash` for the row: Plan 4's per-title command-log digest over the human's commands.

---

## 7 · Performance (deliverable f)

### 7.1 Where a decision's time goes

Measured with the bundled sim on the dev machine:

| Item | Cost |
|---|---|
| `cloneMatch` (2A's per-candidate copy) | **33.1 µs** |
| `copyMatchInto` (2B's) | **0.20 µs** |
| a quiet sim on a copy, opponent-facing grid: Pulse / roster mean / max (Pinball) | **16.8 / 33.9 / 87.4 µs** with the quick-reject (a Pulse sim was 66 µs on the probe bench before it) |
| a probe flight, Ace grid: plain / Needle / Railshot / Hydra / Hailstorm | 2.5 / 2.7 / 4.6 / 2.6 / 2.1 µs (before the quick-reject 9.7 / 11.3 / 28.9 / 15.2 / 13.1) |
| … Skipper / Pinball / Ricochet / Seeker / Swarm | 7.7 / 12.2 / 3.4 / 12.8 / 9.2 µs (before 28.4 / 42.4 / 16.6 / 28.5 / 22.5) |
| … a beam dial angle: Lancer / Prism | 2.0 / 5.8 µs |
| 2A's `perf.test.ts` (unchanged assertions): Pulse / Swarm / Prism `resolveTurn` | 0.021 / 0.046 / 0.119 ms (before: 0.028 / 0.095 / 0.123) |

An Ace decision averages ≈ 21,800 probe flights (≈ 55% of its time) and ≈ 2,120 sims (the sweep's 12,004 Ace decisions; at most 49,900 and 3,700). The same Ace match measured 457 ms a turn before the quick-reject and 153 ms after, with identical decisions.

### 7.2 `copyMatchInto` (`state.ts`)

```diff
--- a/src/game/titles/arcfire/state.ts
+++ b/src/game/titles/arcfire/state.ts
@@ -62,3 +62,42 @@
     scores: m.scores.slice(),
   };
 }
+
+/**
+ * Copy every field of `src` into `dst` in place, allocating nothing (the AI's
+ * per-candidate reset: one scratch match reused for thousands of resolves).
+ * The in-shot spans are NOT copied: dst.terrain.spans / spanCount stay stale
+ * until spansFromHeight runs, and resolveWeapon runs it before anything reads
+ * them. So dst is a valid argument to resolveTurn / resolveTurnPoints /
+ * resolveWeapon and to hashMatch, but not to an isSolid reader before a
+ * resolve. dst must come from createMatch or cloneMatch; it never shares an
+ * array with src (a poolOwner of another length is reallocated).
+ */
+export function copyMatchInto(dst: MatchState, src: MatchState): void {
+  dst.settings = src.settings;
+  dst.rng.state = src.rng.state;
+  dst.phase = src.phase;
+  dst.terrain.height.set(src.terrain.height);
+  dst.tankX[0] = src.tankX[0];
+  dst.tankX[1] = src.tankX[1];
+  dst.movesLeft[0] = src.movesLeft[0];
+  dst.movesLeft[1] = src.movesLeft[1];
+  copyInts(dst.pool, src.pool);
+  if (dst.poolOwner.length !== src.poolOwner.length) dst.poolOwner = new Int32Array(src.poolOwner.length);
+  dst.poolOwner.set(src.poolOwner);
+  dst.firstPicker = src.firstPicker;
+  dst.picksMade = src.picksMade;
+  copyInts(dst.hands[0], src.hands[0]);
+  copyInts(dst.hands[1], src.hands[1]);
+  dst.shooter = src.shooter;
+  dst.shotsFired = src.shotsFired;
+  dst.wind = src.wind;
+  dst.scores[0] = src.scores[0];
+  dst.scores[1] = src.scores[1];
+  dst.winner = src.winner;
+}
+
+function copyInts(dst: number[], src: readonly number[]): void {
+  dst.length = src.length;
+  for (let i = 0; i < src.length; i++) dst[i] = src[i];
+}
```

It copies every field `hashMatch` reads plus the hands and the pool, never shares an array with `src`, and skips the 77 KB span buffer, which every resolve rebuilds from `height` (`spansFromHeight` at its start). Its completeness is tested against `Object.keys` (a new `MatchState` field fails the test until it is copied), against `hashMatch`, and by resolve parity (§10.1). The search keeps three module scratch matches (`BASE`, `RESOLVE`, `POST`), so a candidate allocates only what `resolveTurnPoints` itself does.

### 7.3 K12: gating the quiet path's allocations (strength's exact edits)

```diff
--- a/src/game/titles/arcfire/terrain.ts
+++ b/src/game/titles/arcfire/terrain.ts
@@ -236,6 +236,7 @@
 // Scratch for carveCapsule: per-column [lo, hi) bounds over the columns it touches.
 const CAP_LO = new Int32Array(WORLD_W);
 const CAP_HI = new Int32Array(WORLD_W);
+const CAP_HALF = new Int32Array(17); // half-heights for radii up to 16 (the validator's largest capsule: dig width 32); larger radii allocate
 
 /**
  * Remove a capsule — the union of radius-r discs centred on every <= 1 px
@@ -253,7 +254,7 @@
     CAP_LO[c] = 2147483647;
     CAP_HI[c] = -2147483648;
   }
-  const half = new Int32Array(r + 1); // half[d] = the disc's half-height d columns from its centre
+  const half = r < CAP_HALF.length ? CAP_HALF : new Int32Array(r + 1); // half[d] = the disc's half-height d columns from its centre
   for (let d = 0; d <= r; d++) half[d] = isqrt(r * r - d * d);
   const dx = x1 - x0;
   const dy = y1 - y0;
@@ -277,9 +278,11 @@
  * material in a column ends up as ONE span resting on the floor, so the new
  * surface is WORLD_H minus the column's total solid length. `collect = false`
  * skips building `falls` (the quiet resolve path); the terrain is identical.
+ * With `collect = false`, `heights` is the live heightfield (no copy) and
+ * `falls` is a shared empty array: the quiet path discards both.
  */
 export function settle(t: Terrain, collect = true): SettleResult {
-  const falls: SettleFall[] = [];
+  const falls: SettleFall[] = collect ? [] : NO_FALLS;
   for (let x = 0; x < WORLD_W; x++) {
     const o = x * STRIDE;
     let stackTop = WORLD_H;
@@ -292,5 +295,7 @@
     t.height[x] = stackTop;
   }
   spansFromHeight(t);
-  return { heights: t.height.slice(), falls };
+  return { heights: collect ? t.height.slice() : t.height, falls }; // quiet: the live heightfield, not a copy
 }
+
+const NO_FALLS: SettleFall[] = [];
```

```diff
--- a/src/game/titles/arcfire/weapons/primitives.ts
+++ b/src/game/titles/arcfire/weapons/primitives.ts
@@ -130,12 +130,12 @@
   return shot.shells.length - 1;
 }
 
-/** Fan offset of item i of count across a TOTAL spread (the volley rule; count > 1 guards the divisor). */
+/** Fan offset of item i of count across a TOTAL spread (the volley rule; count > 1 guards the divisor). `| 0`: a zero offset is +0, never -0 (Timeline angles). */
 export const fanOffset = (i: number, count: number, spread: number): number =>
-  count > 1 ? idiv((2 * i - (count - 1)) * spread, 2 * (count - 1)) : 0;
+  count > 1 ? idiv((2 * i - (count - 1)) * spread, 2 * (count - 1)) | 0 : 0;
 
 function split(shot: Shot, trig: Trigger, sp: Split): void {
-  const children: number[] = [];
+  const children: number[] | null = shot.rec ? [] : null;
   const speed = idiv(trig.speed * sp.speedPct, 100); // the children's nominal speed
   for (let i = 0; i < sp.count; i++) {
     const off = fanOffset(i, sp.count, sp.spreadDeg);
@@ -155,31 +155,32 @@
     const gx = sp.gapPx ? idiv((2 * i - (sp.count - 1)) * sp.gapPx, 2) : 0;
     const s = shellAt(trig.fx + fromInt(gx), trig.fy, vx, vy, speed, trig.gravityStep);
     const id = addShell(shot, s, sp.child, off, trig.shell, trig.step);
-    if (id >= 0) children.push(id);
+    if (id >= 0 && children) children.push(id);
   }
-  emit(shot, { step: trig.step, kind: "split", shell: trig.shell, x: trig.x, y: trig.y, children });
+  if (children) emit(shot, { step: trig.step, kind: "split", shell: trig.shell, x: trig.x, y: trig.y, children });
 }
 
-interface WalkEnd { x: number; g: number; stop: "far" | "rise" | "tank" | "edge"; tank: number }
+interface WalkEnd { x: number; g: number; stop: "far" | "rise" | "tank" | "edge"; tank: number; n: number } // n: columns walked
 
 /**
  * Walk along the ground from column x (standing on ground px g) toward dir,
  * up to maxPx columns. Level or downhill only: it stops before any rise (the
  * next column is solid at g - 1), at a world edge, or on entering a tank
- * hitbox (the walker's point is (x, g - 1)). Appends each point to `path`.
+ * hitbox (the walker's point is (x, g - 1)). Appends each point to `path`
+ * when there is one (recording); `n` counts the columns walked either way.
  */
-function walk(shot: Shot, x: number, g: number, dir: number, maxPx: number, path: number[]): WalkEnd {
+function walk(shot: Shot, x: number, g: number, dir: number, maxPx: number, path: number[] | null): WalkEnd {
   for (let k = 0; k < maxPx; k++) {
     const nx = x + dir;
-    if (nx < 0 || nx >= WORLD_W) return { x, g, stop: "edge", tank: -1 };
-    if (isSolid(shot.t, nx, g - 1)) return { x, g, stop: "rise", tank: -1 };
+    if (nx < 0 || nx >= WORLD_W) return { x, g, stop: "edge", tank: -1, n: k };
+    if (isSolid(shot.t, nx, g - 1)) return { x, g, stop: "rise", tank: -1, n: k };
     x = nx;
     g = groundBelow(shot.t, x, g);
-    path.push(x, g - 1);
+    if (path) path.push(x, g - 1);
     const tank = tankAt(shot, x, g - 1);
-    if (tank >= 0) return { x, g, stop: "tank", tank };
+    if (tank >= 0) return { x, g, stop: "tank", tank, n: k + 1 };
   }
-  return { x, g, stop: "far", tank: -1 };
+  return { x, g, stop: "far", tank: -1, n: maxPx };
 }
 
 /** Downhill direction at (x, g) from the ground ROLL_PROBE px either side; on level ground, the travel direction. */
@@ -195,13 +196,13 @@
   if (trig.tank >= 0) return blastAt(shot, r.then, trig.x, trig.y, trig.step, trig.shell, 0); // a direct hit doesn't roll
   const x = floorPx(trig.fx);
   const g = groundBelow(shot.t, x, floorPx(trig.fy));
-  const path = [x, g - 1];
+  const path = shot.rec ? [x, g - 1] : null;
   const against = tankAt(shot, x, g - 1); // landed against a tank: it stops at once
   const end: WalkEnd = against >= 0
-    ? { x, g, stop: "tank", tank: against }
+    ? { x, g, stop: "tank", tank: against, n: 0 }
     : walk(shot, x, g, downhill(shot.t, x, g, trig.vx), r.maxDistance, path);
-  const dur = showSteps(path.length / 2 - 1, SHOW_PX_PER_STEP.roll);
-  emit(shot, { step: trig.step, kind: "roll", shell: trig.shell, path, dur });
+  const dur = showSteps(end.n, SHOW_PX_PER_STEP.roll);
+  if (path) emit(shot, { step: trig.step, kind: "roll", shell: trig.shell, path, dur });
   if (end.stop === "edge") { // rolled off the world: lost, like any shell leaving the side edges
     emit(shot, { step: trig.step, kind: "out", shell: trig.shell, x: end.x + (end.x === 0 ? -1 : 1), y: end.g - 1, lag: dur });
     return;
@@ -263,17 +264,17 @@
   if (half > 0) runs.push(-1, half, 1, half);
   if (b.split) runs.push(-1, b.flow, 1, b.flow);
   else runs.push(downhill(shot.t, x, g, trig.vx), b.flow);
-  const flows: number[][] = [];
+  const flows: number[][] | null = shot.rec ? [] : null;
   let longest = 0;
   for (let j = 0; j < runs.length; j += 2) {
-    const path = [x, g - 1];
+    const path = flows ? [x, g - 1] : null;
     const end = walk(shot, x, g, runs[j], runs[j + 1], path);
-    const px = path.length / 2 - 1;
+    const px = end.n;
     if (end.tank >= 0 && (touched[end.tank] < 0 || px < touched[end.tank])) touched[end.tank] = px;
     if (px > longest) longest = px;
-    flows.push(path);
+    if (flows && path) flows.push(path);
   }
-  emit(shot, { step: trig.step, kind: "burn", shell: trig.shell, x, y: g - 1, flows, dur: showSteps(longest, SHOW_PX_PER_STEP.burn) });
+  if (flows) emit(shot, { step: trig.step, kind: "burn", shell: trig.shell, x, y: g - 1, flows, dur: showSteps(longest, SHOW_PX_PER_STEP.burn) });
   for (let p = 0; p < 2; p++) {
     if (touched[p] >= 0) hurt(shot, p, b.damage, trig.step, showSteps(touched[p], SHOW_PX_PER_STEP.burn));
   }
```

The durations are unchanged (`path.length / 2 − 1` always equalled the columns walked, now `n`); with `rec` true every event is byte-identical, and with `rec` false the gated events are not built. **Not gated, deliberately:** the `Timeline` object and the `[p0, p1]` points array (`resolveTurnPoints` returns it: a shared array would be a trap), one `Trigger` per trigger, the blast and damage event literals `emit` drops, and `stepShell`'s `Impact` results: a few small objects per sim that a young-generation GC collects almost for free (minimal's profile: GC 0.3% of an Ace match). **So K12 is not allocation-free, on purpose:** the 2A hand-off listed the per-trigger objects among those to gate. This design accepts them at 0.3% of the time, and T16 records the deviation in the addendum's §11. **Pin-neutral:** every pin and the parity test.

### 7.4 The exact quick-reject sweep (`ballistics.ts`) and `endStep`

```diff
--- a/src/game/titles/arcfire/ballistics.ts
+++ b/src/game/titles/arcfire/ballistics.ts
@@ -11,7 +11,7 @@
 import type { Fx } from "@/game/sim/types";
 import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
 import { cosDeg, sinDeg } from "./aimTable";
-import { isSolid, type Terrain } from "./terrain";
+import { isSolid, surfaceTop, type Terrain } from "./terrain";
 import {
   WORLD_W, STEPS_PER_SEC, GRAVITY_STEP, V_UNIT, MAX_FLIGHT_STEPS, BARREL_LEN, TANK_HIT_R, BOUNCE_PROBE_R,
 } from "./constants";
@@ -152,16 +152,40 @@
   s.vy = idiv(s.vy * s.restitutionPct, 100);
 }
 
+/**
+ * Can this step's sweep hit nothing? Every sample of a step lies in the pixel box between its start
+ * (x0, y0) and end (x1, y1) pixels: the samples interpolate the step monotonically and floorPx is
+ * monotone. So the sweep is clear when that box lies inside the world, strictly above the top span of
+ * every column it covers, and outside the square around each hitbox circle. Exact, never approximate:
+ * when it answers false, the per-sample sweep decides exactly as before.
+ */
+function clearStep(t: Terrain, tanks: readonly HitCircle[], x0: number, y0: number, x1: number, y1: number): boolean {
+  const lo = x0 < x1 ? x0 : x1;
+  const hi = x0 < x1 ? x1 : x0;
+  if (lo < 0 || hi >= WORLD_W) return false;
+  const top = y0 < y1 ? y0 : y1;
+  const bot = y0 < y1 ? y1 : y0;
+  for (let k = 0; k < tanks.length; k++) {
+    const tk = tanks[k];
+    if (hi >= tk.x - TANK_HIT_R && lo <= tk.x + TANK_HIT_R && bot >= tk.y - TANK_HIT_R && top <= tk.y + TANK_HIT_R) return false;
+  }
+  for (let c = lo; c <= hi; c++) if (bot >= surfaceTop(t, c)) return false;
+  return true;
+}
+
+/** End a flown step at Q16.16 (x, y): count it, and lose the shell there (out) if it reached its flight cap. */
+function endStep(s: Shell, x: Fx, y: Fx): Impact | null {
+  s.x = x;
+  s.y = y;
+  s.steps++;
+  if (s.steps < MAX_FLIGHT_STEPS) return null;
+  s.alive = false;
+  return { kind: "out", x: floorPx(x), y: floorPx(y) };
+}
+
 /** A bounce ends the step at the last free sample; the flight cap still applies. */
 function endBounce(s: Shell, fx: Fx, fy: Fx, ev: Impact): Impact {
-  s.x = fx;
-  s.y = fy;
-  s.steps++;
-  if (s.steps >= MAX_FLIGHT_STEPS) {
-    s.alive = false;
-    return { kind: "out", x: floorPx(fx), y: floorPx(fy) };
-  }
-  return ev;
+  return endStep(s, fx, fy) ?? ev;
 }
 
 /**
@@ -170,9 +194,11 @@
  * change per step (Fx). The order inside a step is part of the determinism
  * contract: wind, gravity, the apex latch (an apex stage ends the step here),
  * homing, then the sweep, whose every sample checks the side edges, then the
- * tanks in index order, then the terrain.
+ * tanks in index order, then the terrain. A step whose sweep provably meets
+ * nothing (clearStep) skips the per-sample loop with the same result; `exact`
+ * forces the loop (the reference property test compares the two).
  */
-export function stepShell(s: Shell, t: Terrain, tanks: readonly HitCircle[], windStep: Fx): Impact | null {
+export function stepShell(s: Shell, t: Terrain, tanks: readonly HitCircle[], windStep: Fx, exact = false): Impact | null {
   const rising = s.vy < 0;
   s.vx += windStep;
   s.vy += s.gravityStep;
@@ -186,7 +212,16 @@
   if (s.homeDeg > 0 && s.apexed) steer(s);
   const nx = s.x + idiv(s.vx, STEPS_PER_SEC);
   const ny = s.y + idiv(s.vy, STEPS_PER_SEC);
-  const n = Math.max(Math.abs(floorPx(nx) - floorPx(s.x)), Math.abs(floorPx(ny) - floorPx(s.y)), 1);
+  const x0 = floorPx(s.x);
+  const y0 = floorPx(s.y);
+  const x1 = floorPx(nx);
+  const y1 = floorPx(ny);
+  if (!exact && clearStep(t, tanks, x0, y0, x1, y1)) {
+    // the sweep below would find nothing, and every sample of it lies outside every hitbox, so it would clear every ignore bit
+    s.ignore = 0;
+    return endStep(s, nx, ny);
+  }
+  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
   const r2 = TANK_HIT_R * TANK_HIT_R;
   let fx = s.x; // the last free sample
   let fy = s.y;
@@ -231,12 +266,5 @@
     fx = sx;
     fy = sy;
   }
-  s.x = nx;
-  s.y = ny;
-  s.steps++;
-  if (s.steps >= MAX_FLIGHT_STEPS) {
-    s.alive = false;
-    return { kind: "out", x: floorPx(nx), y: floorPx(ny) };
-  }
-  return null;
+  return endStep(s, nx, ny);
 }
```

**Why it is exact.** A step's samples are `s.x + idiv((nx − s.x)·i, n)` for `i = 1..n` (and likewise for y): monotone between the start and the end, the last one exactly `nx`. `floorPx` is monotone, so every sample's pixel lies in the box between the start and end pixels. If that box is inside the world, strictly above the top span of every column it covers (spans are ordered top-down and the floor is below every top), and outside the 29 × 29 square around each hitbox circle, then no sample can meet an edge, a tank or terrain, and every sample lies outside every hitbox, so the loop would have cleared every `ignore` bit. The quick path returns exactly what the loop would; anything else falls through to the unchanged loop. `endStep` is the shared "count the step, apply the flight cap" (the 2A `endBounce` minor), and the bounce-at-the-cap test (`ballistics.test.ts`) stays green.

**Proof it changes nothing:** the reference property test (§10.1: 20,000 random shells, > 500,000 steps, `stepShell` vs `stepShell(…, exact = true)`, mutation-tested), every pin, and the AI's four new digests reproduced with the quick-reject compiled out. It is also **removable**: dropping T2 changes no decision and no pin, only speed (the corpus 2.7 → 7.5 s, a verification 0.42 → 0.85 s, an Ace turn ≈ 3× slower).

**Not taken: the dirty-range settle** (engine's B16b). Tracking the columns a shot touched would let `settle` and `spansFromHeight` skip the rest of the 1,200 columns, but it adds fields and an invariant to `Terrain`, touches `cloneTerrain`, and the budgets are met without it. It is the next lever if phones need one (K5).

### 7.5 Measured budgets

| Target | Spec | Measured (bundled Node 24, dev machine) | Margin |
|---|---|---|---|
| single-shell `resolveTurn` | ≤ 0.2 ms average | Pulse 0.021 ms (2A perf test) | ≈ 9× |
| a full daily verification (10 Veteran turns + 10 AI picks) | < 5 s on CI | **cold, fresh process: 414 ms mean, 530 ms max** (12 logs); the test's cold run 507–526 ms, warm 408–417 ms; Chromium 660 ms, WebKit 507 ms. **Worst-case bound:** 11 × the sweep's worst Veteran decision (128 ms) ≈ 1.4 s | ≈ 10× typical, ≈ 3.5× worst case, here; for CI see below |
| Ace per turn (UI, in the worker) | — | Node: corpus states 273–317 ms mean (max 392); the sweep's worst decision alone 605–650 ms. Chromium: corpus states 211 (max 337); WebKit 356 (max 448). **Chromium 4× throttle: corpus 1,335 (max 1,650), the sweep's heaviest 1,650–2,180; 6×: corpus 2,120 (max 2,570), heaviest 2,580–3,390** | hidden behind the human shot's playback (§8.5); ⚑ O15 |
| Veteran / Rookie per turn | — | Node: corpus 36 / 8 ms, the sweep's worst alone 128 / 37 ms; Chromium 4× 288 / 65 ms | |

**The Node 22 baseline.** Every figure here is Node 24.11.1 on the dev machine. Spec §9.1 asked for the performance baseline from a Node 22 run, and this design does not guess CI's slowdown. The numbers `ai.perf.test.ts` prints on its **first CI run** become the Node 22 baseline: daily verification cold and warm, and each tier's mean and maximum decision time. T16 records them in spec §9.1.

No budget is enforced by the clock except the spec's two (§10.6). The sim budgets are enforced by counting.

---

## 8 · The Web Worker (deliverable g)

### 8.1 Shape

```
main thread (Plan 3: GameClient, behind ssr:false)          worker (2B)
  ArcfireWorkerClient ── postMessage(HostRequest) ────────▶ worker.ts ─▶ createArcfireHost(post)
        ▲                                                                 │  vsai.ts / match.ts / ai/**
        └──────────── postMessage(HostEvent, transfer) ◀──────────────────┘
```

- **`host.ts`** is the whole brain: pure TypeScript, no `self`, no clock, no DOM. Node tests drive it by collecting what it posts. It sequences the sim and the AI and decides nothing: every AI action is `stepAi` on the match, so the worker can't make a replay diverge (tested: the host's final hash = `replayVsAi`'s).
- **`worker.ts`** binds `self.onmessage` to `host.receive` and `post` to `self.postMessage` with its transfer list.
- **`client.ts`** is the main-thread handle Plan 3 uses: request ids, listeners, `dispose()` (which terminates the worker: also how the UI abandons an AI that is thinking). Tests inject a factory returning an in-process `WorkerLike` wired to a real host.

### 8.2 `protocol.ts`

```ts
// src/game/runtime/arcfire/protocol.ts
//
// The message protocol between the main thread (rendering, HUD, input,
// localStorage) and the Arcfire worker (sim + AI), spec §1.4. Type-only.
// Every message is structured-clone safe (plain objects, arrays, Int32Arrays);
// a snapshot's and a timeline's heights are fresh copies the host transfers.
// Every request carries an `id`; every event it causes echoes that id, in
// order. `seq` is an applied action's index in the match log (0, 1, 2, ...),
// so the UI can queue and play actions in order.
import type { MatchSettings, Phase } from "@/game/titles/arcfire/state";
import type { TurnCommand } from "@/game/titles/arcfire/match";
import type { ArcfireCommand } from "@/game/titles/arcfire/replay";
import type { Timeline } from "@/game/titles/arcfire/timeline";
import type { AiTier } from "@/game/titles/arcfire/ai/tiers";
import type { AiStats } from "@/game/titles/arcfire/ai/search";

/** vs-AI (the human is player 0) or "local" pass-and-play (both seats send commands; no AI). */
export type Opponent = AiTier | "local";

export type HostRequest =
  | { t: "start"; id: number; seed: number; settings: MatchSettings; opponent: Opponent; log?: readonly ArcfireCommand[] } // log: a resume blob's full log, both seats in order
  | { t: "pick"; id: number; poolIndex: number }
  | { t: "turn"; id: number; cmd: TurnCommand }
  | { t: "preview"; id: number; weapon: number; angle: number; power: number }; // the draft panel's looping preview

/** What the HUD and renderer need between timelines. */
export interface Snapshot {
  phase: Phase;
  toAct: number; // the seat whose command is awaited: 0 or 1, or -1 when over
  shooter: number;
  firstPicker: number;
  picksMade: number;
  shotsFired: number;
  pool: number[];
  poolOwner: number[];
  hands: [number[], number[]];
  scores: [number, number];
  tankX: [number, number];
  movesLeft: [number, number];
  wind: number;
  winner: number;
  heights: Int32Array; // the settled surface per column (a fresh copy, transferred)
  hash: string; // hashMatch: desync checks now, online play later
}

export type HostEvent =
  | { t: "state"; id: number; seq: number; snap: Snapshot; log: ArcfireCommand[]; humanLog: ArcfireCommand[]; droppedFrom: number } // after start/resume: log = the resume blob, humanLog = the daily submission
  | { t: "picked"; id: number; seq: number; by: number; poolIndex: number; snap: Snapshot }
  | { t: "shot"; id: number; seq: number; by: number; cmd: TurnCommand; timeline: Timeline; snap: Snapshot; ai: AiStats | null }
  | { t: "thinking"; id: number; by: number } // an AI turn's search starts now (the human's own event is already posted)
  | { t: "rejected"; id: number; reason: "invalid_command" | "not_your_move" | "no_match" | "bad_log" }
  | { t: "preview"; id: number; timeline: Timeline }
  | { t: "error"; id: number; message: string }; // a bug report path: the AI's commands are legal by construction
```

### 8.3 `host.ts`, `worker.ts`, `client.ts`

```ts
// src/game/runtime/arcfire/host.ts
//
// The Arcfire worker's brain as a pure module: it owns one match and its log,
// applies the local player's commands, runs the AI whenever it is the AI's
// move, and reports every action through `post`. No `self`, no clock, no DOM:
// Node tests drive it directly, and worker.ts binds it to postMessage.
// Runtime code (outside the purity roots) that never decides anything: every
// decision comes from vsai.ts and ai/**, so the worker can't make a replay
// diverge. A human command's event is posted BEFORE the AI starts, so the
// AI's search overlaps the human shot's playback on the main thread.
import { createMatch, toAct, type TurnCommand } from "@/game/titles/arcfire/match";
import { applyCommand, type ArcfireCommand } from "@/game/titles/arcfire/replay";
import { hashMatch } from "@/game/titles/arcfire/hash";
import { resolveTurn } from "@/game/titles/arcfire/resolve";
import { spansFromHeight } from "@/game/titles/arcfire/terrain";
import { ROSTER } from "@/game/titles/arcfire/weapons/roster";
import { SHORT_SETTINGS, type MatchState } from "@/game/titles/arcfire/state";
import { AI, HUMAN, aiToAct, resumeVsAi, stepAi } from "@/game/titles/arcfire/vsai";
import type { Timeline } from "@/game/titles/arcfire/timeline";
import type { AiStats } from "@/game/titles/arcfire/ai/search";
import type { HostEvent, HostRequest, Opponent, Snapshot } from "./protocol";

export type Post = (ev: HostEvent, transfer: Transferable[]) => void;

export function snapshot(m: MatchState): Snapshot {
  return {
    phase: m.phase, toAct: toAct(m), shooter: m.shooter, firstPicker: m.firstPicker, picksMade: m.picksMade, shotsFired: m.shotsFired,
    pool: m.pool.slice(), poolOwner: Array.from(m.poolOwner), hands: [m.hands[0].slice(), m.hands[1].slice()],
    scores: [m.scores[0], m.scores[1]], tankX: [m.tankX[0], m.tankX[1]], movesLeft: [m.movesLeft[0], m.movesLeft[1]],
    wind: m.wind, winner: m.winner, heights: m.terrain.height.slice(), hash: hashMatch(m),
  };
}

const isInt = (v: unknown, lo: number, hi: number): boolean => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/** The draft panel's preview board: flat ground at y = 400, tanks at 300 / 700, player 0 to shoot, no wind. */
function previewBoard(): MatchState {
  const p = createMatch(1, SHORT_SETTINGS);
  p.phase = "battle";
  p.terrain.height.fill(400);
  spansFromHeight(p.terrain);
  p.tankX[0] = 300;
  p.tankX[1] = 700;
  p.shooter = 0;
  return p;
}

export function createArcfireHost(post: Post): { receive(req: HostRequest): void } {
  let m: MatchState | null = null;
  let opponent: Opponent = "local";
  let log: ArcfireCommand[] = []; // every command in order, both seats: the resume blob
  let humanLog: ArcfireCommand[] = []; // the human's only (vs-AI): the daily submission

  const vsAi = (): boolean => opponent !== "local";

  /** Post one applied action (the log already holds it). */
  function applied(id: number, by: number, c: ArcfireCommand, timeline: Timeline | null, ai: AiStats | null): void {
    const snap = snapshot(m!);
    const seq = log.length - 1;
    if (c.k === "pick") post({ t: "picked", id, seq, by, poolIndex: c.w, snap }, [snap.heights.buffer]);
    else if (timeline !== null) post({ t: "shot", id, seq, by, cmd: { move: c.move, w: c.w, angle: c.angle, power: c.power }, timeline, snap, ai }, [snap.heights.buffer, timeline.settle.heights.buffer]);
  }

  /** Run the AI until it is not its move, reporting each action under request `id`. */
  function runAi(id: number): void {
    while (m !== null && opponent !== "local" && aiToAct(m)) {
      if (m.phase !== "draft") post({ t: "thinking", id, by: AI }, []);
      const a = stepAi(m, opponent);
      if (a === null) return;
      const c: ArcfireCommand = a.k === "pick" ? { k: "pick", w: a.w } : { k: "turn", ...a.cmd };
      log.push(c);
      applied(id, AI, c, a.k === "turn" ? a.timeline : null, a.k === "turn" ? a.plan.stats : null);
    }
  }

  function start(req: Extract<HostRequest, { t: "start" }>): void {
    const saved: unknown = req.log ?? [];
    if (!Array.isArray(saved)) {
      post({ t: "rejected", id: req.id, reason: "bad_log" }, []);
      return;
    }
    opponent = req.opponent;
    let droppedFrom = -1;
    if (vsAi()) {
      const r = resumeVsAi({ seed: req.seed, settings: req.settings, log: saved });
      if (!r.ok) { post({ t: "rejected", id: req.id, reason: "bad_log" }, []); return; }
      m = r.state;
      log = r.log;
      humanLog = r.humanLog;
      droppedFrom = r.droppedFrom;
    } else { // pass-and-play: the valid prefix of a plain 2-player log
      m = createMatch(req.seed, req.settings);
      log = [];
      humanLog = [];
      for (let i = 0; i < saved.length; i++) {
        if (!applyCommand(m, saved[i]).ok) { droppedFrom = i; break; }
        log.push(saved[i] as ArcfireCommand);
      }
    }
    const snap = snapshot(m);
    post({ t: "state", id: req.id, seq: log.length, snap, log: log.slice(), humanLog: humanLog.slice(), droppedFrom }, [snap.heights.buffer]);
    runAi(req.id); // the AI's opening pick, or the reply a save was taken before
  }

  function preview(req: Extract<HostRequest, { t: "preview" }>): void {
    if (!isInt(req.weapon, 0, ROSTER.length - 1) || !isInt(req.angle, 0, 180) || !isInt(req.power, 0, 100)) {
      post({ t: "rejected", id: req.id, reason: "invalid_command" }, []);
      return;
    }
    const timeline = resolveTurn(previewBoard(), { move: 0, weapon: req.weapon, angle: req.angle, power: req.power });
    post({ t: "preview", id: req.id, timeline }, [timeline.settle.heights.buffer]);
  }

  function command(req: Extract<HostRequest, { t: "pick" | "turn" }>): void {
    if (m === null) { post({ t: "rejected", id: req.id, reason: "no_match" }, []); return; }
    const by = toAct(m);
    if (by === -1 || (vsAi() && by !== HUMAN)) { post({ t: "rejected", id: req.id, reason: "not_your_move" }, []); return; }
    // a fresh plain entry (the log never aliases a request), applied by applyCommand, which never throws:
    // a malformed request (a null cmd, a string angle) is invalid_command, never an error event
    const cmd: Partial<TurnCommand> = req.t === "turn" && typeof req.cmd === "object" && req.cmd !== null ? req.cmd : {};
    const c = (req.t === "pick"
      ? { k: "pick", w: req.poolIndex }
      : { k: "turn", move: cmd.move, w: cmd.w, angle: cmd.angle, power: cmd.power }) as ArcfireCommand;
    const r = applyCommand(m, c);
    if (!r.ok) { post({ t: "rejected", id: req.id, reason: "invalid_command" }, []); return; }
    log.push(c);
    if (vsAi()) humanLog.push(c);
    applied(req.id, by, c, r.timeline, null);
    runAi(req.id); // starts at once: the search overlaps the human shot's playback
  }

  return {
    receive(req: HostRequest): void {
      try {
        if (req.t === "start") start(req);
        else if (req.t === "preview") preview(req);
        else command(req);
      } catch (e) {
        post({ t: "error", id: req.id, message: e instanceof Error ? e.message : String(e) }, []);
      }
    },
  };
}
```

```ts
// src/game/runtime/arcfire/worker.ts
//
// The Web Worker entry (spec §1.4): host.ts bound to postMessage, so the sim
// and the AI's thinking never block the main thread. Loaded only by client.ts.
import { createArcfireHost } from "./host";
import type { HostEvent, HostRequest } from "./protocol";

const scope = self as unknown as {
  postMessage(ev: HostEvent, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<HostRequest>) => void) | null;
};
const host = createArcfireHost((ev, transfer) => scope.postMessage(ev, transfer));
scope.onmessage = (e) => host.receive(e.data);
```

```ts
// src/game/runtime/arcfire/client.ts
//
// The main thread's handle on the Arcfire worker: what Plan 3's GameClient
// (behind its ssr:false dynamic import) uses, and nothing else imports. It
// owns the request ids and the listeners; dispose() terminates the worker,
// which is also how the UI abandons an AI that is still thinking. Tests pass
// a factory that returns an in-process WorkerLike wired to createArcfireHost.
import type { MatchSettings } from "@/game/titles/arcfire/state";
import type { TurnCommand } from "@/game/titles/arcfire/match";
import type { ArcfireCommand } from "@/game/titles/arcfire/replay";
import type { HostEvent, HostRequest, Opponent } from "./protocol";

/** The part of a Worker the client uses. */
export interface WorkerLike {
  postMessage(req: HostRequest): void;
  terminate(): void;
  onmessage: ((e: { data: HostEvent }) => void) | null;
  onerror: ((e: { message: string }) => void) | null;
}

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never; // distributes over the union
export type Listener = (ev: HostEvent) => void;

const moduleWorker = (): WorkerLike =>
  new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;

export class ArcfireWorkerClient {
  private readonly worker: WorkerLike;
  private readonly listeners = new Set<Listener>();
  private nextId = 1;

  constructor(factory: () => WorkerLike = moduleWorker) {
    this.worker = factory();
    this.worker.onmessage = (e) => {
      for (const l of this.listeners) l(e.data);
    };
    this.worker.onerror = (e) => {
      for (const l of this.listeners) l({ t: "error", id: -1, message: e.message });
    };
  }

  /** Subscribe; returns the unsubscribe. */
  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  start(seed: number, settings: MatchSettings, opponent: Opponent, log?: readonly ArcfireCommand[]): number {
    return this.send({ t: "start", seed, settings, opponent, log });
  }

  pick(poolIndex: number): number {
    return this.send({ t: "pick", poolIndex });
  }

  turn(cmd: TurnCommand): number {
    return this.send({ t: "turn", cmd });
  }

  preview(weapon: number, angle: number, power: number): number {
    return this.send({ t: "preview", weapon, angle, power });
  }

  dispose(): void {
    this.worker.terminate();
    this.listeners.clear();
  }

  private send(req: WithoutId<HostRequest>): number {
    const id = this.nextId++;
    this.worker.postMessage({ ...req, id } as HostRequest);
    return id;
  }
}
```

### 8.4 The bundle boundary

- The runtime files live under `src/game/runtime/arcfire/`, outside the purity roots (they may use `self`) but, like the rest of `src/game/**`, reachable only from Plan 3's `GameClient` behind `PlayGate`'s `dynamic(() => import("./GameClient"), { ssr: false })`. `lazy-boundary.test.ts` already forbids `@/game/**` (by alias or relative path) in marketing, layout, `src/lib`, `src/data` and `src/components`, and `check-bundle-budget.mjs` checks the prerendered HTML: both stay green because **nothing in 2B imports `client.ts`**, so `npm run build`'s output is unchanged.
- `worker.bundle.test.ts` (always on) bundles `worker.ts` for the browser with esbuild and asserts: no input under `src/app`, `src/components` or `node_modules`; no `require(` or `node:` in the output; **< 64 KiB** minified (measured **39.9 KiB**, 29 inputs).
- `client.ts` creates the worker with `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })`, the pattern the Next 16 Turbopack reference lists among the expressions its bundler processes (`node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md`). 2B cannot exercise it inside `next build` without a page, so **Plan 3's first task verifies it with `npm run build`** (K10); the fallback is emitting the esbuild worker bundle into `public/` at build time. 2B proves the worker code itself in real Chromium and WebKit Workers (§1, §10.8).

### 8.5 How Plan 3 drives it (the contract 2B guarantees)

1. **Start.** `client.start(seed, settings, opponent, savedLog?)` answers with a `state` event (`seq` = the log length, `snap`, `log`, `humanLog`, `droppedFrom`), then the AI's opening actions if it is the AI's move. `opponent` is a tier or `"local"` (pass-and-play: both seats send commands, the AI never acts, and a saved log is a plain 2-player log).
2. **A human command.** `client.pick(i)` / `client.turn(cmd)`: its event (`picked` / `shot`, `by: 0`, with the Timeline) is posted **before** the AI starts, so the UI starts the human shot's playback at once. Then `thinking` and the AI's `shot` (`by: 1`, with its `AiStats`), or up to two AI actions after the last pick. The UI queues events by `seq` and plays the AI's shot when the human's has finished; it shows "aiming…" only if the AI's event has not arrived by then. Measured in real workers: a Veteran answer arrives within 144–160 ms (desktop); an Ace turn at 4× throttle averages 1.3 s, usually inside a 2–4 s shot animation.
3. **Feel is presentation** (⚑ O14): a minimum visible think time and the AI's turret sweeping to its angle never reach the worker.
4. **Save** `{ v, seed, settings, mode, opponent, log }` to `arcfire:match:v<simVersion>` after every event, with `log` = `state.log` plus each `picked`/`shot` in `seq` order. Resuming is `start` with that log (§6.5).
5. **Submit** the daily challenge's `humanLog` (`state.humanLog` plus the human's own events).
6. **Reject paths:**
   - `rejected{invalid_command}`: the UI's local check drifted, so re-sync from the last snapshot. It also covers any malformed pick or turn request (a null or missing `cmd`, a string angle, a non-integer pool index), because the host applies every request through `applyCommand`, which never throws.
   - `not_your_move`, `no_match`.
   - `bad_log`: a corrupt save; discard it and start fresh.
   - `error`: a bug-report path, reached only by a thrown bug such as an illegal AI command.
7. **The draft panel's preview:** `client.preview(weapon, angle, power)` resolves on a fixed flat board and answers with a Timeline; it never touches the match.
8. **Hints** (optional, Plan 3): `planTurn` is RNG-free and pure, so a "what would Ace do" message is a one-line host addition that cannot perturb the match.

---

## 9 · The balance harness (deliverable h)

### 9.1 The algorithm

- **Matches:** seeds 1..400, `STANDARD_SETTINGS` (so the literal `rosterSize: 32` and a 24-weapon pool), **Ace vs Ace**.
- **A seeded random draft:** every pick, for both seats, is `nextRange(m.rng, free slots)`: one match-RNG draw, deterministic, the same count as `aiPick`. Two reasons (⚑ O7): **circularity** (Ace drafts by `power`, which is exactly what the harness computes) and **exposure** (a deterministic power draft would put each weapon in the same kind of hand every time, and never measure the four weakest). With a random draft every weapon is held in varied hands, so its win-rate contribution is a clean marginal effect.
- **Per weapon** (battle shots only; sudden death is always Pulse and is excluded): shots; **mean net points per shot** (points dealt minus points gifted: the AI's own value) and its sd; points gifted per shot; hit rate (dealt > 0); **win-rate contribution** = (the holders' wins + ½ draws) / holdings − ½, with a 95% half-width `1.96·√(0.25 / holdings)`; the mean battle turn it was fired on; for DIRT, the defensive uses and the mean estimated reply cut; and the **pick rate** Ace's power draft would give it with the *proposed* powers (the pools of the same 400 seeds, ranked by the new powers: `rank < 2 × weaponsEach`).
- **The verdict** (spec §4.3): a damaging weapon **fails** when its mean is outside its tier band (T1 15–40, T2 30–60, T3 50–90); **any** weapon fails when its win-rate contribution exceeds +12%. DIRT is judged by win-rate contribution only. A weapon never fired gets no band verdict.
- **The suggestion** (the actionable part): a band failure with a hit rate ≥ 80% says "damage × (band middle / mean)" (with an accurate AI, points scale about linearly with damage); with a lower hit rate it says "structural: hit X%, Y points on a hit" (the geometry is the problem, not the numbers); a win-rate failure says "reduce damage or spread: +W% ± CI".
- **Tier separation** runs in the same sweep (spec §8): 200 seeds each of Ace–Rookie, Ace–Veteran and Veteran–Rookie, power drafts, seats swapped on odd seeds.
- Every AI turn of every sweep match is checked legal and within its tier's sim budget, so the weekly sweep is also a 20,000-decision property test. Each decision's sims, probe flights and wall time (`ShotRecord.ms`, from a clock the test code injects) go into the report's per-tier cost table, which is where this design's worst-case counts come from (§1, §9.5).

### 9.2 The sweep's code

```ts
// src/game/test/arcfire/aiMatch.ts
//
// One whole AI-vs-AI match, recorded shot by shot: what the tier-separation
// sweep and the balance harness play (bundled into sweep.entry.ts). Pure and
// deterministic: a match is a function of (seed, tiers, draft, settings). The
// "random" draft makes every pick with one match-RNG draw over the free pool
// slots (the same count as aiPick), so the harness measures weapons without
// reading the `power` it is about to write. Every AI turn is checked legal and
// within its tier's sim budget, so every sweep decision is also a test. `now`
// (test code may read a clock) times each decision into ShotRecord.ms: the one
// field that is not a function of the seed, and nothing judged reads it.
import { nextRange } from "@/game/sim/math/rng";
import { applyPick, applyTurn, createMatch, toAct } from "@/game/titles/arcfire/match";
import { STANDARD_SETTINGS, cloneMatch, type MatchSettings } from "@/game/titles/arcfire/state";
import { aiPick, aiTurn } from "@/game/titles/arcfire/ai/policy";
import { TIERS, tierBudget, type AiTier } from "@/game/titles/arcfire/ai/tiers";
import type { AiReason } from "@/game/titles/arcfire/ai/search";

export interface ShotRecord {
  p: number; // the shooter
  w: number; // roster index fired
  sd: boolean; // a sudden-death shot (Pulse): excluded from the per-weapon figures
  pts: number; // points it scored
  gift: number; // points it gifted by self-damage
  move: number;
  reason: AiReason;
  reply: number; // the DIRT rule's estimates (-1: not made)
  replyDirt: number;
  sims: number;
  probes: number;
  ms: number; // the decision's wall time (aiTurn), by the injected clock: informational only
}

export interface MatchRecord {
  seed: number;
  tiers: [AiTier, AiTier];
  firstPicker: number;
  pool: number[]; // the draft pool (roster indices)
  hands: [number[], number[]]; // each player's drafted weapons
  scores: [number, number];
  winner: number; // 0, 1, or 2 for a draw
  shots: ShotRecord[];
}

export function playAiMatch(
  seed: number, tiers: readonly [AiTier, AiTier], draft: "power" | "random", settings: MatchSettings = STANDARD_SETTINGS, now: () => number = () => 0,
): MatchRecord {
  const m = createMatch(seed, settings);
  const shots: ShotRecord[] = [];
  let hands: [number[], number[]] = [[], []];
  while (m.phase !== "over") {
    const p = toAct(m);
    if (m.phase === "draft") {
      let w: number;
      if (draft === "power") w = aiPick(m, tiers[p]);
      else {
        const free: number[] = [];
        for (let i = 0; i < m.pool.length; i++) if (m.poolOwner[i] === -1) free.push(i);
        w = free[nextRange(m.rng, free.length)];
      }
      if (!applyPick(m, w).ok) throw new Error(`seed ${seed}: illegal pick`);
      if (m.phase !== "draft") hands = [m.hands[0].slice(), m.hands[1].slice()];
      continue;
    }
    const sd = m.phase === "suddenDeath";
    const before = [m.scores[0], m.scores[1]];
    const t0 = now();
    const { cmd, plan } = aiTurn(m, tiers[p]);
    const ms = now() - t0;
    if (plan.stats.sims > tierBudget(TIERS[tiers[p]])) throw new Error(`seed ${seed}: ${plan.stats.sims} sims over the ${tiers[p]} budget`);
    if (!applyTurn(cloneMatch(m), cmd).ok || !applyTurn(m, cmd).ok) throw new Error(`seed ${seed}: illegal AI turn ${JSON.stringify(cmd)}`);
    const s = plan.stats;
    shots.push({
      p, w: cmd.w, sd, pts: m.scores[p] - before[p], gift: m.scores[1 - p] - before[1 - p], move: cmd.move,
      reason: s.reason, reply: s.reply, replyDirt: s.replyDirt, sims: s.sims, probes: s.probes, ms,
    });
  }
  return {
    seed, tiers: [tiers[0], tiers[1]], firstPicker: m.firstPicker, pool: m.pool.slice(), hands,
    scores: [m.scores[0], m.scores[1]], winner: m.winner, shots,
  };
}
```

```ts
// src/game/test/arcfire/balance.ts
//
// The balance harness's pure half (spec §4.3): aggregate Ace-vs-Ace match
// records per weapon, judge each weapon against its tier band and the +12%
// win-rate rule, suggest a fix, compute the `power` table, and rewrite the
// `power:` literals of roster.ts. Test support (outside the purity roots):
// floats are fine here. Records are sorted by seed first, so a report is
// identical whatever the thread count or shard order.
import type { MatchRecord } from "./aiMatch";

export interface WeaponDefLite { id: string; tag: string; tier: number }

export const BANDS: Record<number, [number, number]> = { 1: [15, 40], 2: [30, 60], 3: [50, 90] };
export const WR_LIMIT = 0.12;

export interface WeaponRow {
  id: string;
  tier: number;
  dirt: boolean;
  shots: number;
  mean: number; // net points per shot: dealt minus gifted (the AI's own value)
  sd: number;
  gifted: number; // points gifted per shot
  hit: number; // share of shots that dealt damage
  held: number; // (match, player) hands holding it
  contrib: number; // the holder's win rate (a draw counts 1/2) minus 1/2
  ci: number; // 95% half-width of contrib
  meanTurn: number; // the mean battle turn it was fired on (1-based)
  defensive: number; // DIRT: shots the DIRT rule fired
  replyCut: number; // DIRT: the mean estimated reply cut over those shots
  verdict: "ok" | "HIGH" | "LOW" | "WR" | "HIGH+WR" | "LOW+WR";
  suggestion: string;
  power: number; // the proposed roster power
  pickRate: number; // how often Ace's power draft would take it, with the proposed powers, when it is in the pool
}

export function aggregate(records: MatchRecord[], roster: readonly WeaponDefLite[], picksPerMatch: number): WeaponRow[] {
  const recs = records.slice().sort((a, b) => a.seed - b.seed);
  const rows: WeaponRow[] = roster.map((def, w) => {
    const dirt = def.tag === "DIRT";
    let shots = 0, net = 0, net2 = 0, dealt = 0, gifted = 0, hits = 0, turnSum = 0, held = 0, won = 0, defensive = 0, cut = 0;
    for (const r of recs) {
      let turn = 0;
      for (const s of r.shots) {
        if (s.sd) continue;
        turn++;
        if (s.w !== w) continue;
        const v = s.pts - s.gift;
        shots++;
        net += v;
        net2 += v * v;
        dealt += s.pts;
        gifted += s.gift;
        if (s.pts > 0) hits++;
        turnSum += turn;
        if (s.reason === "dirt") {
          defensive++;
          cut += s.reply - s.replyDirt;
        }
      }
      for (const p of [0, 1]) {
        if (!r.hands[p].includes(w)) continue;
        held++;
        won += r.winner === p ? 1 : r.winner === 2 ? 0.5 : 0;
      }
    }
    const mean = shots > 0 ? net / shots : 0;
    const sd = shots > 1 ? Math.sqrt(Math.max(0, net2 / shots - mean * mean)) : 0;
    const contrib = held > 0 ? won / held - 0.5 : 0;
    const ci = held > 0 ? 1.96 * Math.sqrt(0.25 / held) : 0;
    const hit = shots > 0 ? hits / shots : 0;
    const [lo, hi] = BANDS[def.tier];
    const band = dirt || shots === 0 ? "" : mean > hi ? "HIGH" : mean < lo ? "LOW" : ""; // never fired: no data, no band verdict
    const wr = contrib > WR_LIMIT;
    const verdict = (band && wr ? `${band}+WR` : band || (wr ? "WR" : "ok")) as WeaponRow["verdict"];
    const parts: string[] = [];
    if (band) {
      const mid = (lo + hi) / 2;
      parts.push(hit >= 0.8
        ? `damage x ${(mid / mean).toFixed(2)} (to the band's middle, ${mid})`
        : `structural: hit ${(100 * hit).toFixed(0)}%, ${(hits > 0 ? dealt / hits : 0).toFixed(1)} points on a hit`);
    }
    if (wr) parts.push(`reduce damage or spread: win-rate contribution +${(100 * contrib).toFixed(1)}% +- ${(100 * ci).toFixed(1)}`);
    if (dirt) parts.push(`${defensive} defensive uses, estimated reply cut ${(defensive > 0 ? cut / defensive : 0).toFixed(1)}`);
    return {
      id: def.id, tier: def.tier, dirt, shots, mean, sd, gifted: shots > 0 ? gifted / shots : 0, hit, held, contrib, ci,
      meanTurn: shots > 0 ? turnSum / shots : 0, defensive, replyCut: defensive > 0 ? cut / defensive : 0,
      verdict, suggestion: parts.join("; "), power: 0, pickRate: 0,
    };
  });
  // power: a damaging weapon's net points per shot; a DIRT weapon's win-rate contribution converted to
  // points by the least-squares line (net per shot against contribution) through the damaging weapons
  const dmg = rows.filter((r) => !r.dirt);
  const mx = dmg.reduce((s, r) => s + r.contrib, 0) / dmg.length;
  const my = dmg.reduce((s, r) => s + r.mean, 0) / dmg.length;
  let sxy = 0, sxx = 0;
  for (const r of dmg) {
    sxy += (r.contrib - mx) * (r.mean - my);
    sxx += (r.contrib - mx) * (r.contrib - mx);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  for (const r of rows) r.power = Math.min(100, Math.max(1, Math.round(r.dirt ? my + slope * (r.contrib - mx) : r.mean)));
  // pick rate with the proposed powers: Ace's draft takes the highest power first (ties: the lower roster index)
  const byPower = (a: number, b: number): number => rows[b].power - rows[a].power || a - b;
  const inPool = rows.map(() => 0);
  const picked = rows.map(() => 0);
  for (const r of recs) {
    const order = r.pool.slice().sort(byPower);
    order.forEach((w, rank) => {
      inPool[w]++;
      if (rank < picksPerMatch) picked[w]++;
    });
  }
  rows.forEach((r, w) => { r.pickRate = inPool[w] > 0 ? picked[w] / inPool[w] : 0; });
  return rows;
}

export interface Judged { rows: WeaponRow[]; failing: string[]; acked: string[]; stale: string[] }

/** The gate: a failing weapon on the allow-list is ACK (reported, not failed); an allow-listed weapon now passing is STALE ACK. */
export function judge(rows: WeaponRow[], allow: Record<string, string>): Judged {
  const failing: string[] = [];
  const acked: string[] = [];
  const stale: string[] = [];
  for (const r of rows) {
    const bad = r.verdict !== "ok";
    if (bad && allow[r.id] !== undefined) acked.push(r.id);
    else if (bad) failing.push(r.id);
    else if (allow[r.id] !== undefined) stale.push(r.id);
  }
  return { rows, failing, acked, stale };
}

const signed = (v: number): string => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(1)}`;

export function report(j: Judged, records: MatchRecord[], title: string): string {
  const n = records.length;
  let p0 = 0, draws = 0, first = 0, margin = 0;
  for (const r of records) {
    if (r.winner === 0) p0++;
    if (r.winner === 2) draws++;
    if (r.winner === 1 - r.firstPicker) first++;
    margin += Math.abs(r.scores[0] - r.scores[1]);
  }
  const lines = [
    `### ${title}`,
    "",
    `${n} matches; player 0 won ${p0}, the first shooter ${first}, draws ${draws}; mean |margin| ${(margin / n).toFixed(1)}`,
    "",
    "| weapon | T | net/shot | band | sd | hit % | gift | WR contrib (95%) | turn | verdict | gate | power | pick % | suggestion |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of j.rows) {
    const band = r.dirt ? "WR only" : `${BANDS[r.tier][0]}-${BANDS[r.tier][1]}`;
    const gate = j.failing.includes(r.id) ? "FAIL" : j.acked.includes(r.id) ? "ACK" : j.stale.includes(r.id) ? "STALE ACK" : "";
    lines.push(`| ${r.id} | ${r.tier} | ${r.dirt ? "-" : r.mean.toFixed(1)} | ${band} | ${r.dirt ? "-" : r.sd.toFixed(1)} | ${r.dirt ? "-" : (100 * r.hit).toFixed(0)} | ${r.gifted.toFixed(1)} | ${signed(r.contrib)} +- ${(100 * r.ci).toFixed(1)} | ${r.meanTurn.toFixed(1)} | ${r.verdict} | ${gate} | ${r.power} | ${(100 * r.pickRate).toFixed(0)} | ${r.suggestion} |`);
  }
  lines.push("", `FAIL (${j.failing.length}): ${j.failing.join(", ") || "none"}; ACK (${j.acked.length}): ${j.acked.join(", ") || "none"}; STALE ACK: ${j.stale.join(", ") || "none"}`);
  return lines.join("\n");
}

export interface TierCost {
  tier: string;
  decisions: number;
  simsMean: number;
  simsMax: number;
  probesMean: number;
  probesMax: number;
  msMean: number; // ShotRecord.ms: wall time under the sweep's own load (every core busy), so an upper bound
  msP99: number;
  msMax: number;
}

/** Per-tier decision costs over every shot of `records` (sudden death included). The counts are exact and seed-determined; ms is not. */
export function costs(records: MatchRecord[]): TierCost[] {
  const by = new Map<string, { sims: number[]; probes: number[]; ms: number[] }>();
  for (const r of records) {
    for (const s of r.shots) {
      const tier = r.tiers[s.p];
      let b = by.get(tier);
      if (b === undefined) {
        b = { sims: [], probes: [], ms: [] };
        by.set(tier, b);
      }
      b.sims.push(s.sims);
      b.probes.push(s.probes);
      b.ms.push(s.ms);
    }
  }
  const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
  const top = (v: number[]): number => v.reduce((a, b) => (b > a ? b : a), 0);
  return ["rookie", "veteran", "ace"].filter((t) => by.has(t)).map((tier) => {
    const b = by.get(tier)!;
    const ms = b.ms.slice().sort((x, y) => x - y);
    return {
      tier, decisions: b.sims.length, simsMean: mean(b.sims), simsMax: top(b.sims), probesMean: mean(b.probes), probesMax: top(b.probes),
      msMean: mean(ms), msP99: ms[Math.min(ms.length - 1, Math.floor(0.99 * ms.length))], msMax: ms[ms.length - 1],
    };
  });
}

export function costTable(c: TierCost[]): string {
  const lines = [
    "| tier | decisions | sims mean / max | probe flights mean / max | ms mean / p99 / max (under the sweep's load) |",
    "|---|---|---|---|---|",
  ];
  for (const t of c) {
    lines.push(`| ${t.tier} | ${t.decisions} | ${t.simsMean.toFixed(0)} / ${t.simsMax} | ${t.probesMean.toFixed(0)} / ${t.probesMax} | ${t.msMean.toFixed(1)} / ${t.msP99.toFixed(1)} / ${t.msMax.toFixed(1)} |`);
  }
  return lines.join("\n");
}

/**
 * Rewrite each weapon's `power: N` literal in roster.ts's source text. Each id must match exactly one
 * `id: "<id>", name: "...", tag: "...", tier: n, power: N` and each power must be an integer in 1..100,
 * or it throws and nothing is written. Returns the new text and the changes as `id: old -> new`.
 */
export function writePowers(src: string, powers: Record<string, number>): { src: string; changed: string[] } {
  let out = src;
  const changed: string[] = [];
  for (const [id, p] of Object.entries(powers)) {
    if (!Number.isInteger(p) || p < 1 || p > 100) throw new RangeError(`power ${id}: ${p} is not an integer in 1..100`);
    const re = new RegExp(`(id: "${id}", name: "[^"]*", tag: "[A-Z]+", tier: [123], power: )(\\d+)`, "g");
    const hits = out.match(re);
    if (hits === null || hits.length !== 1) throw new Error(`power ${id}: ${hits === null ? 0 : hits.length} roster lines match, need exactly 1`);
    out = out.replace(re, (_all: string, head: string, old: string) => {
      if (Number(old) !== p) changed.push(`${id}: ${old} -> ${p}`);
      return `${head}${p}`;
    });
  }
  return { src: out, changed };
}
```

```ts
// src/game/test/arcfire/sweep.entry.ts
//
// Bundled by sweep.ts with esbuild and loaded once per worker thread: the
// sweep's matches run as one module, as the worker and the verifier run the
// sim (vitest's module runner is 4-5x slower, 2A K3).
export { playAiMatch } from "./aiMatch";
```

```ts
// src/game/test/arcfire/sweep.ts
//
// The sweep runner (Node only, test support): bundle sweep.entry.ts once with
// esbuild, then play AI-vs-AI matches on worker_threads. Results come back in
// job order, so every aggregate is identical whatever the thread count.
// ARCFIRE_SWEEP_SHARD=k/n keeps the jobs whose index is k - 1 mod n (a CI
// matrix shard); ARCFIRE_SWEEP_THREADS caps the threads (default: all cores).
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { build } from "esbuild";
import type { MatchRecord } from "./aiMatch";
import type { AiTier } from "@/game/titles/arcfire/ai/tiers";

export interface MatchJob { seed: number; tiers: [AiTier, AiTier]; draft: "power" | "random" }

export async function bundleSweep(): Promise<string> {
  const out = await build({
    entryPoints: [resolve("src/game/test/arcfire/sweep.entry.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, tsconfig: "tsconfig.json",
  });
  return out.outputFiles[0].text;
}

const WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
const mod = { exports: {} };
new Function("module", "exports", workerData.code)(mod, mod.exports);
parentPort.on("message", ({ i, job }) => {
  try { parentPort.postMessage({ i, rec: mod.exports.playAiMatch(job.seed, job.tiers, job.draft, undefined, () => performance.now()) }); }
  catch (e) { parentPort.postMessage({ i, error: String((e && e.stack) || e) }); }
});`;

/** The jobs of shard `spec` ("k/n"), or all of them. */
export function shardOf<T>(jobs: T[], spec: string | undefined): T[] {
  if (!spec) return jobs;
  const [k, n] = spec.split("/").map(Number);
  return jobs.filter((_, i) => i % n === k - 1);
}

export async function runMatches(code: string, jobs: MatchJob[], threads = availableParallelism()): Promise<MatchRecord[]> {
  const out: MatchRecord[] = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const n = Math.max(1, Math.min(threads, jobs.length));
  await new Promise<void>((res, rej) => {
    if (jobs.length === 0) return res();
    for (let k = 0; k < n; k++) {
      const w = new Worker(WORKER, { eval: true, workerData: { code } });
      const feed = (): void => {
        if (next >= jobs.length) { void w.terminate(); return; }
        const i = next++;
        w.postMessage({ i, job: jobs[i] });
      };
      w.on("message", (msg: { i: number; rec?: MatchRecord; error?: string }) => {
        if (msg.error !== undefined) { rej(new Error(`job ${msg.i}: ${msg.error}`)); void w.terminate(); return; }
        out[msg.i] = msg.rec!;
        if (++done === jobs.length) res();
        feed();
      });
      w.on("error", rej);
      feed();
    }
  });
  return out;
}

/** Seeds first..first+n-1, the two tiers swapping seats on odd seeds, drafting by power (spec §8 tier separation). */
export function separationJobs(a: AiTier, b: AiTier, n: number, first = 1): MatchJob[] {
  const jobs: MatchJob[] = [];
  for (let s = first; s < first + n; s++) jobs.push({ seed: s, tiers: s % 2 === 0 ? [a, b] : [b, a], draft: "power" });
  return jobs;
}

/** How often tier `a` won the separation matches (draws are not wins). */
export function winRate(recs: MatchRecord[], a: AiTier): number {
  let wins = 0;
  for (const r of recs) if (r.winner !== 2 && r.tiers[r.winner] === a && r.tiers[1 - r.winner] !== a) wins++;
  return wins / recs.length;
}
```

```ts
// src/game/test/arcfire/arcfire.sweep.test.ts
//
// The weekly Arcfire sweeps, only under BALANCE_SWEEP=1 (spec §4.3, §8):
//   tier separation: 200 seeds each, power drafts, seats swapped on odd
//     seeds: Ace beats Rookie >= 85% and Veteran >= 60%, Veteran beats
//     Rookie >= 70%. Always enforced: these are AI-correctness properties.
//   the balance harness: seeds 1..400, Ace vs Ace, random draft. A weapon
//     fails outside its tier band (T1 15-40, T2 30-60, T3 50-90 net points
//     per shot; DIRT exempt) or above +12% win-rate contribution. A failure
//     on balance.allow.json is ACK (reported, not failed); anything else
//     fails the job; an allow-listed weapon now passing is STALE ACK. The
//     launch gate needs the allow-list empty.
// CI runs it as a matrix: ARCFIRE_SWEEP_SHARD=k/n plays shard k and writes
// test-results/arcfire-sweep/shard-k.json; ARCFIRE_SWEEP_MERGE=<dir> judges
// the merged shards. Locally, one run does everything on every core.
// ARCFIRE_BALANCE_WRITE=1 (local only: a full run or a merge) writes the
// harness's `power` table into roster.ts and prints the AI re-pins it needs.
import { describe, it, expect } from "vitest";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROSTER } from "@/game/titles/arcfire/weapons/roster";
import type { MatchRecord } from "./aiMatch";
import { STANDARD_SETTINGS } from "@/game/titles/arcfire/state";
import { bundleSweep, runMatches, separationJobs, shardOf, winRate, type MatchJob } from "./sweep";
import { aggregate, costTable, costs, judge, report, writePowers } from "./balance";

const SWEEP = process.env.BALANCE_SWEEP === "1";
const SHARD = process.env.ARCFIRE_SWEEP_SHARD;
const MERGE = process.env.ARCFIRE_SWEEP_MERGE;
const OUT = "test-results/arcfire-sweep";
const ALLOW = "src/game/titles/arcfire/balance.allow.json";
const ROSTER_TS = "src/game/titles/arcfire/weapons/roster.ts";

interface SweepData { ar: MatchRecord[]; av: MatchRecord[]; vr: MatchRecord[]; balance: MatchRecord[] }

const balanceJobs = (): MatchJob[] => Array.from({ length: 400 }, (_, i) => ({ seed: i + 1, tiers: ["ace", "ace"], draft: "random" }));

async function play(): Promise<SweepData> {
  const code = await bundleSweep();
  const threads = process.env.ARCFIRE_SWEEP_THREADS ? Number(process.env.ARCFIRE_SWEEP_THREADS) : undefined;
  // ONE queue, the slowest matches first (Ace-Ace about 4.2 s, Ace-Veteran 2.4, Ace-Rookie 2.2, Veteran-Rookie 0.45),
  // so no thread idles at the end of a group; each group is sharded on its own, as the merge expects
  const groups: [keyof SweepData, MatchJob[]][] = [
    ["balance", shardOf(balanceJobs(), SHARD)],
    ["av", shardOf(separationJobs("ace", "veteran", 200), SHARD)],
    ["ar", shardOf(separationJobs("ace", "rookie", 200), SHARD)],
    ["vr", shardOf(separationJobs("veteran", "rookie", 200), SHARD)],
  ];
  const recs = await runMatches(code, groups.flatMap(([, jobs]) => jobs), threads);
  const data: SweepData = { ar: [], av: [], vr: [], balance: [] };
  let at = 0;
  for (const [k, jobs] of groups) {
    data[k] = recs.slice(at, at + jobs.length);
    at += jobs.length;
  }
  return data;
}

function merged(dir: string): SweepData {
  const all: SweepData = { ar: [], av: [], vr: [], balance: [] };
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const d: SweepData = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const k of ["ar", "av", "vr", "balance"] as const) all[k].push(...d[k]);
  }
  for (const k of ["ar", "av", "vr", "balance"] as const) {
    all[k].sort((a, b) => a.seed - b.seed);
    all[k].forEach((r, i) => {
      if (i > 0 && all[k][i - 1].seed === r.seed) throw new Error(`${dir}: seed ${r.seed} of "${k}" is in two shard files`);
    });
  }
  return all;
}

function publish(text: string): void {
  process.stderr.write(`${text}\n`); // outside Vitest's console capture: every reporter shows it
  mkdirSync("test-results/arcfire-balance", { recursive: true });
  writeFileSync("test-results/arcfire-balance/report.md", `${text}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

describe.runIf(SWEEP)("arcfire sweeps (BALANCE_SWEEP=1)", () => {
  it("separates the tiers and judges every weapon", async () => {
    const data = MERGE ? merged(MERGE) : await play();
    if (!MERGE) { // the records, for a later merge: a matrix shard stops here, and the merge job judges
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, `shard-${SHARD ? SHARD.split("/")[0] : "all"}.json`), JSON.stringify(data));
      if (SHARD) return;
    }
    const sep = { ar: winRate(data.ar, "ace"), av: winRate(data.av, "ace"), vr: winRate(data.vr, "veteran") };
    const rows = aggregate(data.balance, ROSTER, 2 * STANDARD_SETTINGS.weaponsEach);
    const allow: Record<string, string> = existsSync(ALLOW) ? JSON.parse(readFileSync(ALLOW, "utf8")) : {};
    const j = judge(rows, allow);
    const pctOf = (v: number): string => `${(100 * v).toFixed(1)}%`;
    const cost = costs([...data.ar, ...data.av, ...data.vr, ...data.balance]);
    publish([
      `## Arcfire sweeps`,
      `tier separation (200 seeds each): Ace-Rookie ${pctOf(sep.ar)} (>= 85%), Ace-Veteran ${pctOf(sep.av)} (>= 60%), Veteran-Rookie ${pctOf(sep.vr)} (>= 70%)`,
      "",
      report(j, data.balance, "Balance: Ace vs Ace, random draft, STANDARD_SETTINGS"),
      "",
      "Decision costs, every sweep match (sims and probe flights are exact; ms is wall time under the sweep's own load):",
      "",
      costTable(cost),
    ].join("\n"));
    writeFileSync("test-results/arcfire-balance/report.json", JSON.stringify({ sep, rows, cost }, null, 1));
    if (process.env.ARCFIRE_BALANCE_WRITE === "1" && !SHARD) {
      const w = writePowers(readFileSync(ROSTER_TS, "utf8"), Object.fromEntries(rows.map((r) => [r.id, r.power])));
      writeFileSync(ROSTER_TS, w.src);
      process.stderr.write(`power write-back (${w.changed.length}):\n${w.changed.join("\n")}\nnow re-pin the AI (declared):\n` +
        "  UPDATE_ARCFIRE_AI=draft npx vitest run src/game/titles/arcfire/ai.corpus.test.ts\n" +
        "  UPDATE_ARCFIRE_GOLDEN=vsai npx vitest run src/game/titles/arcfire/ai.corpus.test.ts\n");
    }
    expect(sep.ar, "Ace beats Rookie").toBeGreaterThanOrEqual(0.85);
    expect(sep.av, "Ace beats Veteran").toBeGreaterThanOrEqual(0.6);
    expect(sep.vr, "Veteran beats Rookie").toBeGreaterThanOrEqual(0.7);
    expect(j.failing, "weapons failing outside balance.allow.json").toEqual([]);
  }, 3_600_000);
});
```

`balance.allow.json` (in `src/game/titles/arcfire/`) is a flat `{ "<weapon id>": "<reason, date>" }` map, `{}` when 2B's sweep task lands (T14) and seeded by the first-sweep task (T15, ⚑ O10).

### 9.3 Runtime, parallelism and CI

- **Cost** (bundled Node 24, per match): Ace vs Ace ≈ 20 × 211 ms ≈ 4.2 s; Ace vs Rookie ≈ 2.2 s; Ace vs Veteran ≈ 2.4 s; Veteran vs Rookie ≈ 0.45 s. The whole weekly sweep (400 + 3 × 200 matches) is **≈ 2,900 CPU-seconds** on the dev machine.
- **One job queue.** `play()` shards each of the four groups on its own, then plays them as **one queue**, slowest matches first (Ace–Ace, Ace–Veteran, Ace–Rookie, Veteran–Rookie), and splits the records back by group. Before, each group ran as its own queue and threads sat idle at the end of each. The records, and so the report, are unchanged; only the wall time falls.
- **Measured** (Node 24, the dev machine):
  - the full local run: **64 s** wall on 64 threads, against 84.6–93 s with a queue per group;
  - **one quarter shard: 164 s on 4 threads** (178 s before) and **315 s on 2 threads**.
- **CI estimate** (not measured: the Node 22 slowdown per thread is unknown until the first weekly run):
  - GitHub's 4-vCPU `ubuntu-latest` (a public repository): at 1.3–1.5× slower per thread, a shard takes about 3.5–4 minutes plus `npm ci`, in line with Circle TD's ~4 minute sweep.
  - **A private repository's `ubuntu-latest` has 2 vCPU,** which roughly doubles a shard: 315 s here, perhaps 7–10 minutes on Node 22. That is still well inside the jobs' 30-minute timeout. If it ever is not, raise the matrix to 8 shards.
  - The merge job takes seconds.
- **Sharding:** `ARCFIRE_SWEEP_SHARD=k/n` keeps every job whose index in its group is `k − 1 mod n`, and writes `test-results/arcfire-sweep/shard-k.json`. `ARCFIRE_SWEEP_MERGE=<dir>` loads every shard file, **refuses a seed that appears in two files** (measured: the guard caught a stray local file), sorts by seed and judges.
- **Determinism of the records.** Records come back in job order and are sorted by seed, so the report's verdicts and counts are identical for any thread count or shard split: 40 matches on 4 and on 40 threads gave identical records. The one exception is `ShotRecord.ms`, which is informational and appears only in the cost table's ms column.
- **Locally:** `BALANCE_SWEEP=1 npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts` runs everything on every core (about a minute here); `ARCFIRE_SWEEP_THREADS` caps the threads.

### 9.4 `power`, and writing it back

**The formula (⚑ O9).** A damaging weapon's power is `clamp(round(mean net points per shot), 1, 100)`: a held weapon adds its points per shot to its holder's score once, so this is exactly what a score-maximising drafter should rank by. A DIRT weapon scores no points, so its **win-rate contribution is converted to points** by the least-squares line (net per shot against contribution) through the damaging weapons, then clamped: DIRT is worth what a damaging weapon with the same win-rate effect is worth. (The alternative, the estimated reply cut, measured 37–39 for all three DIRT weapons, which would rank them above Pulse although holding one costs 8–17% of win rate.)

**The mechanism.**
- Only with `ARCFIRE_BALANCE_WRITE=1`, only in a local run (a full run or a merge, never a CI shard).
- `writePowers` rewrites the one literal matched by `` `(id: "<id>", name: "[^"]*", tag: "[A-Z]+", tier: [123], power: )(\d+)` `` per weapon in `weapons/roster.ts`; it requires exactly one match per id and an integer in 1..100, or it throws and writes nothing. An always-on test runs it on the real `roster.ts` text (one line per changed id, idempotent, refusals).
- It prints each `id: old -> new` and the declared re-pins the write-back needs:
  ```
  UPDATE_ARCFIRE_AI=draft npx vitest run src/game/titles/arcfire/ai.corpus.test.ts
  UPDATE_ARCFIRE_GOLDEN=vsai npx vitest run src/game/titles/arcfire/ai.corpus.test.ts
  ```

**What a write-back moves.** `defDigest` filters `power` (and a new always-on assertion pins that for every roster entry), the corpus fingerprints never read it, and the Plan 1 and full-roster goldens draft by fixed slot rules: **no 2A pin moves**. The AI turn cases draft by the lowest slot and never read `power`: **the turn digest does not move**. The draft section and the vs-AI goldens do (Veteran drafts by power): a declared re-pin (`UPDATE_ARCFIRE_AI=draft` refuses if a turn case moved), and after launch a `simVersion` bump (D23).

### 9.5 The first-run report (measured on the prototype, exactly as the test prints it)

**Arcfire sweeps** (the report the test writes to stderr, the job summary and `test-results/arcfire-balance/report.md`)

tier separation (200 seeds each): Ace-Rookie 99.5% (>= 85%), Ace-Veteran 93.5% (>= 60%), Veteran-Rookie 85.5% (>= 70%)

**Balance: Ace vs Ace, random draft, STANDARD_SETTINGS**

400 matches; player 0 won 218, the first shooter 211, draws 1; mean |margin| 112.4

| weapon | T | net/shot | band | sd | hit % | gift | WR contrib (95%) | turn | verdict | gate | power | pick % | suggestion |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pulse | 1 | 27.6 | 15-40 | 15.5 | 83 | 0.0 | -0.4 +- 6.2 | 14.9 | ok |  | 28 | 100 |  |
| pulse2 | 2 | 47.7 | 30-60 | 18.6 | 93 | 0.0 | +0.8 +- 6.2 | 9.0 | ok |  | 48 | 100 |  |
| nova | 3 | 90.5 | 50-90 | 19.2 | 98 | 0.0 | +12.0 +- 6.1 | 3.5 | HIGH+WR | FAIL | 90 | 100 | damage x 0.77 (to the band's middle, 70); reduce damage or spread: win-rate contribution +12.0% +- 6.1 |
| needle | 2 | 78.6 | 30-60 | 47.7 | 75 | 0.0 | +4.3 +- 6.1 | 3.5 | HIGH | FAIL | 79 | 100 | structural: hit 75%, 104.7 points on a hit |
| crater | 1 | 21.0 | 15-40 | 6.5 | 96 | 0.0 | -9.8 +- 6.2 | 17.1 | ok |  | 21 | 39 |  |
| triad | 1 | 39.7 | 15-40 | 23.3 | 91 | 0.0 | -5.7 +- 6.1 | 12.7 | ok |  | 40 | 100 |  |
| fan | 2 | 44.2 | 30-60 | 28.7 | 92 | 0.0 | -5.2 +- 6.2 | 11.2 | ok |  | 44 | 100 |  |
| railshot | 2 | 27.6 | 30-60 | 35.7 | 38 | 0.0 | -0.2 +- 6.2 | 14.7 | LOW | FAIL | 28 | 97 | structural: hit 38%, 72.5 points on a hit |
| twinnova | 3 | 104.3 | 50-90 | 22.6 | 99 | 0.0 | +17.3 +- 6.2 | 2.3 | HIGH+WR | FAIL | 100 | 100 | damage x 0.67 (to the band's middle, 70); reduce damage or spread: win-rate contribution +17.3% +- 6.2 |
| cascade | 3 | 54.7 | 50-90 | 45.7 | 92 | 0.0 | +5.0 +- 6.0 | 9.6 | ok |  | 55 | 100 |  |
| hydra | 3 | 50.9 | 50-90 | 22.0 | 98 | 0.0 | +1.4 +- 6.1 | 10.5 | ok |  | 51 | 100 |  |
| hailstorm | 2 | 42.2 | 30-60 | 19.6 | 99 | 0.0 | -1.4 +- 6.1 | 11.5 | ok |  | 42 | 100 |  |
| shrapnel | 2 | 24.4 | 30-60 | 12.9 | 95 | 0.0 | -5.3 +- 6.2 | 15.7 | LOW | FAIL | 24 | 72 | damage x 1.84 (to the band's middle, 45) |
| barrage | 2 | 31.3 | 30-60 | 12.9 | 100 | 0.0 | -6.5 +- 6.0 | 13.4 | ok |  | 31 | 100 |  |
| skipper | 2 | 26.5 | 30-60 | 10.3 | 95 | 0.0 | +0.8 +- 6.3 | 15.3 | LOW | FAIL | 27 | 85 | damage x 1.70 (to the band's middle, 45) |
| pinball | 2 | 50.8 | 30-60 | 13.7 | 94 | 0.0 | +5.2 +- 6.4 | 8.5 | ok |  | 51 | 100 |  |
| ricochet | 1 | 31.2 | 15-40 | 13.1 | 92 | 0.0 | +1.7 +- 6.4 | 13.0 | ok |  | 31 | 100 |  |
| tumbler | 1 | 35.3 | 15-40 | 10.8 | 94 | 0.0 | -6.3 +- 6.4 | 12.4 | ok |  | 35 | 100 |  |
| juggernaut | 3 | 83.6 | 50-90 | 7.4 | 100 | 0.0 | +8.6 +- 6.2 | 4.1 | ok |  | 84 | 100 |  |
| burrow | 2 | 44.5 | 30-60 | 20.7 | 84 | 0.0 | +0.2 +- 6.3 | 11.2 | ok |  | 45 | 100 |  |
| auger | 2 | 11.5 | 30-60 | 8.6 | 70 | 0.0 | -6.1 +- 6.2 | 18.1 | LOW | FAIL | 12 | 0 | structural: hit 70%, 16.4 points on a hit |
| inferno | 3 | 66.1 | 50-90 | 16.1 | 94 | 0.0 | +6.0 +- 6.4 | 6.8 | ok |  | 66 | 100 |  |
| wildfire | 2 | 40.1 | 30-60 | 14.0 | 89 | 0.0 | -0.6 +- 6.1 | 11.5 | ok |  | 40 | 100 |  |
| rampart | 1 | - | WR only | - | - | 0.0 | -11.2 +- 5.9 | 12.4 | ok |  | 10 | 0 | 125 defensive uses, estimated reply cut 39.4 |
| bastion | 1 | - | WR only | - | - | 0.0 | -7.9 +- 5.9 | 14.7 | ok |  | 20 | 0 | 96 defensive uses, estimated reply cut 37.2 |
| leveler | 1 | - | WR only | - | - | 0.0 | -17.3 +- 5.9 | 12.0 | ok |  | 1 | 0 | 142 defensive uses, estimated reply cut 38.9 |
| lancer | 2 | 59.2 | 30-60 | 6.7 | 99 | 0.0 | +5.4 +- 6.3 | 6.6 | ok |  | 59 | 100 |  |
| prism | 3 | 33.1 | 50-90 | 7.9 | 95 | 0.0 | +1.3 +- 6.3 | 14.8 | LOW | FAIL | 33 | 100 | damage x 2.12 (to the band's middle, 70) |
| seeker | 2 | 50.0 | 30-60 | 0.0 | 100 | 0.0 | +0.8 +- 6.2 | 7.9 | ok |  | 50 | 100 |  |
| swarm | 3 | 93.0 | 50-90 | 12.0 | 100 | 0.0 | +15.9 +- 6.5 | 3.3 | HIGH+WR | FAIL | 93 | 100 | damage x 0.75 (to the band's middle, 70); reduce damage or spread: win-rate contribution +15.9% +- 6.5 |
| quake | 2 | 52.6 | 30-60 | 3.8 | 100 | 0.0 | -2.4 +- 6.1 | 7.3 | ok |  | 53 | 100 |  |
| aftershock | 3 | 75.8 | 50-90 | 16.2 | 100 | 0.0 | +5.7 +- 6.4 | 5.3 | ok |  | 76 | 100 |  |

FAIL (9): nova, needle, railshot, twinnova, shrapnel, skipper, auger, prism, swarm; ACK (0): none; STALE ACK: none

Decision costs, every sweep match (sims and probe flights are exact; ms is wall time under the sweep's own load):

| tier | decisions | sims mean / max | probe flights mean / max | ms mean / p99 / max (under the sweep's load) |
|---|---|---|---|---|
| rookie | 4000 | 144 / 300 | 564 / 1737 | 12.6 / 31.6 / 93.9 |
| veteran | 4000 | 651 / 1200 | 3559 / 9357 | 67.3 / 152.2 / 302.2 |
| ace | 12004 | 2123 / 3700 | 21773 / 49900 | 290.2 / 1066.6 / 7298.0 |

(Revision 1's rerun printed the tier line and the 32-row table above cell for cell, then this cost table, which is new. Its counts are seed-determined. Its ms column is wall time with all 64 threads busy, so it is only an upper bound; §1 gives the heaviest decisions re-timed alone.)

**Verdict: 9 of 32 fail**, as the spec expects of a first run: **Nova, Twin Nova, Swarm** too strong for tier 3 *and* over +12%; **Needle** too strong for tier 2 (a structural 75% hit rate with 105 points on a hit); **Railshot** too weak (structural: 38% hits, its 18 px blast at 180% speed under the Ace's ±1 noise); **Shrapnel, Skipper** too weak (×1.84, ×1.70); **Prism** too weak for tier 3 (×2.12: one beam of three reaches at spawn range); **Auger** structural (70% hits, 16 points on a hit: tunnel blasts too deep under the 30° clamp). Triad sits at 39.7, just inside tier 1. Two findings beyond the verdict: holding a DIRT weapon costs its holder 8–17% of win rate (⚑ O13), and homing at the spec numbers never misses (Seeker 50.0 points a shot with sd 0; Swarm 93.0 at +15.9%), the ruling 2A asked this harness for (⚑ O12).

With the allow-list seeded by T15 (the nine ids, each with its reason), the same records judge **FAIL 0, ACK 9** and the job is green; a tenth failure would fail it, and a tuned weapon still on the list prints `STALE ACK`.

### 9.6 Gating policy and the workflow

- **Per-commit CI** (`npm test`) never plays a sweep match. It runs the AI corpus, the vs-AI goldens, the verification budget and the unit tests (§10).
- **Weekly (and `workflow_dispatch`), tier separation is always enforced:** Ace ≥ 85% against Rookie, ≥ 60% against Veteran, and Veteran ≥ 70% against Rookie (measured 99.5 / 93.5 / 85.5%). These are AI-correctness properties, not tuning.
- **Weekly, the harness gates through the allow-list** (engine's policy): a failing weapon on `balance.allow.json` is reported as ACK and doesn't fail the job; any other failure does; an allow-listed weapon now passing prints STALE ACK (remove it). So the job stays green while the owner tunes, yet a new regression is caught, which strength's global report-only switch could not do.
- **Never a merge blocker:** the sweep is not in `ci.yml` (the workflow is `schedule` + `workflow_dispatch` only), so an out-of-band weapon never blocks an unrelated merge.
- **The launch gate** (spec §7): the sweep green **with an empty allow-list**, the cross-engine gate green, the owner's playtest; then freeze `simVersion` and flip `LEADERBOARD_PUBLIC.arcfire`.

`.github/workflows/balance-sweep.yml` becomes (written for the plan; the prototype ran the same commands locally):

```yaml
name: Balance sweep (scheduled)

on:
  schedule:
    - cron: "0 6 * * 1"   # Mondays 06:00 UTC
  workflow_dispatch: {}

jobs:
  balance-sweep:
    name: Circle TD BALANCE_SWEEP=1 (Arcfire's sweep runs in its own jobs)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Full balance sweep + grid
        run: BALANCE_SWEEP=1 npx vitest run --exclude src/game/test/arcfire/arcfire.sweep.test.ts

  arcfire-sweep:
    name: Arcfire sweep shard ${{ matrix.shard }}/4
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: BALANCE_SWEEP=1 ARCFIRE_SWEEP_SHARD=${{ matrix.shard }}/4 npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts
      - uses: actions/upload-artifact@v4
        with:
          name: arcfire-sweep-${{ matrix.shard }}
          path: test-results/arcfire-sweep/shard-${{ matrix.shard }}.json

  arcfire-sweep-report:
    name: Arcfire tier separation + balance verdict
    needs: arcfire-sweep
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          pattern: arcfire-sweep-*
          path: test-results/arcfire-sweep
          merge-multiple: true
      - run: BALANCE_SWEEP=1 ARCFIRE_SWEEP_MERGE=test-results/arcfire-sweep npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: arcfire-balance-report
          path: test-results/arcfire-balance/
```

The report goes to the job summary (`GITHUB_STEP_SUMMARY`), to stderr and to the uploaded `arcfire-balance-report` artifact (`report.md` + `report.json`).

---

## 10 · Test strategy (deliverable i)

Unbundled vitest runs the sim 4–5× slower (2A K3). So everything that runs AI decisions in bulk, or is timed, runs on an esbuild bundle (`ai.entry.ts`, `sweep.entry.ts`), and the unbundled tests use small or few states. Every unbundled test that searches or plays carries an **explicit timeout** (§10.2).

**Measured cost** (the Arcfire paths alone, 32 files in parallel, 11.6 s wall on the dev machine), added to `npm test`:

| Tests | Time |
|---|---|
| AI units | 5.4 s |
| vs-AI flow | 10.7 s |
| host | 8.5 s |
| engine | 3.1 s |
| bundled AI pins | 9.7 s |
| bundled timing | 7.5 s |

The longest single file is `vsai.test.ts`, at 10.7 s.

| File | Runs | Concrete assertions |
|---|---|---|
| `copyInto.test.ts` (T1), `quickReject.test.ts` (T2), `carryovers.test.ts` (T3) | always | `copyMatchInto` completeness and parity, no −0 angle; the quick-reject reference property test; every 2A carry-over, with count-based bounds (§10.1, §11) |
| `corpus.test.ts` (+1 `it`) | always | `defDigest({...def, power: x}) === defDigest(def)` for every roster entry |
| `ai/data.test.ts` (T4), `ai/probe.test.ts` (T5), `ai/search.test.ts` (T6), `ai/policy.test.ts` (T7) | always | budgets, noise kernels and draws, models; probe exactness; search purity and budget, Hailstorm, choice rules; 7 draws, legality, the draft (§10.2) |
| `vsai.test.ts` | always | interleaving, human-only replay, resume on every prefix, rejections at the right index, a 300-log fuzz (§10.3) |
| `verify.test.ts` | always | command shapes; cheap rejections before any AI work (§10.4) |
| `ai.corpus.test.ts` (bundled) | always | the AI corpus's two digests and coverage gates; the vs-AI win and loss goldens; `scoreVsAi` on them (§10.5) |
| `ai.perf.test.ts` (bundled) | always | a **cold** daily verification < 5 s (× `ARCFIRE_PERF_MARGIN`); per-tier decision times printed; an Ace tripwire (§10.6) |
| `runtime/arcfire/host.test.ts`, `worker.bundle.test.ts` | always | the host plays the win golden to its hash and resumes it mid-draft, mid-battle and finished; every rejection, including malformed requests in battle; pass-and-play; the client round trip; the worker bundle's inputs and size (§10.7) |
| `test/arcfire/balance.test.ts` | always | aggregation, verdicts, suggestions, powers, pick rate, allow-list states, a report row, the cost table, the roster write-back and its refusals (§10.9) |
| `e2e/cross-engine-determinism.spec.ts` (+2 PINS rows, + a Worker smoke) | the CI browser job; locally Chromium + WebKit | the AI digests and both vs-AI goldens in every engine; the golden in a real Worker, resumed in a fresh one (§10.8) |
| `test/arcfire/arcfire.sweep.test.ts` | `BALANCE_SWEEP=1` (weekly) | tier separation ≥ 85 / 60 / 70%; the harness verdict through the allow-list; every sweep turn legal and within budget (§9) |

### 10.1 The engine changes are pin-neutral, and the carry-overs: T1–T3's test files

**One test file per task.** Each engine and AI task adds its own test file, whole, and no later task edits it, so a task's file imports only modules that exist when the task lands (the staging rule of §12). The shared boards live in `test/arcfire/fixtures.ts`, which T1 extends with `corpusState` (a real `STANDARD_SETTINGS` match with no AI in it: the lowest-free-slot draft, then fixed shots; the engine tests, the AI units and the AI corpus all use it), `battleBoards` (the AI units' 8 boards) and `rngAfter` (the RNG state after n draws):

```diff
--- a/src/game/test/arcfire/fixtures.ts
+++ b/src/game/test/arcfire/fixtures.ts
@@ -3,9 +3,14 @@
 // Shared boards for the Arcfire weapon tests (test-only; outside the sim
 // purity roots). flatBattle() is Plan 1's resolve.test.ts board: battle
 // phase, flat ground at y = 400, player 0 to shoot, no wind, rosterSize 8.
-import { createMatch } from "@/game/titles/arcfire/match";
+// corpusState() is a real STANDARD_SETTINGS match with no AI in it: the
+// Plan 2B engine tests, the AI units and the AI corpus share it (so it lands
+// with the first 2B task, before any AI module exists).
+import { nextU32 } from "@/game/sim/math/rng";
+import { applyPick, applyTurn, createMatch } from "@/game/titles/arcfire/match";
 import { spansFromHeight } from "@/game/titles/arcfire/terrain";
-import type { MatchSettings, MatchState } from "@/game/titles/arcfire/state";
+import { SUDDEN_DEATH_WEAPON } from "@/game/titles/arcfire/constants";
+import { STANDARD_SETTINGS, type MatchSettings, type MatchState } from "@/game/titles/arcfire/state";
 
 const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [], rosterSize: 8 };
 
@@ -27,3 +32,38 @@
   spansFromHeight(m.terrain);
   return m;
 }
+
+/** A STANDARD_SETTINGS match after the lowest-free-slot draft (never `power`), then `shots` fixed shots (the first weapon in hand at 50 or 130, power 65). */
+export function corpusState(seed: number, shots: number): MatchState {
+  const m = createMatch(seed, STANDARD_SETTINGS);
+  while (m.phase === "draft") applyPick(m, m.poolOwner.findIndex((o) => o === -1));
+  for (let i = 0; i < shots && m.phase !== "over"; i++) {
+    const p = m.shooter;
+    applyTurn(m, { move: 0, w: m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[p][0], angle: p === 0 ? 50 : 130, power: 65 });
+  }
+  return m;
+}
+
+/** The AI units' 8 battle boards: corpusState 11/0 and 23/9, each with either player to shoot, windless and with wind 40. */
+export function battleBoards(): MatchState[] {
+  const out: MatchState[] = [];
+  for (const [seed, shots] of [[11, 0], [23, 9]]) {
+    for (const shooter of [0, 1]) {
+      for (const wind of [0, 40]) {
+        const m = corpusState(seed, shots);
+        m.phase = "battle";
+        m.shooter = shooter;
+        m.wind = wind;
+        out.push(m);
+      }
+    }
+  }
+  return out;
+}
+
+/** The RNG state after n more draws from `state`: what a decision that draws n values must leave behind. */
+export function rngAfter(state: number, n: number): number {
+  const r = { state };
+  for (let i = 0; i < n; i++) nextU32(r);
+  return r.state;
+}
```

**T1: `copyInto.test.ts`.**

```ts
// src/game/titles/arcfire/copyInto.test.ts — Plan 2B T1: copyMatchInto, and no -0 shell angle (both pin-neutral)
import { describe, it, expect } from "vitest";
import { createMatch } from "./match";
import { STANDARD_SETTINGS, cloneMatch, copyMatchInto, type MatchState } from "./state";
import { hashMatch } from "./hash";
import { resolveTurn, resolveTurnPoints } from "./resolve";
import { ROSTER } from "./weapons/roster";
import { fanOffset } from "./weapons/primitives";
import { runCorpus } from "@/game/test/arcfire/corpus";
import { corpusState, flatBattle } from "@/game/test/arcfire/fixtures";

function sweepBoards(): MatchState[] {
  const hills = (shooter: number, wind: number): MatchState => {
    const m = corpusState(20260922, 0);
    m.shooter = shooter;
    m.wind = wind;
    return m;
  };
  return [hills(0, 0), hills(0, 40), hills(1, -40), corpusState(23, 9), flatBattle()];
}

/** Each column's live spans: [count, top0, bottom0, ...]. */
function liveSpans(m: MatchState): number[] {
  const out: number[] = [];
  for (let x = 0; x < 1200; x++) {
    const n = m.terrain.spanCount[x];
    out.push(n);
    for (let i = 0; i < 2 * n; i++) out.push(m.terrain.spans[x * 16 + i]);
  }
  return out;
}

describe("copyMatchInto", () => {
  it("copies every field, shares no array, and resolves exactly like a clone", () => {
    const states = [createMatch(5, STANDARD_SETTINGS), corpusState(11, 0), corpusState(23, 9), corpusState(37, 20)];
    const other = createMatch(99, { ...STANDARD_SETTINGS, poolSize: 22 }); // another pool length: poolOwner is reallocated
    for (const s of states) {
      copyMatchInto(other, s);
      expect(hashMatch(other)).toBe(hashMatch(s));
      expect(Object.keys(other).sort()).toEqual(Object.keys(s).sort());
      expect([other.pool, other.hands, Array.from(other.poolOwner), Array.from(other.scores)]).toEqual([s.pool, s.hands, Array.from(s.poolOwner), Array.from(s.scores)]);
      other.hands[0].push(99);
      other.scores[0] += 1;
      other.terrain.height[0] += 1;
      expect(hashMatch(other)).not.toBe(hashMatch(s)); // nothing shared with the source
    }
    const AIMS: [number, number][] = [[0, 100], [35, 70], [45, 60], [65, 95], [90, 100], [115, 70], [135, 60], [180, 100]];
    const scratch = cloneMatch(states[0]);
    for (const b of sweepBoards()) {
      for (let w = 0; w < ROSTER.length; w++) {
        for (const [angle, power] of AIMS) {
          const input = { move: 0 as const, weapon: w, angle, power };
          const loud = cloneMatch(b);
          const tl = resolveTurn(loud, input);
          copyMatchInto(scratch, b);
          expect(resolveTurnPoints(scratch, input)).toEqual(tl.points);
          expect(hashMatch(scratch)).toBe(hashMatch(loud));
          expect(liveSpans(scratch)).toEqual(liveSpans(loud)); // the slots past spanCount are scratch
        }
      }
    }
  }, 120_000);
});

describe("Timeline shell angles", () => {
  it("never records a -0 shell angle", () => {
    for (let i = 0; i < 6; i++) expect(Object.is(fanOffset(i, 6, 0), -0)).toBe(false);
    let angles = 0;
    runCorpus((_c, tl) => {
      for (const s of tl.shells) {
        angles++;
        expect(Object.is(s.angle, -0)).toBe(false);
      }
    });
    expect(angles).toBeGreaterThan(900);
  }, 60_000);
});
```

**T2: `quickReject.test.ts`** (mutation-check it once by dropping the hitbox test from `clearStep`: it turns red).

```ts
// src/game/titles/arcfire/quickReject.test.ts — Plan 2B T2: the exact quick-reject sweep against the per-sample reference
import { describe, it, expect } from "vitest";
import { makeRng, nextRange, type Rng } from "@/game/sim/math/rng";
import { fromInt } from "@/game/sim/math/fixed";
import { shellAt, stepShell, type HitCircle, type Shell } from "./ballistics";
import { addInterval, carveCircle, makeTerrain, removeInterval, spansFromHeight } from "./terrain";

const r = (rng: Rng, lo: number, hi: number): number => lo + nextRange(rng, hi - lo + 1);

const shellKey = (s: Shell): string =>
  [s.x, s.y, s.vx, s.vy, s.gravityStep, s.steps, s.alive, s.speed, s.apexed, s.stopAtApex, s.homeDeg, s.bounces, s.wallBounces, s.restitutionPct, s.ignore].join();

describe("the quick-reject sweep", () => {
  it("steps 20,000 random shells exactly like the per-sample sweep", () => {
    const rng = makeRng(2026);
    let t = makeTerrain();
    let steps = 0;
    const bad: string[] = [];
    for (let n = 0; n < 20000; n++) {
      if (n % 50 === 0) { // a fresh random terrain every 50 shells: hills, floor gaps, craters, floating dirt, tunnels
        t = makeTerrain();
        for (let x = 0; x < 1200; x++) t.height[x] = r(rng, 0, 9) === 0 ? 500 : r(rng, 60, 480);
        spansFromHeight(t);
        for (let k = r(rng, 0, 12); k > 0; k--) {
          const kind = r(rng, 0, 2);
          const cx = r(rng, 0, 1199);
          const cy = r(rng, 0, 499);
          if (kind === 0) carveCircle(t, cx, cy, r(rng, 3, 60));
          else if (kind === 1) for (let x = cx; x < Math.min(1200, cx + r(rng, 1, 40)); x++) addInterval(t, x, cy - r(rng, 1, 60), cy);
          else for (let x = cx; x < Math.min(1200, cx + r(rng, 1, 40)); x++) removeInterval(t, x, cy, cy + r(rng, 1, 30));
        }
      }
      const tanks: HitCircle[] = [{ x: r(rng, 0, 1199), y: r(rng, -20, 510) }, { x: r(rng, 0, 1199), y: r(rng, -20, 510) }];
      const s: Shell = shellAt(fromInt(r(rng, -8, 1207)) + r(rng, 0, 65535), fromInt(r(rng, -300, 520)), fromInt(r(rng, -1400, 1400)), fromInt(r(rng, -1400, 1400)), fromInt(r(rng, 0, 1400)), r(rng, 0, fromInt(12)));
      s.bounces = r(rng, 0, 3) === 0 ? r(rng, 1, 6) : 0;
      s.wallBounces = r(rng, 0, 3) === 0 ? r(rng, 1, 2) : 0;
      s.restitutionPct = r(rng, 40, 100);
      s.homeDeg = r(rng, 0, 3) === 0 ? r(rng, 1, 3) : 0;
      s.homeX = tanks[1].x;
      s.homeY = tanks[1].y;
      s.stopAtApex = r(rng, 0, 7) === 0;
      s.apexed = r(rng, 0, 1) === 0;
      s.ignore = r(rng, 0, 3);
      s.steps = r(rng, 0, 1199);
      const q = { ...s };
      const wind = fromInt(r(rng, -40, 40)) / 60 | 0;
      for (let step = 0; step < 1300 && s.alive; step++) {
        const a = JSON.stringify(stepShell(s, t, tanks, wind));
        const b = JSON.stringify(stepShell(q, t, tanks, wind, true));
        steps++;
        if (a !== b || shellKey(s) !== shellKey(q)) bad.push(`shell ${n} step ${step}: ${a} vs ${b}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(steps).toBeGreaterThan(500000);
  }, 120_000);
});
```

**T3: `carryovers.test.ts`.** Red on the 2A code where it guards a change: the delay test throws `RangeError`, and the ring test counts 65,641 effect-list walks (1 + 40 + 1,600 + 64,000) against 4. The over-deep test is green on the 2A code too. It guards the memo's direction: a memo that skips a stage "already checked at this depth or a shallower one" fails it (measured), because the shallower check hits the depth limit later (§11). The walk count and the report equality replace wall-clock limits, so no always-on test times the validator.

```ts
// src/game/titles/arcfire/carryovers.test.ts — Plan 2B T3: the parked Plan 2A minors (the validator fixes and the missing tests)
import { describe, it, expect } from "vitest";
import { hashMatch } from "./hash";
import { resolveWeapon } from "./resolve";
import { ROSTER, ROSTER_INDEX } from "./weapons/roster";
import { maxTurnSteps, weaponErrors } from "./weapons/validate";
import { flatBattle } from "@/game/test/arcfire/fixtures";
import type { Blast, Effect, Stage, WeaponDef } from "./weapons/types";

const B: Blast = { radius: 28, damage: 40 };
const weapon = (stage: Stage): WeaponDef => ({ id: "t", name: "T", tag: "BLAST", tier: 1, power: 30, launch: { kind: "shell" }, stage });
const up = (child: Stage): Effect => ({ split: { count: 1, spreadDeg: 0, speedPct: 50, from: "up", child } });

describe("the Plan 2A carry-overs", () => {
  it("weaponErrors never descends into a delay: a self-containing or deep delay chain is one report, no throw", () => {
    const then: Effect[] = [{ blast: B }];
    then.push({ delay: { steps: 5, then: then as never } });
    expect(weaponErrors(weapon({ on: "impact", effects: [{ delay: { steps: 5, then: then as never } }] })))
      .toEqual(["stage.effects[0].delay.then[1]: a delay cannot schedule a delay"]);
    let deep: Effect = { blast: B };
    for (let i = 0; i < 10000; i++) deep = { delay: { steps: 1, then: [deep] as never } };
    expect(weaponErrors(weapon({ on: "impact", effects: [deep] }))).toEqual(["stage.effects[0].delay.then[0]: a delay cannot schedule a delay"]);
  });
  it("walks each stage of a multi-stage cycle once, and still reports every back-reference", () => {
    const ring: Stage[] = [0, 1, 2, 3].map(() => ({ on: "impact" as const, effects: [{ blast: B }] as Effect[] }));
    for (let i = 0; i < 4; i++) for (let k = 0; k < 40; k++) ring[i].effects.push(up(ring[(i + 1) % 4]));
    let walks = 0; // reads of a ring stage's effect list: one per stage check
    for (const st of ring) {
      const list = st.effects;
      Object.defineProperty(st, "effects", { get: () => { walks++; return list; } });
    }
    const errs = weaponErrors(weapon(ring[0]));
    expect(walks).toBe(4); // without the (stage, depth) memo: 1 + 40 + 1,600 + 64,000 walks and 40^4 reports
    expect(errs.length).toBe(40);
    expect(errs.every((e) => e.endsWith("split.child: cyclic stage, so its stages nest deeper than 4"))).toBe(true);
  });
  it("still reports an over-deep path through a stage it already checked at a shallower depth", () => {
    const leaf: Stage = { on: "impact", effects: [{ blast: B }] };
    const s: Stage = { on: "impact", effects: [{ blast: B }, up(leaf)] }; // leaf: depth 3 under s at 2, depth 5 under s at 4
    const b: Stage = { on: "impact", effects: [{ blast: B }, up(s)] };
    const a: Stage = { on: "impact", effects: [{ blast: B }, up(b)] };
    expect(weaponErrors(weapon({ on: "impact", effects: [{ blast: B }, up(s), up(a)] }))).toEqual([
      "stage.effects[2].split.child.effects[1].split.child.effects[1].split.child.effects[1].split.child: stages nest deeper than 4",
    ]);
  });
  it("reports homing: null as missing, and resolves such a def as if it had no homing", () => {
    const bad = weapon({ on: "impact", effects: [{ blast: B }], homing: null as never });
    expect(weaponErrors(bad)).toContain("stage.homing: missing");
    const a = flatBattle();
    const b = flatBattle();
    const input = { move: 0 as const, weapon: 0, angle: 45, power: 60 };
    expect(resolveWeapon(a, bad, input).points).toEqual(resolveWeapon(b, weapon({ on: "impact", effects: [{ blast: B }] }), input).points);
    expect(hashMatch(a)).toBe(hashMatch(b));
  });
  it("bounds a turn's steps statically", () => {
    expect(maxTurnSteps(ROSTER[ROSTER_INDEX.twinnova])).toBe(1230);
    expect(maxTurnSteps(ROSTER[ROSTER_INDEX.cascade])).toBe(3600);
    expect(maxTurnSteps(ROSTER[ROSTER_INDEX.lancer])).toBe(1);
    const leaf: Stage = { on: "impact", effects: [{ blast: B }, { delay: { steps: 600, then: [{ blast: B }] } }] };
    expect(maxTurnSteps(weapon({ on: "impact", effects: [{ split: { count: 2, spreadDeg: 10, speedPct: 50, from: "up", child: leaf } }] }))).toBe(3000);
  });
  it("abandons every shell still flying at the 4,800-step backstop with one out event each", () => {
    const hop: Stage = { on: "impact", effects: [] };
    hop.effects.push({ split: { count: 1, spreadDeg: 0, speedPct: 100, from: "up", child: hop } });
    const tl = resolveWeapon(flatBattle(), weapon(hop), { move: 0, weapon: 0, angle: 90, power: 100 });
    expect(tl.steps).toBe(4800);
    const outs = tl.events.filter((e) => e.kind === "out");
    expect(outs.length).toBe(1);
    expect(outs[0]).toMatchObject({ step: 4800, lag: 0 });
    expect(tl.events[tl.events.length - 1]).toBe(outs[0]);
    const alive = tl.shells.length - 1; // the one shell alive at the backstop: its path ends at the out point
    const pts = tl.shells[alive].points;
    expect([pts[pts.length - 2], pts[pts.length - 1]]).toEqual([(outs[0] as { x: number }).x, (outs[0] as { y: number }).y]);
  });
});
```

And in `corpus.test.ts` (T3; the power-independence pin):

```diff
--- a/src/game/titles/arcfire/corpus.test.ts
+++ b/src/game/titles/arcfire/corpus.test.ts
@@ -42,6 +42,9 @@
 interface CorpusFixture { digest: string; defs: Record<string, string>; cases: Record<string, Fingerprint> }
 
 describe("arcfire corpus", () => {
+  it("definition digests ignore `power`, so a balance write-back moves no corpus pin", () => {
+    for (const def of ROSTER) expect(defDigest({ ...def, power: def.power === 1 ? 2 : 1 }), def.id).toBe(defDigest(def));
+  });
   it("reproduces every pinned case and weapon definition", () => {
     const kinds = new Set<string>();
     const volleyAngles: number[] = [];
```

Every existing test stays green unchanged, including the bounce-at-the-cap test through the `endStep` refactor, the quiet-path parity test through K12, and `validate.test.ts`'s cycle, shared-child and malformed-input tests through the validator fix. Every pin is byte-identical: `389a1340`, `8d7dc831`, `a7100140`, `3f614265`, `5167b43d`.

### 10.2 AI units: T4–T7's test files

Four files, one per task. The search's purity test (RNG-free, same plan on a clone, within budget) lands with the search in T6. The policy's draw test (exactly 7 draws, same command on clones, a legal command) lands with the policy in T7.

**Explicit timeouts.** Every unbundled test that runs a search or a match carries an explicit timeout (30–120 s), because vitest's default is 5 s. Under a parallel `npm test` on the dev machine, the slowest unbundled AI tests took 2.6 s (the search), 4.5 s (the policy), 9.3 s (the vs-AI prefix test) and 9.7 s (the host's golden test), and CI runs Node 22 on 4 vCPUs with the test files in parallel. Timing assertions exist only in the bundled `ai.perf.test.ts` and 2A's `perf.test.ts`.

**T4: `ai/data.test.ts`.**

```ts
// src/game/titles/arcfire/ai/data.test.ts — Plan 2B T4: the tier table, the noise, the weapon models
import { describe, it, expect } from "vitest";
import { makeRng } from "@/game/sim/math/rng";
import { ROSTER, ROSTER_INDEX } from "../weapons/roster";
import { rngAfter } from "@/game/test/arcfire/fixtures";
import { drawNoise, kernelTotal, noiseKernel } from "./noise";
import { dealsDamage, probeModelOf } from "./model";
import { TIERS, tierBudget } from "./tiers";

describe("tiers", () => {
  it("budgets are the spec's fixed sim counts", () => {
    expect([TIERS.rookie, TIERS.veteran, TIERS.ace].map(tierBudget)).toEqual([300, 1500, 4000]);
  });
});

describe("noise (a seeded sum of 3 uniform integers)", () => {
  it("has the exact kernels", () => {
    expect(Array.from(noiseKernel(0))).toEqual([1]);
    expect(Array.from(noiseKernel(1))).toEqual([1, 1, 1]);
    expect(Array.from(noiseKernel(2))).toEqual([1, 2, 3, 2, 1]);
    expect(Array.from(noiseKernel(3))).toEqual([1, 3, 6, 7, 6, 3, 1]);
    for (const [b, total] of [[6, 125], [8, 245]]) {
      const k = Array.from(noiseKernel(b));
      expect(k.length).toBe(2 * b + 1);
      expect(kernelTotal(noiseKernel(b))).toBe(total);
      expect(k).toEqual(k.slice().reverse());
    }
  });
  it("draws exactly 3 values and spans exactly +-bound", () => {
    for (const bound of [1, 2, 3, 6, 8]) {
      const rng = makeRng(bound);
      const seen = new Set<number>();
      for (let i = 0; i < 20000; i++) {
        const before = rng.state;
        const v = drawNoise(rng, bound);
        expect(rng.state).toBe(rngAfter(before, 3));
        seen.add(v);
      }
      expect(Math.min(...seen)).toBe(0 - bound);
      expect(Math.max(...seen)).toBe(bound);
      expect(seen.size).toBe(2 * bound + 1);
    }
  }, 30_000);
});

describe("weapon models", () => {
  it("dealsDamage is false exactly for the DIRT weapons, and a cyclic def terminates", () => {
    expect(ROSTER.filter((w) => !dealsDamage(w)).map((w) => w.id)).toEqual(["rampart", "bastion", "leveler"]);
    const loop = { on: "impact" as const, effects: [] as never[] };
    (loop.effects as unknown[]).push({ split: { count: 1, spreadDeg: 0, speedPct: 50, from: "up", child: loop } });
    expect(dealsDamage({ ...ROSTER[0], stage: loop })).toBe(false);
  });
  it("the roster flies 12 distinct probe models", () => {
    expect(new Set(ROSTER.map((w) => probeModelOf(w).key)).size).toBe(12);
    expect(probeModelOf(ROSTER[ROSTER_INDEX.hydra]).key).toBe(probeModelOf(ROSTER[ROSTER_INDEX.barrage]).key);
  });
});
```

**T5: `ai/probe.test.ts`.**

```ts
// src/game/titles/arcfire/ai/probe.test.ts — Plan 2B T5: the probe flies the weapon's own flight, exactly
import { describe, it, expect } from "vitest";
import { cloneMatch } from "../state";
import { resolveTurn } from "../resolve";
import { hitCircles } from "../tanks";
import { spansFromHeight } from "../terrain";
import { ROSTER, ROSTER_INDEX } from "../weapons/roster";
import { battleBoards } from "@/game/test/arcfire/fixtures";
import { probeModelOf } from "./model";
import { LAND_FOE, LAND_OUT, landingGrid } from "./probe";
import { TIERS } from "./tiers";

describe("the probe", () => {
  it("lands a plain model exactly where Pulse's blast lands (or leaves the world where Pulse does)", () => {
    for (const b of battleBoards()) {
      const t = cloneMatch(b);
      spansFromHeight(t.terrain);
      const board = { t: t.terrain, tanks: hitCircles(t), me: b.shooter, windStep: Math.trunc((b.wind * 65536) / 60) };
      const g = landingGrid(board, probeModelOf(ROSTER[0]), TIERS.rookie, { probes: 0 });
      for (let c = 0; c < g.kind.length; c++) {
        const tl = resolveTurn(cloneMatch(b), { move: 0, weapon: 0, angle: g.angles[Math.trunc(c / g.powers.length)], power: g.powers[c % g.powers.length] });
        const blast = tl.events.find((e) => e.kind === "blast");
        if (g.kind[c] === LAND_OUT) expect(blast).toBeUndefined();
        else expect(blast && [blast.x, blast.y]).toEqual([g.x[c], g.y[c]]);
      }
    }
  }, 60_000);
  it("a beam probe reaches the enemy exactly when Lancer damages it, on the whole dial", () => {
    for (const b of battleBoards()) {
      const t = cloneMatch(b);
      spansFromHeight(t.terrain);
      const board = { t: t.terrain, tanks: hitCircles(t), me: b.shooter, windStep: 0 };
      const g = landingGrid(board, probeModelOf(ROSTER[ROSTER_INDEX.lancer]), TIERS.ace, { probes: 0 });
      expect(g.angles.length).toBe(181);
      for (let c = 0; c < g.angles.length; c++) {
        const tl = resolveTurn(cloneMatch(b), { move: 0, weapon: ROSTER_INDEX.lancer, angle: g.angles[c], power: 50 });
        expect(g.kind[c] === LAND_FOE, `angle ${g.angles[c]}`).toBe(tl.points[b.shooter] > 0);
      }
    }
  }, 60_000);
});
```

**T6: `ai/search.test.ts`.**

```ts
// src/game/titles/arcfire/ai/search.test.ts — Plan 2B T6: the RNG-free search and the choice rules
import { describe, it, expect } from "vitest";
import { cloneMatch } from "../state";
import { hashMatch } from "../hash";
import { resolveTurn } from "../resolve";
import { ROSTER, ROSTER_INDEX } from "../weapons/roster";
import { battleBoards, corpusState } from "@/game/test/arcfire/fixtures";
import { byValue, chooseOffence, planTurn } from "./plan";
import { TIERS, tierBudget } from "./tiers";
import type { Cand } from "./search";

describe("the search", () => {
  it("never writes the match or its RNG, stays within its budget, and plans the same on a clone", () => {
    const m = corpusState(11, 9);
    for (const tier of ["rookie", "veteran", "ace"] as const) {
      const hash = hashMatch(m);
      const a = planTurn(m, tier);
      expect(hashMatch(m)).toBe(hash);
      expect(planTurn(cloneMatch(m), tier)).toEqual(a);
      expect(a.stats.sims).toBeLessThanOrEqual(tierBudget(TIERS[tier]));
    }
  }, 120_000);
  it("finds the Hailstorm cone: a Veteran with only Hailstorm scores on every board", () => {
    for (const b of battleBoards().filter((x) => x.wind === 0)) {
      const m = cloneMatch(b);
      m.hands[m.shooter] = [ROSTER_INDEX.hailstorm];
      const c = planTurn(m, "veteran").choices[0];
      const tl = resolveTurn(cloneMatch(m), { move: c.move, weapon: c.w, angle: c.angle, power: c.power });
      expect(tl.points[m.shooter]).toBeGreaterThan(0);
    }
  }, 60_000);
});

const cand = (id: string, ev: number): Cand => ({ w: ROSTER_INDEX[id], move: 0, angle: 45, power: 60, ev, raw: ev });

describe("the choice rules", () => {
  it("Ace saves a tier-3 weapon unless it beats the best other by >= 20%, strictly", () => {
    expect(chooseOffence([cand("nova", 100), cand("pulse2", 83)], TIERS.ace).pick!.w).toBe(ROSTER_INDEX.nova); // 500 >= 498
    const saved = chooseOffence([cand("nova", 100), cand("pulse2", 84)], TIERS.ace); // 500 < 504
    expect([saved.pick!.w, saved.saved]).toEqual([ROSTER_INDEX.pulse2, true]);
    expect(chooseOffence([cand("nova", 0), cand("pulse2", 0)], TIERS.ace).pick!.w).toBe(ROSTER_INDEX.nova); // no alternative with ev > 0
    expect(chooseOffence([cand("nova", 90), cand("swarm", 80)], TIERS.ace).pick!.w).toBe(ROSTER_INDEX.nova); // only tier 3
    expect(chooseOffence([cand("nova", 100), cand("pulse2", 84)], TIERS.veteran).pick!.w).toBe(ROSTER_INDEX.nova); // Veteran never saves
    expect(chooseOffence([cand("pulse", 40), cand("tumbler", 40)], TIERS.veteran).pick!.w).toBe(ROSTER_INDEX.pulse); // the first of equals
  });
  it("ranks by ev, then the lower tier, then roster index", () => {
    const r = [cand("nova", 60), cand("pulse2", 60), cand("tumbler", 60), cand("pulse", 70)].sort(byValue).map((c) => ROSTER[c.w].id);
    expect(r).toEqual(["pulse", "tumbler", "pulse2", "nova"]);
  });
});
```

**T7: `ai/policy.test.ts`.**

```ts
// src/game/titles/arcfire/ai/policy.test.ts — Plan 2B T7: the only RNG draws (the turn policy and the draft AI)
import { describe, it, expect } from "vitest";
import { applyPick, applyTurn, createMatch } from "../match";
import { STANDARD_SETTINGS, cloneMatch } from "../state";
import { ROSTER } from "../weapons/roster";
import { corpusState, rngAfter } from "@/game/test/arcfire/fixtures";
import { planTurn } from "./plan";
import { AI_TURN_DRAWS, aiPick, aiTurn } from "./policy";

describe("the policy", () => {
  it("draws exactly 7 values after its search, decides the same on clones, and fires a legal command", () => {
    const m = corpusState(11, 9);
    for (const tier of ["rookie", "veteran", "ace"] as const) {
      const plan = planTurn(m, tier);
      const x = cloneMatch(m);
      const y = cloneMatch(m);
      const cx = aiTurn(x, tier);
      const cy = aiTurn(y, tier);
      expect(cx.cmd).toEqual(cy.cmd);
      expect(cx.plan.stats).toEqual(cy.plan.stats);
      expect(cx.plan.stats).toEqual(plan.stats);
      expect(x.rng.state).toBe(rngAfter(m.rng.state, AI_TURN_DRAWS));
      expect(applyTurn(cloneMatch(m), cx.cmd).ok).toBe(true);
    }
  }, 120_000);
});

describe("the draft AI", () => {
  it("takes the top by power (Ace), stays within its top N, and always draws exactly once", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const m = createMatch(seed, STANDARD_SETTINGS);
      const byPower = m.pool.map((_, i) => i).sort((a, b) => ROSTER[m.pool[b]].power - ROSTER[m.pool[a]].power || a - b);
      for (const [tier, top] of [["rookie", 8], ["veteran", 3], ["ace", 1]] as const) {
        const c = cloneMatch(m);
        const w = aiPick(c, tier);
        expect(byPower.slice(0, top)).toContain(w);
        expect(c.rng.state).toBe(rngAfter(m.rng.state, 1));
        expect(applyPick(c, w).ok).toBe(true);
      }
    }
  }, 30_000);
});
```

### 10.3 vs-AI flow: `vsai.test.ts`

```ts
// src/game/titles/arcfire/vsai.test.ts — vs-AI flow, human-only replay, search-free resume (SHORT_SETTINGS: fast)
import { describe, it, expect } from "vitest";
import { makeRng, nextRange } from "@/game/sim/math/rng";
import { createMatch, toAct } from "./match";
import { SHORT_SETTINGS, STANDARD_SETTINGS } from "./state";
import { hashMatch } from "./hash";
import { AI, HUMAN, advanceAi, maxHumanCommands, replayVsAi, resumeVsAi } from "./vsai";
import { playVsAi } from "@/game/test/arcfire/vsaiGolden";
import type { ArcfireCommand } from "./replay";
import type { MatchState } from "./state";
import { moveTarget } from "./tanks";
import { SUDDEN_DEATH_WEAPON } from "./constants";

const S = SHORT_SETTINGS;

/** A cheap scripted human (the goldens use the grid human): the lowest free slot, then its first weapon at 45, power 70; its second shot moves toward the enemy when legal. */
const quick = (m: MatchState): ArcfireCommand => {
  if (m.phase === "draft") return { k: "pick", w: m.poolOwner.findIndex((o) => o === -1) };
  const w = m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[HUMAN][0];
  const move = m.hands[HUMAN].length === S.weaponsEach - 1 && moveTarget(m, HUMAN, 1) !== -1 ? 1 : 0;
  return { k: "turn", move, w, angle: 45, power: 70 };
};

describe("vs-AI flow", () => {
  it("the AI acts after createMatch and after every human command, twice at the draft's end when the human picked first", () => {
    let aiFirst = -1;
    let humanFirst = -1;
    for (let seed = 1; aiFirst < 0 || humanFirst < 0; seed++) {
      if (createMatch(seed, S).firstPicker === AI) aiFirst = seed;
      else humanFirst = seed;
    }
    const a = createMatch(aiFirst, S);
    expect(advanceAi(a, "rookie").map((x) => x.k)).toEqual(["pick"]);
    expect(toAct(a)).toBe(HUMAN);
    const h = createMatch(humanFirst, S);
    expect(advanceAi(h, "rookie")).toEqual([]);
    const live = playVsAi(humanFirst, S, "rookie", quick);
    const lastPick = live.log.map((c) => c.k).lastIndexOf("pick");
    expect(live.log[lastPick - 1]).toBe(live.commands[S.weaponsEach - 1]); // the human's last pick ...
    expect(live.log[lastPick].k).toBe("pick"); // ... then the AI's last pick ...
    expect(live.log[lastPick + 1].k).toBe("turn"); // ... then the AI's opening shot
  }, 60_000);

  it("replays the human's commands alone to the live match, and resumes every prefix without a search", () => {
    for (const seed of [3, 4, 5]) {
      for (const tier of ["rookie", "veteran"] as const) {
        const live = playVsAi(seed, S, tier, quick);
        const r = replayVsAi({ seed, settings: S, tier, commands: live.commands });
        expect(r.ok && r.hash).toBe(hashMatch(live.state));
        expect(live.commands.length).toBeLessThanOrEqual(maxHumanCommands(S));
        if (seed !== 3 || tier !== "rookie") continue; // every prefix (Veteran: the bundled golden test resumes its full log)
        for (let k = 0; k <= live.log.length; k++) {
          const res = resumeVsAi({ seed, settings: S, log: live.log.slice(0, k) });
          expect(res.ok && res.droppedFrom).toBe(-1);
          if (!res.ok) return;
          expect(res.log).toEqual(live.log.slice(0, k));
          advanceAi(res.state, tier); // a host continues the AI after a resume
          const rr = replayVsAi({ seed, settings: S, tier, commands: res.humanLog });
          expect(rr.ok && rr.hash, `prefix ${k}`).toBe(hashMatch(res.state));
        }
      }
    }
  }, 120_000); // unbundled: about 8 s on the dev machine, so vitest's 5 s default would fail it

  it("resume drops a bad entry and everything after it, and never throws", () => {
    const live = playVsAi(4, S, "rookie", quick);
    const bad = live.log.slice();
    bad[7] = { k: "pick", w: 99 };
    const r = resumeVsAi({ seed: 4, settings: S, log: bad });
    expect(r.ok && r.droppedFrom).toBe(7);
    if (r.ok) expect(r.log).toEqual(live.log.slice(0, 7));
    expect(resumeVsAi({ seed: 4, settings: S, log: "nope" })).toEqual({ ok: false });
    expect(resumeVsAi({ seed: 4, settings: S, log: [null, 3] }).ok).toBe(true);
  }, 60_000);

  it("rejects a bad human log at the right index", () => {
    const live = playVsAi(5, S, "rookie", quick);
    const cmds = live.commands;
    const at = (commands: unknown): unknown => {
      const r = replayVsAi({ seed: 5, settings: S, tier: "rookie", commands });
      return r.ok ? "ok" : `${r.reason}@${r.atIndex}`;
    };
    expect(at(cmds)).toBe("ok");
    expect(at([...cmds, cmds[cmds.length - 1]])).toBe(cmds.length === maxHumanCommands(S) ? `too_long@${maxHumanCommands(S)}` : `invalid_command@${cmds.length}`);
    const turnAt = cmds.findIndex((c) => c.k === "turn");
    const turn = cmds[turnAt] as Extract<ArcfireCommand, { k: "turn" }>;
    expect(at(cmds.map((c, i) => (i === turnAt ? { ...turn, angle: 181 } : c)))).toBe(`invalid_command@${turnAt}`);
    const aiWeapon = live.state.pool[live.state.poolOwner.indexOf(AI)]; // drafted by the AI: never in the human's hand
    expect(at(cmds.map((c, i) => (i === turnAt ? { ...turn, w: aiWeapon } : c)))).toBe(`invalid_command@${turnAt}`);
    expect(at([null])).toBe("invalid_command@0");
    expect(at([{ k: "x" }])).toBe("invalid_command@0");
    expect(at("nope")).toBe("invalid_command@0");
    expect(at(new Array(maxHumanCommands(S) + 1).fill(cmds[0]))).toBe(`too_long@${maxHumanCommands(S)}`);
  }, 60_000);

  it("never throws on 300 random logs", () => {
    const rng = makeRng(20260924);
    for (let n = 0; n < 300; n++) {
      const cmds: unknown[] = [];
      const len = nextRange(rng, 14);
      for (let i = 0; i < len; i++) {
        const k = nextRange(rng, 5);
        cmds.push(k === 0 ? { k: "pick", w: nextRange(rng, 14) - 1 } : k === 1 ? { k: "turn", move: nextRange(rng, 3) - 1, w: nextRange(rng, 33), angle: nextRange(rng, 200) - 10, power: nextRange(rng, 120) - 10 } : k === 2 ? null : k === 3 ? { k: "pick", w: 0.5 } : "x");
      }
      const r = replayVsAi({ seed: n, settings: S, tier: "rookie", commands: cmds });
      expect(r.ok || r.reason === "invalid_command" || r.reason === "too_long").toBe(true);
    }
  }, 60_000);

  it("allows 2 x weaponsEach + 1 human commands (21 in the daily)", () => {
    expect(maxHumanCommands(STANDARD_SETTINGS)).toBe(21);
  });
});
```

### 10.4 The verifier's cheap paths: `verify.test.ts`

```ts
// src/game/titles/arcfire/verify.test.ts — the verifier's cheap paths (the golden paths run bundled in ai.corpus.test.ts)
import { describe, it, expect } from "vitest";
import { isArcfireCommand, scoreVsAi, DAILY_TIER } from "./verify";

describe("scoreVsAi", () => {
  it("checks the command shape", () => {
    expect([{ k: "pick", w: 3 }, { k: "turn", move: -1, w: 0, angle: 0, power: 100 }].map(isArcfireCommand)).toEqual([true, true]);
    expect([null, 3, "x", { k: "pick" }, { k: "pick", w: 1.5 }, { k: "turn", move: 2, w: 0, angle: 45, power: 50 }, { k: "turn", move: 0, w: 0, angle: "45", power: 50 }, { k: "boom" }]
      .map(isArcfireCommand)).toEqual([false, false, false, false, false, false, false, false]);
  });
  it("rejects cheapest first, before any AI work", () => {
    expect(scoreVsAi(1, "nope")).toEqual({ rejected: "invalid_command_shape" });
    expect(scoreVsAi(1, new Array(22).fill(null))).toEqual({ rejected: "too_long" });
    expect(scoreVsAi(1, [{ k: "pick", w: 0 }, 7])).toEqual({ rejected: "invalid_command_shape" });
    expect(scoreVsAi(1, [])).toEqual({ rejected: "not_a_win" });
    expect(DAILY_TIER).toBe("veteran");
  });
});
```

### 10.5 The AI pins: `aiCorpus.ts`, `vsaiGolden.ts`, `ai.entry.ts`, `ai.corpus.test.ts`

```ts
// src/game/test/arcfire/aiCorpus.ts
//
// The AI corpus: fixed AI decisions, fingerprinted, so Node and every browser
// engine must decide identically (spec §8), and a change to the AI names the
// decision it moved. Two sections with their own digests:
//   turn|<tier>|<state>  a turn decision on a fixed state. States are
//     fixtures.ts's corpusState (the lowest-free-slot draft, never `power`,
//     then fixed shots: no AI); the specials
//     edit a hand, the wind or the phase so that every heuristic is
//     exercised (a coverage gate in ai.corpus.test.ts checks it). The
//     fingerprint is the command after noise, the sim and probe counts, the
//     chosen ev and the RNG state after the 7 draws. Power-independent;
//   draft|<tier>|s<seed> the tier's first six picks on the seed's pool, and
//     the RNG state after them. These read `power`, so a balance write-back
//     moves this section (and the vs-AI golden) only.
// Pure: the corpus test (bundled, Node) and the cross-engine harness run it.
import { FNV_OFFSET, fnvFold, fnvHex } from "@/game/sim/hash";
import { applyPick, createMatch } from "@/game/titles/arcfire/match";
import { STANDARD_SETTINGS, cloneMatch, type MatchState } from "@/game/titles/arcfire/state";
import { ROSTER_INDEX } from "@/game/titles/arcfire/weapons/roster";
import { aiPick, aiTurn } from "@/game/titles/arcfire/ai/policy";
import type { Plan } from "@/game/titles/arcfire/ai/plan";
import type { TurnCommand } from "@/game/titles/arcfire/match";
import type { AiTier } from "@/game/titles/arcfire/ai/tiers";
import { corpusState } from "./fixtures";

export const AI_TIERS: AiTier[] = ["rookie", "veteran", "ace"];
export const AI_CORPUS_SEEDS = [11, 23, 37, 41];

const hand = (ids: string[]): number[] => ids.map((id) => ROSTER_INDEX[id]).sort((a, b) => a - b);

/** Every turn state by name: 8 plain states, then the specials that exercise wind, sudden death, a beam, tier-3 saving, DIRT and moves. */
export function turnStates(): [string, MatchState][] {
  const out: [string, MatchState][] = [];
  for (const seed of AI_CORPUS_SEEDS) for (const shots of [0, 9]) out.push([`s${seed}t${shots}`, corpusState(seed, shots)]);
  const wind = corpusState(11, 0);
  wind.wind = 40;
  out.push(["wind", wind]);
  const sudden = corpusState(23, 0);
  sudden.phase = "suddenDeath";
  out.push(["sudden", sudden]);
  const beam = corpusState(37, 0);
  beam.hands[beam.shooter] = hand(["pulse", "lancer"]);
  out.push(["beam", beam]);
  const save = corpusState(11, 0);
  save.hands[save.shooter] = hand(["fan", "cascade"]);
  out.push(["saveT3", save]);
  const dirt = corpusState(67, 0);
  dirt.hands[dirt.shooter] = hand(["pulse", "rampart"]);
  dirt.hands[1 - dirt.shooter] = hand(["nova", "twinnova", "juggernaut"]);
  out.push(["dirt", dirt]);
  const move = corpusState(30, 15);
  move.hands[move.shooter] = hand(["pulse"]);
  out.push(["move", move]);
  out.push(["move2", corpusState(6, 0)]);
  return out;
}

export type AiFingerprint = number[];
export interface AiCorpus { turn: Record<string, AiFingerprint>; draft: Record<string, AiFingerprint> }

/** Every case's fingerprint. `onTurn` sees each turn case's state, command and plan (Node-only coverage checks). */
export function runAiCorpus(onTurn?: (id: string, m: MatchState, cmd: TurnCommand, plan: Plan) => void): AiCorpus {
  const turn: Record<string, AiFingerprint> = {};
  const draft: Record<string, AiFingerprint> = {};
  for (const [name, s] of turnStates()) {
    for (const tier of AI_TIERS) {
      const m = cloneMatch(s);
      const { cmd, plan } = aiTurn(m, tier);
      const id = `turn|${tier}|${name}`;
      turn[id] = [cmd.w, cmd.move, cmd.angle, cmd.power, plan.stats.sims, plan.stats.probes, plan.choices[0].ev, m.rng.state];
      if (onTurn) onTurn(id, s, cmd, plan);
    }
  }
  for (const seed of AI_CORPUS_SEEDS) {
    for (const tier of AI_TIERS) {
      const m = createMatch(seed, STANDARD_SETTINGS);
      const picks: number[] = [];
      for (let i = 0; i < 6; i++) {
        const w = aiPick(m, tier);
        picks.push(m.pool[w]);
        applyPick(m, w);
      }
      draft[`draft|${tier}|s${seed}`] = [...picks, m.rng.state];
    }
  }
  return { turn, draft };
}

/** One digest over a section's cases, in id order. */
export function aiDigest(cases: Record<string, AiFingerprint>): string {
  let h = FNV_OFFSET;
  for (const id of Object.keys(cases).sort()) {
    for (let i = 0; i < id.length; i++) h = fnvFold(h, id.charCodeAt(i));
    for (const v of cases[id]) h = fnvFold(h, v);
  }
  return fnvHex(h);
}
```

```ts
// src/game/test/arcfire/vsaiGolden.ts
//
// The vs-AI goldens' scripted human, and live play against the AI. The human
// (player 0) is deliberately simple and independent of the AI search: it
// drafts the highest free pool slot, and each turn fires the best command of a
// fixed grid over its hand (angles 20..75 step 5, powers 40..100 step 5),
// found on cloneMatch copies, the first best on a tie; its third battle shot
// moves one step toward the enemy when that is legal. It never touches the
// live match's RNG, so replaying its commands alone must regenerate exactly
// the match it played: the leaderboard's core guarantee.
import { applyTurn, createMatch } from "@/game/titles/arcfire/match";
import { moveTarget } from "@/game/titles/arcfire/tanks";
import { cloneMatch, type MatchSettings, type MatchState } from "@/game/titles/arcfire/state";
import { applyCommand, type ArcfireCommand } from "@/game/titles/arcfire/replay";
import { SUDDEN_DEATH_WEAPON } from "@/game/titles/arcfire/constants";
import { HUMAN, advanceAi } from "@/game/titles/arcfire/vsai";
import type { AiTier } from "@/game/titles/arcfire/ai/tiers";

/** The scripted human's command for the state it is to act in. */
export function goldenHuman(m: MatchState): ArcfireCommand {
  if (m.phase === "draft") {
    let w = m.poolOwner.length - 1;
    while (m.poolOwner[w] !== -1) w--;
    return { k: "pick", w };
  }
  const battleShot = m.phase === "battle" ? (m.shotsFired - (m.firstPicker === HUMAN ? 1 : 0)) >> 1 : -1; // the human's own shot number
  const move: -1 | 0 | 1 = battleShot === 2 && moveTarget(m, HUMAN, 1) !== -1 ? 1 : 0;
  const hand = m.phase === "suddenDeath" ? [SUDDEN_DEATH_WEAPON] : m.hands[HUMAN];
  let best: ArcfireCommand | null = null;
  let bestV = 0;
  for (const w of hand) {
    for (let angle = 20; angle <= 75; angle += 5) {
      for (let power = 40; power <= 100; power += 5) {
        const c = cloneMatch(m);
        if (!applyTurn(c, { move, w, angle, power }).ok) continue;
        const v = c.scores[HUMAN] - m.scores[HUMAN] - (c.scores[1 - HUMAN] - m.scores[1 - HUMAN]);
        if (best === null || v > bestV) {
          best = { k: "turn", move, w, angle, power };
          bestV = v;
        }
      }
    }
  }
  return best!;
}

/** A live vs-AI match: the human's commands (the submission), the full log (the resume blob), the AI's turns, the final state. */
export interface LivePlay { commands: ArcfireCommand[]; log: ArcfireCommand[]; aiTurns: ArcfireCommand[]; state: MatchState }

/** Play a whole vs-AI match live: the AI acts whenever it is its move (vsai.ts), `human` otherwise. */
export function playVsAi(seed: number, settings: MatchSettings, tier: AiTier, human: (m: MatchState) => ArcfireCommand = goldenHuman): LivePlay {
  const m = createMatch(seed, settings);
  const commands: ArcfireCommand[] = [];
  const log: ArcfireCommand[] = [];
  const aiTurns: ArcfireCommand[] = [];
  const record = (): void => {
    for (const a of advanceAi(m, tier)) {
      const c: ArcfireCommand = a.k === "pick" ? { k: "pick", w: a.w } : { k: "turn", ...a.cmd };
      log.push(c);
      if (c.k === "turn") aiTurns.push(c);
    }
  };
  record();
  while (m.phase !== "over") {
    const c = human(m);
    if (!applyCommand(m, c).ok) throw new Error(`the scripted human sent an illegal command: ${JSON.stringify(c)}`);
    commands.push(c);
    log.push(c);
    record();
  }
  return { commands, log, aiTurns, state: m };
}
```

```ts
// src/game/test/arcfire/ai.entry.ts
//
// Bundled by ai.corpus.test.ts and ai.perf.test.ts with esbuild and run as
// ONE module (vitest's module runner slows the sim 4-5x, 2A K3): the AI
// corpus, the vs-AI goldens, verification and the per-turn timings.
export { runAiCorpus, aiDigest, turnStates } from "./aiCorpus";
export { goldenHuman, playVsAi } from "./vsaiGolden";
export { advanceAi, replayVsAi, resumeVsAi } from "@/game/titles/arcfire/vsai";
export { hashMatch } from "@/game/titles/arcfire/hash";
export { scoreVsAi } from "@/game/titles/arcfire/verify";
export { STANDARD_SETTINGS } from "@/game/titles/arcfire/state";
import { cloneMatch } from "@/game/titles/arcfire/state";
import { aiTurn } from "@/game/titles/arcfire/ai/policy";
import { turnStates } from "./aiCorpus";
import type { AiTier } from "@/game/titles/arcfire/ai/tiers";

/** Per-tier decision times (ms) on the corpus's plain states: informational, printed for the hand-off. */
export function turnTimes(tier: AiTier, now: () => number): number[] {
  const out: number[] = [];
  for (const [name, s] of turnStates()) {
    if (!/^s\d+t\d+$/.test(name)) continue; // the 8 plain states
    const m = cloneMatch(s);
    const t0 = now();
    aiTurn(m, tier);
    out.push(now() - t0);
  }
  return out;
}
```

```ts
// src/game/titles/arcfire/ai.corpus.test.ts
//
// The AI's pins (spec §8), run on the bundled sim (ai.entry.ts):
//   the AI corpus (ai.corpus.golden.json): two digests, `turn` (power-
//     independent) and `draft` (reads `power`), plus coverage gates so the
//     case list can never go inert: some case moved, saved a tier-3 weapon,
//     built DIRT by the rule, chose a beam, played sudden death, faced wind;
//   the vs-AI goldens (determinism.vsai.golden.json): a human win and a human
//     loss against Veteran with STANDARD_SETTINGS, played live by the scripted
//     human (vsaiGolden.ts), then replayed from the human's commands alone:
//     the replay must reproduce the live hash (the leaderboard's core
//     guarantee) and the pinned one; scoreVsAi scores the win and rejects the rest.
// Update modes, declared and loud (each writes what moved to stderr):
//   UPDATE_ARCFIRE_AI=add    write new case ids only; refuses if any pinned case moved
//   UPDATE_ARCFIRE_AI=draft  re-pin the draft section only (a `power` write-back)
//   UPDATE_ARCFIRE_AI=1      re-pin both sections; needs ARCFIRE_AI_EXPECT_MOVED=<n>, the moved count
//   UPDATE_ARCFIRE_GOLDEN=vsai re-pins the vs-AI goldens, and only =vsai does: determinism.test.ts's
//     =1 (plan1 + full) never touches them, so one re-pin command moves one cause's pins
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { ROSTER } from "./weapons/roster";
import type { ArcfireCommand } from "./replay";
import type { MatchSettings, MatchState } from "./state";
import type { TurnCommand } from "./match";
import type { Plan } from "./ai/plan";
import type { AiCorpus, AiFingerprint } from "@/game/test/arcfire/aiCorpus";
import type { LivePlay } from "@/game/test/arcfire/vsaiGolden";
import type { VsAiResult, VsAiResume } from "./vsai";
import type { ReplayOutcome, ReplayRejection } from "@/game/sim/title";

interface AiEntry {
  runAiCorpus(onTurn?: (id: string, m: MatchState, cmd: TurnCommand, plan: Plan) => void): AiCorpus;
  aiDigest(cases: Record<string, AiFingerprint>): string;
  playVsAi(seed: number, settings: MatchSettings, tier: "veteran"): LivePlay;
  replayVsAi(r: { seed: number; settings: MatchSettings; tier: "veteran"; commands: unknown }): VsAiResult;
  resumeVsAi(r: { seed: number; settings: MatchSettings; log: unknown }): VsAiResume;
  scoreVsAi(seed: number, commands: unknown): ReplayOutcome | { rejected: ReplayRejection };
  hashMatch(m: MatchState): string;
  STANDARD_SETTINGS: MatchSettings;
}

let ai: AiEntry;
beforeAll(async () => {
  const out = await build({
    entryPoints: [resolve("src/game/test/arcfire/ai.entry.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, tsconfig: "tsconfig.json",
  });
  const mod: { exports: Partial<AiEntry> } = { exports: {} };
  new Function("module", "exports", out.outputFiles[0].text)(mod, mod.exports);
  ai = mod.exports as AiEntry;
}, 60000);

const CORPUS = "src/game/titles/arcfire/ai.corpus.golden.json";
const GOLDEN = "src/game/titles/arcfire/determinism.vsai.golden.json";

interface CorpusFixture { turnDigest: string; draftDigest: string; turn: Record<string, AiFingerprint>; draft: Record<string, AiFingerprint> }

const movedIn = (old: Record<string, AiFingerprint>, cur: Record<string, AiFingerprint>): string[] =>
  [...new Set([...Object.keys(old), ...Object.keys(cur)])].sort()
    .filter((id) => id in old && JSON.stringify(old[id]) !== JSON.stringify(cur[id] ?? null))
    .map((id) => `${id}: ${JSON.stringify(old[id])} -> ${JSON.stringify(cur[id] ?? null)}`);

describe("arcfire AI corpus", () => {
  it("reproduces every pinned AI decision, and exercises every heuristic", () => {
    const seen = new Set<string>();
    const corpus = ai.runAiCorpus((id, m, cmd, plan) => {
      expect(cmd.angle >= 0 && cmd.angle <= 180 && cmd.power >= 0 && cmd.power <= 100, id).toBe(true);
      if (plan.stats.reason === "move" && cmd.move !== 0) seen.add("move");
      if (plan.stats.reason === "saveT3") seen.add("saveT3");
      if (plan.stats.reason === "dirt" && ROSTER[cmd.w].tag === "DIRT") seen.add("dirt");
      if (ROSTER[cmd.w].launch.kind === "beam") seen.add("beam");
      if (m.phase === "suddenDeath") seen.add("sudden");
      if (m.wind !== 0) seen.add("wind");
    });
    expect([...seen].sort(), "coverage gates").toEqual(["beam", "dirt", "move", "saveT3", "sudden", "wind"]);
    const fresh: CorpusFixture = { turnDigest: ai.aiDigest(corpus.turn), draftDigest: ai.aiDigest(corpus.draft), turn: corpus.turn, draft: corpus.draft };
    const mode = process.env.UPDATE_ARCFIRE_AI;
    const old: CorpusFixture | null = existsSync(CORPUS) ? JSON.parse(readFileSync(CORPUS, "utf8")) : null;
    const movedTurn = old ? movedIn(old.turn, corpus.turn) : [];
    const movedDraft = old ? movedIn(old.draft, corpus.draft) : [];
    if (mode === "1" || mode === "draft") {
      const moved = mode === "draft" ? movedDraft : movedTurn.concat(movedDraft);
      process.stderr.write(`AI corpus re-pin (${mode}): ${moved.length} moved cases:\n${moved.join("\n")}\n`);
      if (mode === "draft") expect(movedTurn, "a draft re-pin must not move a turn case").toEqual([]);
      else expect(process.env.ARCFIRE_AI_EXPECT_MOVED, "UPDATE_ARCFIRE_AI=1 needs ARCFIRE_AI_EXPECT_MOVED=<n>; nothing was written").toBe(String(moved.length));
      writeFileSync(CORPUS, JSON.stringify(fresh, null, 1) + "\n");
    } else if (mode === "add" && movedTurn.length === 0 && movedDraft.length === 0) writeFileSync(CORPUS, JSON.stringify(fresh, null, 1) + "\n");
    expect(existsSync(CORPUS), "create it once with UPDATE_ARCFIRE_AI=1 ARCFIRE_AI_EXPECT_MOVED=0").toBe(true);
    if (mode !== "1" && mode !== "draft") {
      expect(movedTurn, "moved turn cases").toEqual([]);
      expect(movedDraft, "moved draft cases (a power write-back: UPDATE_ARCFIRE_AI=draft)").toEqual([]);
    }
    const pinned: CorpusFixture = JSON.parse(readFileSync(CORPUS, "utf8"));
    expect(Object.keys(corpus.turn).sort()).toEqual(Object.keys(pinned.turn).sort());
    expect(Object.keys(corpus.draft).sort()).toEqual(Object.keys(pinned.draft).sort());
    expect(fresh.turnDigest).toBe(pinned.turnDigest);
    expect(fresh.draftDigest).toBe(pinned.draftDigest);
  }, 120000);
});

interface GoldenCase { seed: number; commands: ArcfireCommand[]; hash: string; scores: number[]; winner: number }
interface VsAiGolden { win: GoldenCase; loss: GoldenCase }

describe("arcfire vs-AI goldens", () => {
  it("replays the human's commands alone to the live and the pinned hash", () => {
    const S = ai.STANDARD_SETTINGS;
    const fixture: VsAiGolden | null = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, "utf8")) : null;
    const mode = process.env.UPDATE_ARCFIRE_GOLDEN;
    const repin = mode === "vsai";
    const fresh: Partial<VsAiGolden> = {};
    for (const name of ["win", "loss"] as const) {
      const seed = fixture ? fixture[name].seed : name === "win" ? 20260934 : 20260928;
      const live = ai.playVsAi(seed, S, "veteran");
      const liveHash = ai.hashMatch(live.state);
      const r = ai.replayVsAi({ seed, settings: S, tier: "veteran", commands: live.commands });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.hash, `${name}: the human-only replay regenerates the live match`).toBe(liveHash);
      // not inert: finished, both sides scored, the human moved, the AI fired >= 6 tags
      expect(r.finished).toBe(true);
      expect(r.state.winner).toBe(name === "win" ? 0 : 1);
      expect(r.humanPoints).toBeGreaterThan(0);
      expect(r.aiPoints).toBeGreaterThan(0);
      expect(live.commands.some((c) => c.k === "turn" && c.move !== 0)).toBe(true);
      expect(new Set(live.aiTurns.map((c) => (c.k === "turn" ? ROSTER[c.w].tag : ""))).size).toBeGreaterThanOrEqual(6);
      // search-free resume of the full log lands on the same state
      const res = ai.resumeVsAi({ seed, settings: S, log: live.log });
      expect(res.ok && res.droppedFrom === -1 && ai.hashMatch(res.state) === liveHash).toBe(true);
      fresh[name] = { seed, commands: live.commands, hash: r.hash, scores: [r.humanPoints, r.aiPoints], winner: r.state.winner };
    }
    if (repin) {
      writeFileSync(GOLDEN, JSON.stringify(fresh, null, 1) + "\n");
      for (const name of ["win", "loss"] as const) {
        process.stderr.write(`golden vsai-${name}: ${fixture ? fixture[name].hash : "none"} -> ${fresh[name]!.hash} (scores ${fixture ? JSON.stringify(fixture[name].scores) : "none"} -> ${JSON.stringify(fresh[name]!.scores)})\n`);
      }
    }
    expect(existsSync(GOLDEN), "create it once with UPDATE_ARCFIRE_GOLDEN=vsai").toBe(true);
    const pinned: VsAiGolden = JSON.parse(readFileSync(GOLDEN, "utf8"));
    for (const name of ["win", "loss"] as const) {
      expect(fresh[name]!.commands, `${name}: the scripted human's log`).toEqual(pinned[name].commands);
      expect(fresh[name]!.hash, `${name} hash`).toBe(pinned[name].hash);
      expect(fresh[name]!.scores).toEqual(pinned[name].scores);
    }
  }, 120000);

  it("scores the win and rejects everything else (scoreVsAi)", () => {
    const g: VsAiGolden = JSON.parse(readFileSync(GOLDEN, "utf8"));
    const win = g.win.commands;
    expect(ai.scoreVsAi(g.win.seed, win)).toEqual({ score: g.win.scores[0] - g.win.scores[1], stat: g.win.scores[0], hash: g.win.hash });
    expect(ai.scoreVsAi(g.loss.seed, g.loss.commands)).toEqual({ rejected: "not_a_win" });
    expect(ai.scoreVsAi(g.win.seed, win.slice(0, 15))).toEqual({ rejected: "not_a_win" }); // unfinished
    expect(ai.scoreVsAi(g.win.seed + 1, win)).toEqual({ rejected: "invalid_command" }); // another pool
    const bent = win.map((c, i) => (i === win.length - 1 && c.k === "turn" ? { ...c, angle: 181 } : c));
    expect(ai.scoreVsAi(g.win.seed, bent)).toEqual({ rejected: "invalid_command" });
    expect(ai.scoreVsAi(g.win.seed, [...win.slice(0, 3), null])).toEqual({ rejected: "invalid_command_shape" });
    expect(ai.scoreVsAi(g.win.seed, [{ k: "turn", move: 2, w: 0, angle: 45, power: 50 }])).toEqual({ rejected: "invalid_command_shape" });
    expect(ai.scoreVsAi(g.win.seed, new Array(22).fill({ k: "pick", w: 0 }))).toEqual({ rejected: "too_long" });
    expect(ai.scoreVsAi(g.win.seed, "commands")).toEqual({ rejected: "invalid_command_shape" });
  }, 120000);
});
```

The fixtures are created once, in the pins task, with the update modes (`UPDATE_ARCFIRE_AI=1 ARCFIRE_AI_EXPECT_MOVED=0 UPDATE_ARCFIRE_GOLDEN=vsai`), and must come out as **turn `55df93ca`, draft `c0d402d4`, win `be9db94d` [254, 169], loss `2097c8fc` [234, 329]**; a different value means the code differs from this document: stop and diff against the case list in Appendix B. The update modes follow the 2A pattern: declared, counted, and written to stderr.

### 10.6 The verification budget: `ai.perf.test.ts`

```ts
// src/game/titles/arcfire/ai.perf.test.ts
//
// Spec §5/§8: verifying a full daily-challenge match (10 Veteran turns, 10 AI
// picks, 20 human commands) takes < 5 s on CI hardware. Timed on the bundled
// sim (ai.entry.ts), like perf.test.ts: the FIRST replay after the bundle is
// evaluated is the verifier's real, cold case, and it is the one asserted.
// Informational: the best of three warm replays and each tier's decision
// times on the AI corpus's plain states, with a loose Ace tripwire (mean
// <= 1,500 ms) that only catches pathological regressions. If CI ever
// flakes, raise ARCFIRE_PERF_MARGIN (a multiplier), never the literals.
import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import type { MatchSettings } from "./state";
import type { VsAiResult } from "./vsai";

interface PerfEntry {
  replayVsAi(r: { seed: number; settings: MatchSettings; tier: "veteran"; commands: unknown }): VsAiResult;
  turnTimes(tier: "rookie" | "veteran" | "ace", now: () => number): number[];
  STANDARD_SETTINGS: MatchSettings;
}

it("verifies a daily-challenge match in < 5 s, cold", async () => {
  const out = await build({
    entryPoints: [resolve("src/game/test/arcfire/ai.entry.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, tsconfig: "tsconfig.json",
  });
  const mod: { exports: Partial<PerfEntry> } = { exports: {} };
  new Function("module", "exports", out.outputFiles[0].text)(mod, mod.exports);
  const ai = mod.exports as PerfEntry;
  const now = (): number => Number(process.hrtime.bigint()) / 1e6;
  const margin = Number(process.env.ARCFIRE_PERF_MARGIN ?? "1");
  const g = JSON.parse(readFileSync("src/game/titles/arcfire/determinism.vsai.golden.json", "utf8")).win;
  const verify = (): { ms: number; r: VsAiResult } => {
    const t0 = now();
    const r = ai.replayVsAi({ seed: g.seed, settings: ai.STANDARD_SETTINGS, tier: "veteran", commands: g.commands });
    return { ms: now() - t0, r };
  };
  const cold = verify();
  expect(cold.r.ok && cold.r.hash).toBe(g.hash);
  let warm = Infinity;
  for (let i = 0; i < 3; i++) warm = Math.min(warm, verify().ms);
  const lines = [`daily verification: cold ${cold.ms.toFixed(0)} ms, warm best of 3 ${warm.toFixed(0)} ms`];
  let aceMean = 0;
  for (const tier of ["rookie", "veteran", "ace"] as const) {
    ai.turnTimes(tier, now); // warm-up pass
    const t = ai.turnTimes(tier, now);
    const mean = t.reduce((a, b) => a + b, 0) / t.length;
    if (tier === "ace") aceMean = mean;
    lines.push(`${tier.padEnd(7)} decision: mean ${mean.toFixed(1)} ms, max ${Math.max(...t).toFixed(1)} ms (${t.length} full-hand states)`);
  }
  console.log(lines.join("\n"));
  expect(cold.ms).toBeLessThan(5000 * margin);
  expect(aceMean).toBeLessThanOrEqual(1500 * margin);
}, 120000);
```

Measured (Revision 1, three runs, the file alone): cold 507–526 ms, warm 408–417 ms; on the 8 full-hand corpus states, Rookie 8.3–8.5 ms mean (max 11.8), Veteran 36.4–37.1 (max 49.6), Ace 273–317 (max 392). In a parallel run of the whole repository suite: cold 644 ms, Veteran 55.5, Ace 320. The first CI run's printed lines are the Node 22 baseline (§7.5, T16).

### 10.7 The host, the client and the bundle: `host.test.ts`, `worker.bundle.test.ts`

```ts
// src/game/runtime/arcfire/host.test.ts — the worker's host and client, driven in Node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SHORT_SETTINGS, STANDARD_SETTINGS } from "@/game/titles/arcfire/state";
import { replayVsAi } from "@/game/titles/arcfire/vsai";
import type { ArcfireCommand } from "@/game/titles/arcfire/replay";
import { createArcfireHost } from "./host";
import { ArcfireWorkerClient, type WorkerLike } from "./client";
import type { HostEvent, HostRequest } from "./protocol";

function harness(): { events: HostEvent[]; send: (req: HostRequest) => HostEvent[] } {
  const events: HostEvent[] = [];
  const host = createArcfireHost((ev) => events.push(ev));
  return {
    events,
    send(req) {
      const from = events.length;
      host.receive(req);
      return events.slice(from);
    },
  };
}

/** Send the human's commands; returns every event. */
function drive(h: ReturnType<typeof harness>, commands: ArcfireCommand[]): void {
  let id = 10;
  for (const c of commands) {
    const out = c.k === "pick" ? h.send({ t: "pick", id: id++, poolIndex: c.w }) : h.send({ t: "turn", id: id++, cmd: { move: c.move, w: c.w, angle: c.angle, power: c.power } });
    expect(out[0].t === "picked" || out[0].t === "shot", JSON.stringify(out[0])).toBe(true);
    expect((out[0] as { by: number }).by).toBe(0); // the human's own event first, before the AI thinks
    for (let i = 1; i < out.length; i++) {
      const e = out[i];
      if (e.t === "thinking") expect(out[i + 1]).toMatchObject({ t: "shot", by: 1 });
      else expect(e).toMatchObject({ by: 1 });
    }
  }
}

describe("the Arcfire host", () => {
  it("plays the vs-AI win golden to its hash, and resumes it mid-draft, mid-battle and finished", () => {
    const g = JSON.parse(readFileSync("src/game/titles/arcfire/determinism.vsai.golden.json", "utf8")).win;
    const h = harness();
    h.send({ t: "start", id: 1, seed: g.seed, settings: STANDARD_SETTINGS, opponent: "veteran" });
    drive(h, g.commands);
    const last = [...h.events].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
    expect(last.snap.hash).toBe(g.hash);
    expect(last.snap.phase).toBe("over");
    const log = h.events.flatMap((e): ArcfireCommand[] => (e.t === "picked" ? [{ k: "pick", w: e.poolIndex }] : e.t === "shot" ? [{ k: "turn", ...e.cmd }] : []));
    expect(log.map((_, i) => i)).toEqual(h.events.flatMap((e) => (e.t === "picked" || e.t === "shot" ? [e.seq] : []))); // seq = the log index
    for (const k of [13, 30, log.length]) { // mid-draft, mid-battle, finished
      const r = harness();
      const out = r.send({ t: "start", id: 1, seed: g.seed, settings: STANDARD_SETTINGS, opponent: "veteran", log: log.slice(0, k) });
      expect(out[0]).toMatchObject({ t: "state", droppedFrom: -1, seq: k });
      const human = (out[0] as Extract<HostEvent, { t: "state" }>).humanLog;
      drive(r, g.commands.slice(human.length));
      const end = [...r.events].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
      expect(end.snap.hash, `resumed after ${k}`).toBe(g.hash);
    }
  }, 120000);

  it("rejects what it must, and never lets a request change a match it refuses", () => {
    const h = harness();
    expect(h.send({ t: "pick", id: 1, poolIndex: 0 })).toEqual([{ t: "rejected", id: 1, reason: "no_match" }]);
    expect(h.send({ t: "start", id: 2, seed: 7, settings: SHORT_SETTINGS, opponent: "rookie", log: "x" as never })).toEqual([{ t: "rejected", id: 2, reason: "bad_log" }]);
    const started = h.send({ t: "start", id: 3, seed: 7, settings: SHORT_SETTINGS, opponent: "rookie" });
    const snap = (started[0] as Extract<HostEvent, { t: "state" }>).snap;
    const hash = [...h.events].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
    expect(h.send({ t: "turn", id: 4, cmd: { move: 0, w: 0, angle: 45, power: 50 } })).toEqual([{ t: "rejected", id: 4, reason: "invalid_command" }]); // a turn in the draft
    expect(h.send({ t: "pick", id: 5, poolIndex: 99 })).toEqual([{ t: "rejected", id: 5, reason: "invalid_command" }]);
    expect(h.send({ t: "preview", id: 6, weapon: 99, angle: 45, power: 50 })).toEqual([{ t: "rejected", id: 6, reason: "invalid_command" }]);
    const pv = h.send({ t: "preview", id: 7, weapon: 1, angle: 45, power: 60 });
    expect(pv[0].t === "preview" && pv[0].timeline.events.some((e) => e.kind === "blast")).toBe(true);
    expect(([...h.events].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>).snap.hash).toBe(hash.snap.hash); // untouched
    expect(snap.phase).toBe("draft");
  }, 60_000);

  it("plays pass-and-play without the AI, and resumes it as a plain 2-player log", () => {
    const h = harness();
    h.send({ t: "start", id: 1, seed: 9, settings: SHORT_SETTINGS, opponent: "local" });
    const cmds: ArcfireCommand[] = [];
    for (let i = 0; i < 2 * SHORT_SETTINGS.weaponsEach; i++) {
      const last = [...h.events].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
      const w = last.snap.poolOwner.findIndex((o) => o === -1);
      expect(h.send({ t: "pick", id: 2 + i, poolIndex: w })[0]).toMatchObject({ t: "picked", by: last.snap.toAct });
      cmds.push({ k: "pick", w });
    }
    expect(h.events.some((e) => e.t === "thinking" || ("by" in e && e.t !== "picked"))).toBe(false);
    for (const cmd of [null, undefined, "x", { move: 0, w: 0, angle: "45", power: 50 }]) { // malformed in battle: rejected, never an error
      expect(h.send({ t: "turn", id: 90, cmd: cmd as never })).toEqual([{ t: "rejected", id: 90, reason: "invalid_command" }]);
    }
    expect(h.send({ t: "pick", id: 91, poolIndex: "3" as never })).toEqual([{ t: "rejected", id: 91, reason: "invalid_command" }]);
    const r = harness();
    const out = r.send({ t: "start", id: 1, seed: 9, settings: SHORT_SETTINGS, opponent: "local", log: cmds });
    expect(out.length).toBe(1);
    expect((out[0] as Extract<HostEvent, { t: "state" }>).snap.phase).toBe("battle");
  }, 60_000);
});

describe("ArcfireWorkerClient", () => {
  it("round-trips a short match against Rookie through a fake worker, with increasing ids", () => {
    let terminated = false;
    const fake: WorkerLike = { onmessage: null, onerror: null, terminate: () => { terminated = true; }, postMessage: () => undefined };
    const host = createArcfireHost((ev) => fake.onmessage!({ data: ev }));
    fake.postMessage = (req) => host.receive(req);
    const client = new ArcfireWorkerClient(() => fake);
    const seen: HostEvent[] = [];
    client.on((ev) => seen.push(ev));
    const ids = [client.start(21, SHORT_SETTINGS, "rookie")];
    const commands: ArcfireCommand[] = [];
    for (let guard = 0; guard < 40; guard++) {
      const last = [...seen].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
      if (last.snap.phase === "over") break;
      if (last.snap.phase === "draft") {
        const w = last.snap.poolOwner.findIndex((o) => o === -1);
        ids.push(client.pick(w));
        commands.push({ k: "pick", w });
      } else {
        const w = last.snap.phase === "suddenDeath" ? 0 : last.snap.hands[0][0];
        ids.push(client.turn({ move: 0, w, angle: 45, power: 70 }));
        commands.push({ k: "turn", move: 0, w, angle: 45, power: 70 });
      }
    }
    expect(ids).toEqual(ids.map((_, i) => i + 1));
    const end = [...seen].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
    expect(end.snap.phase).toBe("over");
    const r = replayVsAi({ seed: 21, settings: SHORT_SETTINGS, tier: "rookie", commands });
    expect(r.ok && r.hash).toBe(end.snap.hash);
    client.dispose();
    expect(terminated).toBe(true);
  }, 60_000);
});
```

```ts
// src/game/runtime/arcfire/worker.bundle.test.ts — the worker bundles alone: sim + AI + host, nothing else
import { it, expect } from "vitest";
import { resolve } from "node:path";
import { build } from "esbuild";

it("bundles the worker for the browser: no Node, no React or Next, under 64 KiB", async () => {
  const out = await build({
    entryPoints: [resolve("src/game/runtime/arcfire/worker.ts")],
    bundle: true, format: "esm", platform: "browser", minify: true, write: false, metafile: true, tsconfig: "tsconfig.json",
  });
  const js = out.outputFiles[0].text;
  const inputs = Object.keys(out.metafile.inputs);
  expect(inputs.filter((p) => /src[\\/](app|components)[\\/]|node_modules/.test(p))).toEqual([]);
  expect(js).not.toMatch(/\brequire\(|node:/);
  console.log(`worker bundle: ${(js.length / 1024).toFixed(1)} KiB minified, ${inputs.length} inputs`);
  expect(js.length).toBeLessThan(64 * 1024);
});
```

### 10.8 Cross-engine (`harness.entry.ts`, `e2e/cross-engine-determinism.spec.ts`)

These two additions are written for the plan (the files depend on Circle TD, which the prototype didn't copy); the harness functions below ran **verbatim** in the prototype's browser bench, and the Worker smoke's steps are the ones that bench ran in Chromium and WebKit.

`src/game/test/cross-engine/harness.entry.ts` gains:

```ts
import { runAiCorpus, aiDigest, type AiFingerprint } from "@/game/test/arcfire/aiCorpus";
import { replayVsAi } from "@/game/titles/arcfire/vsai";
import { STANDARD_SETTINGS } from "@/game/titles/arcfire/state";
import type { ArcfireCommand } from "@/game/titles/arcfire/replay";

// inside `declare global { interface Window { ... } }`:
//   runArcfireAiCorpus: () => { turn: string; draft: string };
//   runArcfireAiCorpusCases: () => Record<string, AiFingerprint>;
//   runArcfireVsAi: (seed: number, commands: ArcfireCommand[]) => string;

window.runArcfireAiCorpus = () => {
  const c = runAiCorpus();
  return { turn: aiDigest(c.turn), draft: aiDigest(c.draft) };
};
window.runArcfireAiCorpusCases = () => {
  const c = runAiCorpus();
  return { ...c.turn, ...c.draft };
};
window.runArcfireVsAi = (seed, commands) => {
  const r = replayVsAi({ seed, settings: STANDARD_SETTINGS, tier: "veteran", commands });
  return r.ok ? r.hash : `${r.reason}@${r.atIndex}`;
};
```

`e2e/cross-engine-determinism.spec.ts` gains two `PINS` rows and a Worker smoke per engine:

```ts
const aiCorpus = readJson<{ turnDigest: string; draftDigest: string; turn: Record<string, number[]>; draft: Record<string, number[]> }>(
  "src/game/titles/arcfire/ai.corpus.golden.json");
type VsAiCase = { seed: number; commands: unknown[]; hash: string };
const vsai = readJson<{ win: VsAiCase; loss: VsAiCase }>("src/game/titles/arcfire/determinism.vsai.golden.json");

/** The AI corpus case ids whose browser fingerprint differs from ai.corpus.golden.json. */
async function movedAiCases(page: Page): Promise<string> {
  const got = await page.evaluate(() => window.runArcfireAiCorpusCases());
  const pinned: Record<string, number[]> = { ...aiCorpus.turn, ...aiCorpus.draft };
  const ids = [...new Set([...Object.keys(pinned), ...Object.keys(got)])].sort()
    .filter((id) => JSON.stringify(got[id] ?? null) !== JSON.stringify(pinned[id] ?? null));
  return `AI cases that differ from ai.corpus.golden.json: ${ids.length > 0 ? ids.join(", ") : "none (only a digest differs)"}`;
}

// PINS gains:
  {
    label: "Arcfire AI corpus digests (turn/draft)",
    expected: `${aiCorpus.turnDigest}/${aiCorpus.draftDigest}`,
    run: (page) => page.evaluate(() => { const d = window.runArcfireAiCorpus(); return `${d.turn}/${d.draft}`; }),
    explain: movedAiCases,
  },
  {
    label: "Arcfire vs-AI goldens (win/loss)",
    expected: `${vsai.win.hash}/${vsai.loss.hash}`,
    run: (page) => page.evaluate(([w, l]) =>
      `${window.runArcfireVsAi(w.seed, w.commands as never)}/${window.runArcfireVsAi(l.seed, l.commands as never)}`, [vsai.win, vsai.loss] as const),
  },

// after the PINS loop: the vs-AI golden through the host in a real Worker, then resumed in a FRESH Worker
for (const [name, engine] of engines) {
  test(`${name} plays the vs-AI golden in a Worker and resumes it in a fresh one`, async () => {
    const out = await build({
      entryPoints: [resolve("src/game/runtime/arcfire/worker.ts")],
      bundle: true, format: "iife", write: false, platform: "browser", tsconfig: "tsconfig.json",
    });
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      const hashes = await page.evaluate(async ([code, g]) => {
        const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
        const settings = { weaponsEach: 10, poolSize: 24, wind: false, guaranteeTags: ["BLAST", "SPLIT", "DIRT"], rosterSize: 32 };
        type Ev = { t: string; snap?: { toAct: number; phase: string; hash: string }; humanLog?: unknown[]; poolIndex?: number; cmd?: object };
        /** Start with `log`, send the golden's remaining human commands whenever the human is to act; resolve at the end. */
        const run = (log: unknown[]): Promise<{ hash: string; log: unknown[] }> => new Promise((done) => {
          const w = new Worker(url);
          const full: unknown[] = log.slice();
          let next = -1;
          let id = 2;
          w.onmessage = (e: MessageEvent<Ev>) => {
            const ev = e.data;
            if (ev.t === "state") next = ev.humanLog!.length;
            if (ev.t === "picked") full.push({ k: "pick", w: ev.poolIndex });
            if (ev.t === "shot") full.push({ k: "turn", ...ev.cmd });
            if (!ev.snap) return;
            if (ev.snap.phase === "over") { w.terminate(); done({ hash: ev.snap.hash, log: full }); return; }
            if (ev.snap.toAct === 0 && ev.t !== "thinking") {
              const c = g.commands[next++] as { k: string; w: number; move?: number; angle?: number; power?: number };
              w.postMessage(c.k === "pick" ? { t: "pick", id: id++, poolIndex: c.w }
                : { t: "turn", id: id++, cmd: { move: c.move, w: c.w, angle: c.angle, power: c.power } });
            }
          };
          w.postMessage({ t: "start", id: 1, seed: g.seed, settings, opponent: "veteran", log });
        });
        const live = await run([]);
        const resumed = await run(live.log.slice(0, 25));
        return [live.hash, resumed.hash];
      }, [out.outputFiles[0].text, vsai.win] as const);
      expect(hashes).toEqual([vsai.win.hash, vsai.win.hash]);
    } finally {
      await browser.close();
    }
  });
}
```

Measured on the prototype: Chromium and WebKit reproduce both digests and both goldens (the corpus in 2.8 s and 3.0 s); the Worker run takes 0.58 s (Chromium) and 0.85 s (WebKit), and the fresh-worker resume answers `state` in 11–22 ms. Firefox runs in CI only (2A ruling R10).

### 10.9 The harness's pure half: `balance.test.ts`

Always on and instant: no match is played. Hand-built records (out of seed order on purpose) pin the aggregation, the verdicts, the suggestions, the proposed powers (DIRT on the least-squares line), the pick rate, the allow-list states, a report row and summary, the cost table, and the `power` write-back on the real `roster.ts` text. The write-back tests cover one changed line per changed id, idempotence, and the refusals (a power outside 1..100, a non-integer power, an unknown id, a duplicated line).

```ts
// src/game/test/arcfire/balance.test.ts — the balance harness's pure half, on hand-built records (always on; no match is played)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ROSTER } from "@/game/titles/arcfire/weapons/roster";
import { aggregate, costs, costTable, judge, report, writePowers, type WeaponDefLite } from "./balance";
import type { MatchRecord, ShotRecord } from "./aiMatch";

const LITE: WeaponDefLite[] = [
  { id: "a", tag: "BLAST", tier: 1 }, // band 15-40
  { id: "b", tag: "BLAST", tier: 3 }, // band 50-90
  { id: "c", tag: "BLAST", tier: 2 }, // never held, never fired
  { id: "d", tag: "DIRT", tier: 1 }, // judged by win-rate contribution only
];

const shot = (p: number, w: number, pts: number, more: Partial<ShotRecord> = {}): ShotRecord => ({
  p, w, sd: false, pts, gift: 0, move: 0, reason: "best", reply: -1, replyDirt: -1, sims: 10, probes: 100, ms: 1, ...more,
});

const rec = (seed: number, hands: [number[], number[]], scores: [number, number], winner: number, shots: ShotRecord[]): MatchRecord => ({
  seed, tiers: ["ace", "ace"], firstPicker: 1, pool: [0, 1, 2, 3], hands, scores, winner, shots,
});

/** Out of seed order on purpose: aggregate sorts by seed. */
const RECORDS: MatchRecord[] = [
  rec(4, [[1], [0]], [0, 50], 1, [shot(0, 1, 0), shot(1, 0, 50)]),
  rec(2, [[0], [1, 3]], [50, 0], 0, [shot(0, 0, 50), shot(1, 1, 0), shot(1, 3, 0, { reason: "forcedDirt" })]),
  rec(1, [[0], [1, 3]], [50, 40], 0, [
    shot(0, 0, 50), shot(1, 3, 0, { reason: "dirt", reply: 70, replyDirt: 30 }), shot(1, 1, 40),
    shot(0, 0, 99, { sd: true }), // sudden death: excluded from every per-weapon figure
  ]),
  rec(3, [[0], [1]], [50, 50], 2, [shot(0, 0, 50), shot(1, 1, 40)]),
];

describe("the balance harness", () => {
  it("aggregates per weapon: net points, hits, turns, holdings and win-rate contribution", () => {
    const [a, b, c, d] = aggregate(RECORDS, LITE, 2);
    expect([a.shots, a.mean, a.sd, a.hit, a.held, a.contrib, a.meanTurn]).toEqual([4, 50, 0, 1, 4, 0.375, 1.25]); // 3 wins + a draw in 4 holdings
    expect(a.ci).toBeCloseTo(0.49, 10); // 1.96 x sqrt(0.25 / 4)
    expect([b.shots, b.mean, b.hit, b.held, b.contrib, b.meanTurn]).toEqual([4, 20, 0.5, 4, -0.375, 2]);
    expect([c.shots, c.held, c.contrib, c.verdict]).toEqual([0, 0, 0, "ok"]); // no data: no band verdict
    expect([d.dirt, d.shots, d.held, d.contrib, d.defensive, d.replyCut]).toEqual([true, 2, 2, -0.5, 1, 40]);
  });

  it("judges the tier bands and the +12% rule, and suggests a fix", () => {
    const [a, b, c, d] = aggregate(RECORDS, LITE, 2);
    expect([a.verdict, b.verdict, c.verdict, d.verdict]).toEqual(["HIGH+WR", "LOW", "ok", "ok"]);
    expect(a.suggestion).toBe("damage x 0.55 (to the band's middle, 27.5); reduce damage or spread: win-rate contribution +37.5% +- 49.0");
    expect(b.suggestion).toBe("structural: hit 50%, 40.0 points on a hit"); // a hit rate under 80%: the geometry, not the numbers
    expect(d.suggestion).toBe("1 defensive uses, estimated reply cut 40.0");
  });

  it("proposes powers (DIRT on the damaging weapons' least-squares line) and the pick rate they would give", () => {
    const rows = aggregate(RECORDS, LITE, 2);
    // the line through (0.375, 50), (-0.375, 20), (0, 0): slope 40, so d = 70/3 + 40 x (-0.5 - 0) = 3.33
    expect(rows.map((r) => r.power)).toEqual([50, 20, 1, 3]); // c: round(0) clamped to 1
    expect(rows.map((r) => r.pickRate)).toEqual([1, 1, 0, 0]); // the power draft takes a and b, the top 2 of every pool
    const shuffled = aggregate(RECORDS.slice().reverse(), LITE, 2);
    expect(shuffled).toEqual(rows); // the record order never matters
  });

  it("gates through the allow-list: FAIL, ACK and STALE ACK", () => {
    const j = judge(aggregate(RECORDS, LITE, 2), { b: "structural, owner tuning", c: "was failing" });
    expect([j.failing, j.acked, j.stale]).toEqual([["a"], ["b"], ["c"]]);
    const text = report(j, RECORDS, "T");
    expect(text).toContain("4 matches; player 0 won 2, the first shooter 2, draws 1; mean |margin| 27.5");
    expect(text).toContain("| a | 1 | 50.0 | 15-40 | 0.0 | 100 | 0.0 | +37.5 +- 49.0 | 1.3 | HIGH+WR | FAIL | 50 | 100 | damage x 0.55");
    expect(text).toContain("| b | 3 | 20.0 | 50-90 |");
    expect(text).toContain("| LOW | ACK | 20 | 100 | structural");
    expect(text).toContain("| d | 1 | - | WR only | - | - | 0.0 | -50.0 +- 69.3 | 2.5 | ok |  | 3 | 0 |");
    expect(text.endsWith("FAIL (1): a; ACK (1): b; STALE ACK: c")).toBe(true);
  });

  it("reports each tier's decision costs", () => {
    const mixed = RECORDS.map((r) => ({ ...r, tiers: ["rookie", "ace"] as MatchRecord["tiers"] }));
    mixed[0].shots[1] = { ...mixed[0].shots[1], sims: 3700, probes: 49900, ms: 9 };
    const c = costs(mixed);
    expect(c.map((t) => [t.tier, t.decisions, t.simsMax, t.probesMax, t.msMax])).toEqual([["rookie", 5, 10, 100, 1], ["ace", 6, 3700, 49900, 9]]);
    expect(costTable(c).split("\n")[3]).toBe("| ace | 6 | 625 / 3700 | 8400 / 49900 | 2.3 / 9.0 / 9.0 |");
  });
});

describe("the power write-back", () => {
  const src = readFileSync("src/game/titles/arcfire/weapons/roster.ts", "utf8");

  it("rewrites exactly one line per changed power, and is idempotent", () => {
    const w = writePowers(src, { pulse: 28, nova: 90 });
    expect(w.changed).toEqual(["pulse: 30 -> 28", "nova: 80 -> 90"]);
    const before = src.split("\n");
    const after = w.src.split("\n");
    expect(after.length).toBe(before.length);
    const diff = after.flatMap((l, i) => (l === before[i] ? [] : [l.trim()]));
    expect(diff).toEqual([
      'id: "pulse", name: "Pulse", tag: "BLAST", tier: 1, power: 28,',
      'id: "nova", name: "Nova", tag: "BLAST", tier: 3, power: 90,',
    ]);
    expect(writePowers(w.src, { pulse: 28, nova: 90 })).toEqual({ src: w.src, changed: [] });
    const same = writePowers(src, Object.fromEntries(ROSTER.map((d) => [d.id, d.power]))); // every id matches exactly once
    expect(same).toEqual({ src, changed: [] });
  });

  it("refuses a power outside 1..100, an unknown id and an ambiguous line, writing nothing", () => {
    for (const p of [0, 101, 2.5, Number.NaN]) expect(() => writePowers(src, { pulse: p })).toThrow(RangeError);
    expect(() => writePowers(src, { nosuch: 5 })).toThrow("power nosuch: 0 roster lines match, need exactly 1");
    const line = src.split("\n").find((l) => l.includes('id: "pulse"'))!;
    expect(() => writePowers(`${src}\n${line}`, { pulse: 28 })).toThrow("power pulse: 2 roster lines match, need exactly 1");
  });
});
```

### 10.10 Guards

- The purity guard walks `src/game/titles/arcfire`, so it covers `ai/**` automatically, comments included (K1).
- `src/game/runtime/arcfire/**` and `src/game/test/**` are outside the purity roots; the runtime still decides nothing.
- Lazy-boundary and the bundle budget stay green because nothing outside `src/game/**` imports the worker, and nothing in 2B imports `client.ts`.
- No file under `src/game/sim` or `src/game/titles/circle-td` changes: Circle TD's `5167b43d` is untouched.

---

## 11 · The Plan 2A carry-overs (deliverable j)

Every fix is pin-neutral, and every new test was red on the 2A code where it guards a change.

1. **`weaponErrors` can throw.** Today a self-containing `delay.then` throws `RangeError: Maximum call stack size exceeded` (`validate.ts:52`, reproduced). **Fix:** a `split` or `delay` inside a delay list is reported and **not descended into**, since a delay list nests nothing. **Test** (`carryovers.test.ts`): the self-containing list and a 10,000-deep delay chain each give exactly one report and never throw.
2. **Multi-stage cycles cost k^L.** A 4-stage ring with 40 back-references per stage takes 1,006–1,168 ms today and reports 40^4 = 2,560,000 errors. **Fix:** `checkStage` keeps a per-call `seen` map from each stage to a bitmask of the depths it was checked at. A stage already checked **at exactly this depth** is skipped, because a second check at the same depth walks the same stages to the same depth limit. The skip comes **after** the cycle and depth checks, so every back-reference on the current path and every over-deep reference is still reported. The walk is bounded by stages × `MAX_STAGE_DEPTH`.
   - **Not "this depth or a shallower one".** A shallower check hits the depth limit later. With that memo, a stage first checked at depth 2 and reached again at depth 4 through a longer chain would never report its depth-5 child. The over-deep test pins that case, and the variant fails it (measured).
   - **Tests** (`carryovers.test.ts`): the ring walks each stage's effect list exactly once (4 walks; 65,641 on the 2A code) and gives exactly 40 `cyclic stage` reports. The over-deep path is reported. The limits are counts, not wall-clock times.
   - **Existing tests:** `validate.test.ts`'s cycle, shared-child and malformed-input tests stay green unchanged (13 of 13, run against this diff).
   - **Fuzz check** (in the prototype, not a committed test): on 30,000 random stage graphs (1–6 stages; splits to any stage, so cycles and shared children; delays nesting splits and delays; self-containing delay lists), the fixed validator agreed with the 2A validator on validity every time 2A didn't throw (27,189 graphs). Its reports were always a subset of 2A's. On the 2,811 graphs where 2A threw, it reported at least one error.

   The diff (T3), `diff -u` against `e77161d`:

```diff
--- a/src/game/titles/arcfire/weapons/validate.ts
+++ b/src/game/titles/arcfire/weapons/validate.ts
@@ -8,8 +8,10 @@
 // (zeros, count 0, a cyclic stage, the launch maxima) resolve without throwing;
 // data far outside these ranges (a huge carve radius, NaN) is not covered.
 // weaponErrors itself never throws: a missing or null nested object is reported
-// as `<path>: missing`, and a cyclic stage is reported once per back-reference
-// and not descended into, so a small cyclic def validates in linear time.
+// as `<path>: missing`; a cyclic stage is reported at each back-reference and
+// not descended into; a split or delay inside a delay list is reported and not
+// descended into (a delay list nests nothing); and a stage is checked at most
+// once per depth. So any def, cyclic or shared, validates in linear time.
 import type { Blast, Effect, Stage, WeaponDef } from "./types";
 import { MAX_FLIGHT_STEPS, MAX_SHELLS, MAX_STAGE_DEPTH, MAX_TURN_STEPS } from "../constants";
 
@@ -41,6 +43,7 @@
 
 function checkEffects(
   errs: string[], path: string, effects: readonly Effect[], apexList: boolean, depth: number, inDelay: boolean, onPath: Set<Stage>,
+  seen: Map<Stage, number>,
 ): void {
   if (!Array.isArray(effects) || effects.length === 0) {
     errs.push(`${path}: must be a non-empty effect list`);
@@ -55,7 +58,10 @@
       return;
     }
     if (!present(errs, `${p}.${keys[0]}`, (e as unknown as Record<string, unknown>)[keys[0]])) return;
-    if (inDelay && (keys[0] === "split" || keys[0] === "delay")) errs.push(`${p}: a delay cannot schedule a ${keys[0]}`);
+    if (inDelay && (keys[0] === "split" || keys[0] === "delay")) {
+      errs.push(`${p}: a delay cannot schedule a ${keys[0]}`);
+      return; // not descended into: a self-containing or deep delay chain is this one report
+    }
     if ("blast" in e) checkBlast(errs, `${p}.blast`, e.blast);
     else if ("split" in e) {
       const s = e.split;
@@ -65,7 +71,7 @@
       if (s.gapPx !== undefined) check(errs, `${p}.split.gapPx`, s.gapPx, 0, 200);
       if (s.from !== "up" && s.from !== "ahead" && s.from !== "cone") errs.push(`${p}.split.from: unknown`);
       else if (s.from !== "up" && !apexList) errs.push(`${p}.split.from: "${s.from}" only in an apex stage's effects (at an impact the heading points into the ground)`);
-      checkStage(errs, `${p}.split.child`, s.child, depth + 1, onPath);
+      checkStage(errs, `${p}.split.child`, s.child, depth + 1, onPath, seen);
     } else if ("roll" in e) {
       check(errs, `${p}.roll.maxDistance`, e.roll.maxDistance, 1, 1200);
       checkBlast(errs, `${p}.roll.then`, e.roll.then);
@@ -98,7 +104,7 @@
       check(errs, `${p}.quake.furrow`, e.quake.furrow, 0, 50);
     } else {
       check(errs, `${p}.delay.steps`, e.delay.steps, 1, 600);
-      checkEffects(errs, `${p}.delay.then`, e.delay.then as Effect[], false, depth, true, onPath);
+      checkEffects(errs, `${p}.delay.then`, e.delay.then as Effect[], false, depth, true, onPath, seen);
     }
   });
 }
@@ -107,9 +113,16 @@
  * Check one stage. `onPath` holds the stages from the root down to this one:
  * meeting one of them again is a cycle, reported once at that back-reference
  * and not descended into (a stage that refers to itself k times costs k
- * checks, not k^4).
+ * checks, not k^4). `seen` maps each stage to a bitmask of the depths it was
+ * checked at: a second check at the same depth would walk the same stages to
+ * the same depth limit and find the same defects, so it is skipped, AFTER the
+ * cycle and depth checks (every back-reference and every over-deep reference
+ * is still reported). That bounds the walk by stages x MAX_STAGE_DEPTH, where
+ * a multi-stage cycle with k back-references per stage used to cost k^L. Not
+ * "this depth or a shallower one": a shallower check hits the depth limit
+ * later, so it can miss an over-deep path through the stage.
  */
-function checkStage(errs: string[], path: string, st: Stage, depth: number, onPath: Set<Stage>): void {
+function checkStage(errs: string[], path: string, st: Stage, depth: number, onPath: Set<Stage>, seen: Map<Stage, number>): void {
   if (!present(errs, path, st)) return;
   if (onPath.has(st)) {
     errs.push(`${path}: cyclic stage, so its stages nest deeper than ${MAX_STAGE_DEPTH}`);
@@ -119,12 +132,15 @@
     errs.push(`${path}: stages nest deeper than ${MAX_STAGE_DEPTH}`);
     return;
   }
+  const at = seen.get(st) ?? 0;
+  if ((at & (1 << depth)) !== 0) return; // already checked at this depth
+  seen.set(st, at | (1 << depth));
   onPath.add(st);
   if (st.on !== "impact" && st.on !== "apex") errs.push(`${path}.on: unknown`);
-  checkEffects(errs, `${path}.effects`, st.effects, st.on === "apex", depth, false, onPath);
+  checkEffects(errs, `${path}.effects`, st.effects, st.on === "apex", depth, false, onPath, seen);
   if (st.early !== undefined) {
     if (st.on !== "apex") errs.push(`${path}.early: only on an apex stage`);
-    checkEffects(errs, `${path}.early`, st.early, false, depth, false, onPath);
+    checkEffects(errs, `${path}.early`, st.early, false, depth, false, onPath, seen);
   }
   if (st.homing !== undefined) {
     if (st.on !== "impact") errs.push(`${path}.homing: only on an impact stage`);
@@ -184,7 +200,7 @@
   check(errs, "power", def.power, 1, 100);
   const l = def.launch;
   if (!present(errs, "launch", l)) {
-    if (def.stage !== undefined) checkStage(errs, "stage", def.stage, 1, new Set());
+    if (def.stage !== undefined) checkStage(errs, "stage", def.stage, 1, new Set(), new Map());
     return errs;
   }
   check(errs, "launch.count", l.count ?? 1, 1, 9);
@@ -193,7 +209,7 @@
     check(errs, "launch.speedPct", l.speedPct ?? 100, 1, 300);
     check(errs, "launch.gravityPct", l.gravityPct ?? 100, 0, 200);
     if (!def.stage) errs.push("stage: a shell launch needs one");
-    else checkStage(errs, "stage", def.stage, 1, new Set());
+    else checkStage(errs, "stage", def.stage, 1, new Set(), new Map());
   } else if (l.kind === "beam") {
     check(errs, "launch.length", l.length, 1, 1400);
     check(errs, "launch.width", l.width, 2, 12);
```

3. **The homing-null guard lacks a test.** The guard is the validator's `present(errs, path.homing, st.homing)`, not `steer`'s zero-heading return, which minimal tested by mistake. **Test:** `homing: null` reports `stage.homing: missing`, and `resolveWeapon` with that def (cast) gives the same points and hash as the def without `homing`.
4. **The `maxTurnSteps` static bound lacks a test.** **Test:** Twin Nova 1,230; Cascade 3,600; Lancer 1; an impact split whose child arms a 600-step delay 3,000 (1,200 + 1,200 + 600).
5. **Timeline shell angles can be −0** (Barrage's children). **Fix at the source:** `fanOffset` returns `idiv(…) | 0`, which changes only −0 to 0. Every use adds it to an integer or passes it to `cosDeg`/`sinDeg`, which normalize with `| 0`, so the change is inert (it is in the §7.3 `primitives.ts` diff). **Test** (`copyInto.test.ts`, T1): `fanOffset(i, 6, 0)` is never −0, and no Timeline shell angle is −0 across the whole 2A corpus (> 900 angles).
6. **`abandon()`'s `out` events are untested.** **Test:** a self-splitting `up` hop fired straight up at power 100 reaches the backstop: `steps` 4,800, and exactly one `out`, at step 4,800 with lag 0. It is the last event, at its shell's last path point.
7. **`endBounce` duplicates `stepShell`'s cap check.** **Refactor with its test:** `endStep` (count the step, apply the flight cap) is shared by the free-flight end and `endBounce` (in the §7.4 `ballistics.ts` diff). The bounce-at-the-cap test stays green, and so do the pins.
8. **The quiet-path allocations (K12):** done (§7.3), with `copyMatchInto` (K10). Some small per-sim objects stay allocated on purpose; that is a recorded deviation from the hand-off (§7.3, T16).
9. **Wording nits** (the docs task, T16):
   - **Update-command wording.** Spec §8 lists every update command as a runnable line and adds 2B's: `UPDATE_ARCFIRE_AI=add|draft|1` with `ARCFIRE_AI_EXPECT_MOVED`, `UPDATE_ARCFIRE_GOLDEN=vsai`, `ARCFIRE_BALANCE_WRITE`, `ARCFIRE_SWEEP_SHARD` / `_MERGE` / `_THREADS` and `ARCFIRE_PERF_MARGIN`. "`UPDATE_ARCFIRE_CORPUS=add` is unchanged" becomes what it does: "writes new keys only, and refuses to write if any existing case or definition digest moved". The addendum's §7.3 still quotes the pre-Revision-3 commands (`UPDATE_ARCFIRE_GOLDEN=1`, and `UPDATE_ARCFIRE_CORPUS=1` without `ARCFIRE_CORPUS_EXPECT_MOVED`); point it at `=plan1` / `=full` and the declared count. In `corpus.test.ts`, "create it once with UPDATE_ARCFIRE_CORPUS=1" gains `ARCFIRE_CORPUS_EXPECT_MOVED=0`.
   - **The wall-bouncer < 1 px exception.** Spec §4.1's Bounce bullet says a wall bouncer spawned past a side wall "goes `out` at its first sample". Add Spawns' own exception: "unless that sample is already back inside the world". Define "inside the world" as the **floored** column in 0..1199, so a last free sample in the sub-pixel band x ∈ (−1, 0) is column −1 and counts as outside (`stepShell`'s rule, §3.2's floor).
   - **Re-pin command docs.** The vs-AI goldens re-pin with `UPDATE_ARCFIRE_GOLDEN=vsai` **only**. `determinism.test.ts`'s `=1` (plan1 + full) never touches them, so each re-pin command moves one cause's pins (2A's rule), and spec §8 says so. `replay.ts`'s header now points vs-AI logs at `vsai.ts` (in the §6.2 diff). Spec §1.3's "regenerating the AI's commands arrives with the AI in Plan 2" points to `replayVsAi`. The addendum's §11 gains "done in 2B" for K10/K12 and the minors.

---

## 12 · Task breakdown (deliverable k): 16 tasks in dependency order

**Rules for every task.**
- **TDD:** the failing test first, then the code, then green.
- **Each task ends green** with `npx vitest run`, `npx tsc --noEmit` and the purity guard, and commits alone with the repo's trailer.
- **Pins:** `389a1340`, `8d7dc831`, `a7100140` (483 cases), `3f614265` and `5167b43d` stay byte-identical after every task. From T10 on, the AI pins move only with a declared cause.
- **Build and commands:** never `next dev`; `npm run build` in T12 and T16. One plain command per line (the worktree guard).

**The staging rule.** A test file lands whole with the task whose modules it imports, and no later task edits it. So every task's test file compiles and passes at that task. The shared boards (`corpusState`, `battleBoards`, `rngAfter`) are in `test/arcfire/fixtures.ts` from T1, before any AI module exists.

**Measured.** Every checkpoint below was rebuilt in the prototype from `e77161d` with exactly the files of the tasks up to it: T10's fixtures were created with the update modes, then re-run without them. Every checkpoint ended green with vitest on the Arcfire paths (`titles/arcfire`, `test/arcfire`, `runtime/arcfire` from T12, and the purity guard) and `tsc --noEmit`. The last column gives that count; 2A's is 212.

| # | Task | Files | Ends green with | Depends on | Arcfire tests (measured) |
|---|---|---|---|---|---|
| T1 | **Engine I (inert): `copyMatchInto`, `toAct`, `applyCommand`, K12, `fanOffset`** | `state.ts`, `match.ts`, `replay.ts`, `terrain.ts`, `weapons/primitives.ts` (§6.2, §7.2, §7.3 diffs); `test/arcfire/fixtures.ts` (§10.1 diff); `copyInto.test.ts` | parity and completeness; no −0 angle; all pins unchanged | — | 214 |
| T2 | **Engine II: the exact quick-reject sweep + `endStep`** | `ballistics.ts` (§7.4 diff); `quickReject.test.ts` (mutation-check it once by dropping the hitbox test) | 20,000 shells equal; bounce-at-cap green; pins unchanged; `perf.test.ts` prints Pulse ≈ 0.021 ms | T1 | 215 |
| T3 | **The 2A carry-overs** | `weapons/validate.ts` (§11 diff); `carryovers.test.ts`; `corpus.test.ts`'s power assertion (§10.1 diff) | §11 tests red → green; `validate.test.ts` unchanged and green; pins unchanged | T1 | 222 |
| T4 | **AI data:** `ai/tiers.ts`, `ai/noise.ts`, `ai/model.ts` | `ai/data.test.ts` | budgets 300/1,500/4,000; the kernels; 12 models, DIRT exactly harmless | T1 | 227 |
| T5 | **The probe:** `ai/probe.ts` | `ai/probe.test.ts` | Pulse's blast pixel on every Rookie-grid aim of 8 boards; the beam probe on 181 dial angles × 8 boards | T4 (T2 for speed) | 229 |
| T6 | **The search:** `ai/search.ts`, `ai/plan.ts` | `ai/search.test.ts` | `planTurn` leaves the match and its RNG alone and plans the same on a clone; `sims ≤ tierBudget`; Hailstorm; the choice rules | T5 | 233 |
| T7 | **The policy + the draft AI:** `ai/policy.ts` | `ai/policy.test.ts` | exactly 7 draws, clones decide alike, a legal command; the draft's top N and 1 draw | T6 | 235 |
| T8 | **vs-AI:** `vsai.ts`, `test/arcfire/vsaiGolden.ts` | `vsai.test.ts` | human-only replay = live; resume = replay on every prefix; the fuzz never throws | T7 | 241 |
| T9 | **The verifier:** `verify.ts` | `verify.test.ts` | every cheap rejection | T8 | 243 |
| T10 | **The AI pins:** `test/arcfire/aiCorpus.ts`, `ai.entry.ts`, `ai.corpus.test.ts`; create the two fixtures with `UPDATE_ARCFIRE_AI=1 ARCFIRE_AI_EXPECT_MOVED=0 UPDATE_ARCFIRE_GOLDEN=vsai` | `ai.corpus.golden.json`, `determinism.vsai.golden.json` | **turn `55df93ca`, draft `c0d402d4`, win `be9db94d` [254, 169], loss `2097c8fc` [234, 329]**; coverage gates; `scoreVsAi` paths | T9 | 246 |
| T11 | **The verification budget:** `ai.perf.test.ts` | — | cold < 5 s (0.5–0.65 s here); timings printed (T16 records the first CI run's) | T10 | 247 |
| T12 | **The worker:** `runtime/arcfire/protocol.ts`, `host.ts`, `worker.ts`, `client.ts` | `host.test.ts`, `worker.bundle.test.ts` | host and client tests; bundle < 64 KiB (≈ 40 KiB); `npm run build` and `npm run check:bundle-budget` unchanged | T8, **T10** (`host.test.ts` reads `determinism.vsai.golden.json`) | 252 |
| T13 | **Cross-engine:** the harness entry, 2 `PINS` rows, the Worker smoke | `harness.entry.ts`, `e2e/cross-engine-determinism.spec.ts` | `npm run test:e2e:cross-engine` green in Chromium and WebKit locally (Firefox in CI) | T10, T12 | (e2e) |
| T14 | **The sweep:** `test/arcfire/aiMatch.ts`, `sweep.entry.ts`, `sweep.ts`, `balance.ts`, `arcfire.sweep.test.ts`, `balance.allow.json` (`{}`), the workflow | `balance.test.ts` (§10.9) | `balance.test.ts` green; `BALANCE_SWEEP=1` runs (tier asserts pass; the harness fails on the first-run weapons, as expected) | T7, T10 | 259 + 1 gated |
| T15 | **The first sweep** (data only): run `BALANCE_SWEEP=1` locally, commit its report as `docs/superpowers/<the run's date>-arcfire-balance-first-run.md`, seed `balance.allow.json` with the failing ids and reasons (⚑ O10). No `power` write-back (⚑ O9) | `balance.allow.json`, the report | the weekly job green with ACKs; separation 99.5 / 93.5 / 85.5% reproduced | T14 | 259 + 1 gated |
| T16 | **Docs and hand-off** (the list below) | docs only | `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run check:bundle-budget`, `npm run test:e2e:cross-engine` all green | all | — |

**T16's spec and addendum edits:**
- **Spec §1.1:** the module layout is `ai/` (`tiers`, `noise`, `model`, `probe`, `search`, `plan`, `policy`) plus `vsai.ts` and `verify.ts`, not `search` / `evaluate` / `draftPick`.
- **Spec §1.3 and §6.5:** vs-AI replay is `replayVsAi`, not `replayMatch`. The local resume blob holds **both** seats' commands plus the opponent and is re-applied without a search (`resumeVsAi`, D17). That changes the binding line "the resume blob is the human-only command format": the **submission** stays human-only. **The owner confirms D17** (⚑ O19); it is not only a §0 note.
- **Spec §4.3:** the harness's random draft (⚑ O7), net points per shot (⚑ O8), the `power` write-back only locally and only after tuning (⚑ O9), and the allow-list gating (⚑ O10).
- **Spec §5:** the interpretations D1–D2 (a "sim" is one full resolve; the budget column is a cap spent as fixed per-weapon shares, ⚑ O18), D6–D9, D11, and the tiers as measured. Step 1 becomes per-weapon probe models (the weapon's own flight, D3) instead of "a single cheap shell", which the brief also called "a plain shell".
- **Spec §8:** the AI pins and the update commands, including the rule that only `UPDATE_ARCFIRE_GOLDEN=vsai` re-pins the vs-AI goldens.
- **Spec §9.1:**
  - mark 2B done;
  - "vs-AI replay in `replayMatch`" becomes `replayVsAi`;
  - **record the Node 22 baseline:** the numbers `ai.perf.test.ts` prints on its first CI run (daily verification cold and warm; each tier's mean and maximum decision time) are the Node 22 baseline the spec asked for, replacing this design's Node 24.11.1 figures;
  - add the first weekly sweep's cost table (§9.5).
- **The addendum's §7.3 and §11:**
  - the update commands;
  - K10/K12 "done in 2B";
  - **K12's deliberate deviation** from the hand-off: the `Timeline` shell, one `Trigger` per trigger, the `[p0, p1]` points array and `stepShell`'s `Impact` objects stay allocated on the quiet path. They are not gated because the GC cost is 0.3% of an Ace match (§7.3).
- **The §11 wording nits,** and the Plan 3 (§8.5) and Plan 4 (§6.6) hand-offs.

**After 2B, next:** the owner's tuning pass (⚑ O11). It is data changes with declared corpus re-pins, iterated with the harness. Then comes the `power` write-back with its declared AI draft + vs-AI re-pin, then the allow-list is emptied for the launch gate.

**Riskiest task:** T2 edits `stepShell`, 2A's hottest loop. Its gate is what the prototype passed: the property test (mutation-checked), every pin, and the AI digests identical with the quick-reject compiled out. T2 is also optional: dropping it moves no decision and no pin, only speed.

---

## 13 · Risks and owner decisions (deliverable l)

### 13.1 For the owner (⚑): gameplay, feel and balance, each with a recommended default

| ⚑ | Decision | Recommended default | Measured basis |
|---|---|---|---|
| **O1** | **Does the Ace aim knowing its own hand shake?** Noise-aware expected value (this design) or the value at the exact aim | **Noise-aware.** It is what "Ace" should mean; its misses look like near misses | The point-evaluating Ace wins 19.4% against it (−13.4 points a shot); with a point-evaluating Ace, Ace–Veteran would still clear 60% (minimal measured 74%) |
| **O2** | **How hard is the daily challenge?** It is always Veteran | The spec's Veteran: exact-aim evaluation, ±2° / ±3. Playtest; if the owner can't win about one daily in three, widen the noise to ±3° / ±5 (one line + a declared AI re-pin, before launch) | A noise-free grid human beat the spec Veteran 25/60, a noise-aware Veteran 23/60, a ±3°/±5 Veteran 41/60. Veteran hits 63–64% of its shots |
| **O3** | **The noise's shape** | The literal sum of 3 uniform integers (part half-ranges ⌊(bound + i)/3⌋) | Ace ±1 is uniform: exact 1 time in 3. Strength's scaled bell (exact 68%, holes at Rookie's ±2/±6) would make every tier sharper |
| **O4** | **Moves:** Veteran looks while its best is < 25; the Ace always; the best weapon re-searched; ≥ 8 points to move | As stated | Ace 80–82 and Veteran 13–26 moves per 200 matches; strength-neutral (52.2%); 30% of the Ace's time. Alternatives: `movers: 2` (neutral, dearer) or a lower `moveGain` for a livelier AI |
| **O5** | **The DIRT rule:** threat ≥ 60 (spec), cut ≥ 20, placements 90 px in front and midway | As stated | 363 defensive uses in 400 harness matches, reply cut ≈ 38 (an optimistic estimate); strength-neutral (53.8%) |
| **O6** | **Tier-3 saving:** fire a tier-3 weapon only if it beats the best other by ≥ 20% (spec) | Keep | 561 saves in ~16,000 shots; strength-neutral (53.1%); it reads as strategy |
| **O7** | **The harness's draft** | Random (seeded) | A power draft would measure the harness's own output and never field the four weakest weapons |
| **O8** | **The band metric** | Net points per shot (dealt − gifted) | Ace gifts ≈ 0 a shot, so net ≈ dealt today |
| **O9** | **The `power` formula, and when to write it** | Damaging: round(net per shot); DIRT: its win-rate contribution on the damaging weapons' line. Write back **after** the tuning pass | First run: Twin Nova 100, Swarm 93, Nova 90 … Pulse 28, Auger 12; DIRT 10 / 20 / 1 |
| **O10** | **Gating** | Weekly, never a merge blocker; T15 seeds the allow-list with the 9 first-run failures; launch needs it empty | Report-only (strength) can't catch a new regression while tuning; red-until-tuned (minimal) trains people to ignore it |
| **O11** | **The first tuning pass** (after 2B; data only) | Nova ×0.77, Twin Nova ×0.67 and Swarm ×0.75 (all three also over +12%); Shrapnel ×1.84, Skipper ×1.70; **structural:** Needle (75% hits, 105 a hit: a smaller damage, e.g. ×0.6), Railshot (38% hits: a larger radius), Prism (one beam of three reaches: a narrower spread or more damage a beam), Auger (70% hits, 16 a hit: a shorter tunnel or shallower pitch). Tune in two rounds (the scalings, then the structural fixes), re-running the harness after each | §9.5 |
| **O12** | **Homing** (2A's O2, re-opened by the harness) | Decide after O11 whether Swarm needs a lock radius or a turn budget | Seeker never misses (50.0 a shot, sd 0); Swarm 93.0 at +15.9% |
| **O13** | **DIRT's value** | Accept for launch (the pool guarantees one; walls may please humans); revisit after playtests | Holding DIRT costs 8–17% of win rate; the AI will rarely draft it |
| **O14** | **The AI's visible think time** (Plan 3, presentation only) | At least 700 ms of "aiming" (the turret sweeping to its angle) before any AI shot, so Rookie's 10 ms decisions don't feel robotic | Never touches the sim |
| **O15** | **The Ace's think time on phones** | Keep the spec's 4,000 budget; hide it behind the human shot's playback. The worst case needs checking: playtest the heaviest openings on a real mid-range phone | Corpus states, Chromium 4× throttle: 1.34 s mean (max 1.65), 6×: 2.12 s (max 2.57). **The sweep's heaviest Ace decisions** (up to 3,700 sims and 49,900 probe flights, found by timing all 12,004 Ace decisions): **1.65–2.18 s at 4×, 2.58–3.39 s at 6×**. That is about 30% above the corpus maxima, and longer than a short shot's playback. Levers if needed, both strength-neutral: half the stationary budget (−33% sims) or no Ace move search (−30% time). Both change the Ace's decisions (a declared re-pin, a `simVersion` bump after launch) |
| **O16** | **Seating** | The human always plays left (player 0, red) against the AI (player 1, blue) | Spec §6.2's colours; the sweeps found no seat advantage (player 0 won 218 of 400 Ace-vs-Ace matches, within noise) |
| **O17** | **Rookie's "random among the top 4"** includes zero-value weapons (and DIRT at 0) | Literal | Rookie loses to Veteran 85.5% of the time and to a grid human 55 in 60: visibly a novice |
| **O18** | **The spec's "Budget (sims/turn)": a cap or a spend?** This design reads it as a cap with fixed per-weapon shares (`⌊stay / max(10, hand)⌋`), so late-match turns spend less | **A cap** (as built); T16 writes the reading into spec §5 | Sweep means: Rookie 144 of 300 (30 in sudden death), Veteran 651 of 1,500 (maximum 1,200), Ace 2,123 of 4,000. The alternative, splitting the stationary budget over the remaining hand, is equally data-independent. It would make late turns sharper and dearer, with no measured strength need: the half-budget Ace won 55.0% |
| **O19** | **The local resume blob holds both seats' commands** (D17), not the human-only format spec §1.3/§6.5 binds | **Both seats + the opponent**, re-applied without a search; the submission stays the human sub-log | A resume in 1.4–1.7 ms instead of ≈ 0.7 s (Veteran) or 13–21 s (Ace at 4–6× throttle) to regenerate. A tampered blob changes only the tamperer's local game. T16 amends the binding line once the owner agrees |

### 13.2 Engineering risks

- **K1 The purity guard scans comments.** The AI's vocabulary ("refine box", "centre") avoids the banned words; never write the w-word, `performance`, `document`, `navigator`, the trig names or `**` in `src/game/titles/arcfire/**` (2A K6).
- **K2 vitest's 4–5× timing inflation.**
  - Every bulk or timed AI test is bundled (§10), and the < 5 s test asserts the cold run. If CI ever flakes, raise `ARCFIRE_PERF_MARGIN`, never a literal.
  - Every unbundled test that searches or plays carries an explicit 30–120 s timeout. Vitest's 5 s default failed the first version's 8 s prefix test, and CI runs Node 22 on 4 vCPUs with the files in parallel.
  - No always-on unbundled test asserts on wall-clock time: the validator's bounds are counts.
- **K3 The AI is a verification input** (D23). After launch, any change to `ai/**`, `TIERS`, the noise, the probe models or a `power` changes regenerated AI decisions: an `ARCFIRE_SIM_VERSION` bump, which partitions the boards. The AI pins make it loud.
- **K4 A `power` write-back moves AI pins:** exactly the draft section and the vs-AI goldens, declared (§9.4); `UPDATE_ARCFIRE_AI=draft` refuses if a turn case moved.
- **K5 Phone think time** (⚑ O15): the worker keeps the UI responsive, and the search overlaps the human shot's playback. Next levers: the dirty-range settle (speed only, decisions unchanged) or a smaller Ace budget (decisions change).
- **K6 CI sweep runtime:** ≈ 2,900 CPU-seconds a week, played as one job queue.
  - Measured on the dev machine: a quarter shard takes 164 s on 4 threads and 315 s on 2.
  - Estimated for CI: 3.5–4 minutes a shard on a public repository's 4-vCPU runner, and roughly double on a private repository's 2-vCPU runner. Both are inside the 30-minute job timeout; 8 shards is the lever.
  - The first weekly run replaces these estimates.
- **K7 Engine differences:** all AI arithmetic is integer and far below 2^53; every `sort` has a total comparator; `Map` is never iterated for a decision. Chromium and WebKit reproduced every AI pin, the goldens and the Worker run; Firefox is CI-only.
- **K8 The quick-reject edits 2A's hottest loop.** Its exactness is structural (a conservative box test; the loop decides otherwise) and proven three ways; the property test is mutation-checked; the `exact` flag keeps the reference path one argument away. If in doubt, T2 can be dropped with no pin or decision moving.
- **K9 The module scratch** (`SLOTS`, `VALS`, `STAMP`, `ORDER`) assumes one synchronous decision at a time per thread: true for the worker, the verifier and each sweep worker. The stamp generation wraps before 2^30, so decisions never depend on process history.
- **K10 The Next bundler and workers:** `new Worker(new URL(…, import.meta.url))` under Next 16 / Turbopack is first exercised by Plan 3's `npm run build`; the fallback is the esbuild worker bundle emitted to `public/`.
- **K11 An AI assertion in the route:** `stepAi` throws only on an illegal AI command, which the legality checks (every sweep turn, the corpus) rule out; if it ever happened, the route's generic error handling answers 500 and stores nothing.
- **K12 Local resume trusts the blob's AI entries:** only the local game can be affected; the submission is the human sub-log and the server regenerates everything.

---

## 14 · Provenance

**Base:** the "strength" design (the winner by total score: strength 172, minimal 171, engine 152). **Every defect the judges found in it, and how it is fixed here:**

| Judges' defect in strength | Fix |
|---|---|
| Calibration read the recorded Timeline (presentation data Plan 3 will extend) | Removed. The probe model comes from the `WeaponDef` (engine) with the apex centre-child rule (minimal), and nothing in the AI reads a Timeline |
| A second, hand-written flight integrator (`flyOne`, 99.3–99.6% exact) | Removed. The probe is `stepShell` itself, exact by construction; its cost is recovered by the exact quick-reject (engine B16a), which also speeds up every sim |
| The noise was a scaled bell, not the literal sum of 3 uniform integers (holes at Rookie's ±2/±6) | The literal parts (minimal/engine); the kernel is exact; ⚑ O3 |
| One ~540-line `search.ts` with a 23-field tier table | Five modules (`model`, `probe`, `search`, `plan`, `policy`), a 16-field `TierSpec` |
| The Veteran was noise-aware and calibrated ("best by evaluation" read loosely) | The Veteran ranks by the exact value; noise-aware is one flag (⚑ O2) |
| Budgets were loose caps (the Ace spent ~1,720 of 4,000) | Fixed per-weapon shares that a full hand spends in full (minimal D7); fixed per-component counts summing to the spec's budget |
| `GEN` into an `Int32Array` could wrap after 2^31 | The generation wraps with a `fill(0)` before 2^30 |
| The golden's human was prose (two readings) | `goldenHuman` is verbatim code |
| The dirty-column settle was left for later | Still not taken, with the reasons and the measured need (§7.4); the quick-reject took its place |
| `resumeVsAi` read `log.length` unchecked; `host.receive` had no try/catch; no transfer lists | `Array.isArray`, never throws, drops a bad suffix; try/catch → `error`; transfer lists |
| The DIRT defence reserved 25% of the Ace's budget, strength-neutral | 300 sims (7.5%), still spec-literal |
| Report-only until a global switch | Engine's per-weapon allow-list (ACK / STALE ACK) |
| The AI corpus had no wind, sudden-death, move or DIRT cases and no coverage gates | Specials for each, two digests, coverage gates (engine) |
| The < 5 s assertion was a best of 3 | The cold first run is asserted (minimal) |
| Shells only over the facing quarter: Ricochet's walls unused | Wall bouncers probe the facing half (engine) |
| `client.ts` and `sweep.ts` were sketches or prose | Both verbatim, compiled and tested |

**Grafted from "minimal":** the tier-independent 1 + 7 draw schedule; the probe as the sim's own flight and the apex centre-child rule; fixed per-weapon shares; `toAct` and the never-throwing `applyCommand` shared by every replay; the worker bundle test; the `defDigest` power assertion; the validator's `(stage, depth)` memo and delay no-descent diff; the cold verification assertion; literal-spec readings throughout.
**Grafted from "engine":** `probeModelOf` / data-derived weapon knowledge (bounces, wall bounces, homing); the exact quick-reject sweep with its reference property test; `too_long` before any AI work; the RNG-free `planTurn` for hints; request ids and `seq`; split turn/draft digests and coverage gates; the allow-list gating; the Worker in the cross-engine gate; the wording nits it found in the addendum.
**Kept from "strength":** noise-aware ranking (now the Ace's, with the literal kernel); the re-centring step (kept, but measured nearly inert: §3.3); the DIRT threat measured after the AI's own planned shot; row-based centres with non-overlapping boxes; `scoreVsAi` in `verify.ts` with win and loss goldens; the search-free resume; `copyMatchInto` and the K12 edits; 4 CI shards + a merge job; the suggestion column; the ablation table; the measured owner decisions (daily difficulty, think time).
**New here:** the DIRT power from the win-rate line; the pick rate with the proposed powers; the duplicate-seed guard in the merge; the `exact` flag that keeps the quick-reject's reference path in the sim; the mutation check of the property test; the daily-difficulty data against a scripted human.

---

## Appendix A · Pins after Plan 2B

| Pin | Value | Changed by 2B? |
|---|---|---|
| Circle TD golden | `5167b43d` | no |
| Arcfire golden (plan1) | `389a1340` [31, 83] | no |
| Windless pin | `8d7dc831` | no |
| 2A corpus | `a7100140` (483 cases, 32 definition digests) | no |
| Full-roster golden | `3f614265` [359, 448] | no |
| **AI corpus, turn section** | **`55df93ca`** (45 cases) | **added** |
| **AI corpus, draft section** | **`c0d402d4`** (12 cases) | **added** (moves with a `power` write-back) |
| **vs-AI win golden** | **`be9db94d`**: seed 20260934, STANDARD, Veteran, [254, 169] | **added** (moves with a `power` write-back) |
| **vs-AI loss golden** | **`2097c8fc`**: seed 20260928, [234, 329] | **added** (likewise) |

## Appendix B · The pinned fixtures (the transcription check, case by case)

`src/game/titles/arcfire/ai.corpus.golden.json` (shown one case per line; the test writes it with `JSON.stringify(…, null, 1)`):

```json
{
 "turnDigest": "55df93ca",
 "draftDigest": "c0d402d4",
 "turn": {
  "turn|rookie|s11t0": [1,0,140,69,270,417,115,2015813115],
  "turn|veteran|s11t0": [8,0,167,95,1080,2391,115,2015813115],
  "turn|ace|s11t0": [8,0,150,72,3332,21201,1011,2015813115],
  "turn|rookie|s11t9": [21,0,65,89,120,750,84,2015813115],
  "turn|veteran|s11t9": [18,0,47,87,480,4575,85,2015813115],
  "turn|ace|s11t9": [18,0,51,86,1909,27477,762,2015813115],
  "turn|rookie|s23t0": [18,0,165,100,270,1130,115,2015813127],
  "turn|veteran|s23t0": [8,0,168,96,1080,6875,115,2015813127],
  "turn|ace|s23t0": [3,0,162,74,3457,38060,850,2015813127],
  "turn|rookie|s23t9": [14,0,35,83,150,570,60,2015813127],
  "turn|veteran|s23t9": [12,0,29,93,600,3450,52,2015813127],
  "turn|ace|s23t9": [10,0,64,86,2227,25000,454,2015813127],
  "turn|rookie|s37t0": [2,0,151,75,270,977,115,2015813141],
  "turn|veteran|s37t0": [8,0,160,97,1080,5816,115,2015813141],
  "turn|ace|s37t0": [8,0,148,78,3336,34831,998,2015813141],
  "turn|rookie|s37t9": [15,0,26,95,150,570,102,2015813141],
  "turn|veteran|s37t9": [13,0,26,99,600,3450,103,2015813141],
  "turn|ace|s37t9": [13,0,26,100,2227,24541,642,2015813141],
  "turn|rookie|s41t0": [3,0,12,89,240,760,115,2015813145],
  "turn|veteran|s41t0": [8,0,9,100,960,4600,115,2015813145],
  "turn|ace|s41t0": [3,0,22,70,3195,31100,874,2015813145],
  "turn|rookie|s41t9": [15,0,162,79,150,570,150,2015813145],
  "turn|veteran|s41t9": [9,0,154,94,600,3450,150,2015813145],
  "turn|ace|s41t9": [9,0,149,84,2221,23890,999,2015813145],
  "turn|rookie|wind": [1,0,155,79,270,417,115,2015813115],
  "turn|veteran|wind": [8,0,167,95,1080,2391,115,2015813115],
  "turn|ace|wind": [8,0,157,81,3332,21201,996,2015813115],
  "turn|rookie|sudden": [0,0,165,100,30,190,40,2015813127],
  "turn|veteran|sudden": [0,0,168,96,120,1150,40,2015813127],
  "turn|ace|sudden": [0,0,157,78,1000,13650,337,2015813127],
  "turn|rookie|beam": [26,0,91,45,60,227,40,2015813141],
  "turn|veteran|beam": [26,0,87,51,240,1241,60,2015813141],
  "turn|ace|beam": [26,0,89,51,837,5093,540,2015813141],
  "turn|rookie|saveT3": [6,0,140,69,60,190,103,2015813115],
  "turn|veteran|saveT3": [9,0,163,84,240,1150,150,2015813115],
  "turn|ace|saveT3": [6,0,140,70,1300,13650,590,2015813115],
  "turn|rookie|dirt": [0,0,135,70,30,190,40,2015813171],
  "turn|veteran|dirt": [0,0,144,69,120,1150,40,2015813171],
  "turn|ace|dirt": [23,0,151,87,1021,14220,0,2015813171],
  "turn|rookie|move": [0,0,113,89,30,190,0,2015813134],
  "turn|veteran|move": [0,0,114,82,120,1150,40,2015813134],
  "turn|ace|move": [0,-1,157,86,1000,13650,345,2015813134],
  "turn|rookie|move2": [1,0,150,88,300,797,85,2015813110],
  "turn|veteran|move2": [9,0,150,88,1200,4691,150,2015813110],
  "turn|ace|move2": [18,-1,133,76,3581,27481,762,2015813110]
 },
 "draft": {
  "draft|rookie|s11": [27,31,8,18,1,10,184247302],
  "draft|veteran|s11": [8,10,18,27,29,2,184247302],
  "draft|ace|s11": [2,8,10,18,21,27,184247302],
  "draft|rookie|s23": [3,10,11,13,8,31,184247314],
  "draft|veteran|s23": [8,10,18,31,1,2,184247314],
  "draft|ace|s23": [2,8,10,18,31,1,184247314],
  "draft|rookie|s37": [21,27,10,9,8,31,184247328],
  "draft|veteran|s37": [2,8,9,21,10,29,184247328],
  "draft|ace|s37": [2,8,9,10,18,21,184247328],
  "draft|rookie|s41": [31,3,21,7,11,14,184247332],
  "draft|veteran|s41": [8,2,9,10,31,3,184247332],
  "draft|ace|s41": [2,8,9,10,21,31,184247332]
 }
}
```

`src/game/titles/arcfire/determinism.vsai.golden.json` (the scripted human's logs are regenerated live by the test and must equal these):

```json
{
 "win": {
  "seed": 20260934,
  "commands": [
   {"k":"pick","w":23},
   {"k":"pick","w":22},
   {"k":"pick","w":21},
   {"k":"pick","w":19},
   {"k":"pick","w":18},
   {"k":"pick","w":17},
   {"k":"pick","w":16},
   {"k":"pick","w":15},
   {"k":"pick","w":13},
   {"k":"pick","w":12},
   {"k":"turn","move":0,"w":31,"angle":30,"power":80},
   {"k":"turn","move":0,"w":19,"angle":55,"power":75},
   {"k":"turn","move":1,"w":30,"angle":70,"power":90},
   {"k":"turn","move":0,"w":28,"angle":75,"power":90},
   {"k":"turn","move":0,"w":20,"angle":75,"power":95},
   {"k":"turn","move":0,"w":22,"angle":20,"power":40},
   {"k":"turn","move":0,"w":23,"angle":20,"power":40},
   {"k":"turn","move":0,"w":24,"angle":20,"power":40},
   {"k":"turn","move":0,"w":25,"angle":20,"power":40},
   {"k":"turn","move":0,"w":26,"angle":20,"power":40}
  ],
  "hash": "be9db94d",
  "scores": [254,169],
  "winner": 0
 },
 "loss": {
  "seed": 20260928,
  "commands": [
   {"k":"pick","w":23},
   {"k":"pick","w":22},
   {"k":"pick","w":21},
   {"k":"pick","w":20},
   {"k":"pick","w":19},
   {"k":"pick","w":18},
   {"k":"pick","w":17},
   {"k":"pick","w":15},
   {"k":"pick","w":13},
   {"k":"pick","w":12},
   {"k":"turn","move":0,"w":29,"angle":55,"power":75},
   {"k":"turn","move":0,"w":31,"angle":65,"power":85},
   {"k":"turn","move":1,"w":30,"angle":75,"power":100},
   {"k":"turn","move":0,"w":16,"angle":35,"power":40},
   {"k":"turn","move":0,"w":20,"angle":75,"power":100},
   {"k":"turn","move":0,"w":17,"angle":75,"power":65},
   {"k":"turn","move":0,"w":22,"angle":20,"power":40},
   {"k":"turn","move":0,"w":23,"angle":20,"power":40},
   {"k":"turn","move":0,"w":24,"angle":20,"power":40},
   {"k":"turn","move":0,"w":27,"angle":20,"power":40}
  ],
  "hash": "2097c8fc",
  "scores": [234,329],
  "winner": 1
 }
}
```

## Appendix C · Measurement notes

- **Machine:** Windows 11 Pro, 64 hardware threads (other agents' prototypes may have been running: timings carry about ±10% noise); Node 24.11.1 (CI runs Node 22); esbuild bundles (cjs for Node, iife for browsers); Playwright Chromium and WebKit; "single-threaded" means one decision at a time in one process, and the sweep timings under 48–64 threads are wall times under contention, not per-turn costs.
- **Seeds:**
  - tier separation 1..200 (power drafts, seats swapped on odd seeds); SHORT + wind 1..100; the harness 1..400 (random draft);
  - ablations 1001..1160 (random draft, seats alternated); the cost bench 101..112;
  - the daily logs 7000..7010 plus the win golden; the grid-human data 5001..5060;
  - Revision 1's re-centring count: Ace vs Ace 1..20 (random draft); the heaviest decisions from the whole weekly sweep's records.
- **The first prototype** (`.superpowers/plan2b/synth-proto/`, gitignored) held a copy of the 2A sim with this design applied, the tests, and bench scripts. The benches covered probe and sim costs, per-tier costs, tier separation, ablations, the grid human, cold verification in fresh processes, the quick-reject on/off comparison, the browser pins and Worker runs with CPU throttling, and the harness. The first version said "270 passing", but under vitest's default 5 s timeout its vs-AI prefix test failed (7.6–8.3 s); Revision 1 fixed that (K2). The prototype was deleted after the measurements.
- **Revision 1's prototype** (`.superpowers/plan2b/revise-proto/`, gitignored, deleted afterwards) did the following:
  - **The base:** `git archive e77161d src`, normalized to LF.
  - **The document applied:** every diff with `patch -p1` and every whole file.
  - **The revision's edits,** then every code block of this document regenerated from the files. The unchanged blocks came out byte-identical.
  - **The document re-applied** to a fresh copy: identical to the prototype, file for file, except the three data files the tasks create by command (the two fixtures, which equal Appendix B by value, and `balance.allow.json`).
  - **The staged checkpoints** T1–T12 and T14, each rebuilt from `e77161d` with only its tasks' files.
  - **The whole suite** (512 passed, 11 skipped) and `tsc --noEmit` (clean).
  - **The validator:** its fuzz (30,000 graphs, the 2A validator as the reference) and the memo-direction mutation check.
  - **The sweeps:** the full `BALANCE_SWEEP=1` run (64 s on 64 threads), and quarter shards on 4 and 2 threads.
  - **The heaviest decisions** re-timed alone (three passes of three replays), then the five heaviest Ace opening decisions in Chromium at 1×, 4× and 6× CPU throttling.
  - **The re-centring instrumentation,** and `ai.perf.test.ts` three times.

---

## Revision log

**Revision 1** answers the critic's review of the first version. Every changed code block was regenerated from a rebuilt prototype and re-validated (Appendix C). **No pin moved:**
- the AI corpus is still turn `55df93ca` and draft `c0d402d4`;
- the vs-AI goldens are still win `be9db94d` [254, 169] and loss `2097c8fc` [234, 329];
- the 2A pins are still `389a1340`, `8d7dc831`, `a7100140`, `3f614265` and `5167b43d`;
- the tier separation is still 99.5 / 93.5 / 85.5%, and the 32-row harness table is unchanged.

### Blocking

| # | Critic's item | Resolution |
|---|---|---|
| B1 | §11 item 2 / T3: the validator fix had no code (an unfilled `@@DIFF` marker, the "§11 diff" cited by T3 and §7). Against the old `validate.ts`, the new tests threw `RangeError` and took 1,168 ms, and "exactly 40 reports" depends on how the memo is written | **§11 now carries the real `diff -u`**, applied in T3. (1) A `split` or `delay` inside a delay list is reported and **not descended into**. (2) A per-call `seen` map holds, for each stage, a bitmask of the depths it was checked at. A stage already checked at **exactly** this depth is skipped, **after** the cycle and depth checks. "This depth or shallower" would lose an over-deep path through a shared stage: a new test pins that case, and that variant fails it (measured). **Verified:** the new tests are red on 2A (`RangeError`; 65,641 walks) and green with the fix, with exactly 40 reports and 4 walks. `validate.test.ts`'s cycle, shared-child and malformed-input tests stay green (13/13). A 30,000-graph fuzz agrees with 2A on validity (§11) |
| B2 | §12: T1–T9 could not end green. `corpusState` lived in T10's `aiCorpus.ts`, which imports T7's policy, yet `engine2b.test.ts` (T1–T3) and `ai/ai.test.ts` (T4–T7) imported it. `ai.test.ts` imported `./probe`, `./plan` and `./policy` from T4 on. T12 read T10's golden but depended only on T8 | **`corpusState` moved into `test/arcfire/fixtures.ts` in T1**, with `battleBoards` and `rngAfter`. `aiCorpus.ts` imports it from there; every importer uses `fixtures.ts`, so no re-export is needed. **The two combined test files are now one whole file per task,** each landing with its task and never edited later (the staging rule): `copyInto` T1, `quickReject` T2, `carryovers` T3, `ai/data` T4, `ai/probe` T5, `ai/search` T6, `ai/policy` T7. This replaces per-task versions of one file, so each task's file imports only what exists at that task. **T12 now depends on T10.** **Verified:** every checkpoint T1–T12 and T14 was rebuilt from `e77161d` with only its tasks' files and ended green (vitest on the Arcfire paths, `tsc --noEmit`, the purity guard). The per-task test counts are in §12 (214 … 259) |
| B3 | §10.3 / T8: the vs-AI prefix test (7.6–8.3 s, unbundled) failed vitest's 5 s default, so T8 did not end green and "270 passing" did not hold. `ai.test.ts`'s search test took 2.6 s against the same default | **Explicit timeouts on every unbundled test that searches or plays:** 120 s on the prefix test, and 30–120 s on the AI units, the vs-AI, host and engine tests. Measured under a parallel `npm test`: the prefix test 9.3 s, the host's golden test 9.7 s, the policy test 4.5 s, the search test 2.6 s. **Verified:** the whole repository suite on the document-applied copy passes, 512 passed and 11 skipped (§1). The Arcfire suite is 259 passing plus the gated sweep |

### Non-blocking

| # | Critic's item | Resolution |
|---|---|---|
| N1 | What held (no action) | Re-confirmed on the rebuilt prototype: the pins, the tier separation, the harness table and the fixtures (equal to Appendix B by value); tsc and purity clean. The worker bundle is now 39.9 KiB after the `host.ts` change |
| N2 | `balance.test.ts` had no code | **Added verbatim (§10.9):** 7 always-on tests on hand-built records. They cover aggregation, verdicts, suggestions, powers (DIRT on the least-squares line), pick rate, the allow-list states (FAIL / ACK / STALE ACK), a report row and summary, the new cost table, and the write-back on the real `roster.ts` text (one line per id, idempotent, the refusals) |
| N3 | The Node 22 baseline was only guessed | §7.5 and §10.6 now say that the numbers `ai.perf.test.ts` prints on its **first CI run** become the Node 22 baseline, and T16 records them in spec §9.1 |
| N4 | The Ace's "one re-centring step" almost never resolves anything | **Described honestly; the code is unchanged, so no pin moves.** Instrumented over 20 Ace-vs-Ace matches (2,745 noise-aware searches): the share had sims left in 226 searches, new cells were resolved 4 times, and the answer changed twice. A comparison with an already-complete support (1,401 times) cannot change the answer. §3.3, D6, §4.4 and `search.ts`'s comments now say "completed only from a share's leftover sims". Reserving 8 sims per share is noted as untested and not taken |
| N5 | The Ace maxima came from a 240-decision sample | **`ShotRecord.ms`** is now recorded from an injected clock, and the sweep report adds a per-tier cost table (§9.2, §9.5). §1 and §7.5 quote the maxima of all 20,004 sweep decisions: Ace 3,700 sims and 49,900 probe flights. The heaviest decisions, re-timed alone, reach Ace 605–650 ms and Veteran 127–128 ms; in Chromium at 4× throttling, 1.65–2.18 s, and at 6×, 2.58–3.39 s (⚑ O15 updated). **Worst-case verification bound:** 11 × 128 ms ≈ 1.4 s |
| N6 | The budgets act as caps with fixed shares | Stated in D2 and §3.3 with the sweep means (144 / 651 / 2,123 of 300 / 1,500 / 4,000). **⚑ O18** asks the owner; T16 writes the reading into spec §5 |
| N7 | T16's spec edits were incomplete | T16 now lists §1.1 (the `ai/` layout), §1.3/§6.5 (`replayVsAi`; the both-seats resume blob, now **⚑ O19** for the owner), §4.3 (random draft, net points, local write-back after tuning, allow-list), §5 step 1 (per-weapon probe models instead of "a single cheap shell"), §8 and §9.1 (`replayVsAi`, the Node 22 baseline) |
| N8 | `UPDATE_ARCFIRE_GOLDEN=1` also re-pinned the vs-AI goldens | `ai.corpus.test.ts` now re-pins them **only with `=vsai`**, so each command moves one cause's pins. The §11 nit is updated to match |
| N9 | K12 is not allocation-free | Recorded as a deliberate deviation from the 2A hand-off (§7.3, §11 item 8), and T16 writes it into the addendum's §11 |
| N10 | Wall-clock assertions in always-on unbundled tests | Replaced by counts. The ring asserts 4 effect-list walks (65,641 on 2A) and exactly 40 reports; the delay tests assert the exact single report. No always-on unbundled test times anything now |
| N11 | `host.ts` called `applyPick` / `applyTurn` directly, so a null `cmd` became an `error` | Pick and turn requests now build a fresh entry and go through **`applyCommand`**, which never throws. `host.test.ts` checks a null, undefined, string or string-angle `cmd` and a string pool index in battle: each is `rejected{invalid_command}` |
| N12 | Minor code notes | `search.ts` computes the row gap as `idiv(2 * rA + angleStep, angleStep)` (the same values, integer math only). The `toMatch(/^(invalid_command@\|ok)/)` in `vsai.test.ts` is now a concrete assertion: firing a weapon the AI drafted is `invalid_command` at that index. The host test's title now says what it covers ("mid-draft, mid-battle and finished") |
| N13 | CI sweep runtime was estimated, and `play()` ran four queues back to back | `play()` now plays **one queue**, slowest matches first, with identical records. Measured: the full run 64 s on 64 threads (was 84–93 s); a quarter shard 164 s on 4 threads (was 178 s) and **315 s on 2 threads**. That covers a private repository's 2-vCPU runner and stays inside the 30-minute timeout, with 8 shards as the lever (§9.3, K6) |
