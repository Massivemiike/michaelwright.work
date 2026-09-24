# Arcfire Plan 2A — Weapons: final design

**Status:** final synthesized design for Plan 2A, **revised with the owner's decisions of 2026-09-23** (Revision 2, logged at the end), ready to be turned into a plan. **Base:** `worktree-games+arcfire` = master `2f9e6ba` (Plan 1 merged).
**Authority:** the spec, `docs/superpowers/specs/2026-09-22-arcfire-design.md` (§2 rules, §3 sim model, §4 weapons, §5 AI budgets, §8 testing, §9.1 carry-forwards). Where this design changes a spec *shape* it says so (§2.4, §10), and the last task syncs the spec.

**Scope (2A):**
- every spec §4.1 primitive;
- the 24 new roster entries (indices 8–31), appended after Plan 1's 0–7;
- a Timeline event for every primitive;
- every spec §9.1 Plan 2 carry-forward;
- the golden re-pin.

**Out of scope (2B):** the AI tiers, the draft AI, the Web Worker, vs-AI replay and the balance harness. §11 lists what 2A hands them.

**Base design:** the "minimal" design, which won all three reviews. Every defect the judges found in it is fixed here, and the best ideas of the "engine" and "feel" designs are grafted in. §12 (Provenance) records what came from where.

**How to read the code:** every code block marked *(verbatim)* is copied mechanically from a throwaway prototype of this exact design. The prototype passed the checks in §1 and was then deleted. Transcribe those blocks exactly: the hashes in §1 and §7 are the transcription checks, and a single changed constant or operator moves them.

**Owner decisions (2026-09-23), all applied below** (§10.1 has each one with its measured effect):
- **Beams are long and can aim down** (O1): Lancer and Prism reach 1,200 px, and read the command angle on the *beam dial*, `beamDir` (D19).
- **Homing keeps the spec numbers** (O2): Seeker ≤ 2°/step, Swarm ≤ 1°/step after the apex, with no lock radius and no turn budget.
- **Dig is pitch-clamped** (O3): along travel, but never steeper than 30° below level (D20).
- **The quake spares its shooter** (O9): horizontal reach as before, and the shooter's own tank takes no shockwave damage (D21).
- **The bounce normal uses a radius-8 disc** (O15, D9).
- Every other owner item takes its stated default.

---

## 0 · Decisions at a glance

| # | Decision | Why |
|---|---|---|
| D1 | **Only shells and delay timers take simulated time.** Blast, split, roll, dig, burn, build, quake and beam apply **instantly** at their trigger step, in closed form or one bounded pass | Fewest mechanisms and the smallest ordering surface; the cheapest model for 2B's thousands of sims per turn |
| D2 | **One step loop with a written order** (§3.2): due delays fire first, then shells step in creation order. Effects apply at once, in list order, and children first move on the next step | These rules are the whole determinism contract for weapons |
| D3 | `bounce` and `homing` are **Stage flight modifiers** handled inside `stepShell`; they are not Effects | They change how a shell flies, not what it does when it arrives |
| D4 | **Apex = the first step a *rising* shell stops rising**: `vy < 0` before the step's gravity and `vy ≥ 0` after it. A shell launched level or downward never apexes | No muzzle bursts, so no step-1 self-hits from apex weapons |
| D5 | **`Stage.early`**: what an apex weapon does if it hits something before its apex (for the roster: one child's blast). Omitted, it is a `dud` | Hydra hitting a hill while still rising no longer stacks 5 heavies (150 damage) on one point |
| D6 | **Spawn-inside rule:** a shell spawned inside a tank's hitbox ignores that tank until a sample leaves it (the `ignore` bitmask) | Barrage's line offsets can put a child inside a hitbox; without the rule it would hit that tank on its first sample |
| D7 | **Directions for any integer degree** come from the existing baked table by exact symmetry (`cosDeg`/`sinDeg`); there are no new literals | Needed by volleys below the horizon, "up"/"cone" splits, the homing rotation, beams on the beam dial (D19) and the dig clamp (D20) |
| D8 | **Homing without an arctangent:** turn `k = min(N, ⌊angle to target⌋)` whole degrees. `⌊angle⌋` is found by comparing tangents with the table: `|cross|·cos k < dot·sin k` | It never overshoots, so there is no snap and no wobble, and every product stays below 2^52 for validator-legal data (§4.4) |
| D9 | **Bounce normal = minus the centroid of the solid pixels** in a radius-8 disc (`BOUNCE_PROBE_R = 8`, ≤ 197 `isSolid` probes; owner decision O15). Reflect with `v − 2n(v·n)/(n·n)` and keep `restitutionPct` of the speed | One rule for overhangs, tunnel roofs and the floor; exact integers, no sqrt. Exact on flat ground and at 45°; within 2.3° of the ideal reflected heading on slopes of 1:10 and steeper. On 1:20 and gentler slopes the 1-px staircase still shows (up to 9.6° off, against 25.2° at radius 4) |
| D10 | Roll and fire flow share one **surface walker**. Dig and beam share one **capsule carve** (one `removeInterval` per column) | Fewer primitives to get right |
| D11 | **`MatchSettings.rosterSize`**: the draft pool is drawn from `ROSTER[0, rosterSize)`. The field is validated and folded into `hashMatch` | Match goldens, replays and resume blobs become immune to roster appends |
| D12 | **Exact-distance damage** (§4.3), computed exactly in integers | The floored `isqrt` overstated damage by up to 17 points (Needle). The golden is being re-pinned anyway, and it is 0 mismatches against a BigInt reference |
| D13 | **Volleys are never clamped** near 0°/180°: the fan stays symmetric about the aim, and edge shells may leave below the horizon | Removes Plan 1's stacking (3 of Fan's 5 shells on one path at 0°) and keeps one fan shape for every aim |
| D14 | **Pixels are floored** (`floorPx`) in `stepShell`, not truncated toward zero | The left edge becomes exactly x = 0 (spec §9.1) |
| D15 | **Flight cap per shell** (1,200 of its own steps, bounces included). There is a turn **backstop** of 4,800 steps and 64 shells, and a static per-weapon bound (roster maximum 3,600 steps and 13 shells) that a test enforces | Children get a full flight, and termination holds even for bad data |
| D16 | **Weapons consume no RNG** (tested) | A candidate's outcome depends only on (state, command), so AI search and replay stay trivial |
| D17 | **Presentation timing without sim coupling:** instant effects carry `dur` (display steps at fixed presentation rates), and the blasts, damage and exits they cause carry `lag` | Plan 3 can animate a roll, flow, tunnel or wave and land its blast on time, and the rates are never hashed |
| D18 | **Pins that survive appends:** a per-weapon-id corpus hashed with `hashBoard` (no settings, pool, hands or RNG), per-weapon definition digests, and a full-roster golden with literal settings (`rosterSize: 32`) | An append only adds keys; a failing key names the weapon |
| D19 | **The beam dial** (owner decision O1). A beam's command angle is read on the shell dial turned a quarter turn toward the shooter's facing: `beamDir(shooter, angle)` = `angle − 90` for player 0 (faces right), `angle + 90` for player 1 (faces left). Lancer and Prism are 1,200 px | 90 fires level at the opponent; each player's usual half of the dial aims level-to-straight-down, the other half level-to-straight-up. The wire angle stays an integer 0..180, rotating the dial turns a beam the same way as a shell, and the mirror of a command is `180 − angle` for shells and beams alike (§4.6) |
| D20 | **Dig pitch clamp** (owner decision O3). A tunnel follows the travel direction at impact, but never steeper than `DIG_MAX_PITCH = 30°` below level: a steeper heading is replaced by exactly 30° in the same horizontal sense (toward the opponent if there is none). Upward and shallower headings are kept | A falling shell no longer tunnels straight down. Integer-exact: one table comparison, no arctangent (§4.6) |
| D21 | **The quake spares its shooter** (owner decision O9). The shockwave's reach is horizontal (unblockable, crosses chasms), and it damages only the opponent. Aftershock's separate impact blast still follows the normal blast rules | A quake near home is no longer a self-inflicted loss; its blast still is (§4.6) |

---

## 1 · How this design was validated

The whole design was built as a throwaway prototype: a copy of the Plan 1 sim with every change in this document applied. It was run with vitest, esbuild + Node 24, and Playwright, then deleted. For Revision 2 (the owner decisions), every number below was re-measured on a prototype with the decisions applied. That prototype was then rebuilt mechanically from this document's blocks: the rebuild's sources matched it byte for byte, and it reproduced every pin. Both were deleted.

**Plan 1 behaviour is preserved.**
- The Plan 1 suite (85 tests) was run on the final code, with `rosterSize: 8` added to its settings literals (edit 1 of §8.3): 80 pass. The other 5 are exactly the declared edits: the golden and windless re-pins, `resolve.test` "Fan" `[51,0] → [50,0]`, and the two Plan-1 roster assertions.
- Two further test edits are type-only (§8.3). After them, `tsc --strict` is clean and the purity-guard regexes find nothing in any new source.

**Stage hashes (transcription checks, §7.2).** None of them moved in Revision 2: the owner decisions touch only weapons 14–31.
- The golden stays `63222780` through T2 step 1 (`rosterSize` plumbed, not folded), then goes → `4c1d8598` (the fold) → `389a1340` [31, 83] (exact damage). Its command log is identical to Plan 1's throughout.
- The windless pin goes `1c8832e9` → `8d7dc831` (the fold), scores [36, 24] and winner 0 throughout.
- Exact damage alone on Plan 1 gives `b5fcdcd8`, which matches the engine design's claim; floor + unclamp on top of it leaves both pins unchanged.
- The rewritten engine (new loop and all 32 primitives) reproduces the post-carry-forward state bit for bit: **0 of 123** Plan-1-weapon corpus cases moved.

**The corpus** (§8.4) is 483 cases for 32 weapons (15 per weapon plus 3 specials).
- Its digest at each stage: `09403dbb` (Plan 1) → `655486aa` (exact damage: exactly 4 cases, points only, each lower) → `fa6b1ed7` (floor + unclamp: exactly 11 cases) → **`a7100140`** (all 32 weapons).
- It exercises every event kind except `dud`, which has a unit test; `dud` is unreachable for the roster.
- It reaches the flight cap, fires volley shells at −7° and 187°, and scores with a beam (Lancer fired level, at 90, on the hills).

**The full-roster golden** (seed 20260927, daily-challenge settings with `rosterSize: 32`):
- **`3f614265`**, scores [359, 448], winner 1, 40 commands (20 picks, 20 shots);
- all 12 tags fired;
- about 0.36 s to generate and replay inside vitest.

**Cross-engine.** The bundled prototype reproduced the corpus digest `a7100140`, the golden `389a1340` and the full golden `3f614265` in **Chromium and WebKit**, as Node does. Firefox cannot launch locally (`spawn UNKNOWN`, a known Plan 1 environment issue) and runs in CI.

**Exact damage.** Over 81,276 samples covering all 33 roster blasts across their whole reach, it had **0 mismatches** against a BigInt reference. It is never above the floored formula; the floored formula overstated damage by up to 17 points (Needle at offset (21, 9): 39 against an exact 23).

**Invariant sweep.** All 32 weapons × the 5 sweep boards × 114 aims = 18,240 turns, with **0 violations** of any of these:
- the recorded and quiet paths give identical hashes and points;
- `m.rng.state` is untouched;
- every height is an integer in [0, 500];
- events are sorted by step;
- steps and shell counts stay within each weapon's static bound (observed maxima 1,200 steps and 13 shells).

The **5 sweep boards** are the corpus seed's hills with player 0 shooting in wind 0, +40 and −40, the same hills with player 1 shooting, and flat ground at 400 with tanks at 300 / 700. The **114 aims** are angle 0..180 step 10 × power 0..100 step 20.

**Properties.**
- **Homing** (2,000 random cases): every turn is ≤ N°, give or take under 0.001° of table rounding, and never passes the target.
- **`addInterval`** (300 random columns × 14 operations): it is a union, never loses dirt, and keeps ≤ 8 disjoint, non-touching spans.
- **`carveCapsule`** equals a brute-force union of discs on 60 random segments. At zero length it equals `carveCircle`.
- **Degenerate and cyclic definitions** resolve without throwing, to integer state.
- **Beams are mirror-exact:** on a mirrored board, player 1 at `180 − angle` scores the mirrored points and leaves the mirrored terrain, for Lancer and Prism, above and below level.

**Cost** is in §4.8. Measured as production runs it (bundled): every weapon's mean `resolveTurn` is 0.026–0.128 ms (the slowest is Prism's three 1,200 px beams); Pulse's is 0.026 ms against the spec's 0.2 ms.

**Owner-decision measurements** (§10.1) use the **blind grid**: 20 seeded hills boards (seeds 1–20, tanks at spawn 840 px apart, wind off) × both shooters. Shells fire at every angle 5..85 step 2 toward the opponent (`180 − a` for player 1) × power 30..100 step 2: 59,040 shots per weapon. Beams ignore power, so they fire at every command angle whose beam points at the opponent's side: all 181 on the beam dial (7,240 shots), or the 91 on the facing half under the old absolute aim (3,640 shots).

**Revision 2 check.** The prototype was rebuilt mechanically from this document's blocks after the owner decisions were applied.
- `tsc --strict` is clean, and the purity-guard patterns find nothing.
- All 166 prototype tests pass: the Plan 1 suite as edited by §8.3, every §8.1 test, the final `roster.test.ts`, the corpus, both goldens, the perf test and the purity guard. The T5 `roster.test.ts` version (§8.2) passes too.
- It reproduces the golden `389a1340` [31, 83], the windless pin `8d7dc831` [36, 24], the Fan test [50, 0], the full-roster golden `3f614265` [359, 448] and the corpus `a7100140` (483 cases).

---

## 2 · Data model (deliverable a)

### 2.1 `weapons/types.ts` *(verbatim, full file)*

```ts
// src/game/titles/arcfire/weapons/types.ts
//
// Data-driven weapon definitions (spec §4.1). A weapon is a Launch (shells or
// beams) plus, for shells, a Stage: WHEN it triggers (impact or apex), HOW the
// shell flies until then (optional bounce and homing), and WHAT it does
// (effects, applied in array order at the trigger point). Pure data: the
// only weapon code is weapons/primitives.ts and ballistics.ts.

export type Tag =
  | "BLAST" | "VOLLEY" | "SPLIT" | "BOUNCE" | "ROLL" | "DIG"
  | "FIRE" | "DIRT" | "BEAM" | "HOMING" | "QUAKE" | "SPECIAL";

export interface Blast {
  radius: number; // px, >= 1
  damage: number; // points when the blast overlaps the hitbox
  falloff?: "linear" | "quadratic"; // default linear
}

export interface ShellLaunch {
  kind: "shell";
  count?: number; // shells in the volley (default 1)
  spreadDeg?: number; // TOTAL angular spread across the volley (default 0); never clamped
  speedPct?: number; // launch speed scale (default 100)
  gravityPct?: number; // gravity scale (default 100); children inherit it
}

export interface BeamLaunch {
  kind: "beam"; // straight lines from the muzzle, aimed on the beam dial (beamDir: can point down); ignore power, gravity and wind
  count?: number; // beams (default 1)
  spreadDeg?: number; // TOTAL angular spread across the beams (default 0)
  length: number; // px, >= 1
  width: number; // px, 2..12 (carves a width/2-radius capsule; <= 12 so a beam can never touch its own hitbox)
  damage: number; // flat points to each tank a beam passes within width/2 of
}

export type Launch = ShellLaunch | BeamLaunch;

export interface Split {
  count: number; // children, >= 1
  spreadDeg: number; // TOTAL fan across the children (0 = all parallel)
  speedPct: number; // % of the base speed (see `from`)
  // up:    a fan about straight up at the parent's nominal speed (impact splits: Cascade, Shrapnel)
  // ahead: a fan about the parent's current velocity, at its current speed (apex splits: Hydra, Barrage)
  // cone:  the parent's current velocity PLUS a fan about straight down at the parent's
  //        nominal speed — a burst carried by the parent's motion (Hailstorm)
  from: "up" | "ahead" | "cone";
  gapPx?: number; // spawn the children in a horizontal line this far apart, centred on the parent (Barrage)
  child: Stage;
}

export type Build =
  | { shape: "ball"; radius: number } // a disc of dirt centred on the impact
  | { shape: "wall"; width: number; height: number } // each column's surface rises by `height`
  | { shape: "level"; radius: number }; // columns within ±radius become solid exactly from the impact y down

export interface Roll { maxDistance: number; then: Blast } // px along the ground
export interface Dig { length: number; width: number; blastEvery?: number; each?: Blast; then?: Blast } // along travel, never steeper than DIG_MAX_PITCH below level
export interface Burn { flow: number; pool: number; damage: number; split?: boolean }
export interface Quake { reach: number; damage: number; furrow: number } // reach is horizontal; the shockwave never hurts the shooter

/** What a delay may schedule. None of these creates a shell or another delay, so every armed delay fires once and adds nothing that waits. */
export type DelayableEffect =
  | { blast: Blast }
  | { roll: Roll }
  | { dig: Dig }
  | { burn: Burn }
  | { build: Build }
  | { quake: Quake };

export interface Delay { steps: number; then: DelayableEffect[] }

export type Effect = DelayableEffect | { split: Split } | { delay: Delay };

export interface Bounce {
  times: number; // reflections before the stage triggers
  restitutionPct: number; // speed kept per reflection, 1..100
  blastEach?: Blast; // detonated at every reflection point
  walls?: boolean; // true: reflect off the world's side walls instead of the terrain (Ricochet)
}

export interface Stage {
  // impact: the first terrain or tank contact that isn't consumed by a bounce.
  // apex: the first step a RISING shell stops rising (vy < 0 before the step's
  //       gravity, vy >= 0 after it). A shell launched level or downward never apexes.
  on: "impact" | "apex";
  effects: Effect[];
  early?: Effect[]; // on "apex" only: applied instead when the shell hits something before its apex (omitted = a dud)
  homing?: { degPerStep: number }; // on "impact" only: once past the apex, turn <= this many whole degrees per step toward the enemy
  bounce?: Bounce; // on "impact" only
}

export interface WeaponDef {
  id: string;
  name: string;
  tag: Tag;
  tier: 1 | 2 | 3;
  power: number; // draft score 1..100 (the balance harness rewrites these)
  launch: Launch;
  stage?: Stage; // required for shell launches; beams have none
}
```

### 2.2 `MatchState` additions

**One field**, in the frozen settings. There is nothing else: every effect resolves inside its turn, and between turns the only persistent consequences are `terrain.height` and `scores`, which Plan 1 already hashes and clones.

- **No lingering fire:** a burn deals its damage in the turn it lands.
- **No stored timers:** Twin Nova's second blast lands in the same turn, 30 steps later.
- **No weapon RNG.**

`hashMatch` and `cloneMatch` therefore stay complete by construction. `state.ts` *(verbatim, full file)*:

```ts
// src/game/titles/arcfire/state.ts
//
// The complete Arcfire match state (spec §3.4). Everything the sim needs lives
// here and nowhere else: it is exactly what hashMatch() digests and what
// cloneMatch() copies for AI search and previews. Integer-only.
import type { Rng } from "@/game/sim/math/rng";
import type { Tag } from "./weapons/types";
import { cloneTerrain, type Terrain } from "./terrain";

export type Phase = "draft" | "battle" | "suddenDeath" | "over";

export interface MatchSettings {
  weaponsEach: number; // 10 normally, 5 for short free play
  poolSize: number; // 24 for 10 each, 12 for 5 each; must be >= 2 × weaponsEach
  wind: boolean; // seeded per-turn wind (free-play toggle)
  guaranteeTags: readonly Tag[]; // the pool always holds >= 1 weapon of each (spec: BLAST, SPLIT, DIRT)
  rosterSize: number; // the pool is drawn from ROSTER[0, rosterSize): pins a match to a roster prefix, so appends never move it
}

/** The daily challenge and default free play (spec §2): 10 weapons each from a 24-weapon pool. */
export const STANDARD_SETTINGS: MatchSettings = Object.freeze({
  weaponsEach: 10,
  poolSize: 24,
  wind: false,
  guaranteeTags: Object.freeze(["BLAST", "SPLIT", "DIRT"] as Tag[]),
  rosterSize: 32, // a literal, NOT ROSTER.length: a roster append must be a deliberate settings + simVersion change
});

/** Short free play: 5 each from a pool of 12. */
export const SHORT_SETTINGS: MatchSettings = Object.freeze({ ...STANDARD_SETTINGS, weaponsEach: 5, poolSize: 12 });

export interface MatchState {
  settings: MatchSettings;
  rng: Rng;
  phase: Phase;
  terrain: Terrain;
  tankX: Int32Array; // [2] each tank's centre column
  movesLeft: Int32Array; // [2]
  pool: number[]; // roster indices, ascending — a pool index is a position in this array
  poolOwner: Int32Array; // [pool.length] -1 = available, else the player (0/1) who drafted it
  firstPicker: number; // 0/1 from the seeded coin flip; the OTHER player shoots first
  picksMade: number;
  hands: [number[], number[]]; // each player's unfired roster indices, ascending
  shooter: number; // whose turn it is in battle / sudden death
  shotsFired: number; // resolved turns so far (battle + sudden death)
  wind: number; // this turn's wind, px/s² (0 when wind is off)
  scores: Int32Array; // [2]
  winner: number; // -1 undecided, 0 or 1, or 2 for a draw
}

/** A deep copy for AI search and previews. `settings` is frozen by createMatch, so it is shared, not copied. */
export function cloneMatch(m: MatchState): MatchState {
  return {
    ...m,
    rng: { state: m.rng.state },
    terrain: cloneTerrain(m.terrain),
    tankX: m.tankX.slice(),
    movesLeft: m.movesLeft.slice(),
    pool: m.pool.slice(),
    poolOwner: m.poolOwner.slice(),
    hands: [m.hands[0].slice(), m.hands[1].slice()],
    scores: m.scores.slice(),
  };
}
```

`match.ts` validates the field and drafts from the prefix. These are the only two changes to `createMatch`:

```ts
  if (!Number.isInteger(settings.rosterSize) || settings.rosterSize < settings.poolSize || settings.rosterSize > ROSTER.length) {
    throw new RangeError(`createMatch: rosterSize ${settings.rosterSize} must be an integer in [poolSize, ${ROSTER.length}]`);
  }
  // ...
  const pool = drawPool(rng, ROSTER.slice(0, own.rosterSize), own.poolSize, own.guaranteeTags);
```

`hash.ts` folds the new field right after `guaranteeTags.length`. The position is part of the transcription check (§7.2):

```ts
    s.weaponsEach, s.poolSize, s.wind ? 1 : 0, s.guaranteeTags.length, s.rosterSize,
```

**Why fold it** (a judge noted that the drawn pool is already hashed): spec §3.4 defines `hashMatch` as FNV-1a over *every integer field* of the state, and `rosterSize` is one. The other integer settings are already folded. The cost is one re-pin (§7), done in the same task as the plumbing.

**What the fold does not do.** It does not make the hash identify the settings. Plan 1 folds only `guaranteeTags.length`, not which tags, so two settings that differ only in their guaranteed tags hash equal whenever they draw the same pool.
- That is harmless for replay verification and for desync detection. The tags act only through `drawPool`, once, inside `createMatch`, and the pool it draws is hashed. `rosterSize` is the same kind of field; it is folded only because it is an integer.
- If sub-project 2 wants the hash to identify the settings themselves, fold the tag codes in the same T2 step-2 re-pin (K11). That costs no extra golden move, but every `hashMatch` value in this document would then have to be taken from the run instead of copied. That covers §1, §7.2, §7.3 and §8.5, but not the corpus, which hashes the board only.

`applyTurn` needs no change: a hand only ever holds indices below `rosterSize`, and Pulse (index 0) is always inside.

### 2.3 `constants.ts` additions *(verbatim)*

```ts
// --- weapons (Plan 2A, spec §4)
export const MAX_TURN_STEPS = 4800; // backstop on one turn's steps; the roster's static bound (3,600) never reaches it
export const MAX_SHELLS = 64; // backstop on the shells one turn may create; the roster's static bound (13) never reaches it
export const MAX_STAGE_DEPTH = 4; // stage nesting a WeaponDef may use (Cascade uses 3)
export const BOUNCE_PROBE_R = 8; // px: the disc sampled for a bounce's surface normal (8 reads gentle slopes, not their 1 px steps)
export const ROLL_PROBE = 6; // px either side sampled to find the downhill direction (roll, burn)
export const DIG_MAX_PITCH = 30; // degrees: a tunnel never dives steeper than this below level
```

The presentation rates for instant effects live in `timeline.ts` (§6), not here, because they are never simulated.

### 2.4 Shape deviations from the spec §4.1 sketch

The last task syncs all of these into the spec. They are small, and every §4.2 behaviour stays expressible.

1. `bounce` moves from `Effect` to `Stage` (D3). Ricochet reflects in flight, before any impact, which an impact-triggered effect cannot express.
2. `Split` gains `from: "up" | "ahead" | "cone"` and `gapPx`: the Hailstorm cone and the Barrage line without special-case code.
3. `Stage` gains `early` (D5). `homing` and `bounce` are valid only on impact stages, and `early` only on apex stages.
4. `build` becomes a discriminated union, so no required size can be missing.
5. `delay.then` is `DelayableEffect[]`: a delay can never create a shell or another delay, so every armed delay fires exactly once and adds nothing that waits.
6. `WeaponDef.stage` is optional, because beams have none.
7. `MatchSettings.rosterSize` is added (D11).

The owner decisions also settle four *behaviours* that spec §4.2 states differently or leaves open; T14 records them in the spec too:
- Lancer and Prism are 1,200 px (spec: 700 and 600), and a beam reads the command angle on the beam dial, `beamDir` (D19), so it can aim below level;
- a dig tunnels along travel but never steeper than 30° below level (D20);
- a quake's shockwave never damages the shooter (D21);
- the bounce normal samples a radius-8 disc (D9).

---

## 3 · The `resolveTurn` architecture (deliverable b)

### 3.1 Entities

Only two kinds of thing live across steps within a turn, both in a `Shot` object that exists for one turn:

- **Shells**, indexed in creation order. The index is the same as `Timeline.shells`. Muzzle shells come first, and split children are appended when spawned. Each shell carries its `Stage` (a parallel `stages[]`) and the flight-modifier fields armed from it at spawn: `stopAtApex`, `homeDeg` and its target, `bounces`/`wallBounces` with `restitutionPct`, and `ignore`.
- **Pending delays**, `{ at, trig, effects }`, in arming order.

Nothing else is an entity. Roll paths, fire flows, tunnels, quakes, builds and beams are computed in one bounded pass the moment they trigger (D1). Their duration is presentation only (D17).

### 3.2 The ordering rules (normative: part of the determinism contract; the goldens and corpus pin them)

1. **Launch.** Before step 1:
   - *Shells* are created in volley order `i = 0..count−1` at `aim + fanOffset(i)`, which runs from −spread/2 to +spread/2 and is never clamped. Each leaves from its own muzzle.
   - *Beams* resolve instead, before the loop and in beam order. Beam `b` flies along `beamDir(shooter, aim + fanOffset(b))` (D19). Each beam carves, then emits its event, then damages tank 0 and then tank 1. All of it is labelled step 1.
2. **Each step `s`, first:** the delays due at `s` fire, in the order they were armed. Their effects apply with `trig.step = s`.
3. **Then** every shell that existed at the start of step `s` and is alive calls `stepShell` once, in creation order.
4. **Inside `stepShell`**, in this order:
   - wind, then gravity;
   - the apex latch (an apex stage ends the step here, *before* moving);
   - the homing turn;
   - the ≤ 1 px swept samples. Each sample checks the side edges (wall bounce or `out`), then the tanks in index order (honouring `ignore`), then the terrain (bounce or impact).

   The first contact ends the step.
5. **A trigger applies its effect list completely, in list order**, before the next shell steps. Terrain edits are visible at once, to everything after them in the same step and in later steps.
6. **Spawns wait a step, and a spawn point is never tested.** A child created during step `s` is appended and first moves at `s + 1`. Its path's point 0 is its spawn point, at step `s`.
   - Like a muzzle point, the spawn point is not a sample. The child's first step tests its samples from the first one on, which is ≤ 1 px from the spawn point, with the usual side-edge, tank and terrain checks.
   - So a child spawned inside terrain (a Barrage line child whose `gapPx` offset lands in a hill) **impacts at its first sample** when that sample is solid: at `s + 1`, with its `fx, fy` still the spawn point.
   - If the first sample is free, the child flies on. That happens when it spawned on a surface pixel moving out, or when an earlier sibling's crater opened the spot that step.
   - A child spawned off the world is `out` at its first sample, unless that sample is back inside.
   - Tank hitboxes are the one exception: D6's `ignore` mask.
7. **A delay armed at step `s` fires at `s + max(1, steps)`**, per rule 2.
8. **Tanks are frozen during the shot.** Hitboxes are computed once, after the move and before the launch. Damage accumulates in `received[]` immediately (with its event); scoring happens after the settle.
9. **One blast = its carve, its `blast` event, then damage to tank 0, then tank 1** (Plan 1's order).
10. **Termination:** the loop ends when no shell is alive and no delay is armed. At `MAX_TURN_STEPS` everything still flying ends as `out`, and armed delays are dropped without an event of their own: a dropped delay is exactly a `fuse` whose `at` is later than `Timeline.steps` (§6.2). The terrain then **settles once** and the turn is **scored**.

### 3.3 Stage triggers and the `Trigger`

| Trigger | When | Effects applied |
|---|---|---|
| impact | the first terrain or tank contact not consumed by a bounce | `stage.effects` (impact stage) |
| apex | the latch step (D4); the shell dies without moving | `stage.effects` (apex stage) |
| early | an apex-stage shell hits terrain or a tank before its apex | `stage.early`, or a `dud` event if it has none |
| delay | step `at` (rule 7) | `delay.then` at the arming trigger's geometry |
| out | leaves a side edge with no wall bounce left, or reaches the per-shell cap | none (the shell is lost) |

What effects see:

| `Trigger` field | on impact / early | on apex |
|---|---|---|
| `x, y` | the first solid (or hitbox) pixel: Plan 1's blast centre | the shell's pixel |
| `fx, fy` (Fx) | the last *free* sample: children spawn here, roll and burn drop from here | the shell's position |
| `vx, vy` | velocity at the trigger (dig direction, the roll/burn tie-break, "ahead"/"cone" splits) | same |
| `speed` | the shell's nominal speed (the base of "up"/"cone" splits) | same |
| `gravityStep` | inherited by children | same |
| `tank` | the tank struck, or −1 | −1 |

### 3.4 Flight caps

- **Per shell:** `MAX_FLIGHT_STEPS = 1200` of **its own** steps, counted from launch or spawn, with bounce steps included. This is exactly Plan 1's rule for launched shells, and every child gets a full flight.
- **Per turn (backstops):** `MAX_TURN_STEPS = 4800` and `MAX_SHELLS = 64`. Spawns beyond 64 are dropped deterministically.
- **Static bound per weapon** (`validate.ts`): `maxTurnSteps(def)` counts 1,200 per stage generation plus the longest delay; `maxShells(def)` counts the split tree.
  - The roster test requires these to stay under the backstops.
  - The roster maximum is Cascade: 3 × 1,200 = **3,600 steps** and **13 shells**. Twin Nova is 1,230.
  - So the backstops only ever fire for invalid or cyclic data. A test proves they terminate it.
- **Termination is guaranteed:** every shell dies within 1,200 of its own steps, the shell count is capped, and each delay fires once and creates nothing that waits.

### 3.5 Recording the Timeline, and the quiet path

- **Recording.** `Shot.rec` gates every `ShellPath` point and every event, through `emit()`. `settle(t, collect)` skips building `falls` when not recording.
- **`resolveTurnPoints`** is 2B's fast path: the same state and points, with no paths or events. It is 5–10% faster than recording, and a parity test pins that the state is identical.
- **Event order.** Events are pushed in application order, so they are **sorted by step** (Plan 1's contract).
- **Within a step**, the order is: firing delays' events (in arming order), then each shell's events in shell order. A trigger's events follow its effect list; for example, Aftershock gives `blast`, `damage`, `quake`, `damage`.

### 3.6 `resolve.ts` *(verbatim, full file)*

```ts
// src/game/titles/arcfire/resolve.ts
//
// resolveTurn (spec §1.3): one whole turn — the optional move, then the shot —
// resolved to completion. It MUTATES the MatchState it's given; callers that
// need the original (AI search, previews) resolve a cloneMatch() copy. The
// caller (match.ts applyTurn) validates the command first.
//
// The step loop and its ORDER are part of the determinism contract:
//   step s = 1, 2, ...:
//     1. delays due at s fire, in the order they were armed;
//     2. every shell that existed at the start of the step and is alive moves
//        once (stepShell), in creation order; a shell that triggers applies
//        its effects at once, in list order (so a later shell this step sees
//        their terrain); children it spawns are appended and first move at s + 1;
//   until no shell is alive and no delay is armed (or MAX_TURN_STEPS). Then
//   settle once, then score. Beams resolve before the loop, at step 1.
import { fromInt } from "@/game/sim/math/fixed";
import { ROSTER } from "./weapons/roster";
import { launchShell, muzzle, stepShell } from "./ballistics";
import { settle, spansFromHeight } from "./terrain";
import { hitCircles, moveTarget } from "./tanks";
import { idiv, floorPx } from "./imath";
import { STEPS_PER_SEC, MAX_TURN_STEPS } from "./constants";
import { addShell, applyEffects, blastAt, emit, fanOffset, fireBeams, type Shot } from "./weapons/primitives";
import type { MatchState } from "./state";
import type { Timeline } from "./timeline";
import type { WeaponDef } from "./weapons/types";

export interface TurnInput {
  move: -1 | 0 | 1;
  weapon: number; // roster index
  angle: number; // integer degrees 0..180 (a beam reads it on the beam dial: weapons/primitives.ts beamDir)
  power: number; // integer 0..100
}

export function resolveTurn(m: MatchState, input: TurnInput): Timeline {
  return resolveWeapon(m, ROSTER[input.weapon], input, true);
}

/** resolveTurn without building the Timeline's paths or events: the same state and points, faster (AI search, verification). */
export function resolveTurnPoints(m: MatchState, input: TurnInput): [number, number] {
  return resolveWeapon(m, ROSTER[input.weapon], input, false).points;
}

/**
 * resolveTurn with the weapon passed in: the seam unit tests use to fire
 * synthetic WeaponDefs (and 2B's probe shell). `input.weapon` is only
 * recorded. `record = false` leaves `shells`, `events` and `settle.falls` empty.
 */
export function resolveWeapon(m: MatchState, def: WeaponDef, input: TurnInput, record = true): Timeline {
  const shooter = m.shooter;
  const tl: Timeline = {
    shooter,
    move: null,
    wind: m.wind,
    weapon: input.weapon,
    steps: 0,
    shells: [],
    events: [],
    settle: { heights: m.terrain.height, falls: [] }, // replaced by the settle below
    points: [0, 0],
  };

  // 1. The move happens first, on the settled terrain.
  if (input.move !== 0) {
    const nx = moveTarget(m, shooter, input.move);
    if (nx !== -1) {
      tl.move = { fromX: m.tankX[shooter], toX: nx };
      m.tankX[shooter] = nx;
      m.movesLeft[shooter]--;
    }
  }

  // 2. Launch: beams resolve at once (step 1); shells fan out from the muzzle.
  spansFromHeight(m.terrain);
  const shot: Shot = {
    t: m.terrain, tanks: hitCircles(m), shooter, shells: [], stages: [], live: 0, pending: [], received: [0, 0],
    rec: record, tl,
  };
  const launch = def.launch;
  if (launch.kind === "beam") {
    fireBeams(shot, launch, input.angle);
    tl.steps = 1;
  } else if (def.stage) {
    const count = launch.count ?? 1;
    for (let i = 0; i < count; i++) {
      const angle = input.angle + fanOffset(i, count, launch.spreadDeg ?? 0); // never clamped: may leave 0..180 near the horizon
      const mz = muzzle(shot.tanks[shooter].x, shot.tanks[shooter].y, angle);
      const s = launchShell(mz.x, mz.y, angle, input.power, launch.speedPct ?? 100, launch.gravityPct ?? 100);
      addShell(shot, s, def.stage, angle, -1, 0);
    }
  }

  // 3. The step loop.
  const windStep = idiv(fromInt(m.wind), STEPS_PER_SEC);
  for (let step = 1; shot.live > 0 || shot.pending.length > 0; step++) {
    if (step > MAX_TURN_STEPS) {
      abandon(shot, MAX_TURN_STEPS);
      break;
    }
    tl.steps = step;
    const n = shot.shells.length; // shells spawned during this step first move at step + 1
    for (let j = 0; j < shot.pending.length; ) {
      const p = shot.pending[j];
      if (p.at !== step) {
        j++;
        continue;
      }
      shot.pending.splice(j, 1);
      applyEffects(shot, { ...p.trig, step }, p.effects);
    }
    for (let i = 0; i < n; i++) {
      const s = shot.shells[i];
      if (!s.alive) continue;
      const hit = stepShell(s, shot.t, shot.tanks, windStep);
      const path = record ? tl.shells[i].points : null;
      if (hit === null) {
        if (path) path.push(floorPx(s.x), floorPx(s.y));
        continue;
      }
      if (!s.alive) shot.live--;
      if (hit.kind === "bounce") {
        if (path) path.push(floorPx(s.x), floorPx(s.y));
        emit(shot, { step, kind: "bounce", shell: i, x: hit.x, y: hit.y, wall: hit.wall });
        const each = shot.stages[i].bounce?.blastEach;
        if (each) blastAt(shot, each, hit.x, hit.y, step, i, 0);
        continue;
      }
      if (hit.kind === "out") {
        if (path) path.push(hit.x, hit.y);
        emit(shot, { step, kind: "out", shell: i, x: hit.x, y: hit.y, lag: 0 });
        continue;
      }
      if (hit.kind !== "apex" && path) path.push(hit.x, hit.y);
      const stage = shot.stages[i];
      let effects = stage.effects;
      if (hit.kind !== "apex" && stage.on === "apex") { // an apex weapon that hit something before its apex
        if (!stage.early) {
          emit(shot, { step, kind: "dud", shell: i, x: hit.x, y: hit.y });
          continue;
        }
        effects = stage.early;
      }
      applyEffects(shot, {
        step, shell: i, x: hit.x, y: hit.y, fx: hit.fx, fy: hit.fy, vx: s.vx, vy: s.vy,
        speed: s.speed, gravityStep: s.gravityStep, tank: hit.kind === "tank" ? hit.tank : -1,
      }, effects);
    }
  }

  // 4. Dirt settles once, after the whole shot.
  tl.settle = settle(m.terrain, record);

  // 5. Damage to the opponent scores for the shooter; self-damage scores for the opponent.
  const opp = 1 - shooter;
  tl.points[shooter] += shot.received[opp];
  tl.points[opp] += shot.received[shooter];
  m.scores[0] += tl.points[0];
  m.scores[1] += tl.points[1];
  return tl;
}

/** The turn backstop: everything still flying is lost at `step` and armed delays are dropped (their `fuse` events keep an `at` beyond tl.steps: playback's cue). */
function abandon(shot: Shot, step: number): void {
  for (let i = 0; i < shot.shells.length; i++) {
    const s = shot.shells[i];
    if (!s.alive) continue;
    s.alive = false;
    emit(shot, { step, kind: "out", shell: i, x: floorPx(s.x), y: floorPx(s.y), lag: 0 });
  }
  shot.live = 0;
  shot.pending.length = 0;
}
```

For a Plan 1 weapon this is exactly Plan 1's loop, give or take the D13/D14 carry-forwards: only muzzle shells, nothing pending, no modifier armed. The corpus proves it (§1: 0 of 123 moved).

---

## 4 · The primitives in integer math (deliverable c)

**Conventions.** `Fx` is Q16.16. y points down, and aim angles are measured anticlockwise on screen (0 = right, 90 = up). A *command* angle is always 0..180; shells fly at it, and beams at `beamDir` of it (D19).

**Why every division is exact.** Every `idiv` / `Math.floor(a / b)` has an integer numerator with |a| < 2^53, and a correctly rounded `a/b` below 2^53 cannot round across an integer, so the quotient is exact. Every product's bound is noted at its site.

**Limits on data.** No `Math.*` beyond `trunc`, `floor`, `sqrt` (only inside `isqrt`), `abs`, `max` and `min`; no `**`; no trig outside the baked table. Words the purity guard bans do not appear even in comments.

### 4.1 Integer helpers

`aimTable.ts` gains full-circle directions, by exact symmetry of the 91 baked literals (append; `aimCos`/`aimSin` keep their clamp for existing callers) *(verbatim)*:

```ts
const norm360 = (deg: number): number => {
  const d = (deg | 0) % 360;
  return d < 0 ? d + 360 : d;
};

/** Q16.16 cos of ANY integer angle (aim sense: 0 = right, 90 = up, 270 = down), by exact symmetry of the baked table. */
export const cosDeg = (deg: number): Fx => {
  const d = norm360(deg);
  return d <= 180 ? COS[d] : COS[360 - d];
};

/** Q16.16 sin of ANY integer angle; negative below the horizon. `0 - x`, so it never yields negative zero. */
export const sinDeg = (deg: number): Fx => {
  const d = norm360(deg);
  return d <= 180 ? SIN[d] : 0 - SIN[360 - d];
};
```

On 0..180, `cosDeg`/`sinDeg` equal `aimCos`/`aimSin` bit for bit. That is why switching `muzzle` and the launch to them is inert for every legal command.

`imath.ts` gains *(verbatim)*:

```ts
/** The pixel containing a Q16.16 coordinate: floor, so x in (-1, 0) is column -1, off the world. Exact: f / 65536 is exact in binary64. */
export const floorPx = (f: number): number => Math.floor(f / 65536);

/** ceil(a / b) for integers a >= 0 and b >= 1. */
export const ceilDiv = (a: number, b: number): number => idiv(a + b - 1, b);
```

### 4.2 Terrain operations: `terrain.ts` *(verbatim, full file)*

What changes from Plan 1:
- `removeInterval` is exported and allocation-free: it uses a module scratch buffer, and Plan 1's keep-the-lowest-8 overflow rule is unchanged.
- New: `addInterval` (a union that **never loses dirt**), `carveCapsule`, `groundBelow` and `surfaceTop`.
- `settle` gains a `collect` flag.
- `carveCircle` is byte-identical, so the Plan 1 craters cannot move.

```ts
// src/game/titles/arcfire/terrain.ts
//
// Column terrain with collapsing dirt (spec §3.1). Between turns the terrain
// IS a heightfield: height[x] is the surface y of column x (y-down; solid from
// height[x] down to the floor at WORLD_H). During a shot each column may hold
// several solid spans — tunnels, overhangs, floating dirt — so projectiles
// collide with the real shape. settle() then drops every floating span onto
// the stack below it, which always collapses a column back to a single span,
// i.e. back to a heightfield. Integer px throughout.
import { nextRange, type Rng } from "@/game/sim/math/rng";
import {
  WORLD_W, WORLD_H, MAX_SPANS, TERRAIN_MIN_Y, TERRAIN_MAX_Y, TERRAIN_CTRL_MIN_Y, TERRAIN_CTRL_MAX_Y,
  TERRAIN_CTRL_STEP, TERRAIN_BLUR_R, TERRAIN_BLUR_PASSES, SPAWN_X, SPAWN_FLAT,
} from "./constants";
import { isqrt, clampInt, idiv } from "./imath";

export interface Terrain {
  height: Int32Array; // [WORLD_W] settled surface y per column
  spanCount: Int32Array; // [WORLD_W] live spans per column during a shot
  spans: Int32Array; // [WORLD_W * MAX_SPANS * 2] (top, bottom) pairs; top < bottom; ordered top-down
}

export interface SettleFall {
  x: number;
  top: number; // the span's top before it fell
  bottom: number; // the span's bottom before it fell
  fall: number; // px it dropped
}

export interface SettleResult {
  heights: Int32Array; // the new heightfield
  falls: SettleFall[]; // every span that moved, for the pour animation
}

const STRIDE = MAX_SPANS * 2;

// Scratch for the column edits: one column's pieces, at most MAX_SPANS + 1 of
// them. Module-level so an edit allocates nothing; the sim is single-threaded
// and no edit re-enters another.
const PIECES = new Int32Array(2 * (MAX_SPANS + 1));

export function makeTerrain(): Terrain {
  return {
    height: new Int32Array(WORLD_W),
    spanCount: new Int32Array(WORLD_W),
    spans: new Int32Array(WORLD_W * STRIDE),
  };
}

export function cloneTerrain(t: Terrain): Terrain {
  return { height: t.height.slice(), spanCount: t.spanCount.slice(), spans: t.spans.slice() };
}

/** Rebuild the in-shot spans from the settled heightfield: one span per column. */
export function spansFromHeight(t: Terrain): void {
  for (let x = 0; x < WORLD_W; x++) {
    if (t.height[x] >= WORLD_H) {
      t.spanCount[x] = 0;
      continue;
    }
    const o = x * STRIDE;
    t.spanCount[x] = 1;
    t.spans[o] = t.height[x];
    t.spans[o + 1] = WORLD_H;
  }
}

/** Seeded rolling hills: random control points, linear interpolation, box blur, clamp, then flatten both spawn pads. */
export function generateTerrain(t: Terrain, rng: Rng): void {
  const lo = TERRAIN_CTRL_MIN_Y;
  const hi = TERRAIN_CTRL_MAX_Y;
  const nCtrl = idiv(WORLD_W, TERRAIN_CTRL_STEP) + 1;
  const ctrl = new Int32Array(nCtrl);
  for (let i = 0; i < nCtrl; i++) ctrl[i] = lo + nextRange(rng, hi - lo + 1);
  const h = new Int32Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) {
    const i = Math.min(nCtrl - 2, idiv(x, TERRAIN_CTRL_STEP));
    const u = x - i * TERRAIN_CTRL_STEP;
    h[x] = ctrl[i] + idiv((ctrl[i + 1] - ctrl[i]) * u, TERRAIN_CTRL_STEP);
  }
  for (let p = 0; p < TERRAIN_BLUR_PASSES; p++) boxBlur(h, TERRAIN_BLUR_R);
  for (let x = 0; x < WORLD_W; x++) h[x] = clampInt(h[x], TERRAIN_MIN_Y, TERRAIN_MAX_Y);
  for (const sx of SPAWN_X) {
    const level = h[sx];
    for (let x = sx - SPAWN_FLAT; x <= sx + SPAWN_FLAT; x++) h[x] = level;
  }
  t.height.set(h);
  spansFromHeight(t);
}

function boxBlur(h: Int32Array, r: number): void {
  const src = h.slice();
  for (let x = 0; x < WORLD_W; x++) {
    let sum = 0;
    for (let k = x - r; k <= x + r; k++) sum += src[k < 0 ? 0 : k >= WORLD_W ? WORLD_W - 1 : k];
    h[x] = idiv(sum, 2 * r + 1);
  }
}

/** Is (x, y) solid? Columns outside the world are empty; everything at or below the floor is solid. */
export function isSolid(t: Terrain, x: number, y: number): boolean {
  if (x < 0 || x >= WORLD_W) return false;
  if (y >= WORLD_H) return true;
  const o = x * STRIDE;
  const n = t.spanCount[x];
  for (let i = 0; i < n; i++) {
    if (y >= t.spans[o + i * 2] && y < t.spans[o + i * 2 + 1]) return true;
  }
  return false;
}

/** The first solid y at or below y in column x (WORLD_H when nothing is: the floor). x must be in the world. */
export function groundBelow(t: Terrain, x: number, y: number): number {
  const o = x * STRIDE;
  const n = t.spanCount[x];
  for (let i = 0; i < n; i++) {
    const top = t.spans[o + i * 2];
    if (t.spans[o + i * 2 + 1] > y) return top > y ? top : y;
  }
  return y > WORLD_H ? y : WORLD_H;
}

/** The top of column x's highest span (WORLD_H if the column is empty). x must be in the world. */
export function surfaceTop(t: Terrain, x: number): number {
  return t.spanCount[x] > 0 ? t.spans[x * STRIDE] : WORLD_H;
}

/** Remove a solid disc of radius r centred on (cx, cy) from the in-shot spans. */
export function carveCircle(t: Terrain, cx: number, cy: number, r: number): void {
  const r2 = r * r;
  const x0 = Math.max(0, cx - r);
  const x1 = Math.min(WORLD_W - 1, cx + r);
  for (let x = x0; x <= x1; x++) {
    const dx = x - cx;
    const dy = isqrt(r2 - dx * dx);
    removeInterval(t, x, cy - dy, cy + dy + 1);
  }
}

/** Write `pieces` (top, bottom) pairs from PIECES into column x, keeping the LOWEST MAX_SPANS. */
function writeColumn(t: Terrain, x: number, pieces: number): void {
  const o = x * STRIDE;
  const keep = pieces < MAX_SPANS ? pieces : MAX_SPANS;
  const first = pieces - keep;
  for (let i = 0; i < keep; i++) {
    t.spans[o + i * 2] = PIECES[(first + i) * 2];
    t.spans[o + i * 2 + 1] = PIECES[(first + i) * 2 + 1];
  }
  t.spanCount[x] = keep;
}

/**
 * Remove the half-open interval [a, b) from column x's spans. More pieces than
 * MAX_SPANS (8+ separate holes in one column in one shot): keep the LOWEST
 * MAX_SPANS and drop the top one — Plan 1's rule, deterministic and rare.
 */
export function removeInterval(t: Terrain, x: number, a: number, b: number): void {
  if (b <= a) return;
  const o = x * STRIDE;
  const n = t.spanCount[x];
  let p = 0;
  for (let i = 0; i < n; i++) {
    const top = t.spans[o + i * 2];
    const bot = t.spans[o + i * 2 + 1];
    if (bot <= a || top >= b) {
      PIECES[p++] = top;
      PIECES[p++] = bot;
      continue;
    }
    if (top < a) {
      PIECES[p++] = top;
      PIECES[p++] = a;
    }
    if (bot > b) {
      PIECES[p++] = b;
      PIECES[p++] = bot;
    }
  }
  writeColumn(t, x, p / 2);
}

/**
 * Add solid [a, b) to column x (a union), clamped to [0, WORLD_H). Spans stay
 * ordered top-down, disjoint and non-touching. Never loses dirt: if the new
 * piece would be a 9th span, it is extended down to absorb the span below it
 * (or, with none below, up to absorb the span above) — dirt lands on dirt.
 */
export function addInterval(t: Terrain, x: number, a: number, b: number): void {
  if (a < 0) a = 0;
  if (b > WORLD_H) b = WORLD_H;
  if (b <= a) return;
  const o = x * STRIDE;
  const n = t.spanCount[x];
  let p = 0;
  let at = -1; // piece index of the new interval
  for (let i = 0; i < n; i++) {
    const top = t.spans[o + i * 2];
    const bot = t.spans[o + i * 2 + 1];
    if (bot < a) { // wholly above, not touching
      PIECES[p++] = top;
      PIECES[p++] = bot;
      continue;
    }
    if (top > b) { // wholly below, not touching
      if (at < 0) {
        at = p / 2;
        PIECES[p++] = a;
        PIECES[p++] = b;
      }
      PIECES[p++] = top;
      PIECES[p++] = bot;
      continue;
    }
    if (top < a) a = top; // overlapping or touching: absorb it into the new interval
    if (bot > b) b = bot;
  }
  if (at < 0) {
    at = p / 2;
    PIECES[p++] = a;
    PIECES[p++] = b;
  }
  let pieces = p / 2;
  if (pieces > MAX_SPANS) {
    // Close the gap on one side of the new piece: below it if there is a span below, else above it.
    const j = at + 1 < pieces ? at : at - 1; // merge pieces j and j + 1
    PIECES[j * 2 + 1] = PIECES[(j + 1) * 2 + 1];
    for (let k = j + 1; k < pieces - 1; k++) {
      PIECES[k * 2] = PIECES[(k + 1) * 2];
      PIECES[k * 2 + 1] = PIECES[(k + 1) * 2 + 1];
    }
    pieces--;
  }
  writeColumn(t, x, pieces);
}

// Scratch for carveCapsule: per-column [lo, hi) bounds over the columns it touches.
const CAP_LO = new Int32Array(WORLD_W);
const CAP_HI = new Int32Array(WORLD_W);

/**
 * Remove a capsule — the union of radius-r discs centred on every <= 1 px
 * sample of the integer segment (x0, y0) -> (x1, y1) — from the spans. One
 * removeInterval per column: consecutive samples are <= 1 px apart, so each
 * column's section of the union is a single interval. A zero-length capsule
 * is exactly carveCircle.
 */
export function carveCapsule(t: Terrain, x0: number, y0: number, x1: number, y1: number, r: number): void {
  if (r < 0) return;
  const left = Math.max(0, Math.min(x0, x1) - r);
  const right = Math.min(WORLD_W - 1, Math.max(x0, x1) + r);
  if (right < left) return;
  for (let c = left; c <= right; c++) {
    CAP_LO[c] = 2147483647;
    CAP_HI[c] = -2147483648;
  }
  const half = new Int32Array(r + 1); // half[d] = the disc's half-height d columns from its centre
  for (let d = 0; d <= r; d++) half[d] = isqrt(r * r - d * d);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= n; i++) {
    const sx = x0 + idiv(dx * i, n);
    const sy = y0 + idiv(dy * i, n);
    const c0 = Math.max(left, sx - r);
    const c1 = Math.min(right, sx + r);
    for (let c = c0; c <= c1; c++) {
      const h = half[c < sx ? sx - c : c - sx];
      if (sy - h < CAP_LO[c]) CAP_LO[c] = sy - h;
      if (sy + h + 1 > CAP_HI[c]) CAP_HI[c] = sy + h + 1;
    }
  }
  for (let c = left; c <= right; c++) if (CAP_LO[c] < CAP_HI[c]) removeInterval(t, c, CAP_LO[c], CAP_HI[c]);
}

/**
 * Drop every floating span straight down onto the stack below it. All solid
 * material in a column ends up as ONE span resting on the floor, so the new
 * surface is WORLD_H minus the column's total solid length. `collect = false`
 * skips building `falls` (the quiet resolve path); the terrain is identical.
 */
export function settle(t: Terrain, collect = true): SettleResult {
  const falls: SettleFall[] = [];
  for (let x = 0; x < WORLD_W; x++) {
    const o = x * STRIDE;
    let stackTop = WORLD_H;
    for (let i = t.spanCount[x] - 1; i >= 0; i--) {
      const top = t.spans[o + i * 2];
      const bot = t.spans[o + i * 2 + 1];
      if (collect && stackTop > bot) falls.push({ x, top, bottom: bot, fall: stackTop - bot });
      stackTop -= bot - top;
    }
    t.height[x] = stackTop;
  }
  spansFromHeight(t);
  return { heights: t.height.slice(), falls };
}
```

**`addInterval` overflow.** A new piece that would be a 9th span is extended to absorb the span directly below it (or, if there is none below, the one above). Dirt lands on dirt: the new dirt is always present and nothing is lost. This was tested against a pixel model.

**Why `carveCapsule` needs one interval per column.** Consecutive samples are ≤ 1 px apart on both axes. A sample's section in column c and the next sample's section therefore overlap or touch: the half-height `isqrt(2r − 1)` at the disc edge is ≥ 1. The samples covering a column are contiguous in the sequence, because x is monotone along a line, so each column's union is one interval.

### 4.3 Exact-distance damage: `damage.ts` *(verbatim, full file)*

```ts
// src/game/titles/arcfire/damage.ts
//
// Blast damage to one tank (spec §3.3), integer-only and EXACT. With s the
// true (real) distance from the blast centre to the tank's hitbox centre and
// d = max(0, s - TANK_HIT_R) the distance to the hitbox edge:
//   linear     floor(D * (R - d) / R)
//   quadratic  floor(D * (R^2 - d^2) / R^2)
// for d < R, else 0. s is irrational in general, so each formula is split
// into an integer part plus one isqrt term. Flooring that term first is exact:
// for an integer a, a real u in [a, a + 1) and an integer m >= 1,
// floor(u / m) = floor(a / m), because no multiple of m lies inside (a, a + 1).
import type { Blast } from "./weapons/types";
import { isqrt } from "./imath";
import { TANK_HIT_R } from "./constants";

export function blastDamage(blast: Blast, bx: number, by: number, tx: number, ty: number): number {
  const r = blast.radius;
  const D = blast.damage;
  if (r <= 0 || D <= 0) return 0; // divisor guard: bad data deals nothing (the roster validator rejects it)
  const dx = bx - tx;
  const dy = by - ty;
  const q = dx * dx + dy * dy; // s^2
  const k = r + TANK_HIT_R;
  if (q >= k * k) return 0; // d >= R
  if (q <= TANK_HIT_R * TANK_HIT_R) return D; // the blast centre is inside the hitbox: d = 0
  if (blast.falloff === "quadratic") {
    // D(R^2 - d^2) = D(R^2 - q - 196) + 28·D·s, and floor(28·D·s) = isqrt(784·D^2·q)
    const a = D * (r * r - q - TANK_HIT_R * TANK_HIT_R);
    return Math.floor((a + isqrt(4 * TANK_HIT_R * TANK_HIT_R * D * D * q)) / (r * r));
  }
  // D(R - d) = D·k - D·s, and ceil(D·s) = ceil(sqrt(D^2·q))
  const d2q = D * D * q;
  const fs = isqrt(d2q);
  return Math.floor((D * k - (fs * fs === d2q ? fs : fs + 1)) / r);
}
```

- **Proof of exactness.** For an integer `a`, a real `u ∈ [a, a+1)` and an integer `m ≥ 1`, `⌊u/m⌋ = ⌊a/m⌋`, because no multiple of `m` lies inside `(a, a+1)`.
  - Linear: `D(R − d) = D·k − D·s`, so `⌊D·k − D·s⌋ = D·k − ⌈D·s⌉`, with `⌈D·s⌉` from `isqrt(D²q)` (+1 unless q is a perfect square).
  - Quadratic: `D(R² − d²) = D(R² − q − 196) + 28·D·s`, with `⌊28·D·s⌋ = isqrt(784·D²·q)`.
  - Both numerators are ≥ 0 inside the reach, so `Math.floor` equals truncation.
- **Bounds.** With the validator's limits (radius, damage ≤ 200), `784·D²·q < 784 · 40,000 · 214² ≈ 1.4·10^12`, far below 2^53.
- **Unchanged Plan 1 behaviour.**
  - The reach boundary is the same (`q < (R+14)²`), so no hit becomes a miss.
  - Every existing `damage.test.ts` value sits at an integer distance and keeps its value.
  - Damage can only go **down** relative to the floored formula, never up.

### 4.4 Shell flight: `ballistics.ts` *(verbatim, full file)*

```ts
// src/game/titles/arcfire/ballistics.ts
//
// Shell flight (spec §3.2): launch from the muzzle along an integer angle,
// then fixed 1/60 s steps of semi-implicit Euler in Q16.16. Each step's
// movement is swept in <= 1 px increments against the tank hitboxes and the
// terrain spans, so nothing tunnels through a thin wall or clips past a tank.
// Plan 2A adds the flight modifiers a Stage can ask for — stop at the apex,
// homing after the apex, bounces off the terrain or the side walls — and a
// shell spawned inside a tank's hitbox ignores that tank until it has left it.
// A shell with no modifiers takes exactly Plan 1's path (pixels are floored).
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "./aimTable";
import { isSolid, type Terrain } from "./terrain";
import {
  WORLD_W, STEPS_PER_SEC, GRAVITY_STEP, V_UNIT, MAX_FLIGHT_STEPS, BARREL_LEN, TANK_HIT_R, BOUNCE_PROBE_R,
} from "./constants";
import { idiv, floorPx } from "./imath";

export interface Shell {
  x: Fx;
  y: Fx;
  vx: Fx; // px/s
  vy: Fx; // px/s, positive = falling
  gravityStep: Fx; // fall-speed gain per step (weapon-scaled gravity)
  steps: number; // steps flown so far (the per-shell flight cap counts these)
  alive: boolean;
  // --- Plan 2A
  speed: Fx; // nominal speed: the launch speed, or a child's split speed ("up"/"cone" splits scale it)
  apexed: boolean; // latched on the step a rising shell stops rising
  stopAtApex: boolean; // die with an "apex" result on the step `apexed` latches
  homeDeg: number; // > 0: once apexed, turn <= this many whole degrees per step toward (homeX, homeY)
  homeX: number;
  homeY: number;
  bounces: number; // terrain reflections left
  wallBounces: number; // side-wall reflections left
  restitutionPct: number; // speed kept per reflection
  ignore: number; // bitmask of tanks whose hitbox the shell spawned inside; a bit clears once a sample is outside
}

/** A tank hitbox centre in px; the radius is TANK_HIT_R. */
export interface HitCircle {
  x: number;
  y: number;
}

export type Impact =
  | { kind: "terrain"; x: number; y: number; fx: Fx; fy: Fx } // (x, y) = first solid px; (fx, fy) = last free position
  | { kind: "tank"; x: number; y: number; tank: number; fx: Fx; fy: Fx }
  | { kind: "apex"; x: number; y: number; fx: Fx; fy: Fx } // only for stopAtApex shells; the shell has not moved this step
  | { kind: "bounce"; x: number; y: number; wall: boolean } // reflected at (x, y); the shell is alive at its last free position
  | { kind: "out"; x: number; y: number }; // left the world sideways, or hit the per-shell flight cap

/** The muzzle point for a hitbox centre and an integer angle (any integer degrees), px. */
export function muzzle(cx: number, cy: number, angleDeg: number): { x: number; y: number } {
  return {
    x: cx + toInt(mul(fromInt(BARREL_LEN), cosDeg(angleDeg))),
    y: cy - toInt(mul(fromInt(BARREL_LEN), sinDeg(angleDeg))),
  };
}

/** A shell at Q16.16 position (x, y) with velocity (vx, vy), nominal speed `speed` and no flight modifiers. */
export function shellAt(x: Fx, y: Fx, vx: Fx, vy: Fx, speed: Fx, gravityStep: Fx): Shell {
  return {
    x, y, vx, vy, gravityStep, steps: 0, alive: true,
    speed, apexed: false, stopAtApex: false, homeDeg: 0, homeX: 0, homeY: 0,
    bounces: 0, wallBounces: 0, restitutionPct: 100, ignore: 0,
  };
}

/** A shell at (x, y) px flying at `speed` (Fx px/s) along an integer angle (any integer degrees). */
export function launchAt(x: number, y: number, angleDeg: number, speed: Fx, gravityStep: Fx): Shell {
  return shellAt(fromInt(x), fromInt(y), mul(speed, cosDeg(angleDeg)), 0 - mul(speed, sinDeg(angleDeg)), speed, gravityStep);
}

export function launchShell(
  x: number, y: number, angleDeg: number, power: number, speedPct = 100, gravityPct = 100
): Shell {
  return launchAt(x, y, angleDeg, idiv(power * V_UNIT * speedPct, 100), idiv(GRAVITY_STEP * gravityPct, 100));
}

/** Rotate a velocity by an integer angle in the aim sense (+ turns a rightward vector toward up). */
export function rotateVel(vx: Fx, vy: Fx, deg: number): [Fx, Fx] {
  const c = cosDeg(deg);
  const s = sinDeg(deg);
  return [mul(vx, c) + mul(vy, s), mul(vy, c) - mul(vx, s)];
}

/**
 * Turn the shell toward (homeX, homeY) by k = min(homeDeg, the whole degrees
 * between its heading and the target) — never past the target, so there is no
 * overshoot and no wobble. No arctangent: with dot > 0 the angle is < k exactly
 * when |cross| * cos k < dot * sin k, compared with the baked table. At
 * 90 degrees or more (dot <= 0) the full homeDeg turn is taken.
 */
function steer(s: Shell): void {
  const dx = s.homeX - floorPx(s.x);
  const dy = s.homeY - floorPx(s.y);
  const vx = idiv(s.vx, 256); // 1/256-px/s units: every product below stays < 2^52 for validator-legal data (see the magnitude notes)
  const vy = idiv(s.vy, 256);
  const cross = vx * dy - vy * dx; // < 0: the target is anticlockwise of the heading (aim sense)
  const dot = vx * dx + vy * dy;
  if (cross === 0 && dot >= 0) return; // dead on, at the target, or too slow to have a heading
  let k = s.homeDeg;
  if (dot > 0) {
    const ac = cross < 0 ? 0 - cross : cross;
    while (k > 0 && ac * cosDeg(k) < dot * sinDeg(k)) k--;
  }
  if (k === 0) return;
  const [rx, ry] = rotateVel(s.vx, s.vy, cross <= 0 ? k : 0 - k); // dead astern (cross 0, dot < 0) turns anticlockwise
  s.vx = rx;
  s.vy = ry;
}

/**
 * The outward surface direction at solid pixel (cx, cy): minus the sum of the
 * offsets of the solid pixels in a radius-BOUNCE_PROBE_R disc around it (their
 * centroid points into the ground). If that is zero or doesn't oppose the
 * motion, the way the shell came in, (fromX - cx, fromY - cy), is used
 * instead; it always opposes the motion, because the swept samples move
 * monotonically along the velocity. Never (0, 0). At BOUNCE_PROBE_R = 8 the
 * components are <= 330 (a half-disc's moment), from <= 197 isSolid probes.
 */
function surfaceNormal(s: Shell, t: Terrain, cx: number, cy: number, fromX: number, fromY: number): [number, number] {
  const r = BOUNCE_PROBE_R;
  let sx = 0;
  let sy = 0;
  for (let dy = 0 - r; dy <= r; dy++) {
    for (let dx = 0 - r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r && isSolid(t, cx + dx, cy + dy)) {
        sx += dx;
        sy += dy;
      }
    }
  }
  const nx = 0 - sx;
  const ny = 0 - sy;
  if ((nx !== 0 || ny !== 0) && s.vx * nx + s.vy * ny < 0) return [nx, ny];
  if (fromX !== cx || fromY !== cy) return [fromX - cx, fromY - cy];
  return [0, -1];
}

/** Mirror the velocity's component along normal (nx, ny) (any non-zero length) if it points into the surface, then keep restitutionPct of the speed. */
function reflect(s: Shell, nx: number, ny: number): void {
  const vn = s.vx * nx + s.vy * ny; // |v| < 2^31, |n| components <= 330: < 2^41
  if (vn < 0) {
    const nn = nx * nx + ny * ny; // >= 1
    s.vx -= idiv(2 * vn * nx, nn); // < 2^50
    s.vy -= idiv(2 * vn * ny, nn);
  }
  s.vx = idiv(s.vx * s.restitutionPct, 100);
  s.vy = idiv(s.vy * s.restitutionPct, 100);
}

/** A bounce ends the step at the last free sample; the flight cap still applies. */
function endBounce(s: Shell, fx: Fx, fy: Fx, ev: Impact): Impact {
  s.x = fx;
  s.y = fy;
  s.steps++;
  if (s.steps >= MAX_FLIGHT_STEPS) {
    s.alive = false;
    return { kind: "out", x: floorPx(fx), y: floorPx(fy) };
  }
  return ev;
}

/**
 * Advance one physics step. Returns the first event along the swept path, or
 * null while the shell is still flying. windStep is the horizontal velocity
 * change per step (Fx). The order inside a step is part of the determinism
 * contract: wind, gravity, the apex latch (an apex stage ends the step here),
 * homing, then the sweep, whose every sample checks the side edges, then the
 * tanks in index order, then the terrain.
 */
export function stepShell(s: Shell, t: Terrain, tanks: readonly HitCircle[], windStep: Fx): Impact | null {
  const rising = s.vy < 0;
  s.vx += windStep;
  s.vy += s.gravityStep;
  if (!s.apexed && rising && s.vy >= 0) {
    s.apexed = true;
    if (s.stopAtApex) {
      s.alive = false;
      return { kind: "apex", x: floorPx(s.x), y: floorPx(s.y), fx: s.x, fy: s.y };
    }
  }
  if (s.homeDeg > 0 && s.apexed) steer(s);
  const nx = s.x + idiv(s.vx, STEPS_PER_SEC);
  const ny = s.y + idiv(s.vy, STEPS_PER_SEC);
  const n = Math.max(Math.abs(floorPx(nx) - floorPx(s.x)), Math.abs(floorPx(ny) - floorPx(s.y)), 1);
  const r2 = TANK_HIT_R * TANK_HIT_R;
  let fx = s.x; // the last free sample
  let fy = s.y;
  for (let i = 1; i <= n; i++) {
    const sx = s.x + idiv((nx - s.x) * i, n);
    const sy = s.y + idiv((ny - s.y) * i, n);
    const cx = floorPx(sx);
    const cy = floorPx(sy);
    if (cx < 0 || cx >= WORLD_W) {
      if (s.wallBounces > 0) {
        s.wallBounces--;
        reflect(s, cx < 0 ? 1 : -1, 0);
        return endBounce(s, fx, fy, { kind: "bounce", x: cx < 0 ? 0 : WORLD_W - 1, y: cy, wall: true });
      }
      s.alive = false;
      return { kind: "out", x: cx, y: cy };
    }
    for (let k = 0; k < tanks.length; k++) {
      const dx = cx - tanks[k].x;
      const dy = cy - tanks[k].y;
      const inside = dx * dx + dy * dy <= r2;
      if ((s.ignore >> k) & 1) {
        if (!inside) s.ignore &= ~(1 << k);
        continue;
      }
      if (inside) {
        s.alive = false;
        return { kind: "tank", x: cx, y: cy, tank: k, fx, fy };
      }
    }
    if (isSolid(t, cx, cy)) {
      if (s.bounces > 0) {
        s.bounces--;
        const [nX, nY] = surfaceNormal(s, t, cx, cy, floorPx(fx), floorPx(fy));
        reflect(s, nX, nY);
        return endBounce(s, fx, fy, { kind: "bounce", x: cx, y: cy, wall: false });
      }
      s.alive = false;
      return { kind: "terrain", x: cx, y: cy, fx, fy };
    }
    fx = sx;
    fy = sy;
  }
  s.x = nx;
  s.y = ny;
  s.steps++;
  if (s.steps >= MAX_FLIGHT_STEPS) {
    s.alive = false;
    return { kind: "out", x: floorPx(nx), y: floorPx(ny) };
  }
  return null;
}
```

**Magnitude bounds.** The measured figures come from the prototype, emulating `stepShell` with homing over a grid of validator-legal launches and child spawns (floor and side edges only, which only lengthens flights).
- **`|v|` in Fx.**
  - A launched shell starts at ≤ 2,052 px/s (power 100 at speedPct 300), and the floor limits how far it can fall. Its measured maximum is 2^27.04, wind ±40 included.
  - A split child's nominal speed can double per generation (`split.speedPct` ≤ 200, three generations), so it reaches 16,416 px/s ≈ 2^30.0 at the validator's corner.
  - Every product below is sized for **|v| < 2^31**.
- **`reflect`:** each component of `n` is ≤ 330 (the radius-8 probe disc's half-moment: Σ dy over its lower half), so `vn < 2^41`, `2·vn·nx < 2^50` and `n·n < 2^18`.
- **`dig`:** the heading components are `toInt` of a velocity (< 2^15 px/s) or the 30° table vector (< 2^16), so the pitch comparison and `a² + c²` stay < 2^33.
- **`steer`** works in 1/256 px/s, where |v| < 2^23. Its comparison products, `|cross|·cos k` and `dot·sin k`, peak where a high apex meets a fast fall:
  - **Launched shells at the validator's extremes:** measured ≤ 2^47.3. At speedPct 300 and gravityPct ≈ 34, the apex is ≈ 20,500 px up at the 1,200-step cap, so `|dy|` ≈ 2^14.3 (not 2^13).
  - **The roster's homing weapons** (Seeker, Swarm: speedPct 100, gravity 100): ≤ 2^43.8.
  - **Split children at the validator's corner** (200% per generation, gravityPct 200): measured ≤ 2^51.3, with `|dy|` ≈ 2^16.2.
    - An estimate of the ceiling: a shell rising for T steps at g ≤ 10 px/s per step climbs g·T²/120 px, then falls for ≤ 1,200 − T steps at ≤ g·(1,200 − T) px/s.
    - The product peaks at T = 800, at 2^35.7 in these units; × 2^16 gives ≈ 2^51.7.
  - All of them stay below 2^52, so every comparison is exact.
  - `rotateVel`'s `mul` operands give < 2^47.
- **Swept samples** have `(nx − x)·i < 2^25 · 2^10`.

**Behaviour notes.**
- **The apex (D4).** `rising` is read *before* wind and gravity. For a shell with no modifiers the latch is inert, so a Plan 1 shell takes exactly Plan 1's path.
- **Homing (D8).** It starts on the apex step, and a shell that never rises never steers. The target is the enemy's hitbox centre at shot start (hitboxes are frozen). Gravity keeps acting, so a homing shell arcs in rather than flying a straight line.
  - Each step turns `k ≤ N` whole degrees. Directly behind the target (`cross = 0`, `dot < 0`) it turns anticlockwise.
  - A turn never passes the target, and the rotation keeps the speed up to table rounding (about 2·10⁻⁷ per turn).
- **Bounce (D9).**
  - **Normal.** The normal is minus the sum of the offsets to the solid pixels in the radius-8 disc (`BOUNCE_PROBE_R`, owner decision O15). That is the same vector as the sum of the offsets to the *empty* pixels, because the disc's offsets sum to zero. If the normal is degenerate or doesn't oppose the motion, the incoming direction is used instead; it is never (0, 0).
  - **Accuracy** (§10.1 O15 has the table). It is exact on flat ground and at 45°. For a vertical drop at 40 consecutive columns of a plain staircase slope, the reflected heading stays within 2.3° of ideal on 1:3, 1:6 and 1:10 slopes. On 1:20 and 1:40 slopes it lands in 90.0°–102.5° (ideal 95.7° and 92.9°), where radius 4 gave 90.0°–118.1°.
  - **Reflection.** Mirror the normal component, then keep `restitutionPct` of *both* components (spec: "3 bounces (55%)" = the speed kept). On flat ground `(100, 200) → (100, −200)`, or `(55, −110)` at 55%. A vertical drop onto a 45° rise leaves horizontally: `(0, 200) → (−200, 0)`.
  - **After a bounce** the step ends at the last free sample, so a bouncer never restarts inside dirt. The flight cap still counts that step.
  - **Tanks never bounce a shell:** a tank contact always triggers the stage.
- **Walls (Ricochet).** A side-edge exit with `wallBounces > 0` reflects about (±1, 0), so vx flips and both components keep `restitutionPct`. The shell stays at its last in-world sample, and the bounce event's x is clamped to the wall column. The world has no ceiling, so a wall bounce can happen at any height.

### 4.5 The effects: `weapons/primitives.ts` *(verbatim, full file)*

```ts
// src/game/titles/arcfire/weapons/primitives.ts
//
// The effect implementations (spec §4.1): the only weapon code outside the
// shell flight in ballistics.ts. Every effect is applied INSTANTLY at its
// trigger step, in closed form or one bounded pass over the terrain; only
// shells and delays take simulated time. Integer px / Q16.16 throughout; no
// weapon draws from the match RNG. The order effects run in is part of the
// determinism contract (see resolve.ts).
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "../aimTable";
import { idiv, isqrt, floorPx } from "../imath";
import {
  isSolid, carveCircle, carveCapsule, removeInterval, addInterval, groundBelow, surfaceTop, type Terrain,
} from "../terrain";
import { muzzle, rotateVel, shellAt, type HitCircle, type Shell } from "../ballistics";
import { blastDamage } from "../damage";
import { WORLD_W, WORLD_H, TANK_HIT_R, ROLL_PROBE, MAX_SHELLS, DIG_MAX_PITCH } from "../constants";
import { SHOW_PX_PER_STEP, showSteps, type Timeline, type TimelineEvent } from "../timeline";
import type { Blast, BeamLaunch, Build, Burn, Dig, Effect, Quake, Roll, Split, Stage } from "./types";

/** Everything one shot's effects can touch. Built by resolveWeapon; lives for one turn. */
export interface Shot {
  t: Terrain;
  tanks: readonly HitCircle[]; // hitboxes, fixed for the whole shot (tanks ride the settle afterwards)
  shooter: number;
  shells: Shell[]; // every shell of the turn, by creation order (= Timeline.shells index)
  stages: Stage[]; // stages[i] = what shells[i] does on its trigger
  live: number; // shells still alive
  pending: Pending[]; // armed delays, in arming order
  received: number[]; // damage each tank took this turn
  rec: boolean; // build the Timeline's paths and events (false: the quiet AI path)
  tl: Timeline;
}

/** Where and how a stage fired. */
export interface Trigger {
  step: number;
  shell: number; // index of the shell that triggered
  x: number; // the trigger px: first solid (or tank) px on impact; the shell's px at the apex
  y: number;
  fx: Fx; // the last free position: children spawn here; roll and burn drop from here
  fy: Fx;
  vx: Fx; // velocity at the trigger: dig direction, the roll/burn tie-break, "ahead"/"cone" splits
  vy: Fx;
  speed: Fx; // the shell's nominal speed: the base of "up"/"cone" splits
  gravityStep: Fx; // inherited by children
  tank: number; // the tank struck, or -1
}

export interface Pending {
  at: number; // the step it fires on
  trig: Trigger;
  effects: readonly Effect[];
}

export function emit(shot: Shot, ev: TimelineEvent): void {
  if (shot.rec) shot.tl.events.push(ev);
}

/** Apply a list of effects at a trigger, completely and in array order (a delay only arms its list). */
export function applyEffects(shot: Shot, trig: Trigger, effects: readonly Effect[]): void {
  for (const e of effects) {
    if ("blast" in e) blastAt(shot, e.blast, trig.x, trig.y, trig.step, trig.shell, 0);
    else if ("split" in e) split(shot, trig, e.split);
    else if ("roll" in e) roll(shot, trig, e.roll);
    else if ("dig" in e) dig(shot, trig, e.dig);
    else if ("burn" in e) burn(shot, trig, e.burn);
    else if ("build" in e) build(shot, trig, e.build);
    else if ("quake" in e) quake(shot, trig, e.quake);
    else {
      const at = trig.step + (e.delay.steps > 1 ? e.delay.steps : 1);
      shot.pending.push({ at, trig, effects: e.delay.then });
      emit(shot, { step: trig.step, kind: "fuse", shell: trig.shell, x: trig.x, y: trig.y, at });
    }
  }
}

/** Damage to tank p: it scores for whoever didn't take it (resolve.ts). */
function hurt(shot: Shot, p: number, amount: number, step: number, lag: number): void {
  if (amount <= 0) return;
  shot.received[p] += amount;
  emit(shot, { step, kind: "damage", target: p, amount, lag });
}

/** Plan 1's blast: carve a disc, then damage both tanks by distance (tank order 0, 1). */
export function blastAt(shot: Shot, b: Blast, x: number, y: number, step: number, shell: number, lag: number): void {
  carveCircle(shot.t, x, y, b.radius);
  emit(shot, { step, kind: "blast", shell, x, y, radius: b.radius, lag });
  for (let p = 0; p < 2; p++) hurt(shot, p, blastDamage(b, x, y, shot.tanks[p].x, shot.tanks[p].y), step, lag);
}

/** Bitmask of the tanks whose hitbox contains px (x, y). */
function tankMask(shot: Shot, x: number, y: number): number {
  let m = 0;
  for (let k = 0; k < 2; k++) {
    const dx = x - shot.tanks[k].x;
    const dy = y - shot.tanks[k].y;
    if (dx * dx + dy * dy <= TANK_HIT_R * TANK_HIT_R) m |= 1 << k;
  }
  return m;
}

/** The first tank whose hitbox contains (x, y), or -1. */
function tankAt(shot: Shot, x: number, y: number): number {
  const m = tankMask(shot, x, y);
  return m === 0 ? -1 : (m & 1) !== 0 ? 0 : 1;
}

/** Add a shell to the turn and arm its stage's flight modifiers. Returns its index, or -1 past MAX_SHELLS (dropped). */
export function addShell(shot: Shot, s: Shell, stage: Stage, angle: number, parent: number, step: number): number {
  if (shot.shells.length >= MAX_SHELLS) return -1;
  s.stopAtApex = stage.on === "apex";
  if (stage.homing) {
    const target = shot.tanks[1 - shot.shooter];
    s.homeDeg = stage.homing.degPerStep;
    s.homeX = target.x;
    s.homeY = target.y;
  }
  if (stage.bounce) {
    if (stage.bounce.walls) s.wallBounces = stage.bounce.times;
    else s.bounces = stage.bounce.times;
    s.restitutionPct = stage.bounce.restitutionPct;
  }
  s.ignore = tankMask(shot, floorPx(s.x), floorPx(s.y)); // only a line split can spawn inside a hitbox
  shot.shells.push(s);
  shot.stages.push(stage);
  shot.live++;
  if (shot.rec) shot.tl.shells.push({ angle, parent, start: step, points: [floorPx(s.x), floorPx(s.y)] });
  return shot.shells.length - 1;
}

/** Fan offset of item i of count across a TOTAL spread (the volley rule; count > 1 guards the divisor). */
export const fanOffset = (i: number, count: number, spread: number): number =>
  count > 1 ? idiv((2 * i - (count - 1)) * spread, 2 * (count - 1)) : 0;

function split(shot: Shot, trig: Trigger, sp: Split): void {
  const children: number[] = [];
  const speed = idiv(trig.speed * sp.speedPct, 100); // the children's nominal speed
  for (let i = 0; i < sp.count; i++) {
    const off = fanOffset(i, sp.count, sp.spreadDeg);
    let vx: Fx;
    let vy: Fx;
    if (sp.from === "up") {
      vx = mul(speed, cosDeg(90 + off));
      vy = 0 - mul(speed, sinDeg(90 + off));
    } else if (sp.from === "cone") {
      vx = trig.vx + mul(speed, cosDeg(270 + off));
      vy = trig.vy - mul(speed, sinDeg(270 + off));
    } else {
      const [rx, ry] = rotateVel(trig.vx, trig.vy, off);
      vx = idiv(rx * sp.speedPct, 100);
      vy = idiv(ry * sp.speedPct, 100);
    }
    const gx = sp.gapPx ? idiv((2 * i - (sp.count - 1)) * sp.gapPx, 2) : 0;
    const s = shellAt(trig.fx + fromInt(gx), trig.fy, vx, vy, speed, trig.gravityStep);
    const id = addShell(shot, s, sp.child, off, trig.shell, trig.step);
    if (id >= 0) children.push(id);
  }
  emit(shot, { step: trig.step, kind: "split", shell: trig.shell, x: trig.x, y: trig.y, children });
}

interface WalkEnd { x: number; g: number; stop: "far" | "rise" | "tank" | "edge"; tank: number }

/**
 * Walk along the ground from column x (standing on ground px g) toward dir,
 * up to maxPx columns. Level or downhill only: it stops before any rise (the
 * next column is solid at g - 1), at a world edge, or on entering a tank
 * hitbox (the walker's point is (x, g - 1)). Appends each point to `path`.
 */
function walk(shot: Shot, x: number, g: number, dir: number, maxPx: number, path: number[]): WalkEnd {
  for (let k = 0; k < maxPx; k++) {
    const nx = x + dir;
    if (nx < 0 || nx >= WORLD_W) return { x, g, stop: "edge", tank: -1 };
    if (isSolid(shot.t, nx, g - 1)) return { x, g, stop: "rise", tank: -1 };
    x = nx;
    g = groundBelow(shot.t, x, g);
    path.push(x, g - 1);
    const tank = tankAt(shot, x, g - 1);
    if (tank >= 0) return { x, g, stop: "tank", tank };
  }
  return { x, g, stop: "far", tank: -1 };
}

/** Downhill direction at (x, g) from the ground ROLL_PROBE px either side; on level ground, the travel direction. */
function downhill(t: Terrain, x: number, g: number, vx: Fx): number {
  const l = x - ROLL_PROBE >= 0 ? groundBelow(t, x - ROLL_PROBE, g - ROLL_PROBE) : g;
  const r = x + ROLL_PROBE < WORLD_W ? groundBelow(t, x + ROLL_PROBE, g - ROLL_PROBE) : g;
  if (r > l) return 1;
  if (l > r) return -1;
  return vx < 0 ? -1 : 1;
}

function roll(shot: Shot, trig: Trigger, r: Roll): void {
  if (trig.tank >= 0) return blastAt(shot, r.then, trig.x, trig.y, trig.step, trig.shell, 0); // a direct hit doesn't roll
  const x = floorPx(trig.fx);
  const g = groundBelow(shot.t, x, floorPx(trig.fy));
  const path = [x, g - 1];
  const against = tankAt(shot, x, g - 1); // landed against a tank: it stops at once
  const end: WalkEnd = against >= 0
    ? { x, g, stop: "tank", tank: against }
    : walk(shot, x, g, downhill(shot.t, x, g, trig.vx), r.maxDistance, path);
  const dur = showSteps(path.length / 2 - 1, SHOW_PX_PER_STEP.roll);
  emit(shot, { step: trig.step, kind: "roll", shell: trig.shell, path, dur });
  if (end.stop === "edge") { // rolled off the world: lost, like any shell leaving the side edges
    emit(shot, { step: trig.step, kind: "out", shell: trig.shell, x: end.x + (end.x === 0 ? -1 : 1), y: end.g - 1, lag: dur });
    return;
  }
  blastAt(shot, r.then, end.x, end.g, trig.step, trig.shell, dur);
}

function dig(shot: Shot, trig: Trigger, d: Dig): void {
  // Along the travel direction, but never steeper than DIG_MAX_PITCH below level: a steeper
  // heading (or none) takes exactly that pitch, keeping the horizontal sense of travel
  // (toward the opponent when there is none). Upward and shallower headings are kept.
  let a = toInt(trig.vx); // px/s, |a| < 2^15: every product here stays < 2^33
  let c = toInt(trig.vy); // px/s, + = down
  if (c > 0 ? c * cosDeg(DIG_MAX_PITCH) > (a < 0 ? 0 - a : a) * sinDeg(DIG_MAX_PITCH) : a === 0 && c === 0) {
    const sense = trig.vx > 0 ? 1 : trig.vx < 0 ? -1 : shot.shooter === 0 ? 1 : -1;
    a = sense * cosDeg(DIG_MAX_PITCH); // (a, c) becomes that pitch's Q16.16 unit vector: only its direction matters
    c = sinDeg(DIG_MAX_PITCH);
  }
  const len = isqrt(a * a + c * c); // >= 1: (a, c) is never (0, 0) here
  const x0 = trig.x;
  const y0 = trig.y;
  const dx = idiv(a * d.length, len);
  const dy = idiv(c * d.length, len);
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  let stop = n; // the last sample the tunnel reaches
  for (let i = 0; i <= n; i++) {
    const sx = x0 + idiv(dx * i, n);
    const sy = y0 + idiv(dy * i, n);
    // i = 0 is the trigger px, inside the world; the floor (WORLD_H) is bedrock
    if (i > 0 && (sx < 0 || sx >= WORLD_W || sy >= WORLD_H)) { stop = i - 1; break; }
    if (tankAt(shot, sx, sy) >= 0) { stop = i; break; }
  }
  const ex = x0 + idiv(dx * stop, n);
  const ey = y0 + idiv(dy * stop, n);
  const reached = idiv(stop * d.length, n); // px along the tunnel
  carveCapsule(shot.t, x0, y0, ex, ey, idiv(d.width, 2));
  const dur = showSteps(reached, SHOW_PX_PER_STEP.dig);
  emit(shot, { step: trig.step, kind: "dig", shell: trig.shell, x0, y0, x1: ex, y1: ey, width: d.width, dur });
  if (d.each && d.blastEvery && d.blastEvery > 0) {
    for (let k = 1; k * d.blastEvery < d.length; k++) {
      const i = idiv(k * d.blastEvery * n, d.length); // the sample k × blastEvery px along
      if (i >= stop) break;
      blastAt(shot, d.each, x0 + idiv(dx * i, n), y0 + idiv(dy * i, n), trig.step, trig.shell,
        showSteps(k * d.blastEvery, SHOW_PX_PER_STEP.dig));
    }
  }
  if (d.then) blastAt(shot, d.then, ex, ey, trig.step, trig.shell, dur);
}

function burn(shot: Shot, trig: Trigger, b: Burn): void {
  const x = floorPx(trig.fx);
  const g = groundBelow(shot.t, x, floorPx(trig.fy));
  const touched = [-1, -1]; // px along a run where each tank was first touched (-1 = never)
  const start = tankAt(shot, x, g - 1);
  if (start >= 0) touched[start] = 0;
  const half = idiv(b.pool, 2);
  const runs: number[] = []; // [dir, max px] pairs: the pool both ways, then the flow(s)
  if (half > 0) runs.push(-1, half, 1, half);
  if (b.split) runs.push(-1, b.flow, 1, b.flow);
  else runs.push(downhill(shot.t, x, g, trig.vx), b.flow);
  const flows: number[][] = [];
  let longest = 0;
  for (let j = 0; j < runs.length; j += 2) {
    const path = [x, g - 1];
    const end = walk(shot, x, g, runs[j], runs[j + 1], path);
    const px = path.length / 2 - 1;
    if (end.tank >= 0 && (touched[end.tank] < 0 || px < touched[end.tank])) touched[end.tank] = px;
    if (px > longest) longest = px;
    flows.push(path);
  }
  emit(shot, { step: trig.step, kind: "burn", shell: trig.shell, x, y: g - 1, flows, dur: showSteps(longest, SHOW_PX_PER_STEP.burn) });
  for (let p = 0; p < 2; p++) {
    if (touched[p] >= 0) hurt(shot, p, b.damage, trig.step, showSteps(touched[p], SHOW_PX_PER_STEP.burn));
  }
}

function build(shot: Shot, trig: Trigger, b: Build): void {
  const t = shot.t;
  const x = trig.x;
  const y = trig.y;
  if (b.shape === "ball") {
    const r = b.radius;
    for (let cx = Math.max(0, x - r); cx <= Math.min(WORLD_W - 1, x + r); cx++) {
      const h = isqrt(r * r - (cx - x) * (cx - x));
      addInterval(t, cx, y - h, y + h + 1);
    }
  } else if (b.shape === "wall") {
    const left = x - idiv(b.width, 2);
    for (let cx = Math.max(0, left); cx < Math.min(WORLD_W, left + b.width); cx++) {
      const top = surfaceTop(t, cx);
      addInterval(t, cx, top - b.height, top);
    }
  } else {
    for (let cx = Math.max(0, x - b.radius); cx <= Math.min(WORLD_W - 1, x + b.radius); cx++) {
      removeInterval(t, cx, 0, y);
      addInterval(t, cx, y, groundBelow(t, cx, y));
    }
  }
  emit(shot, { step: trig.step, kind: "build", shell: trig.shell, shape: b.shape, x, y,
    size: b.shape === "wall" ? b.height : b.radius, width: b.shape === "wall" ? b.width : 2 * b.radius + 1 });
}

function quake(shot: Shot, trig: Trigger, q: Quake): void {
  if (q.reach <= 0) return; // divisor guard (the roster validator requires reach >= 1)
  const x = trig.x;
  for (let cx = Math.max(0, x - q.reach + 1); cx <= Math.min(WORLD_W - 1, x + q.reach - 1); cx++) {
    const depth = idiv(q.furrow * (q.reach - Math.abs(cx - x)), q.reach); // furrow px at the source, 0 at ±reach
    const top = surfaceTop(shot.t, cx);
    if (depth > 0 && top < WORLD_H) removeInterval(shot.t, cx, top, top + depth);
  }
  emit(shot, { step: trig.step, kind: "quake", shell: trig.shell, x, y: trig.y, reach: q.reach, furrow: q.furrow,
    dur: showSteps(q.reach, SHOW_PX_PER_STEP.quake) });
  // The shockwave hurts only the opponent: the shooter's own tank is exempt (its blasts are not).
  const p = 1 - shot.shooter;
  const gap = Math.abs(shot.tanks[p].x - x) - TANK_HIT_R; // horizontal distance to the hitbox edge, like a blast's
  const d = gap > 0 ? gap : 0;
  if (d < q.reach) hurt(shot, p, idiv(q.damage * (q.reach - d), q.reach), trig.step, showSteps(d, SHOW_PX_PER_STEP.quake));
}

/**
 * The direction (aim sense: 0 = right, 90 = up, 270 = down) of a beam fired
 * at command angle `angle` by `shooter`. A beam reads the angle on the shell
 * dial turned a quarter turn toward the shooter's facing (player 0 faces
 * right and player 1 left; tanks never cross): clockwise for player 0,
 * anticlockwise for player 1. So 90 is level at the opponent's side, the
 * shooter's usual half of the dial (0..90 for player 0, 90..180 for player 1)
 * runs from straight down to level, the other half from level to straight up,
 * and the mirror of a beam command is 180 - angle, as for a shell. The wire
 * angle stays an integer in 0..180; the HUD and the AI call this function.
 */
export const beamDir = (shooter: number, angle: number): number => (shooter === 0 ? angle - 90 : angle + 90);

/** Fire a beam launch at command angle `angle` (step 1): straight lines that carve and pass through terrain and tanks. */
export function fireBeams(shot: Shot, launch: BeamLaunch, angle: number): void {
  const count = launch.count ?? 1;
  const reach = TANK_HIT_R + idiv(launch.width, 2);
  const from = shot.tanks[shot.shooter];
  for (let b = 0; b < count; b++) {
    const a = beamDir(shot.shooter, angle + fanOffset(b, count, launch.spreadDeg ?? 0));
    const mz = muzzle(from.x, from.y, a);
    const dx = toInt(mul(fromInt(launch.length), cosDeg(a)));
    const dy = 0 - toInt(mul(fromInt(launch.length), sinDeg(a)));
    const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    let hit = 0; // tank bitmask
    let last = 0;
    for (let i = 0; i <= n; i++) {
      const sx = mz.x + idiv(dx * i, n);
      const sy = mz.y + idiv(dy * i, n);
      if (sx < 0 || sx >= WORLD_W || sy >= WORLD_H) break; // the side edges; the floor is bedrock
      last = i;
      for (let p = 0; p < 2; p++) {
        const ex = sx - shot.tanks[p].x;
        const ey = sy - shot.tanks[p].y;
        if (ex * ex + ey * ey <= reach * reach) hit |= 1 << p;
      }
    }
    const x1 = mz.x + idiv(dx * last, n);
    const y1 = mz.y + idiv(dy * last, n);
    carveCapsule(shot.t, mz.x, mz.y, x1, y1, idiv(launch.width, 2));
    emit(shot, { step: 1, kind: "beam", beam: b, x0: mz.x, y0: mz.y, x1, y1, width: launch.width });
    for (let p = 0; p < 2; p++) if ((hit >> p) & 1) hurt(shot, p, launch.damage, 1, 0);
  }
}
```

### 4.6 Each primitive: the rule, the algorithm, the edge cases

**Blast.** Plan 1's: carve a disc of the radius at the trigger pixel, then exact damage to tank 0 and then tank 1. Every primitive that "ends in a blast" calls the same `blastAt`.

**Split.** Child `i` of `n` is offset `fanOffset(i, n, spreadDeg)`, the volley rule:
- Cascade 50° → −25, 0, 25;
- Hydra 40° → −20, −10, 0, 10, 20;
- Shrapnel 160° → −80, −48, −16, 16, 48, 80;
- Hailstorm 30° → −15, −11, −7, −3, 0, 3, 7, 11, 15.

| `from` | child velocity | child nominal speed |
|---|---|---|
| `up` (impact splits) | straight up rotated by the offset, at `speed × pct` | parent nominal × pct |
| `ahead` (Hydra, Barrage) | the parent's current velocity rotated by the offset, × pct | parent nominal × pct |
| `cone` (Hailstorm) | the parent's current velocity **plus** straight down rotated by the offset at `speed × pct`: a burst carried by the parent's motion | parent nominal × pct |

- **Spawn point:** the parent's last *free* position `(fx, fy)`, shifted by the line offset when `gapPx` is set.
  - Without `gapPx`, the parent reached that point through free samples, so it is free unless an effect has filled it since (a build).
  - With `gapPx`, the shifted point is **not** checked, so a line child can spawn inside a hill or off the world. §3.2 rule 6 says what happens next, and §8.1 pins it.
  - Measured on the prototype over 128,586 Barrage children (20 seeded boards × both shooters × 90 aims × 9 powers):
    - 3.8% spawned inside a hill. 99.3% of those impacted at their first sample, within 1 px of the spawn point. The other 32 flew on: they were on a surface pixel moving out, or a sibling's crater had opened the spot.
    - 2.5% spawned off the world, and all were lost at their first sample.
- **Barrage's line:** `gapPx` shifts child `i` by `(2i − (n−1))·gap/2`, giving −75, −45, −15, 15, 45, 75. Every child carries the parent's velocity. The x offsets are whole pixels on identical trajectories, so on flat ground the six blasts land **exactly 30 px apart**. The gap (30) exceeds the child blast radius (20), so an earlier child's crater never changes a later child's landing; the §8.1 test pins it.
- **Inheritance:** children inherit gravity and feel wind. Their `ignore` mask is computed at spawn (D6), and they first move next step.
- **Nesting:** each child's `Stage` is armed like any shell's. Cascade has 3 generations.

**Delay.** It arms `{ at: step + max(1, steps), trig, effects }` and emits `fuse`. At `at`, before any shell moves, the effects apply with the arming trigger's geometry.
- Twin Nova: blast 50/55 at step S, then 70/60 at the same pixel at S + 30. The tanks haven't moved, so the second blast reaches them through the fresh crater.
- A delay cannot schedule a split or a delay (§2.4 #5).

**Apex / early.** See §3.3 and D4/D5. The roster's `early` is one child's blast: Hydra 26/30, Hailstorm 14/12, Barrage 20/18.

**Bounce (terrain).** See §4.4. Each terrain contact while `bounces > 0` consumes one bounce, reflects, and ends the step at the last free sample. `blastEach` (Skipper) detonates at the contact pixel in the same step, *after* the reflection (the normal is read before the crater exists). When the bounces are used up, the next contact triggers the stage.

**Bounce (walls).** With `walls: true` only side-wall exits bounce. Terrain triggers the stage as usual. With no wall bounces left, leaving the side is `out`.

**Homing.** See §4.4. Swarm's five shells home independently.

**Roll** (`roll` → `walk`).
- A direct tank hit blasts at once, with no roll.
- Otherwise the shell drops from its last free pixel to the ground below (`groundBelow`). If that point is already inside a hitbox, it blasts there.
- It then walks **downhill**, comparing `groundBelow` 6 px either side, measured from 6 px up; on level ground it walks in the travel direction (`sign(vx)`).
- Each column is taken only if the next column's pixel at the walker's height is empty. The walker then drops to that column's ground, so it moves level or down.
- It stops at the first rise (≥ 1 px), on entering a hitbox, at `maxDistance`, or at a world edge. The blast is at the stop column's ground pixel.
- **Rolling off the world is lost:** an `out` (with `lag`) and no blast.

**Dig** (`dig`, D20: owner decision O3).
- **Direction:** the travel direction at impact, `(a, c) = (toInt(vx), toInt(vy))`, **pitch-clamped**: a heading steeper than `DIG_MAX_PITCH` = 30° below level is replaced by exactly 30° below level, keeping the horizontal sense of travel.
  - The test is one exact comparison against the baked table, with no arctangent: `c > 0` and `c · cos 30° > |a| · sin 30°`.
  - The clamped heading is the table's own unit vector, `(±cosDeg(30), sinDeg(30))` = `(±56756, 32768)`. Its sense is the sign of `vx`; with `vx` exactly 0 (a vertical fall, or a trigger with no heading at all) it is **toward the opponent**: right for player 0, left for player 1.
  - Upward headings and headings shallower than 30° are kept as they are (a level shot into a cliff tunnels level).
  - The heading is normalised with `isqrt` and scaled by `length`. The length is never 0, because a zero heading is always clamped.
  - For Burrow that is `(±77, 45)` px from the impact pixel, where the old steep dig at 60°/50 ran `(41, 79)`. Its end blast is therefore 45 px below the impact, out of reach of a tank standing at the impact's level (its hitbox centre is 57 px above the blast, and the blast reaches 34 + 14 = 48). The end blast can reach the enemy only if the impact is at least 10 px above the enemy's ground (on a slope or a ledge), or if the tunnel runs into the hitbox itself; a direct hit still scores in full (§10.1 O3 has the measurements).
- **Reach:** DDA samples from the impact pixel. The tunnel ends early at the first sample outside the world or at or below the floor (bedrock, exclusive), or at the first sample inside a hitbox (inclusive).
- It carves a capsule of radius `width/2` along the reached segment.
- `each` blasts at k × `blastEvery` px strictly before the end, then `then` at the end.
  - Auger: 3 `each` + the end blast = one every 40 px.
  - A direct tank hit digs nothing, and only `then` fires.
- Settle collapses tunnels, because column terrain has no voids between turns. A tunnel matters within the shot and as the lowered ground it leaves.

**Burn** (`burn` → `walk`).
- **Ignition** is the ground below the last free pixel. Each run walks from there under the same no-climb rule: the **pool** walks `pool/2` each way, then the **flow** walks `flow` px downhill (travel direction on level ground), or both ways when `split` (Wildfire).
- A run stops at a rise, an edge, or a tank. A tank that stops a run, or whose hitbox contains the ignition point, is *touched*.
- Each touched tank takes `damage` **once per burn effect**, with `lag` = the run distance to it. There is no terrain change.

**Build.** All shapes act at the trigger pixel (x, y):
- **ball:** a disc of radius r, one `addInterval` per column. The airborne half settles onto the ground, so on flat ground Bastion makes a mound 48 px high at the centre (352 at the centre, 356 at ±17, 374 at ±40).
- **wall:** the `width` columns starting at `x − width/2` each rise by exactly `height` on their own surface (`surfaceTop`), so the wall follows the ground.
- **level:** columns within ±radius are carved above y and filled from y down to their ground. Each becomes solid exactly from y, so a hillside becomes a flat shelf at the impact height.

**No burying (spec §2) holds by construction.** A tank has no y of its own: after the settle it stands at `height[x] − 12`, on its column's single span.
- Dirt added in a tank's column (a ball dropped on it, a wall under it, a level through it) is compacted into that span *beneath* the tank and lifts it. For example, Bastion on the enemy lifted their column from 400 to 328.
- There is no fall damage.
- During the shot, hitboxes are frozen and checked *before* terrain on every sample, so dirt inside a hitbox cannot shield a tank from a later shell.
- Dirt is never added above y = 0.

**Quake** (`quake`, D21: owner decision O9).
- **Damage, to the opponent only:** `⌊damage · (reach − d) / reach⌋` for `d < reach`, where `d = max(0, |tank.x − x| − 14)` is the horizontal distance to the hitbox **edge** (the same edge rule as a blast). The reach is horizontal, so it is unblockable and crosses chasms.
- **The shooter's own tank is exempt** from the shockwave, however close. Aftershock's separate impact blast is an ordinary blast: it can still hurt the shooter, credited to the opponent. On its own tank, Aftershock gives the opponent 50 (the blast), not 85.
- **Furrow:** every column within ±(reach − 1) loses `⌊furrow · (reach − |dx|)/reach⌋` px off its top, the shooter's included. For Quake that is 6 at the source, tapering to 0.
- It is one pass: 519 columns for Quake.

**Beam** (`fireBeams`, D19: owner decision O1).
- **The beam dial.** A beam reads the command angle on the shell dial turned a quarter turn toward the shooter's facing. Player 0 always stands left of player 1 and the tanks never cross, so the facing is the shooter's index:

  `beamDir(shooter, angle)` = `angle − 90` for player 0 (turned clockwise), `angle + 90` for player 1 (turned anticlockwise), in aim-sense degrees (0 = right, 90 = up, 270 = down).

  | command angle | player 0 (faces right) | player 1 (faces left) |
  |---|---|---|
  | 0 | straight down (−90) | straight up (90) |
  | 45 | 45° below level, toward the opponent (−45) | 45° above level, toward the opponent (135) |
  | 90 | **level at the opponent** (0) | **level at the opponent** (180) |
  | 135 | 45° above level (45) | 45° below level (225) |
  | 180 | straight up (90) | straight down (270) |

  - Each player's usual shell half of the dial (0..90 for player 0, 90..180 for player 1) aims a beam from straight down to level; the other half aims it from level up to straight up. So the elevation toward the opponent is the same command's shell elevation minus 90°.
  - Rotating the dial turns a beam the same way it turns a shell, and the mirror of a beam command is `180 − angle`, exactly as for a shell. A mirrored board gives the mirrored outcome (tested), so 2B's mirrored aim grids and the full-roster golden's `180 − a` strategy cover beams unchanged.
  - The wire angle stays an integer in 0..180, and `applyTurn` validates it as before. Plan 3's HUD draws a beam weapon's aim needle along `beamDir(shooter, angle)`, and shows `angle − 90` (player 0) or `90 − angle` (player 1) as the elevation; the AI calls the same function. It is exported from `weapons/primitives.ts`.
- Beam `b` flies along `beamDir(shooter, aim + fanOffset(b))` (Prism: −4, 0, +4 on the dial). As in a shell volley, beam 0 is the most clockwise: the lowest for player 0, the highest for player 1. It is a straight line from that direction's muzzle, `length` px long: 1,200 px for Lancer and Prism, the world's width. Power, gravity and wind are ignored.
- **Samples:** a DDA from the muzzle. It stops at the side edges and at the floor (bedrock); there is no ceiling. A beam aimed down cuts to the floor: Lancer at 0 from flat ground runs from (300, 410) to (300, 499).
- **Hits:** a tank is hit when any sample lies within `TANK_HIT_R + width/2` of its hitbox centre. A beam passes through terrain and tanks and damages each tank at most once.
- **Carve:** a capsule of radius `width/2` along the beam.
- **No self-hit, in any direction:** the muzzle is at least √433 ≈ 20.8 px from the hitbox centre in every direction (22 px, truncated per axis; the minimum is at 36°, offset (17, 12)), the beam only moves away from it, and the reach is ≤ 14 + 6 = 20. The validator caps the width at 12, and a test sweeps all 181 command angles for both shooters, which covers the whole circle.

### 4.7 The static half: `weapons/validate.ts` *(verbatim, full file)*

```ts
// src/game/titles/arcfire/weapons/validate.ts
//
// The static half of the weapon contract: weaponErrors(def) lists every rule a
// WeaponDef breaks ([] = valid), and the cost bounds resolveTurn relies on.
// The roster test requires [] for every entry. The ranges keep every product
// in the sim below 2^53 and every data-fed divisor >= 1. The runtime guards in
// damage.ts / primitives.ts let the degenerate defs the totality test covers
// (zeros, count 0, a cyclic stage, the launch maxima) resolve without throwing;
// data far outside these ranges (a huge carve radius, NaN) is not covered.
import type { Blast, Effect, Stage, WeaponDef } from "./types";
import { MAX_FLIGHT_STEPS, MAX_SHELLS, MAX_STAGE_DEPTH, MAX_TURN_STEPS } from "../constants";

const isInt = (v: unknown, lo: number, hi: number): boolean =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

function check(errs: string[], path: string, v: unknown, lo: number, hi: number): void {
  if (!isInt(v, lo, hi)) errs.push(`${path}: ${String(v)} is not an integer in [${lo}, ${hi}]`);
}

function checkBlast(errs: string[], path: string, b: Blast): void {
  check(errs, `${path}.radius`, b.radius, 1, 200);
  check(errs, `${path}.damage`, b.damage, 1, 200);
  if (b.falloff !== undefined && b.falloff !== "linear" && b.falloff !== "quadratic") errs.push(`${path}.falloff: unknown`);
}

const EFFECT_KEYS = ["blast", "split", "roll", "dig", "burn", "build", "quake", "delay"];

function checkEffects(errs: string[], path: string, effects: readonly Effect[], apexList: boolean, depth: number, inDelay: boolean): void {
  if (!Array.isArray(effects) || effects.length === 0) {
    errs.push(`${path}: must be a non-empty effect list`);
    return;
  }
  effects.forEach((e, i) => {
    const p = `${path}[${i}]`;
    const keys = Object.keys(e);
    if (keys.length !== 1 || !EFFECT_KEYS.includes(keys[0])) {
      errs.push(`${p}: an effect has exactly one known key`);
      return;
    }
    if (inDelay && (keys[0] === "split" || keys[0] === "delay")) errs.push(`${p}: a delay cannot schedule a ${keys[0]}`);
    if ("blast" in e) checkBlast(errs, `${p}.blast`, e.blast);
    else if ("split" in e) {
      const s = e.split;
      check(errs, `${p}.split.count`, s.count, 1, 9);
      check(errs, `${p}.split.spreadDeg`, s.spreadDeg, 0, 180);
      check(errs, `${p}.split.speedPct`, s.speedPct, 1, 200);
      if (s.gapPx !== undefined) check(errs, `${p}.split.gapPx`, s.gapPx, 0, 200);
      if (s.from !== "up" && s.from !== "ahead" && s.from !== "cone") errs.push(`${p}.split.from: unknown`);
      else if (s.from !== "up" && !apexList) errs.push(`${p}.split.from: "${s.from}" only in an apex stage's effects (at an impact the heading points into the ground)`);
      checkStage(errs, `${p}.split.child`, s.child, depth + 1);
    } else if ("roll" in e) {
      check(errs, `${p}.roll.maxDistance`, e.roll.maxDistance, 1, 1200);
      checkBlast(errs, `${p}.roll.then`, e.roll.then);
    } else if ("dig" in e) {
      const d = e.dig;
      check(errs, `${p}.dig.length`, d.length, 1, 400);
      check(errs, `${p}.dig.width`, d.width, 2, 32);
      if (d.blastEvery !== undefined || d.each !== undefined) {
        if (d.each === undefined || d.blastEvery === undefined) errs.push(`${p}.dig: blastEvery and each come together`);
        else {
          check(errs, `${p}.dig.blastEvery`, d.blastEvery, 1, d.length);
          checkBlast(errs, `${p}.dig.each`, d.each);
        }
      }
      if (d.then !== undefined) checkBlast(errs, `${p}.dig.then`, d.then);
    } else if ("burn" in e) {
      check(errs, `${p}.burn.flow`, e.burn.flow, 0, 1200);
      check(errs, `${p}.burn.pool`, e.burn.pool, 0, 400);
      check(errs, `${p}.burn.damage`, e.burn.damage, 1, 200);
    } else if ("build" in e) {
      const b = e.build;
      if (b.shape === "wall") {
        check(errs, `${p}.build.width`, b.width, 1, 200);
        check(errs, `${p}.build.height`, b.height, 1, 200);
      } else if (b.shape === "ball" || b.shape === "level") check(errs, `${p}.build.radius`, b.radius, 1, 200);
      else errs.push(`${p}.build.shape: unknown`);
    } else if ("quake" in e) {
      check(errs, `${p}.quake.reach`, e.quake.reach, 1, 1200);
      check(errs, `${p}.quake.damage`, e.quake.damage, 1, 200);
      check(errs, `${p}.quake.furrow`, e.quake.furrow, 0, 50);
    } else {
      check(errs, `${p}.delay.steps`, e.delay.steps, 1, 600);
      checkEffects(errs, `${p}.delay.then`, e.delay.then as Effect[], false, depth, true);
    }
  });
}

function checkStage(errs: string[], path: string, st: Stage, depth: number): void {
  if (depth > MAX_STAGE_DEPTH) {
    errs.push(`${path}: stages nest deeper than ${MAX_STAGE_DEPTH}`);
    return; // also stops a cyclic def
  }
  if (st.on !== "impact" && st.on !== "apex") errs.push(`${path}.on: unknown`);
  checkEffects(errs, `${path}.effects`, st.effects, st.on === "apex", depth, false);
  if (st.early !== undefined) {
    if (st.on !== "apex") errs.push(`${path}.early: only on an apex stage`);
    checkEffects(errs, `${path}.early`, st.early, false, depth, false);
  }
  if (st.homing !== undefined) {
    if (st.on !== "impact") errs.push(`${path}.homing: only on an impact stage`);
    check(errs, `${path}.homing.degPerStep`, st.homing.degPerStep, 1, 10);
  }
  if (st.bounce !== undefined) {
    if (st.on !== "impact") errs.push(`${path}.bounce: only on an impact stage`);
    check(errs, `${path}.bounce.times`, st.bounce.times, 1, 10);
    check(errs, `${path}.bounce.restitutionPct`, st.bounce.restitutionPct, 1, 100);
    if (st.bounce.blastEach !== undefined) checkBlast(errs, `${path}.bounce.blastEach`, st.bounce.blastEach);
  }
}

/** Shells one stage's shell can lead to, itself included (the larger of its effects and its early list). */
function stageShells(st: Stage, depth: number): number {
  if (depth > MAX_STAGE_DEPTH) return MAX_SHELLS + 1;
  const list = (effects: readonly Effect[] | undefined): number => {
    let n = 0;
    for (const e of effects ?? []) if ("split" in e) n += e.split.count * stageShells(e.split.child, depth + 1);
    return n;
  };
  return 1 + Math.max(list(st.effects), list(st.early));
}

/** Steps from one stage's shell's spawn to the last thing it can cause. */
function stageSteps(st: Stage, depth: number): number {
  if (depth > MAX_STAGE_DEPTH) return MAX_TURN_STEPS + 1;
  let tail = 0;
  for (const e of [...st.effects, ...(st.early ?? [])]) {
    if ("delay" in e && e.delay.steps > tail) tail = e.delay.steps;
    if ("split" in e) tail = Math.max(tail, stageSteps(e.split.child, depth + 1));
  }
  return MAX_FLIGHT_STEPS + tail;
}

/** Static upper bound on the shells one turn with `def` creates. */
export function maxShells(def: WeaponDef): number {
  if (def.launch.kind === "beam" || !def.stage) return 0;
  return (def.launch.count ?? 1) * stageShells(def.stage, 1);
}

/** Static upper bound on the steps one turn with `def` runs. */
export function maxTurnSteps(def: WeaponDef): number {
  if (def.launch.kind === "beam" || !def.stage) return 1;
  return stageSteps(def.stage, 1);
}

/** Every rule `def` breaks; [] when it is valid. */
export function weaponErrors(def: WeaponDef): string[] {
  const errs: string[] = [];
  if (typeof def.id !== "string" || def.id === "") errs.push("id: empty");
  check(errs, "tier", def.tier, 1, 3);
  check(errs, "power", def.power, 1, 100);
  const l = def.launch;
  check(errs, "launch.count", l.count ?? 1, 1, 9);
  check(errs, "launch.spreadDeg", l.spreadDeg ?? 0, 0, 180);
  if (l.kind === "shell") {
    check(errs, "launch.speedPct", l.speedPct ?? 100, 1, 300);
    check(errs, "launch.gravityPct", l.gravityPct ?? 100, 0, 200);
    if (!def.stage) errs.push("stage: a shell launch needs one");
    else checkStage(errs, "stage", def.stage, 1);
  } else if (l.kind === "beam") {
    check(errs, "launch.length", l.length, 1, 1400);
    check(errs, "launch.width", l.width, 2, 12);
    check(errs, "launch.damage", l.damage, 1, 200);
    if (def.stage) errs.push("stage: a beam has none");
  } else errs.push("launch.kind: unknown");
  if (errs.length === 0) {
    if (maxShells(def) > MAX_SHELLS) errs.push(`maxShells ${maxShells(def)} > MAX_SHELLS ${MAX_SHELLS}`);
    if (maxTurnSteps(def) > MAX_TURN_STEPS) errs.push(`maxTurnSteps ${maxTurnSteps(def)} > MAX_TURN_STEPS ${MAX_TURN_STEPS}`);
  }
  return errs;
}
```

The ranges keep every product below 2^53, and every data-fed divisor is ≥ 1.

The runtime guards in `damage.ts` and `primitives.ts` keep degenerate data from dividing by zero (§7.1 lists the divisor audit). What they are proven to cover is what the totality test resolves (§8.1): zeros, count 0, reach 0, width 0, the launch maxima, and a cyclic stage.

Data far outside the validator's ranges is **not** covered:
- `carveCapsule` sizes its `half` table from the radius, so a huge dig or beam width throws a `RangeError` or allocates gigabytes;
- NaN data is unspecified.

The validator is the gate: the roster test requires `[]` for every entry, and 2B's probe definitions should pass it too.

### 4.8 Cost

Measured on Node 24 on the design machine, running the bundled sim (Revision 2 code). The table is the mean `resolveTurn` (recording) over the 5 sweep boards × 114 aims (§1) × 3 repeats after a warm-up, averaged over two runs, excluding `cloneMatch` (≈ 22 µs):

| Class | Weapons (mean ms) |
|---|---|
| single shell + blast | Pulse 0.026 · Pulse II 0.028 · Nova 0.029 · Needle 0.028 · Crater 0.029 · Railshot 0.037 · Twin Nova 0.028 |
| volley | Triad 0.050 · Fan 0.071 |
| split | Cascade 0.054 · Hydra 0.050 · Hailstorm 0.057 · Shrapnel 0.037 · Barrage 0.048 |
| bounce | Skipper 0.037 · Pinball 0.042 · Ricochet 0.036 |
| roll / dig / burn | Tumbler 0.029 · Juggernaut 0.031 · Burrow 0.034 · Auger 0.036 · Inferno 0.029 · Wildfire 0.030 |
| build | Rampart 0.028 · Bastion 0.029 · Leveler 0.031 |
| beam | Lancer 0.060 · Prism 0.128 |
| homing | Seeker 0.033 · Swarm 0.082 |
| quake | Quake 0.032 · Aftershock 0.032 |

**Model.**
- **Fixed per-turn floor:** ≈ 0.02–0.03 ms (`spansFromHeight`, `settle`, the heights copy).
- **Shells:** ≈ 0.03–0.05 µs per shell-step. The cost driver is shell count × flight length.
- **Carving** is cheap at these sizes (one `removeInterval` per column): Crater's 181-column blast costs no measurably more than Pulse's 57.
- **Beams** are the exception since the owner's 1,200 px length: each beam's DDA and capsule walk ≈ 1,200 samples, so Lancer adds ≈ 0.03 ms over the floor and Prism's three beams ≈ 0.10 ms. Prism is now the slowest weapon; at 700 / 600 px the same run gave Lancer 0.046 and Prism 0.080.
- **Bounces** read ≤ 197 probes per terrain bounce at radius 8 (49 at radius 4). Skipper and Pinball measured ≈ 0.01 ms slower than at radius 4, which is within run-to-run noise here: Ricochet, whose wall bounces never probe, moved as much.
- **Worst single turns:** ≤ 0.45 ms in these runs, as isolated outliers consistent with GC pauses.

**Budgets.**
- **Spec §5, single shell ≤ 0.2 ms:** met about 8× over (Pulse 0.026 ms).
- **Ace, 4,000 sims per AI turn:** clone + resolve ≈ 0.05–0.15 ms, so about 0.2–0.6 s per AI turn in Node.
- **Veteran daily verification:** 10 turns × 1,500 sims × ≈ 0.05 ms ≈ 0.75 s, under 5 s.
- **WebKit and Firefox JITs** may be 1.5–2× slower; there is margin.

> **Measurement trap (new finding):** timing the sim *inside vitest* inflates it about 4–5×. The Pulse mean was 0.15–0.19 ms for both the Plan 1 code and the 2A code, against 0.025–0.045 ms bundled; on the Revision 2 code, §8.6's own best-of-three `measure` gives Pulse 0.141 ms unbundled in vitest against 0.027 ms bundled, and the slowest weapon 0.44 ms, close to the perf test's 0.5 ms ceiling. The most likely cause is the per-call live-binding lookups that vitest's module runner adds across modules; the measurement, not the cause, is what matters here. Production (the Next bundle, the worker, the server verifier) runs bundled code, so the perf test bundles the sim with esbuild before timing it (§8.6). 2B's < 5 s verification test must do the same.

---

## 5 · The roster (deliverable d)

### 5.1 Wire order

Indices 0–7 are **byte-for-byte unchanged**, and their definition digests are pinned from Task 1 (§8.4). Indices 8–31 are appended in spec §4.2 display order. `power` is a placeholder until 2B's harness writes it: T1 30, T2 55, T3 80, DIRT 25. **Bold** marks a value the spec leaves open; each is an owner-tunable number (O13, default accepted). *Italic* marks an owner decision of 2026-09-23 that departs from the spec text (§2.4).

| idx | id | tag · tier | launch | stage | effects |
|---|---|---|---|---|---|
| 0 | pulse | BLAST 1 | shell | impact | blast 28/40 |
| 1 | pulse2 | BLAST 2 | shell | impact | blast 40/60 |
| 2 | nova | BLAST 3 | shell | impact | blast 72/100 |
| 3 | needle | BLAST 2 | shell 115% | impact | blast 10/110 quadratic |
| 4 | crater | BLAST 1 | shell | impact | blast 90/25 |
| 5 | triad | VOLLEY 1 | 3 shells, 6° | impact | blast 24/24 |
| 6 | fan | VOLLEY 2 | 5 shells, 12° | impact | blast 20/18 |
| 7 | railshot | SPECIAL 2 | shell 180%, gravity 40% | impact | blast 18/75 |
| 8 | twinnova | BLAST 3 | shell | impact | blast 50/55; delay 30 → blast 70/60 |
| 9 | cascade | SPLIT 3 | shell | impact | blast 20/15; split 3 up 50° 40% → [blast 18/15; split 3 up **50° 40%** → blast 14/10] |
| 10 | hydra | SPLIT 3 | shell | apex, early **26/30** | split 5 ahead 40° **100%** → blast 26/30 |
| 11 | hailstorm | SPLIT 2 | shell | apex, early **14/12** | split 9 cone 30° **50%** → blast 14/12 |
| 12 | shrapnel | SPLIT 2 | shell | impact | blast 24/20; split 6 up 160° 35% → blast 10/8 |
| 13 | barrage | SPLIT 2 | shell | apex, early **20/18** | split 6 ahead 0° **100%**, gap 30 → blast 20/18 |
| 14 | skipper | BOUNCE 2 | shell | impact; bounce 3 × 55%, each 22/20 | blast 26/24 |
| 15 | pinball | BOUNCE 2 | shell | impact; bounce 6 × 80% | blast 36/55 |
| 16 | ricochet | BOUNCE 1 | shell | impact; wall bounce 2 × **100%** | blast 30/40 |
| 17 | tumbler | ROLL 1 | shell | impact | roll ≤ 160 → blast 30/40 |
| 18 | juggernaut | ROLL 3 | shell | impact | roll ≤ 300 → blast 60/85 |
| 19 | burrow | DIG 2 | shell | impact | dig 90 × 14 *(pitch ≤ 30° down)* → blast 34/55 |
| 20 | auger | DIG 2 | shell | impact | dig 160 × **14** *(pitch ≤ 30° down)*, every 40 → 18/16, **end 18/16** |
| 21 | inferno | FIRE 3 | shell | impact | burn pool 30, flow 220 downhill, 70 |
| 22 | wildfire | FIRE 2 | shell | impact | burn **pool 0**, flow 140 both ways, 45 |
| 23 | rampart | DIRT 1 | shell | impact | build wall 36 × 80 |
| 24 | bastion | DIRT 1 | shell | impact | build ball r 48 |
| 25 | leveler | DIRT 1 | shell | impact | build level r 80 |
| 26 | lancer | BEAM 2 | beam *1200* × 8, 60, *on the beam dial* | — | — |
| 27 | prism | BEAM 3 | 3 beams, 8°, *1200* × 6, 35, *on the beam dial* | — | — |
| 28 | seeker | HOMING 2 | shell | impact; homing 2°/step | blast 32/50 |
| 29 | swarm | HOMING 3 | 5 shells, 14° | impact; homing 1°/step | blast 16/20 |
| 30 | quake | QUAKE 2 | shell | impact | quake ±260, 55, furrow 6 *(never the shooter)* |
| 31 | aftershock | QUAKE 3 | shell | impact | blast 40/50; quake ±200, 35, furrow **4** *(never the shooter)* |

**Tag counts:** BLAST 6, VOLLEY 2, SPLIT 5, BOUNCE 3, ROLL 2, DIG 2, FIRE 2, DIRT 3, BEAM 2, HOMING 2, QUAKE 2, SPECIAL 1, which is 32. Each guaranteed tag (BLAST, SPLIT, DIRT) has at least 3 candidates.

### 5.2 The appended source *(verbatim)*

`roster.ts`'s import line becomes `import type { Blast, WeaponDef } from "./types";`, followed by this helper:

```ts
const blast = (radius: number, damage: number): Blast => ({ radius, damage });
```

These entries go before the closing `];`. Each weapon task (§9) appends a contiguous slice in index order:

```ts
  // --- Plan 2A: indices 8..31, in spec §4.2 display order. Numbers the spec leaves open are initial choices (spec §4.2).
  {
    id: "twinnova", name: "Twin Nova", tag: "BLAST", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: blast(50, 55) }, { delay: { steps: 30, then: [{ blast: blast(70, 60) }] } }] },
  },
  {
    id: "cascade", name: "Cascade", tag: "SPLIT", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: blast(20, 15) }, { split: { count: 3, spreadDeg: 50, speedPct: 40, from: "up",
      child: { on: "impact", effects: [{ blast: blast(18, 15) }, { split: { count: 3, spreadDeg: 50, speedPct: 40, from: "up",
        child: { on: "impact", effects: [{ blast: blast(14, 10) }] } } }] } } }] },
  },
  {
    id: "hydra", name: "Hydra", tag: "SPLIT", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "apex", effects: [{ split: { count: 5, spreadDeg: 40, speedPct: 100, from: "ahead",
      child: { on: "impact", effects: [{ blast: blast(26, 30) }] } } }], early: [{ blast: blast(26, 30) }] },
  },
  {
    id: "hailstorm", name: "Hailstorm", tag: "SPLIT", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "apex", effects: [{ split: { count: 9, spreadDeg: 30, speedPct: 50, from: "cone",
      child: { on: "impact", effects: [{ blast: blast(14, 12) }] } } }], early: [{ blast: blast(14, 12) }] },
  },
  {
    id: "shrapnel", name: "Shrapnel", tag: "SPLIT", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: blast(24, 20) }, { split: { count: 6, spreadDeg: 160, speedPct: 35, from: "up",
      child: { on: "impact", effects: [{ blast: blast(10, 8) }] } } }] },
  },
  {
    id: "barrage", name: "Barrage", tag: "SPLIT", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "apex", effects: [{ split: { count: 6, spreadDeg: 0, speedPct: 100, from: "ahead", gapPx: 30,
      child: { on: "impact", effects: [{ blast: blast(20, 18) }] } } }], early: [{ blast: blast(20, 18) }] },
  },
  {
    id: "skipper", name: "Skipper", tag: "BOUNCE", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", bounce: { times: 3, restitutionPct: 55, blastEach: blast(22, 20) }, effects: [{ blast: blast(26, 24) }] },
  },
  {
    id: "pinball", name: "Pinball", tag: "BOUNCE", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", bounce: { times: 6, restitutionPct: 80 }, effects: [{ blast: blast(36, 55) }] },
  },
  {
    id: "ricochet", name: "Ricochet", tag: "BOUNCE", tier: 1, power: 30,
    launch: { kind: "shell" },
    stage: { on: "impact", bounce: { times: 2, restitutionPct: 100, walls: true }, effects: [{ blast: blast(30, 40) }] },
  },
  {
    id: "tumbler", name: "Tumbler", tag: "ROLL", tier: 1, power: 30,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ roll: { maxDistance: 160, then: blast(30, 40) } }] },
  },
  {
    id: "juggernaut", name: "Juggernaut", tag: "ROLL", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ roll: { maxDistance: 300, then: blast(60, 85) } }] },
  },
  {
    id: "burrow", name: "Burrow", tag: "DIG", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ dig: { length: 90, width: 14, then: blast(34, 55) } }] },
  },
  {
    id: "auger", name: "Auger", tag: "DIG", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ dig: { length: 160, width: 14, blastEvery: 40, each: blast(18, 16), then: blast(18, 16) } }] },
  },
  {
    id: "inferno", name: "Inferno", tag: "FIRE", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ burn: { flow: 220, pool: 30, damage: 70 } }] },
  },
  {
    id: "wildfire", name: "Wildfire", tag: "FIRE", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ burn: { flow: 140, pool: 0, damage: 45, split: true } }] },
  },
  {
    id: "rampart", name: "Rampart", tag: "DIRT", tier: 1, power: 25,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ build: { shape: "wall", width: 36, height: 80 } }] },
  },
  {
    id: "bastion", name: "Bastion", tag: "DIRT", tier: 1, power: 25,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ build: { shape: "ball", radius: 48 } }] },
  },
  {
    id: "leveler", name: "Leveler", tag: "DIRT", tier: 1, power: 25,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ build: { shape: "level", radius: 80 } }] },
  },
  {
    id: "lancer", name: "Lancer", tag: "BEAM", tier: 2, power: 55,
    launch: { kind: "beam", length: 1200, width: 8, damage: 60 },
  },
  {
    id: "prism", name: "Prism", tag: "BEAM", tier: 3, power: 80,
    launch: { kind: "beam", count: 3, spreadDeg: 8, length: 1200, width: 6, damage: 35 },
  },
  {
    id: "seeker", name: "Seeker", tag: "HOMING", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", homing: { degPerStep: 2 }, effects: [{ blast: blast(32, 50) }] },
  },
  {
    id: "swarm", name: "Swarm", tag: "HOMING", tier: 3, power: 80,
    launch: { kind: "shell", count: 5, spreadDeg: 14 },
    stage: { on: "impact", homing: { degPerStep: 1 }, effects: [{ blast: blast(16, 20) }] },
  },
  {
    id: "quake", name: "Quake", tag: "QUAKE", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ quake: { reach: 260, damage: 55, furrow: 6 } }] },
  },
  {
    id: "aftershock", name: "Aftershock", tag: "QUAKE", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: blast(40, 50) }, { quake: { reach: 200, damage: 35, furrow: 4 } }] },
  },
];
```

---

## 6 · Timeline (deliverable e)

### 6.1 `timeline.ts` *(verbatim, full file)*

```ts
// src/game/titles/arcfire/timeline.ts
//
// What one resolved turn looked like, for the renderer to play back (spec
// §3.4). Presentation-only: never hashed and never fed back into the sim.
//
// Every event's `step` is the sim step it was APPLIED on, and `events` is in
// application order (so it is sorted by step). Roll, dig, burn and quake
// resolve instantly in the sim; their events carry the geometry plus `dur`,
// the display steps the animation takes at SHOW_PX_PER_STEP, and the blasts,
// damage and exits they cause carry `lag`: show them at step + lag, when the
// animation reaches them. Changing these rates never moves a hash.
import type { SettleFall } from "./terrain";
import { ceilDiv } from "./imath";

/** Display speed of the instant effects' animations, px per step. Presentation only. */
export const SHOW_PX_PER_STEP = { roll: 3, dig: 4, burn: 4, quake: 8 } as const;

/** Display steps for `px` of animation at `rate` px per step. */
export const showSteps = (px: number, rate: number): number => ceilDiv(px < 0 ? 0 - px : px, rate);

export type TimelineEvent =
  | { step: number; kind: "blast"; shell: number; x: number; y: number; radius: number; lag: number }
  | { step: number; kind: "damage"; target: number; amount: number; lag: number }
  | { step: number; kind: "out"; shell: number; x: number; y: number; lag: number } // left a side edge, or a flight cap
  // Plan 2A — `shell` indexes Timeline.shells
  | { step: number; kind: "bounce"; shell: number; x: number; y: number; wall: boolean } // the path continues through it
  | { step: number; kind: "split"; shell: number; x: number; y: number; children: number[] }
  | { step: number; kind: "dud"; shell: number; x: number; y: number } // an apex weapon hit early and has no `early` effects
  | { step: number; kind: "fuse"; shell: number; x: number; y: number; at: number } // a delay armed here fires at step `at`
  | { step: number; kind: "roll"; shell: number; path: number[]; dur: number } // flat [x, y, ...], one point per column, ends at the stop
  | { step: number; kind: "dig"; shell: number; x0: number; y0: number; x1: number; y1: number; width: number; dur: number }
  | { step: number; kind: "burn"; shell: number; x: number; y: number; flows: number[][]; dur: number } // each run's flat path
  // build: size = the ball/level radius or the wall height; width = the columns it spans (the wall's width, or 2 × radius + 1), the first at x - floor(width / 2)
  | { step: number; kind: "build"; shell: number; shape: "ball" | "wall" | "level"; x: number; y: number; size: number; width: number }
  | { step: number; kind: "quake"; shell: number; x: number; y: number; reach: number; furrow: number; dur: number }
  | { step: number; kind: "beam"; beam: number; x0: number; y0: number; x1: number; y1: number; width: number }; // muzzle to end, along beamDir: may point down

export interface ShellPath {
  angle: number; // launch angle (muzzle shells; may lie outside 0..180 at a volley's edge), or the fan offset (children)
  parent: number; // index of the shell that spawned this one; -1 for muzzle shells
  start: number; // the step of points[0]: point k is at step start + k
  points: number[]; // flat [x0, y0, x1, y1, ...] px: the spawn point, then one point per step, ending at the terminal event
}

export interface Timeline {
  shooter: number;
  move: { fromX: number; toX: number } | null;
  wind: number; // px/s² during this turn
  weapon: number; // roster index fired
  steps: number; // sim steps the shot took (1 for beams); the renderer adds any dur/lag beyond it
  shells: ShellPath[];
  events: TimelineEvent[]; // in application order, so sorted by step
  settle: { heights: Int32Array; falls: SettleFall[] };
  points: [number, number]; // points awarded this turn to player 0 / player 1
}
```

### 6.2 The playback contract (Plan 3)

- **Shell paths.** Shell point k is at step `start + k`. A path ends at its shell's terminal point:
  - the trigger pixel of its `blast`/`split`/`dud`, or the trigger that started its `roll`/`dig`/`burn`/`build`/`quake`;
  - or its `out`, including an out at the flight cap or the turn backstop.

  An apex shell's path ends at its last point, which equals the `split` (x, y). A `bounce` is mid-path.
- **Timing.** Show an event at `step + lag` (with `lag` 0 unless a roll, dig, burn or quake caused it). Animate `roll.path`, `burn.flows`, the `dig` segment and the `quake` ring over `dur` steps from `step`. The playback length is the maximum of `steps` and every `step + lag` / `step + dur`.
- **Other events.**
  - `fuse` shows a ticking marker until `at`.
    - A `fuse` whose `at` is later than `steps` never fired: the turn backstop (§3.2 rule 10) dropped it. Fizzle it at `steps`.
    - That is the backstop's only trace for delays. It is exact: every delay with `at ≤ MAX_TURN_STEPS` fires, and `steps` is `MAX_TURN_STEPS` when the backstop hits.
    - It is unreachable for the roster, whose latest delay fires by step 1,230.
  - `build.size` is the ball or level radius, or the wall height.
    - `build.width` is the number of columns the shape spans (the wall's width, or 2 × radius + 1), starting at `x − ⌊width/2⌋`; clip it to the world.
    - Both come with the event, so a build reached through a delay or a child stage needs no weapon lookup.
  - `beam` events are all at step 1, and a beam weapon has no shells. A beam runs from `(x0, y0)` to `(x1, y1)` in any direction, down included; it ends early at a side edge or the floor.
- **Aiming a beam** (the HUD, before the shot). A beam weapon's aim needle points along `beamDir(shooter, angle)` (§4.6), not along the shell angle, and its readout is the elevation toward the opponent: `angle − 90` for player 0, `90 − angle` for player 1. The needle turns the same way as a shell's as the angle changes, and 90 is level at the opponent for both players.
- **Terrain.** Every terrain edit appears as a `blast` (disc), `dig`/`beam` (capsule), `quake` (furrow) or `build` event. Together with Plan 3's pre-settle heightfield, that is enough to animate the dirt.
- **Hashing.** The Timeline is presentation only and never hashed, so all of this moves no pin.

---

## 7 · The spec §9.1 carry-forwards, and the golden re-pin (deliverable f)

### 7.1 Decisions

1. **Volleys near 0°/180° (D13): never clamped.** Each shell flies at `aim + offset`, from its own muzzle, using `cosDeg`/`sinDeg`.
   - Fan at 2° → [−4, −1, 2, 5, 8]; at 178° → [172, 175, 178, 181, 184]. The corpus sees −7° to 187°.
   - Why: one fan shape for every aim, a continuous score surface for 2B's grid search, and the same rule for Prism's beams.
   - Rejected: shifting the fan inward. The centre shell would no longer go where the reticle points, and one aim would have two different fans.
   - Cost: an edge shell below the horizon can land near the shooter. Fan at 180°/100 on the corpus hills gives the opponent 2 points (O6).
2. **`stepShell` rounding (D14): floor.** Every position-to-pixel conversion in flight uses `floorPx`: the samples, the sample count, recorded points and the cap point.
   - Column c is exactly [c, c+1), so the left edge is x = 0 and a step crossing 0 no longer drops a sample.
   - `muzzle` keeps `toInt`, whose offsets are mirror-symmetric.
   - Proven inert for both Plan 1 pins. The corpus's `special|left-edge|seed777|railshot|129/10` now ends `out` at x = −1 (Plan 1 blasted column 0).
3. **`STANDARD_SETTINGS` / `SHORT_SETTINGS`** (§2.2, frozen, `rosterSize: 32`). Tests (§8.2) prove the real 32-weapon roster always satisfies the tag guarantees:
   - **by construction, not by sampling.** `drawPool` takes one weapon per guaranteed tag before its shuffle. A weapon has one tag, so distinct tags never compete for a candidate, and the loop stops early only when the pool is full. The test asserts the three preconditions: the guaranteed tags are distinct; there are no more of them than `poolSize`; and each has a weapon in `ROSTER[0, rosterSize)`. BLAST has 6 candidates, SPLIT 5 and DIRT 3;
   - over seeds 0..499, both settings draw distinct in-range pools with BLAST, SPLIT and DIRT;
   - the draft completes;
   - all 32 weapons appear in some pool.

   A tripwire asserts `STANDARD_SETTINGS.rosterSize === ROSTER.length`, so a 33rd weapon forces a deliberate settings and `simVersion` decision.
4. **Cross-engine corpus fixture** (§8.4): it covers wind off and on, both shooters, a move, extreme aims, the flight cap, the left edge, sudden death (draw and win), and every primitive. The Chromium and WebKit gate runs it; Firefox runs in CI.
5. **A golden pin that survives roster appends** (D18):
   - `rosterSize` pins the Plan 1 golden (8) and the full-roster golden (32, a literal);
   - the corpus is keyed by weapon id and hashed with `hashBoard`, which excludes settings, pool, hands and RNG;
   - per-weapon definition digests catch data edits that don't change a corpus outcome.
6. **`idiv` divisor guards.** Weapon data reaches these divisors. Each has a static rule (`validate.ts`) and a runtime guard:

   | Site | Divisor | Guard |
   |---|---|---|
   | `fanOffset` (volley, split, beam) | 2(count − 1) | only when count > 1 |
   | `blastDamage` | R, R² | `r <= 0 \|\| D <= 0 → 0`; validator radius ≥ 1 |
   | `dig` direction | `isqrt` length | ≥ 1 by construction: a zero heading is always replaced by the 30° pitch-clamp vector (D20) |
   | `dig` spacing | `d.length` (in `idiv(k·every·n, length)`) | `each` only when `blastEvery > 0`; the loop needs `k·every < length`; validator length ≥ 1 |
   | `quake` falloff and furrow | reach | `reach <= 0 → return`; validator reach ≥ 1 |
   | `reflect` | n·n | the normal is never (0, 0) by construction |
   | `steer` | none | a comparison, not a division |
   | every DDA (`stepShell`, capsule, dig, beam) | n | `Math.max(…, 1)` |
   | percentages, `/2`, `STEPS_PER_SEC`, `showSteps` rates | literals | — |

   The totality test (§8.1, `validate.test.ts`) resolves degenerate definitions: all zeros, count 0, reach 0, width 0, the launch maxima (9 shells over 180° at 300%, gravity 0), and a cyclic stage. It asserts no throw, integer state and a valid hash.
   - That is the whole claim. Data far outside the validator's ranges can still throw, for example a huge carve radius (`carveCapsule` allocates `r + 1` entries) or NaN.
   - The validator keeps such data out of the roster (§4.7).
7. **Exact-distance damage (D12): adopted** (§4.3). Spec §3.3's last paragraph becomes "decided in Plan 2A: exact".

### 7.2 Every golden-moving change (the complete list)

| # | Change (task) | What moves | Pins: before → after |
|---|---|---|---|
| G1 | `hashMatch` folds `rosterSize` (T2) | every `hashMatch` value; nothing that is played | golden `63222780` → **`4c1d8598`** (scores [32, 84], winner 1 and commands unchanged); windless `1c8832e9` → **`8d7dc831`** ([36, 24]); corpus unchanged (`09403dbb`) |
| G2 | exact-distance damage (T3) | points of blasts at non-integer distances; only ever down | golden → **`389a1340`**, scores [32, 84] → **[31, 83]**, winner and commands unchanged; windless unchanged; `resolve.test` Fan `[51,0]` → **`[50,0]`**; corpus: **exactly 4 cases**, points only (below), digest → `655486aa` |
| G3 | floored pixels (T4) | shells crossing x ∈ (−1, 0) are now `out`; Timeline points at negative coordinates | pins unchanged; corpus: `fan\|hills\|p1\|w0\|m0\|130/80`, `special\|left-edge\|seed777\|railshot\|129/10` |
| G4 | unclamped volleys (T4) | Triad aimed within 3° / Fan within 6° of the horizon | pins unchanged; corpus: 7 volley cases + both sudden-death matches (below); G3 + G4 = **exactly 11 cases**, digest → `fa6b1ed7` |
| G5 | appended weapons (T7–T13) | nothing: every pinned match has `rosterSize` 8 | none; the corpus only adds keys, reaching **`a7100140`** (483 cases). The owner decisions (D9's radius 8, D19–D21) act only inside weapons 14–31, whose keys are first written in T8–T13, so they move no pin that an earlier task lands |
| — | loop refactor, allocation-free intervals, record flag, Timeline fields, validator (T5, T6) | nothing | every pin and the corpus byte-identical |
| — | Circle TD golden `5167b43d` | untouched: no shared file changes | unchanged |

- **G2's four cases:**
  - `triad|hills|p0|w-40|m0|50/80` [37,0] → [36,0]
  - `triad|hills|p0|w0|m1|55/75` [52,0] → [50,0]
  - `fan|hills|p0|w0|m0|65/95` [5,0] → [4,0]
  - `fan|hills|p0|w-40|m0|50/80` [24,0] → [23,0]
- **G3 + G4's eleven cases:**
  - `triad|hills|p0|w0|m0|0/100`, `triad|hills|p0|w0|m0|2/30`, `triad|flat|p0|w0|m0|0/60`;
  - `fan|hills|p1|w0|m0|130/80`, `fan|hills|p0|w0|m0|0/100`, `fan|hills|p0|w0|m0|180/100` (now [0, 2]), `fan|hills|p0|w0|m0|2/30`, `fan|flat|p0|w0|m0|0/60`;
  - `special|left-edge|seed777|railshot|129/10`;
  - `match|sudden-death-draw` and `match|sudden-death-win` (terrain only; still a draw, and still won 40–0).

### 7.3 The re-pin procedure

**Every re-pin (T2, T3, T4) follows the same five steps.**

1. **Before touching sim code**, run `npx vitest run src/game/titles/arcfire`. All green.
2. **Make the one change.** Run the suite without update variables. It must fail **only** in the declared set for that task (§7.2). Anything else failing is a bug: stop.
3. **Re-pin with the variables set to exactly `1`:**
   - `UPDATE_ARCFIRE_GOLDEN=1 npx vitest run src/game/titles/arcfire/determinism.test.ts`
   - `UPDATE_ARCFIRE_CORPUS=1 npx vitest run src/game/titles/arcfire/corpus.test.ts`

   Edit the windless and Fan literals by hand. Re-run with no variables: green.
4. **`npm run test:e2e:cross-engine`:** Chromium and WebKit reproduce the new golden and corpus digest (Firefox runs in CI).
5. **One commit per cause.** The body lists the old → new hash, the scores and the moved corpus ids. The corpus test prints them in mode 1.

**The Arcfire golden `63222780` moves twice in 2A, each move with one cause and its own inertness check.**

- **T2, step 1 (plumbing only).** Add `rosterSize` everywhere (§2.2), `rosterSize: 8` in the golden's `SETTINGS`, and **no** fold.
  - Run the update: the fixture must come back with **hash `63222780`, [32, 84], winner 1 and identical commands**.
  - `git diff` on the fixture touches only the `settings` object: one added line, `"rosterSize": 8`, and one changed line, the `guaranteeTags` array's closing `]` becoming `],` (the re-written JSON needs the comma). The hash, scores, winner and commands are untouched. This proves the plumbing is inert.
- **T2, step 2 (the fold).**
  - Only the `hash` line changes, to **`4c1d8598`**.
  - The windless pin → **`8d7dc831`**, with scores [36, 24] and winner 0 unchanged.
  - The corpus is unchanged.
- **T3 (exact damage).** Inertness checks before accepting the re-pin:
  - the command log is identical;
  - the winner is unchanged;
  - each player's score is **≤ its old value** (a property the damage test proves for every roster blast);
  - the golden goes to **`389a1340`, [31, 83]**;
  - the windless pin must **not** move;
  - the Fan test goes to [50, 0];
  - exactly the 4 corpus cases above move, with an unchanged `board`, lower points, and digest `655486aa`.
- **T4 (floor + unclamp).**
  - Both pins must **not** move.
  - Exactly the 11 corpus cases move, with digest `fa6b1ed7`.
- **After T4, every later task must leave `389a1340`, `8d7dc831` and every existing corpus key byte-identical.** This is the regression net for the loop refactor and all 24 weapons.
- **Weapon tasks (T7–T13)** update the corpus with `UPDATE_ARCFIRE_CORPUS=add`. That writes new keys only and refuses to write if any existing key moved. T13 ends at **`a7100140`** (483 cases).
- **T14** pins the full-roster golden:
  - generated **`3f614265`, [359, 448], winner 1**, 40 commands;
  - inertness: decisive, both sides scored, a move, and **all 12 tags fired**.

`ARCFIRE_SIM_VERSION` stays 1: no leaderboard rows or saves exist yet, and the owner freezes it at launch (spec §7).

---

## 8 · Test strategy (deliverable g)

All sim tests are TDD, colocated `*.test.ts` files running in Node vitest. The fixture helper is Plan 1's `flatBattle()`: ground at 400, tanks at 300 and 700, player 0 to shoot, no wind, `rosterSize: 8`. Synthetic definitions go through `resolveWeapon`, so each primitive is tested before its roster entry exists.

**How to read the numbers.** Values marked *(proto)* are what the prototype produced. Pin them only if the code was transcribed verbatim; otherwise assert the structural property beside them.

### 8.1 Unit tests per primitive: the concrete assertions

**`aimTable.test.ts`**
- `cosDeg(d) === aimCos(d)` and `sinDeg(d) === aimSin(d)` for d = 0..180.
- For d = −400..400: `cosDeg(−d) === cosDeg(d)`, `sinDeg(−d) === −sinDeg(d) || 0`, `cosDeg(d + 360) === cosDeg(d)`, and `sinDeg` never returns −0.
- `[cosDeg(270), sinDeg(270)]` is `[0, −65536]`, and `rotateVel(fromInt(100), 0, 90)` is `[0, fromInt(−100)]`.

**`imath.test.ts`**
- `floorPx` maps 0, 65535, 65536, −1, −65536, −65537 to 0, 0, 1, −1, −1, −2.
- `ceilDiv(0, 3) = 0`, `ceilDiv(7, 3) = 3`.

**`damage.test.ts`** *(verbatim, replaces the file; the first four tests are Plan 1's)*

```ts
import { describe, it, expect } from "vitest";
import { blastDamage } from "./damage";
import { TANK_HIT_R } from "./constants";
import { ROSTER } from "./weapons/roster";
import type { Blast } from "./weapons/types";

/** The exact damage in BigInt: the largest n with n <= the real formula, by bisection. (BigInt(...) calls: the repo targets ES2017, which has no 0n literals.) */
function reference(b: Blast, dx: number, dy: number): number {
  const q = BigInt(dx * dx + dy * dy);
  const R = BigInt(b.radius);
  const D = BigInt(b.damage);
  const H = BigInt(TANK_HIT_R);
  const zero = BigInt(0);
  if (q >= (R + H) * (R + H)) return 0;
  if (q <= H * H) return b.damage;
  const ok = (n: bigint): boolean => {
    if (b.falloff === "quadratic") { // n·R^2 <= D(R^2 - q - 196) + 28·D·s
      const need = n * R * R - D * (R * R - q - H * H);
      return need <= zero || BigInt(784) * D * D * q >= need * need;
    }
    const room = D * (R + H) - n * R; // n·R <= D(R + 14) - D·s
    return room >= zero && D * D * q <= room * room;
  };
  let lo = zero;
  let hi = D;
  while (lo < hi) {
    const mid = (lo + hi + BigInt(1)) / BigInt(2);
    if (ok(mid)) lo = mid;
    else hi = mid - BigInt(1);
  }
  return Number(lo);
}

/** Plan 1's floored-distance formula, for comparison. */
function floored(b: Blast, dx: number, dy: number): number {
  const c = Math.floor(Math.sqrt(dx * dx + dy * dy));
  const d = c > TANK_HIT_R ? c - TANK_HIT_R : 0;
  const r = b.radius;
  if (d >= r) return 0;
  return b.falloff === "quadratic" ? Math.trunc((b.damage * (r * r - d * d)) / (r * r)) : Math.trunc((b.damage * (r - d)) / r);
}

function rosterBlasts(): Blast[] {
  const out: Blast[] = [];
  const walk = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o.radius === "number" && typeof o.damage === "number" && !("kind" in o)) out.push(o as unknown as Blast);
    for (const x of Object.values(o)) walk(x);
  };
  walk(ROSTER);
  return out;
}

describe("blastDamage", () => {
  const pulse = { radius: 28, damage: 40 };
  it("deals full damage when the blast overlaps the hitbox", () => {
    expect(blastDamage(pulse, 100, 100, 100, 100)).toBe(40);
    expect(blastDamage(pulse, 100, 100, 100 + TANK_HIT_R, 100)).toBe(40);
  });
  it("falls off linearly from the hitbox edge out to the blast radius", () => {
    expect(blastDamage(pulse, 100, 100, 100 + TANK_HIT_R + 14, 100)).toBe(20);
    expect(blastDamage(pulse, 100, 100, 100 + TANK_HIT_R + 28, 100)).toBe(0);
    expect(blastDamage(pulse, 100, 100, 100 + TANK_HIT_R + 100, 100)).toBe(0);
  });
  it("uses the quadratic curve when asked", () => {
    const needle = { radius: 10, damage: 110, falloff: "quadratic" as const };
    expect(blastDamage(needle, 0, 0, TANK_HIT_R + 5, 0)).toBe(82); // 110 × (100 − 25) / 100 = 82.5
  });
  it("measures true (euclidean) distance", () => {
    expect(blastDamage(pulse, 0, 0, 12, 16)).toBe(blastDamage(pulse, 0, 0, 20, 0));
    expect(blastDamage(pulse, 0, 0, 20, 0)).toBe(31); // d = 6 → 40 × 22 / 28 = 31.4
  });
  it("is exact at non-integer distances (Plan 1's floored distance overstated these)", () => {
    const needle = { radius: 10, damage: 110, falloff: "quadratic" as const };
    expect(blastDamage(needle, 0, 0, 21, 9)).toBe(23); // floored: 39
    expect(blastDamage(needle, 0, 0, 19, 5)).toBe(74); // floored: 82
    expect(blastDamage(pulse, 0, 0, 20, 5)).toBe(30); // floored: 31
  });
  it("equals a BigInt reference for every roster blast over its whole reach, and never exceeds the floored value", () => {
    let samples = 0;
    for (const b of rosterBlasts()) {
      const k = b.radius + TANK_HIT_R + 1;
      for (let dx = 0; dx <= k; dx++) {
        for (let dy = 0; dy <= k; dy++) {
          const got = blastDamage(b, 0, 0, dx, dy);
          expect(got).toBe(reference(b, dx, dy));
          expect(got).toBeLessThanOrEqual(floored(b, dx, dy));
          samples++;
        }
      }
    }
    expect(samples).toBeGreaterThan(20000); // 28,780 with Plan 1's eight weapons, 81,276 with all 32
  });
  it("deals nothing for a non-positive radius or damage (the divisor guard)", () => {
    expect(blastDamage({ radius: 0, damage: 40 }, 0, 0, 0, 0)).toBe(0);
    expect(blastDamage({ radius: 28, damage: 0 }, 0, 0, 0, 0)).toBe(0);
  });
});
```

The reference uses `BigInt(…)` calls because the repo's `tsconfig` targets ES2017, where `0n` literals are a type error.

**`terrain.test.ts`**
- `groundBelow` on flat ground at 300:
  - `(x, 100) → 300`, `(x, 350) → 350`;
  - after `carveCircle(600, 360, 10)`, `groundBelow(600, 355) → 371`;
  - an empty column → `WORLD_H`.
- `addInterval` against a pixel model (300 random columns × 14 random add/remove operations):
  - the new dirt is present and nothing is lost;
  - `spanCount ≤ 8`;
  - spans are ordered, disjoint and non-touching.

  Plus the explicit cases:
  - [290, 300) onto [300, 500) → one span [290, 500);
  - a floating piece adds a span that settle drops;
  - clamping to [0, 500);
  - an 8-span column plus a 9th disjoint piece: the piece merges with the span below, or the one above if there is none below.
- `carveCapsule` equals the brute-force union of discs on 60 random segments (r 1..8). At zero length it equals `carveCircle` exactly (`spans` and `spanCount` over all columns).
- `removeInterval` stays Plan 1's: the existing "keeps at most MAX_SPANS" test still passes.

**`ballistics.test.ts`**
- **Left edge:** `shellAt(100, fromInt(100), fromInt(−6), 0, 0, 0)` (x ≈ 0.0015 px, moving left) returns `{ kind: "out", x: −1, y: 100 }`.
- **Apex:** a `stopAtApex` shell launched at 60°/50 from (600, 300) returns `apex` on the step where `vy` goes from < 0 to ≥ 0, without moving that step *(proto: step 60)*. Launched at 0°, it never apexes (`apexed` stays false).
- **Reflection** (`bounces = 1`, flat ground at 400, from y = 398):
  - `(100, 200)` px/s → `(100, −200)` exactly, left at `floorPx(y) = 399`;
  - at 55% → `(55, −110)`;
  - onto a 45° rise (ground rising to the right, `height[x] = 900 − x`; dropped at x = 600 from y = 290) → `(−200, 0)` exactly, bouncing at (600, 300).
- **Wall:** from x = 5, `vx = −600` with `wallBounces = 1` → `bounce {wall: true, x: 0}`, `vx = +600`, and the next step is null.
- **Homing property:** over 2,000 seeded (v, target, N ∈ 1..3) cases with `apexed = true` and gravity 0, one step turns the heading by ≤ N° + 0.001° (table rounding), and the remaining angle to the target never changes sign. Host trig is fine in a test file.
- **Ignore:** a shell spawned at a hitbox centre with its `ignore` bit set flies out without hitting it; pushed back by wind (−40 px/s per step), it then hits that tank, and the bit has cleared.
- **Spawn point never tested (§3.2 rule 6; T7).** Setup: flat ground at 400, `stepShell(s, t, [], 0)` (no tanks, no wind), gravity 0. Values checked on the prototype:
  - `shellAt(fromInt(600), fromInt(420), fromInt(60), 0, fromInt(60), 0)`, spawned 20 px deep and moving 1 px/step right, returns `{ kind: "terrain", x: 601, y: 420, fx: fromInt(600), fy: fromInt(420) }` on its first step;
  - `shellAt(fromInt(600), fromInt(400), 0, fromInt(-60), fromInt(60), 0)`, on the surface pixel and rising, returns `null` and is then at pixel (600, 399), alive;
  - `shellAt(fromInt(-5), fromInt(300), fromInt(60), 0, fromInt(60), 0)` returns `{ kind: "out", x: -4, y: 300 }`.

**`weapons/primitives.test.ts`** (through `resolveTurn` / `resolveWeapon` on `flatBattle()` unless noted)

*Delay*
- Twin Nova at 60/50: blasts of radius [50, 70] at the same (x, y), 30 steps apart, and `fuse {step: S, at: S + 30}`. *(proto: S = 124, (663, 400), points [65, 0])*
- A synthetic 5,000-step delay (a Pulse blast, then `delay 5000 → blast`): the resolve returns, with one blast only, `tl.steps === MAX_TURN_STEPS`, and the `fuse` event's `at` beyond `tl.steps`.

*Split*
- Cascade at 60/50: 13 shells; `split` children counts [3, 3, 3, 3]; 13 blasts. Shell 0's children have angles [−25, 0, 25], `parent` 0 and `start` = the split step, and each first moves upward. *(proto: splits at steps 124, 156, 173, 186; points [35, 0])*
- Hydra at 45/60: one split. Its (x, y) equals the parent path's last point, and the parent path has `split.step` points (it didn't move on the apex step). Children angles are [−20, −10, 0, 10, 20]. *(proto: step 59 at (595, 235))*
- Hydra at 0°: no split, one blast of radius 26 (`early`).
- On a wall at x 400–419 up to y = 100, Barrage at 45/90 gives no split and one blast of radius 20 (`early`). A synthetic apex stage without `early` gives exactly one `dud` and no blast.
- Barrage at 45/60 with tanks at 300/1000: the child spawn x's are 0, 30, …, 150 apart, and the 6 blast x's are exactly 30 apart. *(proto: spawns 520…670, blasts 818…968)*
- **Line children inside a hill (§3.2 rule 6).** Same shot, with columns 630–699 raised to 200:
  - the split is unchanged: step 59 at (595, 235);
  - shells 5 and 6 spawn inside the block, at (640, 235) and (670, 235);
  - each ends with a blast at `start + 1` (step 60), within 1 px of its spawn point, with a 2-point path. *(proto: blasts at (641, 235) and (671, 235))*
- Hailstorm at 45/60 (300/1000): 9 children, each moving down on its first step. *(proto: split at (595, 235), blasts at x 737–795)*
- Shrapnel: children angles [−80, −48, −16, 16, 48, 80].
- **Spawn-inside:** Barrage at 3°/60 with tanks at 300/400 spawns one child inside each hitbox, and neither ends on its first sample *(proto: the split is at step 5 and those two children end at steps 18 and 22)*. The rear child, spawned at x 273 outside the shooter's hitbox, still flies into it for 18 self-damage *(proto)*: this is O5, and the test pins it as documented behaviour.

*Bounce*
- Pinball at 45/40 (300/1100): exactly 6 `bounce` events at increasing steps, then one blast. *(proto: bounces at x 586, 775, 894, 971, 1019, 1048; blast (1067, 400) at step 354)*
- Skipper at 45/40 (300/1100): 3 bounces, each with a radius-22 blast at the same (x, y) in the same step, then the final radius-26 blast. *(proto: bounces at x 586, 675, 701; final blast at (699, 422). The third bounce lands 4 px outside the rim of the second bounce's crater, inside the radius-8 probe disc, so this is where the radius-8 normal shows: at radius 4 the final blast was at x 713)*
- Ricochet at 150/70 with tanks at 100/700: `bounce {wall: true, x: 0}`, then one in-world blast. *(proto: bounce at step 12, blast (609, 400) at step 101)* Pulse at the same aim → one `out`.

*Roll*
- A slope falling from 300 to 420 over x 300–539 (tanks at 200/900), Tumbler at 70/30:
  - the path's x values step by +1 and its y values never decrease;
  - it has ≤ 161 points;
  - the blast sits at the path end, with `lag === roll.dur`. *(proto: 307 → 467, dur 54)*
- Tumbler at 90/0: a direct hit, no `roll` event, points [0, 40].
- A synthetic 1,200 px roll at 60/60: one `out` at x = 1200, no blast.

*Dig* (D20)
- Burrow at 60/50 falls steeply, so its tunnel is clamped to 30° below level: the `dig` segment runs (663, 400) → (740, 445), i.e. (+77, +45), 88–91 px long, `dur` 23, and the blast is at (x1, y1) with `lag` 23.
- A heading shallower than 30° is kept: with columns ≥ 450 raised to 200 (a cliff face), Burrow at 0/100 tunnels (450, 393) → (539, 400).
- With no horizontal travel it digs 30° below level toward the opponent: a synthetic apex stage `[{ dig: { length: 90, width: 14 } }]` fired at 90/50 digs (300, 173) → (377, 218) for player 0 and, from a tank at 700, (700, 173) → (623, 218) for player 1.
- Auger at 30/60: blasts every 40 px along the clamped tunnel, at (871, 419), (906, 440), (940, 459) and the end (975, 480), with lags 10, 20, 30, 40, all at y < 500.
- Burrow at 90/0 (a direct hit): a zero-length dig and one blast.

*Burn*
- Wildfire at 60/52: 2 flows. The enemy takes 45 exactly once, with a small `lag`. *(proto: ignition at 687, flows 687→547 and 687→692 stopped by the tank, lag 2)*
- Inferno on a slope falling toward the enemy (tanks 200/700; `height[x]` = 300 for x < 400, `300 + ⌊(x − 400) · 120 / 300⌋` for 400 ≤ x ≤ 700, and 420 beyond): at 45°/37 it ignites uphill of the enemy, at x 470, and the flow reaches it: 70 exactly once, with `lag` 55, and the terrain is unchanged.
- Heights after a burn equal the heights before it.

*Build*
- Rampart at 60/50 (300/1000): exactly 36 contiguous columns at 320, their neighbours at 400. *(proto: 645–680)*
- The `build` event carries the footprint. For that Rampart, `size` is 80, `width` is 36, and the raised columns are exactly `x − 18` … `x + 17` *(proto: x = 663)*. For Bastion, `size` is 48 and `width` is 97.
- Bastion at 60/50: the centre column is 352 *(proto: +17 → 356, +40 → 374)*, the profile is symmetric, and no column rises more than 48.
- Leveler on a 1-in-4 slope (`height[x] = min(480, 250 + ⌊x / 4⌋)`, tanks 200/1000, fired at 60/60): every column within ±80 ends exactly at the impact y; columns beyond are unchanged.
- **No burying:** Bastion landing within 8 px of the enemy (45°, power swept 40..80) raises `height[700]` *(proto: power 50, 400 → 328)*. After the settle, the enemy's hitbox centre is not solid, and its column is one span with the tank on top.
- Rampart landing within 10 px of the enemy lifts its column by exactly 80. *(proto: power 49, 400 → 320)*

*Beam* (D19)
- **The dial:** `beamDir(0, a)` is −90, 0, 90 at a = 0, 90, 180, and `beamDir(1, a)` is 90, 180, 270. For every a in 0..180, `beamDir(1, 180 − a) + beamDir(0, a) ≡ 180 (mod 360)`: the mirror of a beam command is `180 − angle`.
- Tanks at 300/900 on flat ground with a mound at 340 over x 550–649, Lancer at **90** (level):
  - points [60, 0] at power 0 **and** 100, with identical resulting terrain;
  - the mound is cut: `height[600]` 340 → 349;
  - the beam event is exactly `{ step: 1, beam: 0, x0: 322, y0: 388, x1: 1199, y1: 388, width: 8 }`: 1,200 px long, cut short at the right edge.
- **Aiming down:** with columns 0–399 raised to 250 (the shooter on a plateau, tanks 300/700), Lancer hits the enemy below at exactly the command angles 67–71 (19°–23° below level) and at no other angle in 0..180.
- **Mirror-exact:** the same plateau board mirrored (tanks 499/899, player 1 shooting) at `180 − angle` gives the swapped points and the mirrored heights, for Lancer at 69 and 150 and Prism at 69 and 20.
- **Straight down:** Lancer at 0 from flat ground (player 0 at 300) cuts (300, 410) → (300, 499), scores nothing, and lowers `height[300]`.
- Prism at 90 (300/800): 3 `beam` events; only the centre one hits, for [35, 0]. Beam 0 (−4 on the dial, 4° below level) runs (321, 389) → (1199, 449).
- **No self-hit:** Lancer and Prism at every command angle 0..180, for player 0 and for player 1 (tanks 100/1100), never score for the opponent. Between them the two shooters cover the whole circle.

*Homing*
- Seeker vs Pulse at 45/45: Pulse [0, 0], Seeker [50, 0] *(proto)*.
- Seeker at 0/60 never apexes, so its path equals Pulse's at 0/60 point for point.

*Quake* (D21)
- Quake at 60/50: the enemy's damage is `⌊55 · (260 − max(0, |700 − x| − 14)) / 260⌋`. *(proto: x = 663, d = 23 → 50)*
- Furrow heights at the source and at +100, +200, +259, +260 are 406, 403, 401, 400, 400.
- **Horizontal reach:** with columns 675–681 cut down to 499 (a chasm between the impact and the enemy), the same shot still lands at 663 and still deals 50.
- **The shooter is exempt:** Quake at 90/0 falls on its own tank: one `quake` event, no `damage` event, points [0, 0] (the old rule gave [0, 55]). Aftershock at 90/0: exactly one `damage` event, target 0, amount 50, from its blast, so points [0, 50] (the old rule gave [0, 85]).

*Every weapon*
- For every `ROSTER` weapon at (45/60, 60/50, 0/100, 180/100, 90/0): events are sorted by step, and every `shell` index is valid. The test loops over `ROSTER`: 8 weapons from T5, 32 at T13.
- **Parity and RNG:** over the §1 sweep boards at a coarser 12-aim grid, `resolveTurnPoints` equals `resolveTurn` in hash and points, and `m.rng.state` is unchanged. The boards are the corpus seed's hills (player 0 in wind 0, +40 and −40; player 1 in wind 0) and `flatBattle()`. The aims are 0/100, 15/70, 35/70, 45/60, 50/80, 65/95, 90/0, 90/100, 115/70, 135/60, 165/70 and 180/100.

**`weapons/validate.test.ts`**
- Every `ROSTER` weapon validates: the 8 from T5 and all 32 by T13. It loops over `ROSTER`, so it is green at every task.
- Each seeded mistake is caught: power 0, radius 0, empty effects, a shell with no stage, beam width 20, `early` on an impact stage, `homing` on an apex stage, an "ahead" split in an impact stage, `blastEvery` without `each`, delay steps 0, and an effect with two keys. These are static (`weaponErrors`), and `validate.ts` lands whole in T5, so they all land in T5.
- A **cyclic** stage is reported (depth > 4), and `maxShells` for it is > `MAX_SHELLS` (T5, static).
- **Totality:** 11 degenerate definitions resolve at (45/60, 90/0, 0/100) without throwing:
  - count 0; radius and damage 0; reach 0; dig all zeros; burn all zeros; wall 0 × 0; roll 0; split count 0; beam all zeros;
  - the launch maxima: 9 shells over 180° at 300%, gravity 0;
  - a cyclic split.

  Every height and point is an integer, the hash is 8 hex digits, and shells ≤ `MAX_SHELLS`.

  **Staged:** each case resolves through the primitive it exercises, so it lands with that primitive, keeping every task green:
  - T5: count 0; radius and damage 0; the launch maxima (blast-only defs);
  - T7: split count 0, and the cyclic split;
  - T9: roll 0, dig all zeros, burn all zeros;
  - T10: wall 0 × 0;
  - T11: beam all zeros;
  - T13: reach 0.

### 8.2 Roster and settings: `weapons/roster.test.ts` *(staged; both versions verbatim)*

**Task staging.** Every task must end green, and this file cannot land whole before T13: its 32-id pin, the 12-tag coverage, and the `STANDARD_SETTINGS`/`SHORT_SETTINGS` blocks all need the full roster. Plan 1's file cannot survive either: it pins the wire order as an exact 8-id list, so T7's first append would fail it. The file therefore lands in three steps, like the corpus test (§8.4):

| Task | Change to `roster.test.ts` | Roster after the task |
|---|---|---|
| T5 | Replace the file with the **T5 version** below. Plan 1's first two blocks are unchanged. Its "shell launch + blast" block becomes the validator block, because the new types make the old block a type error. The exact 8-id pin becomes a **prefix pin** on `WIRE` | 8 entries: maxima 5 shells and 1,200 steps; 3 tags |
| T7 | Append `"twinnova", "cascade", "hydra", "hailstorm", "shrapnel", "barrage"` to `WIRE`. Add the two static-maximum lines from the final file (13 shells, 3,600 steps) to the validator block: Cascade is the roster maximum from T7 on | 14 |
| T8 | Append `"skipper", "pinball", "ricochet"` | 17 |
| T9 | Append `"tumbler", "juggernaut", "burrow", "auger", "inferno", "wildfire"` | 23 |
| T10 | Append `"rampart", "bastion", "leveler"` | 26 |
| T11 | Append `"lancer", "prism"` | 28 |
| T12 | Append `"seeker", "swarm"` | 30 (11 tags) |
| T13 | Replace the file with the **final version** below. It adds the exact 32-id pin (`WIRE` goes away), the 12-tag coverage, and the settings blocks, including the structural tag-guarantee test | 32 (12 tags) |

A prefix pin stays green when a later task appends weapons. Each weapon task extends `WIRE` in the same commit as its roster slice, so an append that reorders or drops an existing id fails at once. On the prototype, every task's blocks were run against the roster prefix that task leaves (8, 14, 17, 23, 26, 28, 30 and 32 entries), and all passed.

**The T5 version** *(verbatim)*:

```ts
import { describe, it, expect } from "vitest";
import { ROSTER, ROSTER_INDEX } from "./roster";
import { weaponErrors, maxShells, maxTurnSteps } from "./validate";
import { SUDDEN_DEATH_WEAPON, MAX_TURN_STEPS, MAX_SHELLS } from "../constants";

// The wire order pinned so far. Append-only: T7–T12 each append their slice of ids here; T13 replaces this
// prefix pin with the exact 32-id pin (§8.2). A prefix pin stays green when a later task appends weapons.
const WIRE = ["pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot"];

describe("ROSTER", () => {
  it("has unique ids that index back to themselves", () => {
    const ids = ROSTER.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    ROSTER.forEach((w, i) => expect(ROSTER_INDEX[w.id]).toBe(i));
  });
  it("keeps Pulse at the sudden-death index", () => {
    expect(ROSTER[SUDDEN_DEATH_WEAPON].id).toBe("pulse");
  });
  it("pins the wire order so far (append-only: existing indices never move)", () => {
    expect(ROSTER.slice(0, WIRE.length).map((w) => w.id)).toEqual(WIRE);
  });
  it("every weapon is valid and within the static cost bounds", () => {
    for (const w of ROSTER) {
      expect(weaponErrors(w), w.id).toEqual([]);
      expect(maxShells(w)).toBeLessThanOrEqual(MAX_SHELLS);
      expect(maxTurnSteps(w)).toBeLessThan(MAX_TURN_STEPS);
    }
  });
});
```

**The final version, landed in T13** *(verbatim; replaces the T5 version)*:

```ts
import { describe, it, expect } from "vitest";
import { ROSTER, ROSTER_INDEX } from "./roster";
import { weaponErrors, maxShells, maxTurnSteps } from "./validate";
import { SUDDEN_DEATH_WEAPON, MAX_TURN_STEPS, MAX_SHELLS } from "../constants";
import { STANDARD_SETTINGS, SHORT_SETTINGS } from "../state";
import { createMatch, applyPick } from "../match";
import type { Tag } from "./types";

const TAGS: Tag[] = ["BLAST", "VOLLEY", "SPLIT", "BOUNCE", "ROLL", "DIG", "FIRE", "DIRT", "BEAM", "HOMING", "QUAKE", "SPECIAL"];

describe("ROSTER", () => {
  it("has unique ids that index back to themselves", () => {
    const ids = ROSTER.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    ROSTER.forEach((w, i) => expect(ROSTER_INDEX[w.id]).toBe(i));
  });
  it("keeps Pulse at the sudden-death index", () => {
    expect(ROSTER[SUDDEN_DEATH_WEAPON].id).toBe("pulse");
  });
  it("pins the wire order (append-only): Plan 1's eight, then Plan 2A's twenty-four", () => {
    expect(ROSTER.map((w) => w.id)).toEqual([
      "pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot",
      "twinnova", "cascade", "hydra", "hailstorm", "shrapnel", "barrage", "skipper", "pinball",
      "ricochet", "tumbler", "juggernaut", "burrow", "auger", "inferno", "wildfire", "rampart",
      "bastion", "leveler", "lancer", "prism", "seeker", "swarm", "quake", "aftershock",
    ]);
  });
  it("every weapon is valid and within the static cost bounds", () => {
    for (const w of ROSTER) {
      expect(weaponErrors(w), w.id).toEqual([]);
      expect(maxShells(w)).toBeLessThanOrEqual(MAX_SHELLS);
      expect(maxTurnSteps(w)).toBeLessThan(MAX_TURN_STEPS);
    }
    expect(Math.max(...ROSTER.map(maxShells))).toBe(13); // Cascade
    expect(Math.max(...ROSTER.map(maxTurnSteps))).toBe(3600); // Cascade: three generations of 1,200 steps
  });
  it("covers all 12 tags", () => {
    expect(new Set(ROSTER.map((w) => w.tag))).toEqual(new Set(TAGS));
  });
});

describe("STANDARD_SETTINGS / SHORT_SETTINGS", () => {
  it("are frozen with the spec values", () => {
    expect(STANDARD_SETTINGS).toEqual({ weaponsEach: 10, poolSize: 24, wind: false, guaranteeTags: ["BLAST", "SPLIT", "DIRT"], rosterSize: 32 });
    expect(SHORT_SETTINGS).toEqual({ ...STANDARD_SETTINGS, weaponsEach: 5, poolSize: 12 });
    expect(Object.isFrozen(STANDARD_SETTINGS) && Object.isFrozen(SHORT_SETTINGS) && Object.isFrozen(STANDARD_SETTINGS.guaranteeTags)).toBe(true);
  });
  it("tripwire: STANDARD covers the whole roster (an append must bump it deliberately, with simVersion)", () => {
    expect(STANDARD_SETTINGS.rosterSize).toBe(ROSTER.length);
  });
  it("guarantees the tags by construction: one distinct tag per free slot, each with a weapon in the drawable prefix", () => {
    // drawPool takes one weapon per guaranteed tag BEFORE the shuffle; a weapon has one tag, so
    // distinct tags never compete for a candidate, and it only stops early when the pool is full.
    for (const s of [STANDARD_SETTINGS, SHORT_SETTINGS]) {
      expect(new Set(s.guaranteeTags).size).toBe(s.guaranteeTags.length);
      expect(s.guaranteeTags.length).toBeLessThanOrEqual(s.poolSize);
      for (const tag of s.guaranteeTags) expect(ROSTER.slice(0, s.rosterSize).some((w) => w.tag === tag), tag).toBe(true);
    }
  });
  it("always draws a legal pool with the guaranteed tags, and every weapon can be drawn", () => {
    for (const s of [STANDARD_SETTINGS, SHORT_SETTINGS]) {
      const seen = new Set<number>();
      for (let seed = 0; seed < 500; seed++) {
        const m = createMatch(seed, s);
        expect(m.pool.length).toBe(s.poolSize);
        expect(new Set(m.pool).size).toBe(s.poolSize);
        for (const i of m.pool) {
          expect(i).toBeLessThan(s.rosterSize);
          seen.add(i);
        }
        for (const tag of s.guaranteeTags) expect(m.pool.some((i) => ROSTER[i].tag === tag)).toBe(true);
        if (seed < 20) {
          while (m.phase === "draft") expect(applyPick(m, m.poolOwner.findIndex((o) => o === -1)).ok).toBe(true);
          expect(m.hands[0].length + m.hands[1].length).toBe(2 * s.weaponsEach);
        }
      }
      if (s === STANDARD_SETTINGS) expect(seen.size).toBe(32);
    }
  });
});
```

`hash.test.ts` gains one assertion: changing `settings.rosterSize` alone changes `hashMatch`. `match.test.ts` gains: `createMatch` throws `RangeError` when `rosterSize` is below `poolSize`, above `ROSTER.length`, or not an integer.

### 8.3 Existing tests: every edit

1. **Every `MatchSettings` literal gains `rosterSize: 8`** (T2): `hash`, `match` (both literals of "keeps a private, frozen copy", which also sets `settings.rosterSize = 9` after `createMatch` and expects 8), `replay`, `resolve`, `tanks`, and `determinism`. They keep drafting Plan 1 weapons, so "sudden death on a tie" still shoots only shells off the world. **No `setHands` churn.**
2. `match.test.ts` "a windless match": `1c8832e9` → `8d7dc831` (T2). Keep asserting scores [36, 24] and winner 0.
3. `determinism.golden.json`: re-pinned per §7.3 (T2, T3).
4. `resolve.test.ts` "lands a Fan volley on the opponent": `[51, 0]` → `[50, 0]` (T3).
5. `ballistics.test.ts` "gives up at the flight cap": the `Shell` literal becomes `shellAt(fromInt(600), fromInt(100), 0, 0, 0, 0)` (T5, type-only; import `shellAt`).
6. `resolve.test.ts` "ends each shell's path at its terminal event": `if (e.kind === "damage") continue;` becomes `if (e.kind !== "blast" && e.kind !== "out") continue;` (T5, type-only; the weapons it fires emit only those kinds).
7. `roster.test.ts`: staged per §8.2, so every task ends green. T5 replaces "Shell + blast" with the validator block and turns the exact 8-id wire pin into a prefix pin (`ROSTER.slice(0, WIRE.length)`). T7–T12 each append their slice of ids to `WIRE`, and T7 also adds the static maxima. T13 lands the final file: the exact 32-id pin, 12-tag coverage, and the settings blocks.
8. `damage.test.ts`: replaced by §8.1's file (T3). Its Plan 1 cases are unchanged.

### 8.4 The corpus: `src/game/test/arcfire/corpus.ts` *(verbatim)* and `src/game/titles/arcfire/corpus.test.ts` *(verbatim)*

**The cases.**
- For **each roster weapon id**, 15 single-turn cases, each on a `cloneMatch` of one of two fixed boards:
  - **hills:** the corpus seed's terrain, tanks at spawn (840 px apart). Cases: 35/70, 50/80, 65/95; wind ±40 at 50/80; player 1 at 130/80; a move then 55/75; and the extremes 0/100, 180/100, 90/0, 90/100, 2/30, 178/30.
  - **flat:** 400, tanks at 300/700. Cases: 45/60 and 0/60. At 0/60 volley shells leave below the horizon, and a beam (on the beam dial) cuts straight down to the floor.
  - The "a beam scored" gate is met on the hills: Lancer at 90/0 and 90/100 fires level from spawn and hits for 60 (the corpus hills' spawn pads stand within the beam's reach of level).
- **Plus three specials:**
  - the left-edge case;
  - a whole tied match ending in a sudden-death **draw**;
  - the same match **won** in sudden death by a direct-hit Pulse (45/72).
- **Fingerprints** are `hashBoard` (heights, tank x, moves left) plus the points (for matches: scores, winner, shots fired).
- **What is never fingerprinted:** settings, pool, hands, RNG and the Timeline, so no roster append, settings change or Plan 3 Timeline extension can move a case.

**Task staging.** T1 lands the corpus on the unchanged Plan 1 code. Before T5, the test omits the `maxTurnSteps` / `maxShells` checks (no `validate.ts` yet) and the horizon checks (Plan 1 clamps volleys and has no `ShellPath.parent`); T5 adds both. `CORPUS_SETTINGS` gains `rosterSize: 8` in T2, which moves nothing.

```ts
// src/game/test/arcfire/corpus.ts
//
// The Arcfire cross-engine corpus: fixed single-turn cases for EVERY roster
// weapon (keyed by weapon id, so a roster append only adds cases) plus a few
// whole-match specials. Each case fingerprints the board it leaves — the
// heightfield, tank x and moves left — and the points it scored. It never
// hashes settings, the pool, the hands or the RNG, so neither a roster append
// nor a MatchSettings change can move an existing case. Pure: Node (the
// corpus test) and each browser (the cross-engine harness) run this same code.
import { FNV_OFFSET, fnvFold, fnvHex } from "@/game/sim/hash";
import { createMatch, applyPick, applyTurn } from "@/game/titles/arcfire/match";
import { cloneMatch, type MatchSettings, type MatchState } from "@/game/titles/arcfire/state";
import { resolveTurn } from "@/game/titles/arcfire/resolve";
import { spansFromHeight } from "@/game/titles/arcfire/terrain";
import { ROSTER, ROSTER_INDEX } from "@/game/titles/arcfire/weapons/roster";
import { SUDDEN_DEATH_WEAPON } from "@/game/titles/arcfire/constants";
import type { Timeline } from "@/game/titles/arcfire/timeline";

export const CORPUS_SEED = 20260922;
export const CORPUS_SETTINGS: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [], rosterSize: 8 };

export interface ShotCase {
  id: string; // `${weapon}|${board}|p${shooter}|w${wind}|m${move}|${angle}/${power}`
  w: string; // weapon id
  board: "hills" | "flat";
  shooter: 0 | 1;
  wind: number;
  move: -1 | 0 | 1;
  angle: number;
  power: number;
}

/** 15 cases per weapon: three plain aims, both winds, player 1, a move, six extreme aims, and two on flat ground. */
export function shotCases(): ShotCase[] {
  const out: ShotCase[] = [];
  const add = (w: string, board: "hills" | "flat", shooter: 0 | 1, wind: number, move: -1 | 0 | 1, angle: number, power: number): void => {
    out.push({ id: `${w}|${board}|p${shooter}|w${wind}|m${move}|${angle}/${power}`, w, board, shooter, wind, move, angle, power });
  };
  for (const { id: w } of ROSTER) {
    for (const [a, p] of [[35, 70], [50, 80], [65, 95]]) add(w, "hills", 0, 0, 0, a, p);
    add(w, "hills", 0, 40, 0, 50, 80);
    add(w, "hills", 0, -40, 0, 50, 80);
    add(w, "hills", 1, 0, 0, 130, 80);
    add(w, "hills", 0, 0, 1, 55, 75);
    for (const [a, p] of [[0, 100], [180, 100], [90, 0], [90, 100], [2, 30], [178, 30]]) add(w, "hills", 0, 0, 0, a, p);
    add(w, "flat", 0, 0, 0, 45, 60);
    add(w, "flat", 0, 0, 0, 0, 60); // volleys leave below the horizon; a beam cuts straight down to the floor
  }
  return out;
}

/** "hills": the corpus seed's terrain, tanks at spawn. "flat": y = 400, tanks at 300 / 700. Battle phase. */
function board(which: "hills" | "flat"): MatchState {
  const m = createMatch(CORPUS_SEED, CORPUS_SETTINGS);
  m.phase = "battle";
  if (which === "flat") {
    m.terrain.height.fill(400);
    spansFromHeight(m.terrain);
    m.tankX[0] = 300;
    m.tankX[1] = 700;
  }
  return m;
}

/** FNV-1a over the heightfield, tank x and moves left: what a shot can change besides the scores. */
export function hashBoard(m: MatchState): string {
  let h = FNV_OFFSET;
  for (let x = 0; x < m.terrain.height.length; x++) h = fnvFold(h, m.terrain.height[x]);
  for (const v of [m.tankX[0], m.tankX[1], m.movesLeft[0], m.movesLeft[1]]) h = fnvFold(h, v);
  return fnvHex(h);
}

export interface Fingerprint { board: string; points: number[] }

/** Every case's fingerprint, by id. `onTurn` sees each shot case's Timeline (Node-only coverage checks). */
export function runCorpus(onTurn?: (c: ShotCase, tl: Timeline) => void): Record<string, Fingerprint> {
  const bases = { hills: board("hills"), flat: board("flat") };
  const res: Record<string, Fingerprint> = {};
  for (const c of shotCases()) {
    const m = cloneMatch(bases[c.board]);
    m.shooter = c.shooter;
    m.wind = c.wind;
    const tl = resolveTurn(m, { move: c.move, weapon: ROSTER_INDEX[c.w], angle: c.angle, power: c.power });
    res[c.id] = { board: hashBoard(m), points: [tl.points[0], tl.points[1]] };
    if (onTurn) onTurn(c, tl);
  }
  {
    // a shell that crosses x in (-1, 0): off the world since Plan 2A's floor fix
    const m = createMatch(777, CORPUS_SETTINGS);
    m.phase = "battle";
    m.shooter = 0;
    const tl = resolveTurn(m, { move: 0, weapon: ROSTER_INDEX.railshot, angle: 129, power: 10 });
    res["special|left-edge|seed777|railshot|129/10"] = { board: hashBoard(m), points: [tl.points[0], tl.points[1]] };
  }
  for (const win of [false, true]) {
    // a whole tied match on low flat ground (everything shot off the world), then sudden death: missed, or won by a direct hit
    const m = createMatch(5, CORPUS_SETTINGS);
    while (m.phase === "draft") applyPick(m, m.poolOwner.findIndex((o) => o === -1));
    m.terrain.height.fill(450);
    spansFromHeight(m.terrain);
    const away = () => ({
      move: 0 as const,
      w: m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[m.shooter][0],
      angle: m.shooter === 0 ? 180 : 0,
      power: 100,
    });
    while (m.phase === "battle") applyTurn(m, away());
    if (win) applyTurn(m, { move: 0, w: SUDDEN_DEATH_WEAPON, angle: m.shooter === 0 ? 45 : 135, power: 72 });
    while (m.phase === "suddenDeath") applyTurn(m, away());
    res[`match|sudden-death-${win ? "win" : "draw"}`] = { board: hashBoard(m), points: [m.scores[0], m.scores[1], m.winner, m.shotsFired] };
  }
  return res;
}

/** One hex digest over every case, in id order: what the browsers must reproduce. */
export function corpusDigest(res: Record<string, Fingerprint>): string {
  let h = FNV_OFFSET;
  for (const id of Object.keys(res).sort()) {
    for (let i = 0; i < id.length; i++) h = fnvFold(h, id.charCodeAt(i));
    h = fnvFold(h, parseInt(res[id].board, 16));
    for (const p of res[id].points) h = fnvFold(h, p);
  }
  return fnvHex(h);
}
```

```ts
// src/game/titles/arcfire/corpus.test.ts
//
// Pins every roster weapon's behaviour, case by case (the corpus in
// src/game/test/arcfire/corpus.ts), plus each weapon's definition. Cases are
// keyed by weapon id, so a roster append only ADDS keys. Update modes (the
// variable set to exactly one of):
//   UPDATE_ARCFIRE_CORPUS=add   write new keys only; every existing key must still match
//   UPDATE_ARCFIRE_CORPUS=1     rewrite everything — only for a declared, reviewed re-pin
// On a mismatch the failure lists each moved case with its old and new fingerprint.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FNV_OFFSET, fnvFold, fnvHex } from "@/game/sim/hash";
import { runCorpus, corpusDigest, type Fingerprint } from "@/game/test/arcfire/corpus";
import { ROSTER, ROSTER_INDEX } from "./weapons/roster";
import { maxShells, maxTurnSteps } from "./weapons/validate";
import { MAX_FLIGHT_STEPS } from "./constants";
import type { WeaponDef } from "./weapons/types";

const FIXTURE = join("src/game/titles/arcfire/corpus.golden.json");

/** Canonical JSON (sorted keys, no `power`) of a def, FNV-1a'd: pins every behaviour number of the def. */
function defDigest(def: WeaponDef): string {
  const canon = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
    if (v !== null && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return `{${Object.keys(o).filter((k) => k !== "power").sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
    }
    return JSON.stringify(v);
  };
  const s = canon(def);
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) h = fnvFold(h, s.charCodeAt(i));
  return fnvHex(h);
}

interface CorpusFixture { digest: string; defs: Record<string, string>; cases: Record<string, Fingerprint> }

describe("arcfire corpus", () => {
  it("reproduces every pinned case and weapon definition", () => {
    const kinds = new Set<string>();
    const volleyAngles: number[] = [];
    let capped = false;
    let beamHit = false;
    const cases = runCorpus((c, tl) => {
      const def = ROSTER[ROSTER_INDEX[c.w]];
      for (const e of tl.events) kinds.add(e.kind === "bounce" ? `bounce:${e.wall ? "wall" : "terrain"}` : e.kind === "build" ? `build:${e.shape}` : e.kind);
      for (const s of tl.shells) {
        if (s.parent === -1) volleyAngles.push(s.angle);
        if (s.points.length === 2 * (MAX_FLIGHT_STEPS + 1)) capped = true;
      }
      if (def.launch.kind === "beam" && tl.points[c.shooter] > 0) beamHit = true;
      // the static cost bounds hold for every case
      expect(tl.steps).toBeLessThanOrEqual(maxTurnSteps(def));
      expect(tl.shells.length).toBeLessThanOrEqual(maxShells(def));
    });
    const defs = Object.fromEntries(ROSTER.map((w) => [w.id, defDigest(w)]));
    const fresh: CorpusFixture = { digest: corpusDigest(cases), defs, cases };

    // Not inert: the corpus exercises the flight cap, both sides of the horizon, and — once
    // the weapon that makes it exists — every event kind (the gates switch on as weapons land).
    expect(capped, "a shell reached the per-shell flight cap").toBe(true);
    expect(Math.min(...volleyAngles)).toBeLessThan(0);
    expect(Math.max(...volleyAngles)).toBeGreaterThan(180);
    const gates: [string, string][] = [
      ["twinnova", "fuse"], ["cascade", "split"], ["skipper", "bounce:terrain"], ["ricochet", "bounce:wall"],
      ["tumbler", "roll"], ["burrow", "dig"], ["inferno", "burn"], ["rampart", "build:wall"], ["bastion", "build:ball"],
      ["leveler", "build:level"], ["lancer", "beam"], ["quake", "quake"],
    ];
    for (const [id, kind] of gates) if (id in ROSTER_INDEX) expect(kinds.has(kind), `${id} emits ${kind}`).toBe(true);
    if ("lancer" in ROSTER_INDEX) expect(beamHit, "a beam scored").toBe(true);

    const mode = process.env.UPDATE_ARCFIRE_CORPUS;
    const old: CorpusFixture | null = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, "utf8")) : null;
    const moved = old
      ? Object.keys(old.cases).filter((id) => JSON.stringify(old.cases[id]) !== JSON.stringify(cases[id]))
        .map((id) => `${id}: ${JSON.stringify(old.cases[id])} -> ${JSON.stringify(cases[id] ?? null)}`)
        .concat(Object.keys(old.defs).filter((id) => old.defs[id] !== defs[id]).map((id) => `def ${id}: ${old.defs[id]} -> ${defs[id]}`))
      : [];
    if (mode === "1") console.log(`re-pinned ${moved.length} moved cases:\n${moved.join("\n")}`); // paste into the commit body
    if (mode === "1" || (mode === "add" && moved.length === 0)) writeFileSync(FIXTURE, JSON.stringify(fresh, null, 1) + "\n");
    expect(existsSync(FIXTURE), "create it once with UPDATE_ARCFIRE_CORPUS=1").toBe(true);
    if (mode !== "1") expect(moved, "moved cases").toEqual([]);
    const pinned: CorpusFixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(Object.keys(cases).sort()).toEqual(Object.keys(pinned.cases).sort()); // no case missing or unpinned
    expect(defs).toEqual(pinned.defs);
    expect(fresh.digest).toBe(pinned.digest);
  });
});
```

**The fixture** `src/game/titles/arcfire/corpus.golden.json` is `{ digest, defs: { id: digest }, cases: { id: { board, points } } }`.
- Digests *(proto)*: T1 `09403dbb` (123 cases); T3 `655486aa`; T4–T6 `fa6b1ed7`; T13 **`a7100140`** (483 cases).
- Of the 32 definition digests, Revision 2 changed exactly two: lancer `0bcc07de` → `26421a9a` and prism `26d3d04f` → `540c4e8a` (their lengths). The other decisions are code, not data.
- The corpus takes about 0.2 s in vitest.
- Plan 1's eight definition digests, pinned in T1, never change *(proto: pulse `e151d5df`, pulse2 `1a588902`, nova `bcb156c7`, needle `086899c2`, crater `922e1cbf`, triad `7028d65d`, fan `635370e6`, railshot `30e47b0c`)*.

### 8.5 The goldens and the cross-engine gate

- **`determinism.test.ts`:**
  - the Plan 1 golden keeps its strategy, with `rosterSize: 8` added to `SETTINGS`;
  - a second `describe` adds the **full-roster golden**, with fixture `determinism.full.golden.json` and the same `UPDATE_ARCFIRE_GOLDEN=1` variable.

  Appended to the file *(verbatim; import `cloneMatch` from `./state`)*:

```ts
// The full-roster golden: the daily-challenge shape (10 each from 24, BLAST/SPLIT/DIRT
// guaranteed) drawn from all 32 weapons. The settings are a LITERAL, frozen with
// rosterSize 32, so a later roster append can't move this pin either.
const FULL_FIXTURE = join("src/game/titles/arcfire/determinism.full.golden.json");
const FULL_SEED = 20260927;
const FULL_SETTINGS: MatchSettings = { weaponsEach: 10, poolSize: 24, wind: false, guaranteeTags: ["BLAST", "SPLIT", "DIRT"], rosterSize: 32 };

/** Draft the highest free slot; each turn fire the lowest weapon in hand at the best point of a coarse grid (resolved on clones). */
function buildFullReplay(): ArcfireReplay {
  const m = createMatch(FULL_SEED, FULL_SETTINGS);
  const commands: ArcfireCommand[] = [];
  while (m.phase === "draft") {
    let w = m.poolOwner.length - 1;
    while (m.poolOwner[w] !== -1) w--;
    if (!applyPick(m, w).ok) throw new Error("full-golden strategy made an illegal pick");
    commands.push({ k: "pick", w });
  }
  for (let turn = 0; m.phase !== "over"; turn++) {
    const p = m.shooter;
    const w = m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[p][0];
    const move: -1 | 0 | 1 = turn === 2 ? (p === 0 ? 1 : -1) : 0;
    let best = -Infinity;
    let angle = 0;
    let power = 0;
    for (let a = 25; a <= 70; a += 5) {
      for (let pw = 40; pw <= 100; pw += 10) {
        const c = cloneMatch(m);
        const aim = p === 0 ? a : 180 - a;
        if (!applyTurn(c, { move, w, angle: aim, power: pw }).ok) throw new Error("full-golden probe was illegal");
        const v = c.scores[p] - m.scores[p] - (c.scores[1 - p] - m.scores[1 - p]);
        if (v > best) {
          best = v;
          angle = aim;
          power = pw;
        }
      }
    }
    if (!applyTurn(m, { move, w, angle, power }).ok) throw new Error(`full-golden strategy made an illegal turn at ${turn}`);
    commands.push({ k: "turn", move, w, angle, power });
  }
  return { seed: FULL_SEED, settings: FULL_SETTINGS, commands };
}

describe("arcfire full-roster golden", () => {
  it("replays the generated full-roster log to its pinned hash", () => {
    const replay = buildFullReplay();
    const result = replayMatch(replay);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Not inert: decisive, both sides scored, a tank moved, and every one of the 12 tags was fired.
    expect(result.state.phase).toBe("over");
    expect([0, 1]).toContain(result.state.winner);
    expect(result.state.scores[0]).toBeGreaterThan(0);
    expect(result.state.scores[1]).toBeGreaterThan(0);
    expect(replay.commands.some((c) => c.k === "turn" && c.move !== 0)).toBe(true);
    expect(new Set(replay.commands.flatMap((c) => (c.k === "turn" ? [ROSTER[c.w].tag] : [])))).toEqual(new Set(ROSTER.map((w) => w.tag)));
    if (process.env.UPDATE_ARCFIRE_GOLDEN === "1") {
      const fixture = { replay, hash: result.hash, scores: Array.from(result.state.scores), winner: result.state.winner };
      writeFileSync(FULL_FIXTURE, JSON.stringify(fixture, null, 2) + "\n");
    }
    expect(existsSync(FULL_FIXTURE), "create it once with UPDATE_ARCFIRE_GOLDEN=1").toBe(true);
    const golden = JSON.parse(readFileSync(FULL_FIXTURE, "utf8"));
    expect(replay).toEqual(golden.replay);
    expect(result.hash).toBe(golden.hash);
    expect(Array.from(result.state.scores)).toEqual(golden.scores);
  });
});
```

- **`src/game/test/cross-engine/harness.entry.ts`** gains `window.runArcfireCorpus = (): string => corpusDigest(runCorpus());`. `runArcfireGolden` already replays any `ArcfireReplay`, so it serves both goldens.
- **`e2e/cross-engine-determinism.spec.ts`** becomes one table-driven loop over the engines (the spec §9.1 housekeeping item). For each engine it asserts:
  - the Circle TD golden;
  - the Arcfire golden;
  - the full-roster golden;
  - the corpus digest against `corpus.golden.json`'s `digest`.

  Firefox runs in CI only.

### 8.6 Performance

**Deterministic, always on:** the corpus test asserts `tl.steps ≤ maxTurnSteps(def)` and `tl.shells.length ≤ maxShells(def)` for every case. The validator bounds every weapon statically. This catches runaway spawning or looping with no clock.

**Wall clock, always on, bundled (§4.8's trap).** `src/game/test/arcfire/perf.entry.ts` and `src/game/titles/arcfire/perf.test.ts` *(verbatim)*:

```ts
// src/game/test/arcfire/perf.entry.ts
//
// Bundled by perf.test.ts with esbuild and run as ONE module, the way the
// worker and the server verifier run the sim. (Run through vitest's module
// runner, the same code measured 4-5x slower than bundled — most likely its
// per-call live-binding lookups across modules — which would make a timing budget
// meaningless.) Returns, per roster weapon, the mean ms of one resolveTurn: the
// best of three timed passes after a warm-up pass. A busy CI neighbour can only
// slow a pass down, so the minimum is the least noisy estimate.
import { createMatch } from "@/game/titles/arcfire/match";
import { cloneMatch, type MatchState } from "@/game/titles/arcfire/state";
import { resolveTurn } from "@/game/titles/arcfire/resolve";
import { ROSTER } from "@/game/titles/arcfire/weapons/roster";
import { CORPUS_SEED, CORPUS_SETTINGS } from "./corpus";

export function measure(now: () => number): number[] {
  const base = createMatch(CORPUS_SEED, CORPUS_SETTINGS);
  base.phase = "battle";
  base.shooter = 0;
  const aims: [number, number][] = [];
  for (let a = 20; a <= 160; a += 10) for (let p = 40; p <= 100; p += 15) aims.push([a, p]);
  const out: number[] = ROSTER.map(() => Infinity);
  for (let pass = 0; pass < 4; pass++) { // pass 0 warms the JIT; passes 1-3 keep each weapon's best mean
    for (let w = 0; w < ROSTER.length; w++) {
      const clones: MatchState[] = aims.map(() => cloneMatch(base));
      const t0 = now();
      for (let i = 0; i < aims.length; i++) resolveTurn(clones[i], { move: 0, weapon: w, angle: aims[i][0], power: aims[i][1] });
      const ms = (now() - t0) / aims.length;
      if (pass > 0 && ms < out[w]) out[w] = ms;
    }
  }
  return out;
}
```

```ts
// src/game/titles/arcfire/perf.test.ts
//
// Spec §5: a single-shell resolveTurn averages <= 0.2 ms in Node. The sim is
// bundled with esbuild and run as one module (perf.entry.ts explains why);
// every weapon must also stay <= 0.5 ms (about 4x the slowest measured,
// Prism's three 1,200 px beams, for CI noise). Each figure is a best of
// three after a warm-up, so a shared runner has to slow all three passes to
// fail it. The table is printed for the plan's hand-off notes.
import { it, expect } from "vitest";
import { resolve } from "node:path";
import { build } from "esbuild";
import { ROSTER } from "./weapons/roster";

it("resolveTurn stays inside the spec §5 budget", async () => {
  const out = await build({
    entryPoints: [resolve("src/game/test/arcfire/perf.entry.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, tsconfig: "tsconfig.json",
  });
  const mod: { exports: { measure?: (now: () => number) => number[] } } = { exports: {} };
  new Function("module", "exports", out.outputFiles[0].text)(mod, mod.exports);
  const ms = mod.exports.measure!(() => Number(process.hrtime.bigint()) / 1e6);
  console.log(ROSTER.map((w, i) => `${w.id.padEnd(11)} ${ms[i].toFixed(4)} ms`).join("\n"));
  expect(ms[0]).toBeLessThanOrEqual(0.2); // Pulse
  for (const v of ms) expect(v).toBeLessThanOrEqual(0.5);
}, 60000);
```

*(Revision 2 measure: best of three after a warm-up, bundled on Node 24. Pulse 0.027 ms, the others 0.027–0.123 ms, the slowest being Prism's three 1,200 px beams, then Swarm at 0.094 ms. Both assertions hold, with ≥ 4× margin on the 0.5 ms ceiling. The whole measurement takes about 0.9 s.)*

A best-of-three cannot hide a real regression, which slows every pass; it only drops the passes a noisy neighbour slowed. If CI still flakes, the next knob is a margin multiplier read from the environment, not a looser literal. The < 5 s daily-verification test belongs to 2B, and must also bundle.

---

## 9 · Task breakdown (deliverable h): 14 tasks in dependency order

**Rules for every task.**
- TDD: a failing test, then the code, then green.
- The task ends with `npx vitest run` and `npx tsc --noEmit` green, and the purity guard passing.
- Circle TD's `5167b43d` is untouched.
- **From T4 on, `389a1340` (golden), `8d7dc831` (windless) and every existing corpus key stay byte-identical.** Weapon tasks append corpus keys with `UPDATE_ARCFIRE_CORPUS=add`.
- Weapon tasks follow roster index order, so each appends a contiguous slice.
- **Tests that span the whole roster are staged, so every task ends green.** Each piece lands with the task that makes it pass:
  - `roster.test.ts`: §8.2 "Task staging" (T5 prefix pin → `WIRE` extended by T7–T12 → the final file at T13);
  - `corpus.test.ts`: §8.4 "Task staging" (the `id in ROSTER_INDEX` gates);
  - the `validate.test.ts` totality cases: §8.1, each with its primitive.

  A test the table below does not assign to a task lands with the code it exercises.
- `ballistics.ts` and `primitives.ts` grow by task toward the verbatim final files; each task adds only the functions listed, and their imports grow with them.

| # | Task | Files | Tests and gate |
|---|---|---|---|
| 1 | **Behaviour pins first.** The corpus runner; the corpus test and fixture for the 8 Plan-1 weapons with their definition digests; `runArcfireCorpus` in the harness; the e2e spec made table-driven with the corpus added. **No sim change.** | `src/game/test/arcfire/corpus.ts`, `corpus.test.ts`, `corpus.golden.json`, `harness.entry.ts`, `e2e/cross-engine-determinism.spec.ts` | Corpus `09403dbb` (123 cases) in Node, Chromium and WebKit; golden `63222780` and windless `1c8832e9` unchanged |
| 2 | **`rosterSize` + the append-proof golden.** The field (required, validated, prefix draft), then the `hashMatch` fold, in two steps (§7.3); `rosterSize: 8` in every test literal and in `CORPUS_SETTINGS` | `state.ts`, `match.ts`, `hash.ts`, the test literals, `determinism.golden.json` | Step 1 reproduces `63222780` with a settings-only fixture diff (`"rosterSize": 8` added, and a comma after the line before it); step 2 gives `4c1d8598`; windless `8d7dc831`; corpus unchanged; rosterSize validation and hash tests |
| 3 | **Exact-distance damage.** `blastDamage` (§4.3) and the new `damage.test.ts` | `damage.ts`, `damage.test.ts`, `resolve.test.ts` (Fan) | BigInt-reference test; golden `389a1340` [31, 83]; windless unchanged; Fan [50, 0]; corpus: exactly the 4 declared cases, points only, lower (`655486aa`) |
| 4 | **Ballistics carry-forwards.** `cosDeg`/`sinDeg`, `floorPx`/`ceilDiv`; `muzzle` and the launch on `cosDeg`/`sinDeg`; `stepShell` floors; `resolve` drops the clamp and floors recorded points. A patch to the Plan 1 files | `aimTable.ts`, `imath.ts`, `ballistics.ts`, `resolve.ts` | Direction, `floorPx` and left-edge unit tests; Fan at 2° and 178°; **pins unchanged**; corpus: exactly the 11 declared cases (`fa6b1ed7`) |
| 5 | **Data model + step-loop refactor (behaviour-preserving) + validator + quiet path.** The final `types.ts`, `timeline.ts` and `validate.ts`; `Shell` gains all fields at inert defaults, plus `shellAt`/`launchAt`; the `primitives.ts` skeleton (`Shot`, `Trigger`, `Pending`, `emit`, `hurt`, `blastAt`, `tankMask`/`tankAt`, `addShell`, `fanOffset`, and `applyEffects` with the `blast` branch); `resolve.ts` as in §3.6 (the loop, `resolveWeapon`, `resolveTurnPoints`, `abandon`) minus three branches that later tasks add: early/dud (T7), bounce (T8) and beams (T11); the constants (§2.3, including `BOUNCE_PROBE_R = 8` and `DIG_MAX_PITCH = 30`); `settle(t, collect)` | `weapons/types.ts`, `weapons/validate.ts`, `timeline.ts`, `ballistics.ts`, `weapons/primitives.ts`, `resolve.ts`, `constants.ts`, `terrain.ts` (`settle` only), `roster.test.ts` (the §8.2 T5 version: the validator block, and the wire pin becomes a prefix pin), `validate.test.ts`, the 2 type-only test edits, `corpus.test.ts` (bound and horizon checks) | Validator tests (the roster, the seeded mistakes, the cyclic report, and the T5 totality cases); ShellPath `parent`/`start` on Plan 1 weapons; parity and RNG-untouched tests; **pins and corpus byte-identical; every Plan 1 test green** |
| 6 | **Terrain ops.** Allocation-free `removeInterval` (`PIECES`, `writeColumn`), `addInterval`, `carveCapsule`, `groundBelow`, `surfaceTop` | `terrain.ts`, `terrain.test.ts` | §8.1 terrain tests (the pixel model, capsule = circle at zero length); pins and corpus unchanged |
| 7 | **Delay + split + apex → Twin Nova, Cascade, Hydra, Hailstorm, Shrapnel, Barrage (8–13).** The apex latch and `stopAtApex` in `stepShell`; `rotateVel`; the `ignore` mask; `split()`; the delay branch and `fuse`; `early`/`dud` in `resolve` | `ballistics.ts`, `weapons/primitives.ts`, `resolve.ts` (early/dud), `roster.ts`, `roster.test.ts` (+6 ids to `WIRE`; the static maxima 13 shells and 3,600 steps), `validate.test.ts` (split totality cases) | Apex latch; the delay tests; the split geometry tests (offsets, Barrage exactly 30 px, child paths, early, dud, spawn-inside); the spawn-point rule (§3.2 rule 6: the `stepShell` cases and Barrage into a block); corpus: 6 weapons' keys added |
| 8 | **Bounce → Skipper, Pinball, Ricochet (14–16).** `surfaceNormal` on the radius-8 disc (D9, O15 decided), `reflect`, `endBounce`, wall bounces; `resolve`'s bounce branch and `blastEach` | `ballistics.ts`, `resolve.ts`, `roster.ts`, `roster.test.ts` (+3 ids) | Reflection (flat and 45°) and wall unit tests; Pinball 6 bounces; Skipper (final blast at (699, 422)); Ricochet; corpus keys added |
| 9 | **Surface walker: roll, dig, burn → Tumbler, Juggernaut, Burrow, Auger, Inferno, Wildfire (17–22).** `walk`, `downhill`, `roll()`, `dig()` with the 30° pitch clamp (D20), `burn()`, with `dur`/`lag` | `weapons/primitives.ts`, `roster.ts`, `roster.test.ts` (+6 ids), `validate.test.ts` (roll, dig and burn totality cases) | The roll, dig and burn tests (path, stop, edge, direct hit; the clamped, kept and headless dig directions; spacing; once-per-tank); corpus keys added |
| 10 | **Build → Rampart, Bastion, Leveler (23–25).** `build()` | `weapons/primitives.ts`, `roster.ts`, `roster.test.ts` (+3 ids), `validate.test.ts` (wall totality case) | Wall, ball and level profiles; `build.width`; **the no-burying test**; corpus keys added |
| 11 | **Beam → Lancer, Prism (26–27).** `beamDir` (the beam dial, D19) and `fireBeams()`; 1,200 px beams | `weapons/primitives.ts`, `roster.ts`, `roster.test.ts` (+2 ids), `validate.test.ts` (beam totality case) | The dial's values and mirror identity; level at 90 through the mound, power ignored; aiming down from a plateau (angles 67–71 hit); mirror-exact on a mirrored board; straight down to the floor; Prism spread; no self-hit at any angle for either shooter; corpus keys added (the beam-scored gate switches on, met by Lancer level on the hills) |
| 12 | **Homing → Seeker, Swarm (28–29).** `steer()` in `stepShell` | `ballistics.ts`, `roster.ts`, `roster.test.ts` (+2 ids) | Homing property test; Seeker vs Pulse; no steering without an apex; corpus keys added |
| 13 | **Quake + roster completion → Quake, Aftershock (30–31).** `quake()`, which spares the shooter (D21); `STANDARD_SETTINGS`/`SHORT_SETTINGS`; the final `roster.test.ts` (the exact 32-id wire pin, 12-tag coverage, the settings guarantee tests including the structural one, the tripwire) | `weapons/primitives.ts`, `roster.ts`, `state.ts`, `roster.test.ts` (the §8.2 final version), `validate.test.ts` (reach-0 totality case) | Quake falloff and furrow; the chasm; the shooter exemption (Quake [0, 0] and Aftershock [0, 50] on their own tank); §8.2 final file green; corpus complete: **483 cases, `a7100140`** |
| 14 | **Full-roster golden, perf, cross-engine, spec sync, hand-off.** §8.5 and §8.6; the spec edits (§2 draft from `rosterSize`; §3.2 caps, walls, floor; §3.3 exact damage; §3.4 Timeline; §4.1 types; §4.2 open values and the owner decisions of §2.4: 1,200 px beams on the beam dial, the 30° dig clamp, the quake's shooter exemption, the radius-8 bounce normal; §9.1 carry-forwards closed; the 2B hand-off, §11) | `determinism.test.ts`, `determinism.full.golden.json`, `perf.entry.ts`, `perf.test.ts`, `harness.entry.ts`, the e2e spec, the spec | Full golden `3f614265` [359, 448] with all 12 tags; the perf assertions; `npm run test:e2e:cross-engine` green in Chromium and WebKit (Firefox in CI); `npm run build` |

**Risk.**
- **Task 5 is the riskiest: it replaces the loop.** Its gate (pins and all 123 corpus cases byte-identical) is exactly what the prototype passed.
  - It stays one task for two reasons. The brief caps the plan at 14 tasks. And its static half cannot compile against Plan 1's loop without throwaway glue: the final `types.ts` makes Plan 1's `def.stage.effects[i].blast` a type error, and the final `ShellPath` needs `parent`/`start`.
  - Failures still localise. The corpus test names every moved case. The parity test separates the quiet path from the loop. The validator tests touch no loop code.
- **Tasks 7–13 only add branches** that the existing weapons never take: the apex latch, bounces, `ignore` and homing are all inert at their defaults.

---

## 10 · Risks and open questions (deliverable i)

### 10.1 For the owner (⚑): gameplay and feel

**All fifteen items are settled (owner, 2026-09-23).** O1, O2, O3, O9 and O15 are **DECIDED** as recorded below; every other item takes its stated default ("default accepted"). 2A implements exactly this. Changing one later is a data or one-rule change plus a declared corpus re-pin.

Measurements use the **blind grid** of §1: 20 seeded hills boards × both shooters; shells at angle 5..85 step 2 toward the opponent × power 30..100 step 2 (59,040 shots); beams at every command angle pointing at the opponent's side (power ignored). "Old" is this design before Revision 2. The reference is **Pulse: 3.2% of shots hit, 0.93 points per shot**, and it gifts the opponent 1.38 points per shot in self-damage.

**⚑ O1: Beams — DECIDED: long, and aim down (D19).**
- *Was:* Lancer 700 px and Prism 600 px against spawns 840 px apart, aimed at the absolute angle, so never below level (Prism's edge beam reached −4°). No beam could reach from spawn.
- *Decision:* 1,200 px for both (widths and damages as spec §4.2: Lancer 8 px / 60; Prism 3 beams, 8° spread, 6 px / 35 each), read on the **beam dial**. `beamDir(shooter, angle)` = `angle − 90` for player 0 and `angle + 90` for player 1: the shell dial turned a quarter turn toward the shooter's facing, so 90 is level at the opponent, the usual shell half of the dial aims level-to-straight-down, and the other half level-to-straight-up. The wire angle stays an integer in 0..180, and the mirror of a command stays `180 − angle` (§4.6 has the table). Beams still ignore power, gravity and wind, and carve a line.
- *Measured:*
  - **From spawn, every board is now in reach:** on all 40 blind-grid board/shooter pairs, Lancer hits at 2–3 command angles and Prism at 6–9. The old beams reached 0 of the 40, at any of the 181 absolute angles.
  - Blind grid: **Lancer 0% → 1.4% of shots hit, 0.83 points per shot; Prism 0% → 3.9%, 1.36 points per shot** (old: 3,640 shots each over the facing half; new: 7,240 over the whole dial). Neither ever damages its shooter.
  - A beam's whole search space is the 181 angles, so an aiming AI finds the hitting angles whenever they exist: from spawn, Lancer's 60 and one Prism beam's 35 are there to be taken every turn (adjacent Prism beams are 4° apart, so beyond about 490 px only one of them can touch the tank). 2B's harness judges both against their tier bands.

**⚑ O2: Homing — DECIDED: the spec numbers.**
- Seeker turns ≤ 2°/step and Swarm ≤ 1°/step after the apex, toward the enemy's hitbox centre, with **no lock radius and no turn budget** (D8, as designed). 2B's balance harness and the owner's playtest tune it.
- *Measured* (unchanged by Revision 2): blind grid **Seeker 46.6% of shots hit, 23.1 points per shot; Swarm 42.5%, 32.06**, against Pulse's 3.2% (0.93). On their own grids the engine and feel prototypes measured 61% and 91%. The table cannot turn less than 1°/step, so any later softening is a new rule (a lock radius or a turn budget), not a smaller number.

**⚑ O3: Dig — DECIDED: pitch-clamped tunnel (D20).**
- *Was:* the literal 2-D heading. Falling shells arrive steeply, so tunnels dived and blasted too deep to hurt.
- *Decision:* along the travel direction at impact, never steeper than 30° below level (`DIG_MAX_PITCH`); the horizontal sense is kept (toward the opponent when there is none), and upward or shallower headings are kept as they are.
- *Measured on the blind grid* (51,956 of the 59,040 shots dig; the rest are lost off the world):
  - Tunnels steeper than 30°: 32,206 → 0. Mean tunnel depth: Burrow 46.4 → 27.1 px, Auger 81.6 → 46.9 px.
  - **Burrow: 1.9% → 2.7% of shots hit, 0.96 → 1.23 points per shot** (Pulse: 3.2%, 0.93). Tunnel hits 158 → 609 (2,915 → 18,723 points); the 979 direct hits are unchanged.
  - **Auger: 2.1% → 3.3%, 0.30 → 0.46 points per shot.** Tunnel hits 253 → 976 (2,178 → 11,209 points); the same 979 direct hits.
  - Why not more: Burrow's clamped 90 px tunnel still ends 45 px down, and Auger's blasts sit 20–80 px down, so their tunnel blasts can reach a tank only from an impact at least 10 px (Burrow) or 1 px (Auger's first blast) above the tank's ground, or by tunnelling into its hitbox (§4.6). Tunnelling works from slopes and ledges above the enemy, not on level ground. Neither weapon ever damaged its shooter on the grid. The balance harness judges the rest; the levers left are the pitch (a constant), the length and the blast radii (data).

**⚑ O4: Apex split geometry — default accepted.**
- Hailstorm is a burst about straight down at 50% of nominal speed, *carried by the parent's motion*, so it is aimed like a shell. The cluster lands 100–160 px short of where the plain shell would have (proto: Pulse at 45°/60 lands at x 898, the hail at 737–795). The alternative, rain straight down from the apex (a lob-over weapon), is not taken.
- Hydra's heavies keep 100% of the apex speed.
- Barrage's line is centred on the parent and carries its velocity: a carpet centred where the shell would have landed.

**⚑ O5: A nearly flat Barrage (aim ≲ 5° or ≳ 175°) apexes near the muzzle — default accepted.** Its rear line children can fly into the shooter (proto: 18 self-damage at 3° with tanks 100 px apart). The spawn-inside rule covers children spawned *inside* a hitbox, not ones flying into it. The alternative, spawning line children only ahead of the parent, is not taken; §8.1 pins the behaviour.

**⚑ O6: Volleys below the horizon (D13) — default accepted.** They can land near the shooter (corpus: Fan at 180°/100 on the hills gives the opponent 2). Shifting the fan inward stays rejected (§7.1).

**⚑ O7: Roll and fire never climb — default accepted.**
- They stop at the first 1-px rise.
- A roller goes *downhill first*, and in its travel direction only on level ground.
- Not taken: travel-first (engine); a climb "credit" (feel).

**⚑ O8: Fire — default accepted.**
- Touch = the tank's hitbox circle, so on level ground a flow must reach within about 8 px of the centre.
- Damage is once per tank per burn effect (Wildfire max 45); flows stop at a tank; there is no lingering fire.
- Not taken: a wider reach; once per flow (Wildfire up to 90); lingering fire (a hashed `MatchState` addition).

**⚑ O9: Quake — DECIDED: horizontal distance, never the shooter (D21).**
- *Decision:* the shockwave's reach stays horizontal (to the hitbox edge; unblockable, crosses chasms), and **the shooter's own tank is exempt** from shockwave damage, for Quake and for Aftershock's shockwave. Aftershock's separate impact blast follows the normal blast rules: it can hurt the shooter, credited to the opponent. The furrow still lowers the ground near the shooter, which the tank rides down (no fall damage).
- *Measured on the blind grid:*
  - **Quake:** hits unchanged (19.6% of shots, 6.28 points per shot). Self-damage **42.7% of shots, 13.01 points per shot gifted → 0**. Net per shot −6.73 → **+6.28**.
  - **Aftershock:** hits unchanged (16.5%, 4.64 points per shot). Self-damage **33.7% of shots, 9.24 gifted → 10.2%, 2.57** (its blast only). Net −4.59 → **+2.07**.
  - Corpus: `quake|flat|…|0/60` gives [1, 0] instead of [1, 29]; Quake on its own tank [0, 0] instead of [0, 55]; Aftershock on its own tank [0, 50] instead of [0, 85].

**⚑ O10: Builds lift tanks — default accepted.** Rampart on a tank puts it on an 80 px pedestal, and Bastion on the enemy raised it 72 px. Builds do not skip tank columns (that would be closer to burying).

**⚑ O11: Direct tank hits skip the roll and the tunnel — default accepted.** Tumbler blasts at once; Burrow and Auger give only their end blast.

**⚑ O12: Bounce restitution — default accepted.** It scales both components (speed kept = pct), and walls are elastic (Ricochet 100%). Restitution on the normal component only (a longer "skip") is not taken.

**⚑ O13: Numbers the spec leaves open (bold in §5.1) — defaults accepted:**
- Cascade grandchildren 50°/40% (a tight cluster, about ±20 px);
- Hydra 100%; Hailstorm cone 50%; Barrage 100%;
- `early` = one child's blast;
- Auger width 14 + an end blast;
- Wildfire pool 0;
- Ricochet 100%;
- Aftershock furrow 4;
- the `power` placeholders (2B's harness rewrites them).

**⚑ O14: Top-attack and direct-hit stacking — default accepted.** Children of a near-vertical apex, and Cascade's chain on a direct hit, can stack up to about 150 points, above the tier-3 band. The balance harness judges it; a minimum horizontal child spread is the knob if it needs one.

**⚑ O15: Bounce normals on gentle slopes — DECIDED: radius 8 (D9).**
- *Decision:* `BOUNCE_PROBE_R = 8`. It is one constant and still exact: each normal component is ≤ 330, so `2·vn·nx < 2^50`, and it costs ≤ 197 probes per terrain bounce.
- *Measured:* a vertical drop at each of 40 consecutive columns (x = 600..639) of a plain staircase slope rising to the right (`height[x] = 400 − ⌊x / k⌋`), reflected heading in aim degrees:

  | slope | ideal | radius 4 (was) | **radius 8 (decided)** |
  |---|---|---|---|
  | 1:3 | 126.9 | 126.9–130.4 | 124.6–126.8 |
  | 1:6 | 108.9 | 105.0–118.1 | 108.4–109.8 |
  | 1:10 | 101.4 | 90.0–118.1 | 99.5–103.6 |
  | 1:20 | 95.7 | 90.0–118.1 | 90.0–102.5 |
  | 1:40 | 92.9 | 90.0–118.1 | 90.0–102.5 |

- Effect on the pins: exactly 5 corpus cases differ from radius 4 (`skipper|hills|p0|w0|m0|0/100`, `skipper|hills|p0|w0|m0|2/30`, `skipper|flat|p0|w0|m0|0/60`, `pinball|hills|p0|w0|m0|35/70`, `pinball|hills|p0|w0|m0|2/30`, all boards only). Nothing was pinned before T8, so nothing is re-pinned: T8 writes these keys first. Ricochet's wall bounces never probe.

### 10.2 Engineering risks

- **K1: Transcription drift.** Mitigated by the verbatim blocks plus the stage transcription checks: `4c1d8598`, `389a1340`, `8d7dc831`, the corpus digests at each stage (`09403dbb`, `655486aa`, `fa6b1ed7`, `a7100140`), and `3f614265`. The final three pins (`389a1340`, `a7100140`, `3f614265`) were reproduced in Chromium and WebKit.
- **K2: `MAX_SPANS` carve overflow** still drops the top span: Plan 1's rule, kept so the pins cannot move. It needs 8+ holes in one column in one shot. `addInterval` never loses dirt.
- **K3: Timing inside vitest is inflated about 4–5×** (§4.8). The perf test bundles; 2B's verification-budget test must too.
- **K4: `-0` in Fx** (Plan 1's `mul` of small negatives) is harmless, because hashing uses `|0`. New code writes negations as `0 - x`.
- **K5: Heights near 0.** Repeated builds can raise a column toward y = 0, and the hitbox then extends above the world top. The sim is fine (there is no ceiling); Plan 3 must draw negative y.
- **K6: The purity guard scans comments.** Never write the banned words ("performance", "window", "document", "navigator", the trig function names) or `**` in a sim file, even in prose.
- **K7: No BigInt literals** anywhere (the `tsconfig` targets ES2017); use `BigInt(…)`.
- **K8: Chaotic sensitivity.** Bounce normals and apex splits make some outcomes jump with 1° of aim. That is deterministic and fine for the AI, but the harness will see high variance for BOUNCE and SPLIT.
- **K9: Browser JIT speed.** WebKit and Firefox may be 1.5–2× slower than Node; the margins in §4.8 absorb it, and 2B owns the worker budget.
- **K10: `cloneMatch` is now 30–50% of a cheap sim** (≈ 21 µs, mostly allocating the 77 KB span buffer). A cheaper clone that rebuilt spans from `height` was measured at only about 3 µs faster: it still allocates, and it needs a "canonical spans" invariant to keep `cloneMatch` deep-equal. It was therefore **not** adopted in 2A. The real lever is 2B's `copyMatchInto(dst, src)`: it reuses a scratch match and can skip `spans` entirely, because `resolveTurn` rebuilds them from `height` at its start (≈ 2 µs).
- **K11: `hashMatch` does not identify the guaranteed tags (decide before T2).** Plan 1 folds `guaranteeTags.length` only (§2.2, "What the fold does not do").
  - That is harmless for verification and desync detection, because the tags act only through the hashed pool.
  - If sub-project 2 wants the hash to identify the settings as well, fold each tag's code (for example its index in a fixed, append-only tag list) right after `s.rosterSize`, in T2's step-2 re-pin.
  - It costs no extra golden move, but `4c1d8598`, `389a1340`, `8d7dc831` and `3f614265` would then all be taken from the run. The corpus digests are unaffected.
  - Default: not folded, as written here.
- **K12: The quiet path still allocates.** When not recording, `resolveTurnPoints` still builds:
  - the `Timeline` shell;
  - one `Trigger` object per trigger;
  - `split`'s `children` array;
  - `roll`'s and `burn`'s walk paths (their lengths feed only `dur`/`lag`);
  - `settle`'s heights copy;
  - `carveCapsule`'s `half` table.

  All of it is cheap today (§4.8). Before 2B multiplies it by thousands of sims per AI turn, gate the walk paths and `children` on `shot.rec` (count columns instead), and keep a module scratch for `half`, sized to the validator's largest carve radius (16). No state changes, so no pin moves, and the parity test guards it (§11).

---

## 11 · What Plan 2B gets from 2A

- **Entry points.** `resolveTurnPoints(m, input)` returns the same state and points with no Timeline. `resolveWeapon(m, def, input, record)` fires any definition without a roster entry: 2B's cheap probe shell (in record mode its `blast` or `out` event gives the landing point) and Plan 3's draft preview can both use it.
- **Weapons consume no RNG** (tested). A candidate's outcome is a pure function of (state, weapon, angle, power, wind), so search never desyncs the match RNG.
- **Beams ignore power** (`def.launch.kind === "beam"`), so the probe grid can collapse that axis. They read the angle on the beam dial: `beamDir(shooter, angle)` (exported from `weapons/primitives.ts`) is the direction a command fires, 90 is level at the opponent for both players, and the mirror of a beam command is `180 − angle` as for shells, so a mirrored aim grid covers beams unchanged. From spawn, 2–3 of Lancer's 181 angles hit on every blind-grid board (§10.1 O1).
- **Homing is at the spec numbers** (O2): Seeker and Swarm score far above Pulse on a blind grid (§10.1), and the harness's first run is where a lock radius or turn budget would be judged.
- **Static cost bounds:** `maxShells(def)` ≤ 13 and `maxTurnSteps(def)` ≤ 3,600 for the roster. Measured costs are in §4.8. Budget in sims, as the spec says; the bounds are there if the owner wants weapon-independent timing.
- **Timing:** bundle the sim before timing (§4.8), and use `copyMatchInto` (K10).
- **Quiet-path allocations to gate** before the AI's inner loop multiplies them (K12): the walk paths, `children`, the per-trigger objects, `settle`'s heights copy and `carveCapsule`'s `half` table. The parity test proves such a change inert.
- **The corpus runner** is reusable as a regression net for AI-side changes.

---

## 12 · Provenance

**From the winning "minimal" design (the base).**
- Instant closed-form effects, the three-line step order, and bounce/homing as Stage flight modifiers inside `stepShell`.
- `cosDeg`/`sinDeg` by symmetry, `floorPx`, and the centroid bounce normal.
- The shared surface walker and the shared capsule carve.
- `resolveWeapon`, `MatchSettings.rosterSize` with the two-step re-pin, and `STANDARD_SETTINGS`/`SHORT_SETTINGS` with the tripwire.
- The per-weapon-id corpus, the full-roster golden (seed 20260927, all 12 tags), the per-primitive test list, and the owner findings O1/O2.
- Most of the code, reworked as described below.

**Fixed from the judges' findings on "minimal".**
- Early apex hits no longer stack a whole split (`Stage.early`).
- Level launches no longer burst at the muzzle (the rising-apex rule).
- Children spawned inside a hitbox no longer get a free hit (`ignore`).
- Instant effects now carry display timing (`dur`/`lag`).
- `addInterval` no longer deletes dirt on overflow.
- Beams stop at the floor.
- The quake uses edge distance.
- Damage is exact.
- A quiet path and allocation-free interval edits exist.
- `STANDARD_SETTINGS` lands with the roster (T13), not before it is usable.
- The dig balance risk is raised (O3), as is the nearly-flat Barrage self-hit (O5).

**Grafted from "engine".**
- Exact-distance damage and its proof.
- The staged, one-cause re-pins with transcription hashes and inertness rules ("scores only go down").
- `Stage.early` / `dud`, and the rising-apex rule.
- The tan-comparison homing that never overshoots.
- The `ignore` spawn mask.
- `validate.ts` with static `maxShells`/`maxTurnSteps`, a depth limit that catches cycles, the seeded-mistake and degenerate-definition totality tests, and the `MAX_SHELLS` backstop.
- `resolveTurnPoints` with `settle(t, collect)`, the parity test and the RNG-untouched test.
- The numbered normative ordering rules.
- The corpus coverage gates (every event kind, the flight cap, both sides of the horizon), plus the finding that the Fan test pin moves, now listed.

**Grafted from "feel".**
- **The behaviour pins come first:** Task 1 pins the Plan 1 corpus before any refactor, and every later stage declares exactly which cases may move.
- `hashBoard`, which leaves settings, pool, hands and RNG out of the fingerprint, together with per-weapon definition digests.
- An `addInterval` overflow rule that never loses dirt (dirt lands on dirt).
- An allocation-free `removeInterval`.
- `DelayableEffect`, so the delay queue provably drains.
- Negations written `0 - x`.

**Considered and not adopted, with the reason.**
- Feel's deterministic *work counter*: the static bounds, the per-case bound checks and a bundled wall-clock test cover the same risks with less plumbing.
- Feel's cheap clone: it measured only about 3 µs faster (K10) and needs a canonical-spans invariant; 2B's `copyMatchInto` is the real lever.
- Engine's entity/table architecture, its Timeline renames, and the mole dig (the owner chose the pitch-clamped tunnel instead, O3).
- Feel's spec deltas as defaults (lock radius, beam dirt cost, climbing rollers, flat-fire cost, a 2,400-step turn cap).
- Feel's arrival-scheduled damage, which couples the sim to presentation speeds (replaced by D17).

**New in this synthesis.**
- `dur`/`lag` presentation timing.
- The measured vitest timing inflation and the bundled perf test.
- The BigInt-literal constraint.
- Exact per-stage corpus diffs, and a fixed-aim sudden-death win case, so no stage gate depends on a search strategy.
- Cross-engine reproduction of every transcription hash.

**From the owner (Revision 2, 2026-09-23).** The beam dial and 1,200 px beams (O1), the spec homing numbers (O2), the 30° dig clamp (O3), the quake's shooter exemption (O9), the radius-8 bounce normal (O15), and the defaults for every other item.

---

## Appendix · File map

```
src/game/titles/arcfire/
  aimTable.ts          + cosDeg, sinDeg                                         T4
  imath.ts             + floorPx, ceilDiv                                       T4
  constants.ts         + MAX_TURN_STEPS, MAX_SHELLS, MAX_STAGE_DEPTH,
                         BOUNCE_PROBE_R (8), ROLL_PROBE, DIG_MAX_PITCH (30)     T5
  state.ts             MatchSettings.rosterSize (T2); STANDARD/SHORT_SETTINGS (T13)
  match.ts             rosterSize validation; draft from ROSTER.slice            T2
  hash.ts              fold s.rosterSize                                        T2
  damage.ts            exact-distance blastDamage                               T3
  terrain.ts           settle(collect) (T5); PIECES/writeColumn, removeInterval
                       export, addInterval, carveCapsule, groundBelow,
                       surfaceTop (T6)
  ballistics.ts        floor + cosDeg (T4); Shell fields, shellAt/launchAt (T5);
                       apex latch, ignore, rotateVel (T7); bounces (T8); steer (T12)
  timeline.ts          final shape (T5)
  resolve.ts           unclamp + floor (T4); the final loop, resolveWeapon,
                       resolveTurnPoints (T5); early/dud (T7); bounce branch (T8)
  weapons/types.ts     final model (T5)
  weapons/validate.ts  NEW (T5)
  weapons/primitives.ts NEW: skeleton (T5); split/delay (T7); walk/roll/dig/burn (T9);
                       build (T10); beamDir, fireBeams (T11); quake (T13)
  weapons/roster.ts    + 24 entries, 8..31 (T7–T13)
  weapons/roster.test.ts  staged (§8.2): T5 version, prefix pin (T5); + ids and,
                       in T7, the static maxima (T7–T12); final version (T13)
  *.test.ts            §8; corpus.test.ts, perf.test.ts, corpus.golden.json,
                       determinism.full.golden.json
src/game/test/arcfire/corpus.ts, perf.entry.ts                                  T1, T14
src/game/test/cross-engine/harness.entry.ts   + runArcfireCorpus                T1
e2e/cross-engine-determinism.spec.ts          table-driven; + corpus (T1), + full golden (T14)
docs/superpowers/specs/2026-09-22-arcfire-design.md   sync                      T14
```

---

## Revision log

### Revision 1 (post-review)

*Historical: the pins quoted in this subsection are Revision 1's. Revision 2, below, supersedes `2b491536` and `654c337b`.*

This revision answers the final critic's review. Every change was checked on a prototype rebuilt mechanically from this document's blocks (§1, "Revision check"). No pin moved: `389a1340`, `8d7dc831`, `2b491536` and `654c337b` are exactly as before. The code changes are Timeline-, comment- and test-only.

**Blocking**

1. **`roster.test.ts` could not end every task green.** Plan 1's exact 8-id pin would fail at T7's first append, and the "verbatim, replaces the file" version cannot pass before T13. **Resolved:** the file is staged like the corpus test (§8.2 "Task staging"):
   - T5 lands a verbatim **T5 version**: Plan 1's first two blocks, the validator block, and the exact pin turned into a **prefix pin** on `WIRE` (`ROSTER.slice(0, WIRE.length)`);
   - T7–T12 each append their own slice of ids to `WIRE`, and T7 also adds the static maxima (13 shells, 3,600 steps), since Cascade is the maximum from T7 on;
   - T13 lands the final file: the exact 32-id pin, 12 tags, and the settings blocks.

   To match, §8.3 item 7, the §9 rules (a new "staged tests" bullet), the §9 rows T5 and T7–T13, and the file map now say which blocks land in which task. The same audit staged the `validate.test.ts` totality cases by primitive (§8.1). They resolve through primitives that do not exist at T5; the seeded-mistake checks are static and stay in T5. The "all 32 weapons" wording in §8.1 now reads "every `ROSTER` weapon". Verified by running each task's blocks against the roster prefix it leaves: 8, 14, 17, 23, 26, 28, 30 and 32 entries.

**Non-blocking, adopted** (cheap and clearly right)

- **#2, bounce normal on gentle slopes.** D9 and §4.4 no longer claim "works on slopes": the measured accuracy is stated. New ⚑ O15 has a measured table (radius 4 / radius 8 / surface tops) and the options, with the measured cost of radius 8: 5 corpus cases, corpus `bce65543`, full golden `df0248f6` [358, 448]. It recommends radius 8. T8's row says to settle it first. The pinned default is unchanged.
- **#3, split spawn point.** The false "never a solid pixel" is corrected in §4.6, with a measured sweep. §3.2 rule 6 now states the rule: a spawn point is never tested, a child whose first sample is solid impacts there at `s + 1`, and one spawned off the world is `out`. Tests were added: three `stepShell` cases (§8.1 ballistics) and Barrage into a block (§8.1 split), all verified on the prototype, landing in T7.
- **#4, totality overclaim.** The `validate.ts` header comment, the §4.7 closing text and §7.1 #6 now claim only what the totality test covers, and name what is not covered (a huge carve radius, NaN).
- **#5, T2 step-1 diff.** The check now expects one added line plus one changed line (`]` → `],`), in §7.3 and in §9 T2.
- **#6, tag codes not folded.** "Why fold it" no longer claims the hash tells settings apart. A "What the fold does not do" paragraph explains why that is harmless. New K11 records the option to fold tag codes in T2 step 2, and which pins it would move. Default: not folded, so no pin moves.
- **#7, structural tag guarantee.** A new test in the final `roster.test.ts` asserts `drawPool`'s preconditions: distinct tags, no more of them than `poolSize`, and each present in `ROSTER[0, rosterSize)`. §7.1 #3 explains why these preconditions make the guarantee structural.
- **#8, build width.** The `build` event gains `width` (the columns spanned, the first at `x − ⌊width/2⌋`) in `timeline.ts` and `primitives.ts`. §6.2 and a §8.1 assertion (Rampart 36 columns at `x − 18` … `x + 17`) cover it. The Timeline is unhashed, so no pin moves.
- **#9, dropped delays.** §3.2 rule 10, the `abandon` comment and the §6.2 playback contract now state the exact rule: a `fuse` whose `at` is greater than `Timeline.steps` was dropped by the backstop. No new event kind.
- **#10, perf flakiness.** `measure` now keeps each weapon's best of three passes after a warm-up. Re-measured: Pulse 0.027 ms, others 0.026–0.096 ms, about 0.8 s in total. §8.6 names the next knob, an environment multiplier.
- **#11, quiet-path allocations.** Listed as K12, with the gating plan, and handed to 2B in §11. The code is unchanged, so no pin moves.
- **#12, `steer` magnitudes.** The §4.4 notes were re-derived and measured:
  - launched shells ≤ 2^47.3, with `|dy|` ≈ 2^14.3 (not 2^13);
  - the roster ≤ 2^43.8;
  - validator-corner split children ≤ 2^51.3 (estimate 2^51.7).

  The `steer` comment and D8 now say "< 2^52". The `|v|` bound was also wrong for children, since nominal speed can reach 2^30 at 200% × 3 generations. It is now "< 2^31", with the `reflect` comments updated (< 2^38, < 2^45). Every product still stays below 2^53.

**Non-blocking, declined**

- **#13, split T5 into T5a/T5b.** The brief caps the plan at 14 tasks, and the static half cannot compile against Plan 1's loop without throwaway glue. §9 "Risk" now says how T5's gate localises failures instead.
- **#1** was a verification report (every pin reproduced), and needed no change.

### Revision 2 (owner decisions)

The owner's decisions of 2026-09-23 are applied in place. Each code block was then copied from a prototype built with them, and a second prototype was rebuilt mechanically from this document's blocks to check the copy (§1, "Revision 2 check"). Both prototypes were deleted afterwards.

**Decisions** (§10.1 has each one with its measurements)

- **O1, beams: DECIDED.** Lancer and Prism are 1,200 px (widths and damages as spec §4.2), and they read the command angle on the **beam dial** (new D19). `beamDir(shooter, angle)` is `angle − 90` for player 0 and `angle + 90` for player 1: the shell dial turned a quarter turn toward the shooter's facing. 90 fires level at the opponent, each player's usual shell half of the dial aims level-to-straight-down, the wire angle stays an integer in 0..180, and the mirror of a beam command is `180 − angle` as for shells.
  - The alternative mapping, `elevation = angle − 90` for both players (a reflection for player 1), was rejected. It reverses the dial's turning sense for player 1 relative to its shells, and it breaks the `180 − angle` mirror rule that 2B's grids and the full-roster golden's strategy rely on.
  - `beamDir` is exported for Plan 3's HUD and 2B's AI. §4.6 and §6.2 have the table and the HUD readout.
- **O2, homing: DECIDED**, at the spec numbers (Seeker ≤ 2°/step, Swarm ≤ 1°/step after the apex, no lock radius, no turn budget). No code change; the blind-grid numbers are re-measured.
- **O3, dig: DECIDED**, a pitch-clamped tunnel (new D20, `DIG_MAX_PITCH = 30`). With no horizontal travel it digs toward the opponent, and a zero heading can no longer occur, so `dig`'s old "straight down" fallback is gone.
- **O9, quake: DECIDED.** The reach stays horizontal, and the shockwave never damages the shooter (new D21); Aftershock's blast is unchanged.
- **O15, bounce normal: DECIDED**, radius 8 (`BOUNCE_PROBE_R = 8`, D9).
- **O4–O8, O10–O14:** defaults accepted, including every O13 number.

**Code changes** (every other block is byte-identical to Revision 1)

- `weapons/primitives.ts`:
  - new `beamDir`, used by `fireBeams`;
  - the `dig` direction clamp, which replaces the `len === 0` fallback;
  - `quake` damages only `1 − shooter`.
- `constants.ts`: `BOUNCE_PROBE_R = 8` and the new `DIG_MAX_PITCH = 30`.
- `ballistics.ts`: comments only, for the radius-8 magnitudes (`|n|` components ≤ 330, `vn < 2^41`, `2·vn·nx < 2^50`, ≤ 197 probes).
- `weapons/types.ts`, `resolve.ts` and `timeline.ts`: comments only.
- `roster.ts`: Lancer and Prism `length: 1200`.
- `corpus.ts`: the flat 0/60 case's comment only. The case list is unchanged; the "a beam scored" gate is now met by Lancer fired level on the hills (90/0 and 90/100).
- `perf.test.ts`: the header comment (the ceiling is now about 4× the slowest weapon).

**Pins, old → new**

- Plan 1 golden chain: **unchanged**, `63222780` (also after T2 step 1) → `4c1d8598` (T2 step 2) → `389a1340` [31, 83] (T3). Exact damage alone on Plan 1 still gives `b5fcdcd8`.
- Windless pin: **unchanged**, `1c8832e9` → `8d7dc831` [36, 24].
- Fan test: **unchanged**, [51, 0] → [50, 0].
- Corpus stages: **unchanged**, `09403dbb` (123 cases) → `655486aa` (the same 4 cases) → `fa6b1ed7` (the same 11 cases). The loop refactor still moves 0 of 123.
- Final corpus: **`654c337b` → `a7100140`**, still 483 cases. Exactly 50 cases differ from Revision 1, all in weapons the decisions touch:
  - lancer 15 and prism 15 (D19);
  - burrow 4 and auger 4 (D20; boards only);
  - quake 4 and aftershock 3 (D21; points only, self-damage removed);
  - skipper 3 and pinball 2 (radius 8; boards only).
- Full-roster golden: **`2b491536` [355, 448] → `3f614265` [359, 448]**, winner 1, 40 commands, all 12 tags.
- Definition digests: lancer `0bcc07de` → `26421a9a` and prism `26d3d04f` → `540c4e8a`; the other 30 are unchanged.
- Cross-engine: `389a1340`, `a7100140` and `3f614265` reproduced in Chromium and WebKit. Firefox runs in CI.
- Circle TD `5167b43d`: untouched.

**Tests (§8.1)**
- **Rewritten:**
  - Beam: the dial and its mirror identity; Lancer level at 90 ending at (1199, 388); aiming down from a plateau (angles 67–71 hit); mirror-exact boards; straight down to the floor; Prism at 90 with beam 0 ending at (1199, 449); no self-hit for both shooters.
  - Dig: Burrow (663, 400) → (740, 445); the kept shallow heading; the headless heading toward the opponent; Auger's blasts at (871, 419) … (975, 480).
- **Added:** the quake's chasm and shooter exemption (Quake [0, 0], Aftershock [0, 50] on their own tank); the dropped delay's `fuse` check.
- **Updated:** Skipper's final blast (699, 422) instead of 713.
- **Given exact constructions** where the text was ambiguous: Inferno's slope (now power 37, ignition x 470, lag 55), Leveler's slope, the 45° rise, and the parity test's boards and aims.
- All 166 prototype tests pass on the rebuild, and so does the T5 `roster.test.ts` version. The Plan 1 suite still gives 80 passes plus exactly the 5 declared edits.

**Re-measured** (§1, §4.8, §8.6, §10.1)
- The invariant sweep: 18,240 turns, 0 violations, maxima 1,200 steps and 13 shells.
- Exact damage: 81,276 samples, 0 mismatches.
- The bounce table: the radius-4 and radius-8 columns reproduce Revision 1's figures exactly.
- The muzzle's exact minimum distance from the hitbox centre: √433 ≈ 20.8 px (at 36°). It keeps the no-self-hit argument for every direction, which downward beams now need.
- The cost table (Prism is now the slowest weapon at 0.128 ms, Lancer 0.060), the worst single turn (≤ 0.45 ms), the vitest inflation (Pulse 0.141 ms unbundled against 0.027 ms bundled) and the perf test (Pulse 0.027 ms, max 0.123 ms).
- The blind grid is now defined exactly (§1). Revision 1's O1–O3 figures came from an unrecorded grid, so they are replaced, not compared.

**Removed as obsolete**
- O15's options (a) and (c) and its "surface tops" column.
- The "settle O15 before T8" gate in §0, §4.4 and T8.
- The option lists and recommendations of O1, O2 and O3.
- The claim that a level beam scores at flat 0/60.
- The radius-4 accuracy caveats in D9 and §4.4.
- The Revision 1 perf notes in §8.6.

**Not re-run**, because no code on their path changed: the Barrage spawn sweep (§4.6: 128,586 children), the `steer` magnitude measurements (§4.4), and the staged roster-prefix runs (§8.2). The decisions change no roster order, id, staged test or gate. The beam-scored gate that switches on at T11 is met by `lancer|hills|…|90/0`, which exists from T11.
