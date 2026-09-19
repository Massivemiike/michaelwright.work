# Circle TD — balance-constant tuning (§5.4 sweep, 2026-09-18)

**Status: PROVISIONAL.** These constants were tuned against Plan 1's
placeholder/INVENTED track and tile geometry (`src/game/titles/circle-td/content.ts`
— a square spiral with a uniform 24px tile grid, explicitly disclaimed as not
matching the original's visual layout). They make the sim winnable and
climbing instead of dying at wave 5, which is what Plan 1 needed to prove the
simulation itself works end-to-end. They are **not** a claim about correct
game balance once Plan 2 ships real track/tile geometry — recalibrate then.

This document is the committed home for the sweep method and results that
several code comments point at. It replaces references to
`.superpowers/sdd/2026-09-18-circle-td-plan-1-simulation/task-13b-report.md`,
which has the full blow-by-blow but is gitignored (`.superpowers/` scratch is
not part of the repo), and a reference to `task-13c-report.md`, which never
existed as a separate file (the task-13c work is an addendum inside
`task-13b-report.md`).

## Method (spec §5.4)

A headless grid sweep over three balance constants, each run driving the sim
with a **best-affordable bot** (`AFFORD_ORDER` in
`src/game/test/balance.sweep.test.ts`: try Damage(260) → Splash(125) →
Fast(50) → Air(45) → Slow(45) every tick, buy whichever is affordable, place
on the next tile from a computed set of Damage-tower-in-range tiles, never
upgrade or sell) to `gameOver` or a tick ceiling:

- **Grid:** `startBank ∈ {125, 250, 400, 600, 900}` × `gamma ∈ {400, 150, 75,
  40, 20}` × `alphaBp ∈ {200, 500, 1000}`.
- **Seeds:** `[20260918, 1, 2, 3]` (the task brief's own set).
- A reduced probe tick ceiling (400,000→200,000, not the full 2,000,000) was
  used for the coarse pass to keep the sweep tractable; the **chosen combo
  and its neighbors were separately re-verified against the actual
  2,000,000-tick ceiling** before being accepted, so the acceptance decision
  does not depend on the reduced probe.
- Rubric: (1) **playable** — worst seed reaches wave ≥ ~30; (2)
  **finite/climbing** — the run still ends via the population cap
  (`gameOver`, never the tick ceiling), just much later; (3) **sweet spot** —
  the reached wave sits inside roughly 40–120, leaving headroom above it for
  a smarter (upgrading) strategy; (4) **active ≫ banking** — active defense
  should dramatically outlast buying nothing; (5) prefer the smallest change
  from the pre-sweep defaults.

## Result: chosen constants

| Constant | Old (pre-sweep) | New (chosen) | File |
|---|---|---|---|
| `START_BANK` | 125 (SOURCED) | **250** (INVENTED) | `src/game/titles/circle-td/content.ts` |
| `GAMMA` | 400 (INVENTED) | **20** (INVENTED) | `src/game/titles/circle-td/balance.ts` |
| `ALPHA_BP` | 200 (INVENTED) | **200** — unchanged, re-confirmed | `src/game/titles/circle-td/balance.ts` |

Key patterns observed during the sweep:

1. **`startBank = 125` is a hard trap independent of `gamma`/`alphaBp`.** The
   opening buy (a single Splash tower) exactly drains the bank to zero every
   time, leaving only one tower for the first several waves regardless of
   how generous the later economy is — confirmed across all 15
   gamma×alphaBp combinations at this bank level with zero variation (every
   cell dies at wave 5).
2. **`gamma` is the real unlock, not `alphaBp`.** At `startBank = 250`,
   `gamma ∈ {400, 150, 75, 40}` all plateau at wave 5–6 regardless of
   `alphaBp`; only `gamma = 20` escapes the trap, and all three `alphaBp`
   values at `gamma = 20` land within 1–2 waves of each other (78–82).
   `alphaBp` (the interest cap) turned out not to matter once the
   bounty-driven early snowball was fixed — the run never carries a large
   enough bank early enough for the interest cap to bind.
3. **The Damage tower's 260-cost threshold is a chaos boundary, not a smooth
   economy dial.** `startBank = 250` keeps every early buy in the
   Splash/Fast/Air/Slow band. Raising it to `startBank = 400` flips the
   *very first* purchase to a single Damage tower (single-target, 60-tick
   cooldown) instead of two Splash towers (AoE, 30-tick cooldown each) — and
   this flip rescues one previously-bad seed (seed 4, wave 82) while
   breaking a previously-fine one (seed 3, wave 5). Confirmed
   deterministically, reproduced twice — this is a genuine strategy-chaos
   finding, not sweep noise.

### Survival results (confirmatory runs, full 2,000,000-tick ceiling)

Best-affordable bot, play to `gameOver`, `hitCeiling: false` in every case
shown (the game always ends via the population cap, never the ceiling):

| combo | seed 20260918 | seed 1 | seed 2 | seed 3 | seed 4 |
|---|---|---|---|---|---|
| **startBank=250, gamma=20, alphaBp=200 (CHOSEN)** | wave 81 | wave 80 | wave 78 | wave 80 | wave 7 (known concern, see below) |
| startBank=400, gamma=20, alphaBp=200 (rejected) | wave 81 | wave 80 | wave 84 | **wave 5 (broken)** | wave 82 |
| pure banking (no towers ever bought) | wave 4 | — | — | — | — |

Bot wave **~78–81** across the sweep's own four seeds vs. **wave 4** for
banking nothing — roughly a 20x margin, and comfortably inside the 40–120
sweet spot with headroom for a smarter strategy (Plan 1's own
`src/game/test/balance.sweep.test.ts` FULL suite, gated behind
`BALANCE_SWEEP=1`, later demonstrated wave 22 is reachable with as few as 2–3
towers when they're continuously upgraded rather than left at level 0 — see
`src/game/test/determinism.test.ts`'s scripted golden replay).

### Known concern: seed 4

Seed 4 (outside the sweep's own 4-seed set) does not escape under the chosen
defaults — it dies at wave 7, vs. wave 78+ for the four seeds the sweep
specification actually covers. Investigated but not fully root-caused:

- Seed 4 draws an early `CREEP_HARD` wave (wave 2), which doubles spawned HP
  via `typeMul()` without a matching bounty increase (`bounty()` uses the
  un-multiplied `hp(wave)`) — a real, if not fully sufficient, mechanism.
- Seed 2 shares the *same* early-HARD-wave timing as seed 4 and escapes
  fine, so "an early HARD wave" is at most a partial explanation, not the
  whole story.
- Raising `startBank` to 400 "fixes" seed 4 (wave 82) but breaks seed 3
  (wave 5) by crossing the Damage-tower chaos boundary above — so this bot
  is genuinely chaotic near the escape threshold, not a simple monotonic
  economy dial.

This was reported rather than papered over. A concrete recommendation for a
future pass: either make `bounty()` scale with the actual spawned HP
(multiply by `typeMul(wave, o)`, not just `hp(wave)`) so a HARD wave's extra
toughness pays proportionally more, or add a flat floor bonus to fatten the
earliest kills regardless of which wave-flags land early. Both are formula
changes, not constant retunes, so they were left out of scope for this
tuning pass.

## Fast/slow test split (same day, task 13c addendum)

Once the tuned constants made the bot reach wave ~80, the FULL
play-to-`gameOver` acceptance tests in `balance.sweep.test.ts` took several
minutes combined — a CI-flakiness risk for no per-commit benefit.
`balance.sweep.test.ts` was split:

- **FAST (always on, part of `npm test`):** a capped bot (40 towers, not all
  ~450 in-range tiles) that stops as soon as it reaches a modest target wave
  rather than playing to `gameOver` — proves "the game is winnable, not
  dying at wave 5" in a couple hundred milliseconds.
- **FULL (opt-in via `BALANCE_SWEEP=1 npm test`):** the original uncapped,
  play-to-`gameOver` measurements across the sweep's full seed set,
  including the wave 78–81 floor and the seed-4 known-concern finding above.

## Pending owner decision

The `START_BANK` change (**125 SOURCED → 250 INVENTED**) trades fidelity to
the original game's starting bank for a playable Plan-1 sim on placeholder
geometry. Whether to keep 250, revert to 125 and rebalance some other way, or
pick a different value entirely once Plan 2's real geometry lands is an
explicit **open product/fidelity decision for the project owner**, not
something this tuning pass or a future automated sweep should silently
re-decide. Recalibrate `START_BANK`/`GAMMA`/`ALPHA_BP` together against the
real track/tile layout in Plan 2 rather than assuming these values still
apply.

## References

- Sweep implementation and current acceptance thresholds:
  `src/game/test/balance.sweep.test.ts`.
- Tuned constants: `src/game/titles/circle-td/content.ts` (`START_BANK`),
  `src/game/titles/circle-td/balance.ts` (`GAMMA`, `ALPHA_BP`).
- Golden determinism fixture exercising a real (upgrading) defense:
  `src/game/test/determinism.test.ts` / `determinism.golden.json`.
- Full sweep narrative (gitignored, not authoritative outside this repo
  checkout): `.superpowers/sdd/2026-09-18-circle-td-plan-1-simulation/task-13b-report.md`.
