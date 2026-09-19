# Circle TD — balance-constant tuning (§5.4 sweep, 2026-09-18; re-tuned 2026-09-19)

**Status: current.** The constants below (`START_BANK=125`, `GAMMA=5`,
`ALPHA_BP=200`) are re-tuned against Plan 2's REAL spiral track/tile geometry
(`src/game/titles/circle-td/content.ts`) and the Task 3 by-maxHp bounty fix —
see "Real-geometry re-tune" further down for the full story. The sections
immediately below (through "Fast/slow test split") are kept as-is for
history: they document the ORIGINAL 2026-09-18 sweep against Plan 1's now-
replaced placeholder/INVENTED geometry (a square spiral with a uniform 24px
tile grid, explicitly disclaimed at the time as not matching the original's
visual layout). That sweep's own constants (`START_BANK=250`, `GAMMA=20`) no
longer apply — they broke on the real geometry (see below) and have been
superseded in `content.ts`/`balance.ts`.

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

## Pending owner decision — RESOLVED 2026-09-19

The `START_BANK` change (**125 SOURCED → 250 INVENTED**) traded fidelity to
the original game's starting bank for a playable Plan-1 sim on placeholder
geometry. This was left as an explicit open product/fidelity decision for
Plan 2, to be recalibrated once the real track/tile geometry landed. See
"Real-geometry re-tune" below for the resolution: **`START_BANK` is restored
to the SOURCED 125.**

## Real-geometry re-tune (Plan 2, Task 2+3, 2026-09-19)

Plan 2 replaced Plan 1's placeholder track/tiles with a real, deterministic
square-spiral board (`src/game/titles/circle-td/content.ts`): two closed
spiral loops (`TRACK.outer`, `TRACK.inner`), each built by tracing
concentric axis-aligned rectangles inward and closing with an explicit
return corridor, plus a buildable-tile set generated as cells flanking each
path segment on both sides (not a uniform grid over the whole stage). This
task also fixed the bounty formula (Task 3, final-review finding #6):
`bounty(wave, gamma)` (based on the *current wave*, letting a stale wave-1
creep killed at wave 50 pay a huge current-wave bonus, and underpaying
`CREEP_HARD` kills) became `bounty(maxHp, gamma) = max(1, floor(maxHp /
gamma))`, paid by the *killed creep's own* `maxHp` — `fireTowers` now calls
it with `c.maxHp[k]` instead of `s.wave`.

### Geometry, in numbers

- `TILE_SIZE = 32`px. `TILE_COUNT = 223` (was 450 on the placeholder),
  comfortably inside the brief's 120–400 sane range.
- All 223 tiles come back "in range of the Damage tower (125px) from some
  point on the track" — expected and correct-by-construction now (every
  tile is generated ~1 tile-width from its own flanked segment, always well
  under 125px), not a fidelity artifact the way "all 450 in range" was on
  the placeholder's uniform grid. What actually changed is that a single
  tower can no longer reach many *different, distant* sections of the path
  at once the way the placeholder's tightly-nested 30px rings allowed.
- Outer track length ≈ 6400px, inner ≈ 2780px (both axis-aligned throughout,
  including the closing wrap edge — no diagonal segments, unlike Plan 1's
  placeholder ruling R5).

### Why the old constants (`START_BANK=250`, `GAMMA=20`) broke on the new board

The placeholder's tile grid put many tiles within range of *multiple*
closely-spaced rings (30px apart, vs. tower ranges of 100–180px), so even 2–3
towers effectively covered several laps' worth of path at once. The real
geometry's flanking tiles only cover their own local segment (rings are
90px/55px apart, deliberately wider than the flank offset so coverage
doesn't bleed into the next ring — see content.ts's `MIN_CLEARANCE`). Concrete
measurement with the *same* best-affordable bot this file's `AFFORD_ORDER`
uses: `startBank=250, gamma=20` (the Plan-1 defaults) reaches only **wave
9** on the real geometry (18 towers placed) before the population cap ends
it — an 8–9x regression from the placeholder's wave 78–81, confirming the
old constants don't carry over.

### Sweep landscape (quick, targeted re-sweep — not the full original grid)

Measured with the new `bounty(maxHp, gamma)` formula, the existing
`AFFORD_ORDER` best-affordable bot, and the real geometry's 223 in-range
tiles, playing to `gameOver`:

| startBank | gamma | seed 20260918 | seed 1 | seed 2 | seed 3 | seed 4 |
|---|---|---|---|---|---|---|
| 125 | 20 (old default) | wave 5 | — | — | — | — |
| 125 | 10 | wave 6 | — | — | — | — |
| 125 | 8 | wave 6 (trap) | wave 50 | wave 51 | wave 54 | — |
| 125 | 7 | wave 49 | wave 49 | wave 54 | wave 50 | — |
| 125 | 6 | wave 54 | wave 56 | wave 59 | wave 5 (trap) | — |
| **125** | **5 (chosen)** | **wave 54** | **wave 58** | **wave 54** | **wave 54** | **wave 57** |
| 125 | 4 | wave 54 | wave 50 | wave 51 | wave 55 | — |
| 250 | 10 | wave 49 | — | — | — | — |
| 250 | 5 | wave 22 | — | — | — | — |

Two things stand out, both consistent with the Plan-1 sweep's own "chaotic
near threshold" finding (not a smooth monotonic economy dial):

1. **`gamma` has non-monotonic trap points.** `gamma=6` and `gamma=8` each
   trap at least one seed at wave 5–6 while their neighbors (5, 7) escape
   cleanly across all four sweep seeds — a discrete tipping point in the
   early-game affordability sequence, not a gradual curve.
2. **`gamma=5` is the most robust choice tested**: all four of the sweep's
   own seeds (20260918, 1, 2, 3) escape comfortably (wave 54–58), *and* it
   also fixes the historical seed=4 concern (wave 57) — see below.

### Chosen constants

| Constant | Old (placeholder geometry) | New (chosen) | File |
|---|---|---|---|
| `START_BANK` | 250 (INVENTED) | **125 (SOURCED, restored)** | `src/game/titles/circle-td/content.ts` |
| `GAMMA` | 20 (INVENTED) | **5 (INVENTED)** | `src/game/titles/circle-td/balance.ts` |
| `ALPHA_BP` | 200 (INVENTED) | **200 — unchanged, re-confirmed** | `src/game/titles/circle-td/balance.ts` |

**`START_BANK` decision: restored to 125 (SOURCED).** Per the task brief's
explicit preference ("restore 125 if winnable-and-climbing on the real
geometry with the maxHp bounty; only keep a higher tuned value if 125 is
genuinely unplayable"): 125 **is** winnable-and-climbing once paired with
`GAMMA=5` and the maxHp bounty fix — confirmed above (wave 54–58 across all
five tested seeds). No INVENTED bank figure is needed; the Plan-2 P3
fidelity question resolves in favor of the faithful value.

### Survival results (confirmatory, `AFFORD_ORDER` bot, all 223 tiles, play to `gameOver`)

With `startBank=125, gamma=5, alphaBp=200`:

| seed | 20260918 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| wave | 54 | 58 | 54 | 54 | 57 |

`hitCeiling: false` in every case — the game always ends via the population
cap, never the tick ceiling. Minimum across all five seeds: **wave 54** (vs.
wave 4 for pure banking — buying nothing — a ~13–14x margin). This is a
real, lower floor than the placeholder geometry's wave 78–81, and that's
expected and honest: the real geometry gives each tower narrower coverage by
design (§"Why the old constants broke" above), so a fair comparison is
against *this* board's own pure-banking baseline, not against the old
board's climbing ceiling.

**Seed=4, historical "known concern", now resolved.** Under the OLD
`bounty(wave, gamma)` formula (pre-Task-3), seed=4 stalled at wave 7 on the
placeholder geometry — an unexplained outlier versus the swept seeds'
wave 78+, tentatively attributed to `typeMul()`'s `CREEP_HARD` doubling not
being reflected in a bounty based only on the un-multiplied `hp(wave)`. The
Task 3 bounty-by-`maxHp` fix pays a Hard creep's kill by its actual (doubled)
`maxHp`, and that alone resolves it: seed=4 now reaches wave 57 on the real
geometry, in line with every other seed. It's folded into the main measured
seed set in `balance.sweep.test.ts` rather than kept as a separate
non-asserting observation.

### FAST per-commit guard (40-tower cap)

Re-measured with the new constants: the capped bot (40 towers, no upgrades,
`AFFORD_ORDER`) played to natural death reaches **wave 19–21** across the
guard's own two seeds (20260918, 1) — close to the placeholder geometry's
21–23, so the existing `targetWave=15`/`FLOOR=10` thresholds in
`balance.sweep.test.ts` didn't need to change, only the comment documenting
the measurement.

### Golden fixture regeneration

The scripted replay in `determinism.test.ts` needed a materially larger
opening than Plan 1's (2 Splash + 1 Damage, 3 towers) because that small a
defense now stalls at the population cap by wave 5–9 on the real geometry
(§"Why the old constants broke" above) — it now uses 12 core towers (a mix
of Fast/Air/Splash) spread across fractions (5%–60%) of the computed
in-range tile array, plus one throwaway tile (80% fraction) for the
place-then-sell exercise, continuously upgraded thereafter. Regenerated via
`UPDATE_GOLDEN=1 npx vitest run src/game/test/determinism.test.ts` and
re-run to confirm it pins:

- **hash:** `649c63da`
- **score:** 1960 (> 0 ✓)
- **wave:** 36 (≥ 20 ✓, well clear of the requirement)
- **maxTowerLevel:** 9 (> 0 ✓)

### Method note

This was a quick, targeted re-sweep (a handful of `gamma` values at
`startBank ∈ {125, 250}`, using the existing `AFFORD_ORDER` bot) rather than
a repeat of the Plan-1 sweep's full 3×5×3 grid — the real geometry's
qualitative behavior (narrower per-tower coverage, same "gamma is the real
unlock" pattern) was already established by the Plan-1 sweep's method, and
the goal here was finding a robust `gamma` for the restored `startBank=125`,
not re-deriving the whole grid from scratch.

## References

- Sweep implementation and current acceptance thresholds:
  `src/game/test/balance.sweep.test.ts`.
- Tuned constants: `src/game/titles/circle-td/content.ts` (`START_BANK`,
  `TILE_SIZE`, `TILE_COUNT`), `src/game/titles/circle-td/balance.ts`
  (`GAMMA`, `ALPHA_BP`, `bounty`).
- Golden determinism fixture exercising a real (upgrading) defense:
  `src/game/test/determinism.test.ts` / `determinism.golden.json`.
- Full Plan-1 sweep narrative (gitignored, not authoritative outside this
  repo checkout): `.superpowers/sdd/2026-09-18-circle-td-plan-1-simulation/task-13b-report.md`.
- Plan-2 Task 2+3 report: `.superpowers/sdd/2026-09-18-circle-td-plan-2-mvp/task-2-3-report.md`
  (gitignored, not authoritative outside this repo checkout).
