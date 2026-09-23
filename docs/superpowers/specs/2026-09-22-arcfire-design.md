# Arcfire — Design Spec (Sub-project 1: the core game)

**Status:** Approved design (brainstorm 2026-09-22). **Slug:** `arcfire` · **Route:** `/games/arcfire`
**Genre:** turn-based artillery, 1v1, in the Scorched Earth / Pocket Tanks lineage. The mechanics are genre conventions; the name, weapon set, art, and code are all original. "Pocket Tanks" is Blitwise's live commercial product, so nothing of theirs (name, weapon names, art) is used.

## Goal

Ship an original, polished WebGPU artillery game on the michaelwright.work arcade, next to Circle TD, playable **vs AI** (three difficulties) and **local pass-and-play**, with a **replay-verified daily-challenge leaderboard** on the existing Supabase database. It runs on desktop and on phones in landscape.

## Scope

**In (sub-project 1):** deterministic sim (terrain, ballistics, tanks, draft, scoring), a 32-weapon roster built from data-driven primitives, a search-based AI with three tiers, both renderers (WebGPU + Canvas2D fallback), the Deck+ HUD, the draft screen, the full match flow, sound, resume, the daily-challenge leaderboard, and the engine generalization needed to host a second title.

**Out, with the design kept ready for them:**
- **Sub-project 2 — online PvP.** Lobby/invites, turn relay, and disconnect handling. The command log in this spec *is* the future wire format; turns are lockstep-ready; there is no hidden information; a per-turn state hash is exposed for desync detection.
- **Sub-project 3 — PvP rankings (Elo).** Needs online play.
- Textured/illustrated art, music, and weapons beyond the 32.

## Decisions log (from the brainstorm)

| Topic | Decision |
|---|---|
| Online PvP | Fast-follow: sub-project 2, right after this one |
| Format | Pocket Tanks-style: 1v1, weapon draft, damage = points, highest total wins, limited moves |
| Devices | Desktop + mobile, landscape; touch drag-to-aim + fine-tuners; mouse + keyboard |
| Weapon roster | Big: 32 weapons at launch, composed from primitives |
| Terrain | Column terrain with collapsing dirt (the persistent state is a heightfield) |
| Sim | Deterministic fixed-point on the CPU; WebGPU is for presentation only |
| Battle layout | "Deck+": layout A's labeled command deck plus layout C's best parts; no layout switcher |
| Tanks | Belt-driven. Default **Vanguard**; players may pick **Scout** (with glowing links) or **Wedge** |
| Leaderboard | Same Supabase DB; daily challenge vs Veteran AI; ranked by margin of victory; wins only |
| Name | **Arcfire** (trademark check before launch) |

Design mockups (reference, not normative): `docs/superpowers/specs/2026-09-22-arcfire-mockups/` — `deck-plus.html` (battle screen), `tank-designs.html` (the three tanks), `draft-screen.html` (draft + flow).

---

## 1 · Architecture

### 1.1 Layout in the repo

```
src/game/titles/arcfire/          sim + rules + AI + roster (pure, purity-guarded)
  constants.ts   world size, physics, rules numbers (the one tuning surface)
  terrain.ts     heightfield + in-shot span columns, carve/add/settle
  ballistics.ts  launch + fixed-step integration + swept collision
  weapons/       primitives.ts (effect implementations), roster.ts (32 WeaponDefs, data only)
  resolve.ts     resolveTurn(state, command) -> { state, timeline }
  match.ts       match state machine: draft -> turns -> sudden death -> result
  ai/            search.ts, evaluate.ts, draftPick.ts (pure, fixed-point)
  state.ts, replay.ts, hash.ts, title.ts (TitleDef binding)
src/game/runtime/render/arcfire/  presentation (outside the purity guard)
  webgpu/ canvas2d/ tankPrimitives.ts terrainMesh.ts effects.ts
src/game/runtime/audio/           procedural WebAudio SFX
src/app/games/arcfire/            page.tsx + GameClient.tsx (ssr:false dynamic import) + HUD components
src/data/games.data.ts            + arcfire catalog entry
```

### 1.2 Engine generalization (a targeted, behavior-preserving refactor)

Today `src/game/sim/` is labeled generic but is Circle-TD-shaped: `replay.ts` imports Circle TD content, `Command` is `start|place|upgrade|sell`, `state.ts` is creeps/towers, `verify.ts` returns `wave`/`maxTowerLevel`, `engine.ts`'s `RenderSnapshot` is creeps/towers, and `runtime/render/transform.ts` imports Circle TD's `STAGE_W/H`. The refactor:

1. **Move the Circle TD specifics into `src/game/titles/circle-td/`:** `SimState`/`Creeps`/`Towers`, its `Command` + `applyCommand` + replay loop, `hashState`, and `RenderSnapshot`. `src/game/sim/` keeps only `math/*`, the FNV-1a primitives, `title.ts`, `registry.ts`, and a generic `verify.ts`.
2. **Generic title contract** (`sim/title.ts`):
   ```ts
   export interface ReplayInput<Cmd> { seed: number; mode: "daily" | "free"; commands: readonly Cmd[] }
   export interface ReplayOutcome { score: number; stat: number; hash: string }
   export type ReplayRejection = "invalid_command_shape" | "invalid_command" | "not_a_win" | "too_long";
   export interface ReplayLimits { maxTicks: number }
   export interface TitleDef<Cmd = unknown> {
     readonly slug: string;
     readonly simVersion: number;
     replay(input: ReplayInput<Cmd>, limits: ReplayLimits): ReplayOutcome | { rejected: ReplayRejection };
   }
   ```
   Circle TD's binding validates each command's tick against `limits.maxTicks` (`invalid_command_shape`, as today), then wraps its existing loop (`score` = score, `stat` = wave). Arcfire's returns `score` = margin, `stat` = the human's points.
3. **Generic `verifyScore`** keeps the version/mode/limits/seed-acceptance checks and delegates the run to `title.replay`, using `title.simVersion` instead of the global `SIM_VERSION`.
4. **`computeFit(pxW, pxH, stageW, stageH)`** takes stage dimensions; each title passes its own.
5. **Regression gate:** Circle TD's determinism golden `5167b43d`, its replay/verify/route tests, and its in-browser behavior must be byte-for-byte unchanged. The refactor lands first, alone, and is verified before any Arcfire code.

### 1.3 The turn contract

`resolveTurn(state, command) -> timeline` is **deterministic** and touches nothing but the `MatchState` it is given, which it advances in place. It resolves one whole turn (optional move, then the shot) to completion. Callers that must keep the original state (AI search, previews) resolve a `cloneMatch` copy. The same function serves:
- **gameplay**: the renderer plays the `timeline` back at display rate, fully decoupled from the sim;
- **AI search**: the AI calls it on candidate commands;
- **verification**: the server replays the command log;
- **online play later**: both clients call it on the same command.

A match is `seed + mode + settings + ordered commands`. That is the replay format, the leaderboard submission, the local resume blob, and the future online wire format. A vs-AI log holds **only the human's** commands (the AI's picks and shots are regenerated deterministically during replay); a 2-player log holds both players' commands in turn order.

### 1.4 Threads

The sim and AI run in a **Web Worker** (the main thread owns rendering, the HUD, and input), so AI "thinking" never janks the UI on phones. The worker and the server run identical code.

---

## 2 · Rules

- **World:** 1200 × 500 stage px (2.4:1), letterboxed to fit. Margins beyond the world show dimmed, non-playable decorative terrain. Nothing playable is ever cropped.
- **Match:** 1v1. A seeded coin flip decides who **picks first**; the other player **shoots first**.
- **Draft:** a seeded pool of **24** distinct weapons drawn from the 32-weapon roster, with at least one of each of BLAST, SPLIT, and DIRT. Players alternate picks until each holds **10**. (Free play can choose **5** each, with a pool of 12.)
- **Turn:** an optional **move** (4 per match; ±36 px horizontally, with y following the surface; can't pass the world edge or come within 64 px of the other tank), then choose one of your remaining weapons, set **angle** (integer degrees 0–180; 0 = right, 90 = straight up) and **power** (integer 0–100), and fire. The **ghost trail** of your previous shot stays visible; there is no trajectory preview.
- **Scoring:** damage dealt to the opponent = points. **Self-damage is awarded to the opponent.** Once all weapons are fired, the higher total wins. **Tie:** sudden death, one Pulse shot each; if still tied, it's a draw.
- **Wind:** off by default. The free-play toggle adds seeded per-turn wind (−40…+40 px/s² horizontal), shown as an arrow and value in the HUD.
- **Tanks:** rest on the surface at their x. They ride settling dirt down; there is no fall damage and no burying (dirt settles beneath tanks, never over them).

---

## 3 · Sim model

All state is integer or Q16.16 fixed-point (`src/game/sim/math/fixed.ts`), randomness comes only from the seeded `mulberry32` (`math/rng.ts`), and aim angles use a **baked** table of Q16.16 cos/sin integer literals for whole degrees 0–180 (`titles/arcfire/aimTable.ts`). Arcfire does not use `math/trig.ts`: that table is built from floating-point sine at load, and engines aren't required to round it identically, so one off-by-one entry could make a browser and the verifier fly different trajectories. There are no floats, no `Math.*` beyond what the purity guard allows, and no host globals.

### 3.1 Terrain

- **Persistent state = heightfield:** `height: Int32Array(1200)`, the surface y per 1-px column (y-down; 500 is the floor).
- **During a shot**, each column may hold several solid **spans** (tunnels, floating dirt): `spans[x] = [top0, bot0, top1, bot1, …]`, capped at 8 per column. Carve (circle, line) and add (ball, wall, mound) edit spans directly, and projectiles collide with spans exactly.
- **Settle** runs once, after the whole shot resolves: in every column, floating spans fall and merge onto the span below or the floor, collapsing back to one span, i.e. the heightfield. The timeline records the pre- and post-settle heightfields plus each falling span so the renderer can animate the pour.
- **Generation:** seeded rolling hills, integer-only:
  - 9 control points (one every 150 px) drawn from the match RNG in [160, 380];
  - linear interpolation between them;
  - three radius-24 box-blur passes;
  - a clamp to [120, 420];
  - tank spawn columns flattened ±24 px.

  No trig is involved, so every engine produces the same hills.

### 3.2 Ballistics

- **Launch:** `v0 = power × V_UNIT` along the aim angle, where `V_UNIT = 6.84 px/s` per power point (power 100 at 45° ranges ~1.3 × world width). `G = 300 px/s²` downward; wind adds horizontal acceleration.
- **Integration:** a fixed physics step of **1/60 s**, semi-implicit Euler in Q16.16. Each step's movement is swept at ≤ 1 px increments (integer DDA) against terrain spans and tank hitboxes, so nothing tunnels.
- **Bounds:** leaving the left or right world edge = lost (except Ricochet, which reflects). There is no ceiling. Flight is capped at **1200 steps** (20 s).
- **Tank hitbox:** a circle of radius 14 px centered 12 px above the tank's surface point.

### 3.3 Damage

For a blast with radius `R` and damage `D` at distance `d` from a tank's hitbox edge (0 if overlapping): `dmg = D × (1 − d/R)` (linear) or `D × (1 − (d/R)²)` (quadratic, where specified), floored to an integer, for `d < R`. A turn's points are the damage its shot dealt to the opponent. Self-damage from any sub-munition is credited to the opponent.

### 3.4 State, hashing, timeline

- `MatchState` = phase, turn index, whose turn, heightfield, tank x (and derived y), moves left, remaining weapons per player, pool/draft state, scores, wind, RNG state, and the sudden-death flag.
- **`hashMatch`:** FNV-1a over every integer field in a canonical order. It's computed per turn (future desync detection) and at match end (verification and golden tests).
- **Timeline** (presentation only, never hashed): per-step projectile positions (a typed array), plus discrete events: `launch`, `bounce`, `split`, `blast{x,y,r}`, `beam`, `roll`, `dig`, `burn{span}`, `quake`, `build`, `damage{player,amount}`, `settle{before,after,falling}`, `move{from,to}`.

---

## 4 · Weapon system

### 4.1 Primitives (the only weapon code)

```ts
type Launch  = { kind: "shell"; count?: number; spreadDeg?: number; speedPct?: number; gravityPct?: number }
             | { kind: "beam"; count?: number; spreadDeg?: number; length: number; width: number; damage: number };
type Blast   = { radius: number; damage: number; falloff?: "linear" | "quadratic" };
type Effect  =
  | { blast: Blast }
  | { split: { count: number; spreadDeg: number; speedPct: number; child: Stage } }
  | { bounce: { times: number; restitutionPct: number; blastEach?: Blast; walls?: boolean } }
  | { roll: { maxDistance: number; then: Blast } }                   // downhill / along travel; stops uphill or on a tank
  | { dig: { length: number; width: number; blastEvery?: number; each?: Blast; then?: Blast } }
  | { burn: { flow: number; pool: number; damage: number; split?: boolean } } // flows downhill along the surface
  | { build: { shape: "ball" | "wall" | "level"; radius?: number; width?: number; height?: number } }
  | { quake: { reach: number; damage: number; furrow: number } }
  | { delay: { steps: number; then: Effect[] } };
interface Stage { on: "impact" | "apex"; effects: Effect[]; homing?: { degPerStep: number } }
interface WeaponDef { id: string; name: string; tag: Tag; tier: 1 | 2 | 3; power: number; launch: Launch; stage?: Stage }
```

`tag` ∈ BLAST, VOLLEY, SPLIT, BOUNCE, ROLL, DIG, FIRE, DIRT, BEAM, HOMING, QUAKE, SPECIAL. `power` is a draft score in 1–100, written by the balance harness and used by the draft AI. Adding a weapon means adding a `WeaponDef` plus an SVG glyph for the HUD.

### 4.2 Roster (32; initial parameters, which the balance harness tunes)

| # | Name | Tag | Tier | Behavior (radius px / damage) |
|---|---|---|---|---|
| 1 | Pulse | BLAST | 1 | impact blast 28 / 40 |
| 2 | Pulse II | BLAST | 2 | impact blast 40 / 60 |
| 3 | Nova | BLAST | 3 | impact blast 72 / 100, deep crater |
| 4 | Needle | BLAST | 2 | speed 115%; blast 10 / 110, quadratic falloff (rewards precision) |
| 5 | Crater | BLAST | 1 | blast 90 / 25; terrain shaping |
| 6 | Twin Nova | BLAST | 3 | blast 50 / 55, then after 30 steps 70 / 60 at the same point |
| 7 | Triad | VOLLEY | 1 | 3 shells, 6° spread; each 24 / 24 |
| 8 | Fan | VOLLEY | 2 | 5 shells, 12° spread; each 20 / 18 |
| 9 | Cascade | SPLIT | 3 | impact 20 / 15 → 3 children (50°, 40% speed), each 18 / 15 → 3 grandchildren, each 14 / 10 |
| 10 | Hydra | SPLIT | 3 | at apex, 5 heavies (40°); each 26 / 30 |
| 11 | Hailstorm | SPLIT | 2 | at apex, 9 small shells falling in a 30° cone; each 14 / 12 |
| 12 | Shrapnel | SPLIT | 2 | impact 24 / 20 → 6 low fragments (160°, 35% speed); each 10 / 8 |
| 13 | Barrage | SPLIT | 2 | at apex, 6 shells dropping in a line 30 px apart; each 20 / 18 |
| 14 | Skipper | BOUNCE | 2 | 3 bounces (55%), blast each 22 / 20; final 26 / 24 |
| 15 | Pinball | BOUNCE | 2 | 6 bounces (80%); final 36 / 55 |
| 16 | Ricochet | BOUNCE | 1 | reflects off the world's side walls (2×); blast 30 / 40 |
| 17 | Tumbler | ROLL | 1 | rolls ≤ 160 px; blast 30 / 40 |
| 18 | Juggernaut | ROLL | 3 | rolls ≤ 300 px; blast 60 / 85 |
| 19 | Burrow | DIG | 2 | tunnels 90 px (width 14) along travel; blast 34 / 55 |
| 20 | Auger | DIG | 2 | tunnels 160 px, blasting every 40 px, each 18 / 16 |
| 21 | Inferno | FIRE | 3 | napalm pool 30 px + flow ≤ 220 px downhill; 70 to any tank it touches |
| 22 | Wildfire | FIRE | 2 | two flows in opposite directions ≤ 140 px; 45 each |
| 23 | Rampart | DIRT | 1 | builds a wall 36 × 80 px |
| 24 | Bastion | DIRT | 1 | builds a dirt ball, radius 48 |
| 25 | Leveler | DIRT | 1 | flattens radius 80 to the impact height |
| 26 | Lancer | BEAM | 2 | beam 700 × 8; 60 to an intersected tank; carves a line; ignores power |
| 27 | Prism | BEAM | 3 | 3 beams (8° spread) 600 × 6; 35 each |
| 28 | Seeker | HOMING | 2 | after apex, steers ≤ 2°/step toward the enemy; blast 32 / 50 |
| 29 | Swarm | HOMING | 3 | 5 shells (14°), after apex ≤ 1°/step; each 16 / 20 |
| 30 | Quake | QUAKE | 2 | shockwave ±260 px along the surface; 55 at the source, linear falloff; 6 px furrow |
| 31 | Aftershock | QUAKE | 3 | blast 40 / 50 + shockwave ±200 px, 35 |
| 32 | Railshot | SPECIAL | 2 | speed 180%, gravity 40%; blast 18 / 75 |

### 4.3 Balance harness

Behind `BALANCE_SWEEP=1` (the same pattern as Circle TD's balance sweep), deterministic **Ace-vs-Ace** matches run across 400 seeds. Per weapon, the harness records mean points per shot, variance, pick rate, and win-rate contribution. It **fails** if any weapon's mean falls outside its tier band (T1: 15–40, T2: 30–60, T3: 50–90 points/shot) or if any weapon's win-rate contribution exceeds +12%. It writes each weapon's `power` score back into the roster. DIRT weapons are judged by win-rate contribution only.

---

## 5 · AI opponent

- **Pure and fixed-point, under the purity guard.** The server must reproduce every decision bit-for-bit, so all evaluation is integer math, noise comes from the match RNG, and ties break by candidate order.
- **Search:** (1) a coarse **probe** with a single cheap shell over an angle × power grid finds aims that land near the enemy; (2) around the best probe aims, each remaining weapon is fully resolved with `resolveTurn`; (3) while moves remain, the best shot is re-evaluated from the left and right positions.
- **Evaluation:** `points to the enemy − points gifted by self-damage`, plus tier heuristics. Ace saves tier-3 weapons unless their expected value beats the best alternative by ≥ 20%, and uses DIRT when the enemy's best reply would score ≥ 60.
- **Tiers** (budgets are **fixed sim counts**, never wall-clock; noise is applied to the chosen angle/power as a seeded sum of 3 uniform integers):

| Tier | Probe grid | Refine | Budget (sims/turn) | Aim noise | Moves | Weapon choice |
|---|---|---|---|---|---|---|
| Rookie | 5° × 10 power | none | 300 | ±6° / ±8 | never | random among the top 4 |
| Veteran | 2° × 4 power | ±2° × ±4 | 1,500 | ±2° / ±3 | when the best shot is < 25 points | best by evaluation |
| Ace | 1° × 2 power | ±1° × ±2 | 4,000 | ±1° / ±1 | always considered | evaluation + sequencing heuristics |

- **Draft AI:** picks by roster `power`. Rookie picks randomly among the top 8 available, Veteran among the top 3, and Ace takes the best.
- **Performance target:** single-shell `resolveTurn` averages ≤ 0.2 ms in Node, and verifying a full daily-challenge match (10 Veteran turns + 10 draft picks) completes in < 5 s on CI hardware, which is enforced by a test.

---

## 6 · Presentation & UX

### 6.1 Battle screen: "Deck+" (one layout; `deck-plus.html`)

- **Battlefield** (~70% of the height): the rendered world, letterboxed. It carries floating **score pills** (you in red, opponent in blue), the **turn pill** (`TURN 7 / 20`), your previous shot's **ghost trail**, and the **drag-to-aim** vector (drag from your tank: direction = angle, length = power) with an `angle · power` bubble.
- **Command deck** (~30%, DOM, design tokens):
  - Row 1: the **weapon carousel** (your 10 drafted weapons; used ones dimmed and struck through; tap to select) and a **weapon info** block (name + one-line description).
  - Row 2: labeled **ANGLE ±** and **POWER ±**, **MOVE ◀ pips ▶**, a "or drag from your tank to aim" hint, and a big **FIRE**.
- Drag and ± are two views of the same value; either one updates the other.
- **Pass-and-play:** a turn banner ("Player 2's turn") appears between turns.

### 6.2 Tanks (`tank-designs.html`)

- Three **belt-driven** designs. Each has a continuous track looping a toothed drive sprocket, road wheels, and an idler; a hull; a turret; and a gun.
  - **Vanguard (default):** a long, low track with four road wheels plus return rollers, a sloped hull, a wide turret, and a long gun with a muzzle brake.
  - **Scout:** a tall, rounded track with three big wheels, a dome turret, and an antenna, with **glowing track links**.
  - **Wedge:** a six-sided track with glowing links, a faceted hull, a hex turret, and a twin-rail gun.
- Each player **picks a tank** before the match. The choice is cosmetic, render-only, and remembered per device. Tank color is the side color: red for player 1, blue for player 2/AI.
- **Animation:** track links travel and wheels spin when a tank moves; tanks tilt to the surface normal; the barrel follows the aim.
- **Implementation:** `tankPrimitives(variant, pose, animPhase) → Primitive[]` is a pure function (rounded rects, circles, lines, link segments placed along the track path) that **both** renderers draw, so the backends can't drift. No atlas is needed.

### 6.3 Renderers (both backends, as in Circle TD)

- **WebGPU:** the terrain heightfield uploads as an `r32float` 1200×1 texture, read with `textureLoad` (no filtering needed). A terrain shader draws the fill, strata bands, and a **glowing surface edge** into the emissive/bloom target. Tanks, projectiles, and effects are instanced primitives through the shared sprite/SDF pipeline and bloom chain. Effects include the blast flash, shockwave ring, debris particles, the dirt-pour animation, flowing fire, the beam glow, trails, and screen shake.
- **Canvas2D:** the same scene drawn with the same `tankPrimitives` and effect data.
- `createRenderer` probes with a silent fallback, and `?renderer=canvas2d` forces the fallback. WGSL keeps `textureSample`/`fwidth` in uniform control flow (the `f6f3787` lesson).

### 6.4 Match flow (`draft-screen.html`)

1. **Mode:** Today's Challenge (ranked, vs Veteran) · Free play vs AI (Rookie / Veteran / Ace) · Local 2-player.
2. **Tank + settings:** each player picks a tank. Free play can also set wind on/off and 5 or 10 weapons each. The Challenge locks its settings (wind off, 10 weapons, Veteran).
3. **Draft:** a 6×4 pool grid (glyph, name, tag; taken cards dim with the owner's color dot); trays on top (opponent) and bottom (you); a **detail panel** with a description, DAMAGE/RADIUS/TRICKY bars, a **live looping preview** (the real `resolveTurn` on a mini terrain), and PICK. On phones the panel becomes a bottom sheet.
4. **Battle:** Deck+.
5. **Results:** final scores, a per-shot breakdown, an **instant replay of the best shot** (deterministic re-resolve), then initials + submit for Challenge wins, plus Rematch.

### 6.5 Around the edges

- **Resume:** the in-progress match (`seed, mode, settings, commands`, a few hundred bytes) auto-saves to `localStorage` (`arcfire:match:v<simVersion>`), with every access in try/catch. On load it re-simulates to the current turn and offers "Resume". A mismatched `simVersion` discards the save.
- **Sound:** procedural WebAudio: fire thump, flight whistle, impact boom + noise, dirt pour, fire crackle. Audio is enabled by the first user gesture, with a mute toggle remembered per device. No music.
- **Controls:** mouse or touch drag-to-aim; keys: ←/→ angle, ↑/↓ power (Shift = ×5), A/D move, Q/E weapon, Space fire.
- **Mobile:** landscape only. In portrait, a "rotate your device" overlay pauses the game. Touch targets are ≥ 44 px, and the carousel scrolls horizontally on small phones.
- **Accessibility:** follows `prefers-reduced-motion` (plus a setting) to disable screen shake and reduce particles; HUD controls get ARIA labels and visible focus; sides are told apart by label + tank design as well as color.

---

## 7 · Leaderboard (same Supabase project)

- **Board:** **Today's Challenge.** Everyone gets the same daily seed (terrain, draft pool, coin flip) against the **Veteran** AI with locked settings. **Score = margin of victory** (your points − AI points); **only wins post** (`not_a_win` is rejected), which satisfies `score >= 0`. The `wave` column holds your raw points as the secondary stat and tiebreaker. Both daily and all-time boards are shown, as in Circle TD.
- **Submission:** `{ gameSlug:"arcfire", simVersion, seed, mode:"daily", initials, commands }`. The commands contain **only the human's** actions:
  ```ts
  type ArcfireCommand =
    | { k: "pick"; w: number }                                                  // pool index 0..23
    | { k: "turn"; move: -1 | 0 | 1; w: number; angle: number; power: number }; // w = roster index
  ```
  There are ≤ 21 commands. The server replays the match and **regenerates every AI pick and shot**; any invalid human command rejects the run (`invalid_command`). Only the server-computed margin and points are stored.
- **Route changes** (`src/app/api/games/scores/route.ts`): `scoreSubmissionSchema` becomes a zod **discriminated union on `gameSlug`** (Circle TD's schema unchanged; an Arcfire command schema added). The verifier already checks each title's own `title.simVersion` (Plan 1 removed the global `expectedSimVersion`). The daily seed comes from a new `dailySeedFor(slug, now)` in `src/lib/dailySeed.ts`: Circle TD keeps its existing `dailySeed(now)` (existing rows are keyed by it), and Arcfire uses `hashToSeed("arcfire:" + utcDateString(now))`. Ranks and boards are already filtered by `game_slug`.
- **Config:** `LEADERBOARD_PUBLIC` becomes a per-slug map (both `false` until each game's launch gate passes), and `LEADERBOARD_SIM_VERSION` becomes a per-slug mirror with a sync test per title.
- **Migration `0002_arcfire_leaderboard.sql`** (run manually in the Supabase SQL editor, like 0001): add a per-slug daily rank index `(game_slug, sim_version, daily_date, score desc, created_at)` for mode='daily', plus a column comment documenting `wave` as the title-defined secondary stat. No other schema change.
- **Games index:** add an `arcfire` entry to `src/data/games.data.ts`; the daily preview becomes per-slug and shows only when that slug's board is public.
- **Launch gate for the Arcfire board:** the balance sweep passes, the cross-engine determinism gate is green, and an owner playtest freezes `simVersion`. Then flip `LEADERBOARD_PUBLIC.arcfire`.

---

## 8 · Testing & verification

- **Determinism:** an Arcfire golden-hash test over scripted matches (vs-AI and 2P) plus cross-engine runs, so Chrome, Firefox, and Node agree bit-for-bit.
- **Sim unit tests (TDD):** terrain carve/add/settle (spans ↔ heightfield); ballistics (range, swept collision, bounds, flight cap); each primitive; the draft (pool guarantees, alternation, first-pick rule); moves; scoring incl. self-damage and sudden death.
- **AI:** the same seed must yield the same decisions; tiers must separate (Ace beats Rookie ≥ 85% and Veteran ≥ 60% over 200 seeds); a recorded vs-AI match replayed from **human commands alone** must reproduce the final hash (the leaderboard's core guarantee); and the < 5 s verification budget is enforced.
- **Guards:** the purity guard's `ROOTS` adds `src/game/titles/arcfire`; lazy-boundary stays green (no `@/game` in `src/lib`/`src/components`/`src/data`); the bundle-budget check passes (Arcfire only behind `ssr:false`); Circle TD's golden `5167b43d` is unchanged.
- **Balance harness** (§4.3), behind `BALANCE_SWEEP=1`.
- **Route:** tests accept a verified Arcfire win and reject a tampered log, a loss, a wrong seed, a sim-version mismatch, and a duplicate; rate limiting still applies; Circle TD's route tests stay unchanged and green.
- **In-browser (controller-owned):** WebGPU and `?renderer=canvas2d` on a desktop viewport and a phone-landscape viewport, covering the draft, battle (all 12 tags), results, resume, mute, and reduced motion. Dev loop is `next build && next start` (never `next dev`).

---

## 9 · Delivery shape

This is too large for a single plan. It's expected to split into sequential plans, as Circle TD's did:

1. **Plan 1 — engine generalization + Arcfire sim core:** the §1.2 refactor (landed and verified alone first), then terrain, ballistics, the match state machine, the draft, scoring, hashing, and goldens.
2. **Plan 2 — weapons + AI:** primitives, the 32-weapon roster, AI tiers, the worker, and the balance harness.
3. **Plan 3 — presentation:** both renderers, tanks, effects, the Deck+ HUD, the draft screen, flow screens, audio, resume, and mobile.
4. **Plan 4 — leaderboard:** route generalization, migration 0002, the daily challenge, and board UI + index integration.

---

## 10 · Open items (non-blocking for planning)

- A trademark / name-availability check on "Arcfire" before public launch.
- The initial numbers in §2–§5 are starting points; the balance harness and the owner's playtest set the shipped values (and freeze `simVersion`).
