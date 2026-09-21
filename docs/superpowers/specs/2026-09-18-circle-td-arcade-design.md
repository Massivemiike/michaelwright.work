# Circle TD — arcade design spec

**Date:** 2026-09-18
**Repo:** `michaelwright.work`
**Status:** design approved, implementation plan not yet written
**Scope:** a `/games` arcade section, with a recreation of *Flash Circle TD* (David Scott, 2007) as its first title, rendered with WebGPU and backed by a replay-verified daily leaderboard.

---

## 1. Purpose and scope

`/games` is a permanent arcade section of michaelwright.work, intended to grow to several
Flash-era recreations over time. This spec covers the shared arcade runtime plus title #1,
**Circle TD**.

The project has three goals, in priority order:

1. **A genuinely good, genuinely hard tower-defense game** that captures what the 2007
   original felt like at its best.
2. **A demonstrable engineering artifact** — deterministic simulation, replay-verified
   leaderboard, WebGPU renderer with a graceful fallback. This is the part that is
   interesting to a technical reader of the portfolio.
3. **Zero cost to the rest of the site.** No marketing or blog page may load a byte of
   game code, and no Core Web Vital may regress.

### Non-goals

Listed explicitly so they do not creep in:

- Accounts, authentication, user profiles, or any storage of personal data.
- Multiplayer, real-time or asynchronous.
- Mobile-first design. Touch must *work*; the game is designed for pointer input.
- Monetisation of any kind.
- Recreating the original's bitmap art. The recreation is visually original (§9).
- Level editor, mod support, or user-generated content.

---

## 2. Decisions

Each of these was decided during brainstorming on 2026-09-18 and is settled. Changing one
invalidates parts of this spec; they are recorded with rationale so a future reader knows
what a reversal costs.

| # | Decision | Rationale |
|---|---|---|
| D1 | `/games` is an **arcade** — an index plus per-title routes — not a single page | Intent is several titles; the shared runtime is built once rather than extracted later under pressure |
| D2 | **Faithful core + modern quality-of-life** | Preserve the placement puzzle, money tension and endless climb; drop the 2007 dead time the original's own players complained about |
| D3 | **Global leaderboard, replay-verified** | The most interesting property of the project; also the only leaderboard design that resists trivial cheating |
| D4 | Carbon Forge palette, **GPU spectacle within the site's brand** | `/games` should read as part of the portfolio, not a bolted-on toy |
| D5 | **Supabase** for persistence (already connected to the Vercel project) | No provider selection needed; RLS gives a clean "verification is the only write path" model |
| D6 | **Daily seed** drives the ranked board; free play uses a random seed | Makes leaderboard positions comparable, and gives a reason to return |
| D7 | **WebGPU primary, Canvas2D fallback** | WebGPU is ~87% of global usage and explicitly *not* Baseline; nobody should hit a dead end on a portfolio site |
| D8 | **Endless, with interest rebalanced** — no wave cap, no time cap | Faithful to "perpetually climbs"; requires fixing the original's broken income curve (§5.2) |

---

## 3. The original game

Researched 2026-09-18 from primary sources: the surviving SWF run under Ruffle, the
developer's own forum and video posts recovered via the Wayback Machine, the publisher's
page and press release, and contemporary reviews. Full source list in Appendix A.

Everything in this section is **sourced fact about the original**. Section 5 marks clearly
where we depart from it, and §5.3 marks what the research could not recover and we must
therefore invent.

### 3.1 Identity

*Flash Circle TD*, by **David Scott**, published **15 March 2007** exclusively on Wrigley's
Candystand.com. Same author as *Flash Element TD* (Jan 2007) and *Vector TD* (June 2007);
he later co-founded the studio that became Kixeye. The game remained on Candystand until
the portal closed in March 2016.

The name is inherited from the Warcraft III "Circle TD" custom-map genre, where creeps loop
a closed track and the player loses on creep count rather than leaks. **The map is not a
circle** — see §3.3.

Two distinct build generations exist and differ materially:

- **Launch build** (15–~26 March 2007): no interest, click-to-focus-fire, Damage tower $350,
  gentler HP curve.
- **Post-update build** (from ~27 March 2007, the build that survives): 5% interest, sandbox
  mode, steeper HP curve, Damage tower $260, click targeting removed.

**We base the recreation on the post-update build**, because compound interest and the
save-versus-spend tension are the mechanics this project is specifically about.

### 3.2 Core loop and lose condition

The defining mechanic, and the thing that makes the game unusual:

> **There are no leaks and no lives.** Creeps that survive a lap keep looping. The game ends
> when **100 creeps are alive simultaneously** (80 on Hard difficulty).

The developer's own framing: *"There is no leaks, the game is over when you have 100+ creeps
alive at a time, so think of it as population control."*

You are not defending an exit. You are fighting an accumulating population, and every creep
you fail to kill comes back around and stacks with the next wave.

- Waves are **timed, not manual**. The player presses GO once; thereafter a wave arrives
  automatically every ~20 seconds forever.
- **30 creeps per wave**, 15 from each of two entrances. Wave size never grows.
- Endless — no final level, no boss. Credible records land around wave 417–426 on Normal.

### 3.3 Map

A **square spiral**: concentric rectangles of cobblestone path separated by raised brick
walls. The walls are the only buildable ground.

- **Two entrances.** Top-left feeds the outer loop; mid-right feeds the inner loop.
- Placement is tile-based and free within the buildable walls, not fixed slots.
- Tower footprints: Fast / Air / Slow **1×1**, Splash **2×2**, Damage **3×3**.
- Total buildable area was roughly 1,100–1,150 unit tiles (estimated from full-map
  inventories players posted at game over).

### 3.4 Towers

Five towers. Each upgrades **9 times** (levels 0–9). Selling refunds **75%** of everything
invested. Upgrade cost from level *L* to *L+1* is `base × (1 + 0.05 × L)`, floored.

| Tower | Cost | Targets | Footprint | Damage L0→L9 | Range L0→L9 | Notes |
|---|---|---|---|---|---|---|
| Fast | $50 | land + air | 1×1 | 9 → 81 (+8/lvl) | 150 → 213 (+7) | High fire rate |
| Air | $45 | **air only** | 1×1 | 18 → 162 (+16) | 180 → 261 (+9) | Good rate and range |
| Slow | $45 | land + air | 1×1 | 1 (flat) | 150 → 213 (+7) | Slow 60% → 89% |
| Splash | $125 | **land only** | 2×2 | 42 → 384 (+38) | 100 → 145 (+5) | Splash radius 40 → 58 |
| Damage | $260 | **land only** | 3×3 | 250 → 2293 (+227) | 125 → 179 (+6) | Slow-firing, massive damage |

Targeting behaviour, as documented by players: a tower picks a **random leading creep** in
range and keeps hitting it until it dies or leaves range. Slow towers preferentially avoid
re-targeting an already-slowed creep.

### 3.5 Enemies

Four types, which combine:

| Type | Trait |
|---|---|
| Normal | Baseline |
| Hard | ×2 HP (post-update build) |
| Fast | Moves faster |
| Air | Flies — only Fast, Air and Slow towers can hit it |

Type assignment is **arithmetic**, and announced before the wave:

- Wave *n* is **Fast** if `n mod 5 == 0`
- Wave *n* is **Air** if `n mod 7 == 0`
- Wave *n* is **Hard** if `n mod 9 == 0`

Combinations therefore occur at the least common multiples: Fast+Air at 35, Hard+Fast at 45,
Hard+Air at 63, and the first **Hard+Fast+Air** triple at **wave 315**.

**HP curve** (post-update, Normal difficulty), fitted to the published wave list and verified
against period screenshots:

```
HP(1) = 8
HP(n) = 1.5n² + 21.5n − 16        for n ≥ 2
Hard-type creeps: ×2
```

No bosses, no spawn-on-death, no armour, no immunities.

### 3.6 Economy

| Quantity | Value |
|---|---|
| Starting bank | $125 |
| Interest | **5% of current bank, paid on every wave** |
| Kill bounty | ~$0.50 per creep |
| Sell refund | 75% of cumulative investment |
| Score | 2 points per creep killed |

### 3.7 What players actually did

The documented meta, which is the single most useful input to the redesign:

1. **Interest banking dominated everything.** Let the alive-creep count hover at 50–70,
   buy nothing, bank the compounding interest.
2. **Do not upgrade early.** Level-0 towers give better damage per dollar; max everything
   only once interest is overflowing.
3. **Damage towers for land, Air towers for air.** Splash, Slow and Fast were considered
   near-useless late.
4. Players asked repeatedly for a **speed-up button** and **hotkeys**. Neither was ever added.

---

## 4. Game design — faithful core

Preserved from the original exactly as documented in §3:

- The square spiral map with two entrances and two nested loops.
- The no-leak, population-cap lose condition at 100 alive.
- Timed waves of 30 creeps every 20 seconds, wave size constant.
- The five towers, their costs, target restrictions, footprints, damage and range curves.
- Nine upgrade levels, `base × (1 + 0.05L)` upgrade pricing, 75% sell refund.
- The four enemy types and the mod-5 / mod-7 / mod-9 type schedule.
- The quadratic HP curve, with Hard-type creeps at ×2.
- $125 starting bank, the 5% interest *rate*, and 2 points per creep killed. Note that
  §5.2 adds a cap on the interest *payout* which is inert for roughly the first 60 waves;
  the rate itself is unchanged. Kill bounty is **not** preserved — see §5.2.
- Pre-wave announcement of the next wave's type flags and HP.

### 4.1 Modern quality-of-life

Added, all of them things the original's own players asked for and never received:

| Addition | Justification |
|---|---|
| **Speed controls** (1× / 2× / 4×) | The original ran frame-based; late waves took 3–7 real minutes. Speed multiplies ticks per second and cannot change outcomes (§6) |
| **Hotkeys** — `U` upgrade, `S` sell, `Esc` cancel, `Space` pause, `1`–`5` select tower | Requested in 2007, never added |
| **Persistent HP bars** and a readable creep-count meter | The cap is the lose condition; it should be impossible to misread |
| **Range preview on hover**, not only while placing | Placement is the core puzzle; it deserves legibility |
| **Save and resume** a run in progress | Endless runs are long |
| **Reduced-motion support** | Site-wide accessibility expectation |

Deliberately **not** added, because they would change the game rather than its ergonomics:
undo, a sandbox money cheat, tower drag-repositioning, or pausing to build with the clock
stopped in ranked runs.

---

## 5. Game design — the endless curve

### 5.1 The problem

The original's late game is broken, and it is broken arithmetically rather than by mistuning.

- Bank grows as `B(n) ≈ B₀ × 1.05ⁿ` — **exponential**.
- Creep HP grows as `1.5n² + 21.5n − 16` — **quadratic**.

Exponential income outpaces polynomial difficulty without bound. By wave 150 the interest
multiplier alone is ~1.7 million×. Contemporary players report waves 60–130 as the only
genuinely hard stretch, after which the game becomes a multi-hour formality — the record
run of ~420 waves would take upwards of ten hours.

This is fatal to an endless game with a daily leaderboard, and it is also simply not the
game the project set out to rebuild.

### 5.2 The fix

**Cap interest against the difficulty of the wave being sent.**

```
typeMultiplier(n) = isHard(n) ? 2 : 1          // matches §3.5
totalWaveHP(n)    = 30 × HP(n) × typeMultiplier(n)
interest(n)       = min( 0.05 × bank,  α × totalWaveHP(n) )
```

The property that makes this the right fix: **it is inert for roughly the first 60 waves.**
Early on, a small bank yields far less than the cap, so 5% compounding applies untouched and
the save-versus-spend tension plays exactly as it did in 2007. The cap engages only where
compounding would otherwise run away, at which point income becomes *proportional to
difficulty* instead of independent of it. Both sides then grow as O(n²) and the race stays a
race indefinitely.

`α` is the single dial governing where the curve stops inverting. **Initial value: α = 0.02**,
to be tuned per §5.4. For scale, at α = 0.02 the cap is about $210/wave at wave 10 (against a
5% yield of roughly $20 — no effect) and about $22,000/wave at wave 150, which is
approximately where players reported the original going slack.

**Second lever — scale kill bounty with creep HP.** The original's flat $0.50 meant that by
wave 100 essentially all income was interest and killing paid nothing, which is what
collapsed the decision space. Scaling restores the real choice at every wave:

```
bounty(maxHp) = max(1, min(BOUNTY_CAP, floor( maxHp / γ )))
```

Shipped values (all INVENTED, re-tuned 2026-09-19; see
`docs/superpowers/2026-09-18-circle-td-balance-tuning.md`): γ = 5, and a hard per-kill ceiling
**BOUNTY_CAP = 25** (spec-new — it did not exist at spec time). The cap leaves early payouts
untouched (floor(maxHp/5) stays under 25 until ~wave 6) while flattening the late game so a
single kill can never fund the ~3.15M-bank glut. Bounty is paid by the KILLED creep's own
maxHp, not the current wave. `α = ALPHA_BP/10000 = 0.02` is unchanged.

### 5.3 What we invent

The research established that these values were **never published and cannot be recovered**
without deeper SWF disassembly. They are our original work, and are marked as such wherever
they appear in code and content data so that they are never mistaken for the original's:

- Tower **fire rates** and projectile speed.
- **Splash falloff** with distance from impact.
- Creep **movement speed** and the Fast-type multiplier.
- **Intra-wave spawn spacing**.
- Exact **buildable tile layout** of the spiral (the original's is known only in shape).
- The tuning constants **α** and **γ** above.

### 5.4 Tuning method

Balance is a tested property here, not a matter of feel. Because the simulation is
deterministic, pure TypeScript and runs headless with no renderer (§6), we can sweep
parameters across thousands of automated runs and **measure** the outcome.

The sweep harness plays scripted strategies — including the documented degenerate one
("bank everything, hover at 60 alive") — across a parameter grid and reports, for each
combination, the wave at which difficulty inverts (the point after which the player's
margin stops shrinking). Acceptance: **no parameter set ships where difficulty inverts
before wave 400**, and the degenerate banking strategy must not outperform balanced play by
more than a set margin. The sweep runs in CI on a schedule rather than per-commit, since it
is long-running.

### 5.5 Seeding

Wave composition in the original is purely arithmetic, so a naive seed would produce an
identical game every day. The **daily seed perturbs the phase of the three type cycles**:

```
isFast(n) = (n + offsetFast) mod 5 == 0
isAir(n)  = (n + offsetAir)  mod 7 == 0
isHard(n) = (n + offsetHard) mod 9 == 0
```

where `offsetFast ∈ [0,5)`, `offsetAir ∈ [0,7)` and `offsetHard ∈ [0,9)` are drawn from the
seeded PRNG at run start. The arithmetic structure — and therefore the
familiar rhythm and the LCM combination waves — is preserved exactly, while each day poses a
genuinely different puzzle. This is our invention, not the original's behaviour.

The seed additionally drives spawn jitter and tower targeting tie-breaks (the original's
"random leading creep").

**Daily seed derivation:** `seed = hash(UTC date string)`, computed identically on client and
server, so no coordination or storage is required and no clock skew can desynchronise them.

### 5.6 Modes and v1 scope

| Mode | Seed | Ranked | In v1 |
|---|---|---|---|
| Daily run | Today's UTC daily seed | Yes | **Yes** |
| Free play | Random | No | **Yes** |
| Hard difficulty | Either | Separate board | No — post-v1 |
| Sandbox / practice | Random | No | No — post-v1 |

v1 ships Normal difficulty only. Hard reuses the identical simulation with a lower creep cap
(80) and a steeper HP curve, so it is a content addition rather than new machinery.

---

## 6. Architecture

No workspaces or monorepo. Replay verification runs inside a Next.js Route Handler in this
same app, so the simulation is simply a folder the server imports.

```
src/game/
  sim/                 pure TypeScript. no DOM, no GPU, no Math.random, no Date
    math/              fixed-point arithmetic, seeded PRNG, trig lookup tables
    state.ts           struct-of-arrays typed arrays
    step.ts            one deterministic tick
    index.ts
  runtime/             shared arcade layer — title #2 inherits this unchanged
    gpu/               adapter negotiation, device lifecycle, loss recovery
    render/
      Renderer.ts      the interface both backends implement
      webgpu/          instanced sprites via storage buffer, compute particles
      canvas2d/        fallback, reduced effects
    loop.ts            fixed-timestep accumulator with render interpolation
    input/             pointer and keyboard → sim commands, with recording
    replay.ts          encode / decode / hash a run
    hud/               shared HUD primitives
  titles/
    circle-td/
      content.ts       towers, enemies, waves, map — data only
      rules.ts         title-specific simulation rules
      shaders/         .wgsl

src/app/games/
  page.tsx                      arcade index (Server Component)
  circle-td/page.tsx            shell + click-to-play gate
src/app/api/games/scores/
  route.ts                      submit → re-simulate → verify → write
src/data/games.data.ts          feeds the index and sitemap.ts
```

### 6.1 The three load-bearing boundaries

**1. Simulation purity.** Enforced by an ESLint rule restricting imports and globals inside
`src/game/sim/**`, not by discipline alone. The same module runs in the browser, in Node
during verification, and in Vitest. If it ever touches `window`, `Date` or `Math.random`,
verification breaks silently and honest players' runs start failing.

**2. The snapshot.** The simulation exposes a flat typed-array snapshot — position, rotation,
sprite index, tint, HP fraction — and renderers never see game objects. This is what makes
the WebGPU and Canvas2D backends interchangeable, and what keeps per-frame CPU cost down to
one `writeBuffer`.

**3. The lazy boundary.** Nothing in the root layout, `Nav`, `Footer` or any shared component
may import from `src/game/**`. The dynamic `import()` fires on click-to-play. This is
asserted in CI (§10), because a single careless import would make every page on the site pay
for the engine.

### 6.2 Constraints from this repo specifically

- `reactStrictMode` defaults on in the App Router, so asynchronous WebGPU initialisation
  needs an `alive` guard — effect cleanup can run before `requestDevice()` resolves.
- `reactCompiler: true` is enabled. The game loop lives in refs outside React's render path;
  the HUD reads a snapshot per frame.
- `NodeNetworkCanvas` renders site-wide from the root layout. The game route suspends it via
  the existing `NodeNetworkContext` — two live canvases would contend for GPU and pointer
  events.
- `PageWrapper` wraps all children in a `motion` fade. The game route opts out.
- Per `AGENTS.md`, the Next.js version in this repo diverges from model training data.
  Consult `node_modules/next/dist/docs/` before writing routing or rendering code.

---

## 7. Determinism

Replay verification means the simulation runs in the player's browser and again in Node on
Vercel. Those may be different JavaScript engines — JavaScriptCore or SpiderMonkey on the
client, V8 on the server — and MDN is explicit that `Math.sin`, `cos`, `pow`, `exp` and `log`
have **implementation-dependent precision**. A one-ULP divergence amplified over tens of
thousands of ticks is a failed verification on an honest run.

Rules, all enforced by lint rule and by the cross-engine test in §10:

1. **Positions, velocities and ranges are Q16.16 fixed-point in `Int32Array`.** JavaScript
   numbers are doubles, so integer arithmetic is exact far beyond this game's magnitudes, and
   a fixed-point multiply (`a * b / 65536`) is bit-identical on every engine.
2. **Trigonometry comes from a generated lookup table** — 4096 entries, committed as a
   fixture. `Math.sin` and `Math.cos` are banned inside `sim/`.
3. **Range checks compare squared distances.** No square root in the hot path at all.
4. Where a true square root is genuinely needed, `Math.sqrt` is permitted: IEEE-754 specifies
   it exactly, unlike the transcendental functions.
5. **Seeded PRNG** (mulberry32) carried in simulation state. `Math.random` is banned.
6. **Fixed timestep.** 30 Hz simulation ticks, accumulator-driven, with render interpolation
   between ticks. Speed controls change how many ticks are executed per second of wall clock,
   never the tick contents — so speed cannot affect outcomes and is not recorded in replays.
7. No `Date`, no `performance.now()`, no iteration over object key order inside `sim/`.

---

## 8. Replay and leaderboard

### 8.1 Run format

```ts
type Replay = {
  seed: number;          // int32 daily seed (numeric, not string) — see dailySeed.ts
  simVersion: number;    // see §8.4
  mode: "daily" | "free";
  commands: Array<{
    tick: number;
    type: "start" | "place" | "upgrade" | "sell";
    tower?: number;      // flat optional fields (NOT a `payload: unknown`)
    tile?: number;
  }>;
};
```

Wire format matches shipped code; the earlier `seed: string` / `payload: unknown` sketch is
superseded.

Only discrete player actions are recorded. Game speed is deliberately excluded (§7 rule 6).
A long run is a few hundred commands — single-digit kilobytes, comfortable in `jsonb`.

### 8.2 Verification

`POST /api/games/scores` receives a replay, re-executes it headlessly against the same
simulation module, and compares the resulting score and wave to the submitted values. It
writes only on an exact match.

Limits are enforced *before* simulation begins, so a hostile submission cannot burn function
budget. Indicative initial values, to be confirmed against measured verification throughput:

| Limit | Initial value |
|---|---|
| Maximum ticks replayed | 5,000,000 (≈ wave 2,700 at 30 Hz) |
| Maximum commands | 20,000 |
| Maximum payload size | 1 MB |
| Wall-clock ceiling on verification | 10 s |

Headless with no rendering, the simulation runs orders of magnitude faster than real time, so
a multi-hour run verifies in well under a second. A submission exceeding any limit is
rejected without being simulated.

### 8.3 Storage

Plan 3B ships a HASH+SCORE-ONLY schema (owner decision): the DB stores a state `hash` + a
`replay_hash` (command-log digest for dedupe) + score/wave/initials — there is NO
`replay jsonb` column, so there is no watch-replay or post-hoc re-audit; verification happens
only at submit time. Public reads go through a column-limited view (`game_scores_public`,
excludes seed + both hashes) with base-table SELECT revoked. See
`supabase/migrations/0001_leaderboard.sql`.

The block below is the original illustrative DDL, kept as historical context:

```sql
create table game_scores (
  id           uuid primary key default gen_random_uuid(),
  game_slug    text    not null,
  sim_version  integer not null,
  mode         text    not null check (mode in ('daily','free')),
  seed         text    not null,
  initials     text    not null check (initials ~ '^[A-Z]{3}$'),
  score        integer not null,
  wave         integer not null,
  replay       jsonb   not null,
  created_at   timestamptz not null default now()
);

alter table game_scores enable row level security;
-- SELECT policy for the anon role, scoped to leaderboard columns.
-- No INSERT, UPDATE or DELETE policy exists for any client role.
```

The service-role key bypasses RLS and is used only by the verification route. **Because no
client-role write policy exists, verification is not a check that can be bypassed — it is
structurally the only write path.**

Identity is **three arcade initials**. No accounts, no authentication, no personal data, and
therefore no GDPR surface on a personal site. Initials pass a profanity filter before
insertion.

Rate limiting is applied per IP on the submission route. This is the practical mitigation
for the one attack determinism does not address: someone scripting genuinely skilled play
and submitting a legitimately verifiable run. Perfect defence is not worth building here.

### 8.4 Simulation versioning

`sim_version` is load-bearing. Any change to simulation behaviour or balance invalidates
every previously recorded replay, because they will no longer reproduce.

- Leaderboards are scoped per `sim_version`.
- On a balance change, the previous board is archived and displayed as historical, never
  silently broken or recomputed.
- This is the standing cost of replay verification, and the reason to complete the §5.4
  tuning sweep before the first public board.

---

## 9. Rendering

### 9.1 Two backends, one interface

```ts
interface Renderer {
  init(canvas: HTMLCanvasElement): Promise<void>;
  resize(widthPx: number, heightPx: number): void;
  frame(snapshot: RenderSnapshot, alpha: number, emits: ParticleEmit[]): void;
  destroy(): void;
  readonly capabilities: { computeParticles: boolean; maxParticles: number };
}
```

**WebGPU backend (primary).** Instanced sprite rendering with per-instance data in a storage
buffer indexed by `instance_index`; one `queue.writeBuffer` per frame. A compute shader drives
the particle system. A render bundle covers the static map layer, which never changes between
frames. Additive bloom on projectiles and impacts.

**Canvas2D backend (fallback).** The same snapshot, drawn with `drawImage`. Particle count
capped, no bloom. A small "reduced effects" badge is shown so the difference is
self-explanatory.

### 9.2 Adapter negotiation

Detection is three-stage, because a present `navigator.gpu` with a null adapter is the normal
case on blocklisted GPUs:

1. `navigator.gpu` exists → `requestAdapter()` returns non-null → `requestDevice()` resolves
   → `canvas.getContext('webgpu')`.
2. On failure, retry once with `requestAdapter({ featureLevel: 'compatibility' })`, which
   reaches Direct3D 11 and OpenGL ES 3.1 devices on Chrome 146+.
3. On failure, fall back to Canvas2D.

Default power preference — `high-performance` measurably increases device-loss frequency and
drains battery. `device.lost` triggers renderer re-initialisation; because simulation state
is CPU-side, a lost device costs a frame, not a run.

Excluded from the WebGPU path today (~13% of global usage): Firefox on Linux, Firefox on
Intel Macs, Firefox on Android, Safari on macOS earlier than Tahoe 26, older Android GPUs,
and Windows on ARM64. All of them play via Canvas2D.

### 9.3 Visual direction

The Carbon Forge palette, used as the game's actual palette:

| Token | Value | Use in game |
|---|---|---|
| `--color-bg-base` | `#08080C` | Field background |
| `--color-bg-surface` | `#0F0F15` | Path |
| `--color-bg-elevated` | `#16161F` | Buildable walls |
| `--color-border-subtle` | `#1F1F2E` | Tile grid |
| `--color-accent` | `#FF3B2F` | Player-side: towers, projectiles, range circles |
| `--color-blue` | `#7FDBFF` | Enemy-side: creeps, HP bars, air markers |
| `--color-text-*` | as defined | HUD typography |

The red/blue split gives a legible two-channel read — everything the player owns is red,
everything attacking them is blue — without introducing colour outside the site's system.
Display type is Syne, HUD numerals and labels are JetBrains Mono, matching the site.

The HUD is React DOM over the canvas, not drawn into it: accessible, themeable, and
selectable, and it avoids the text-rendering cost in the render loop.

### 9.4 Asset policy

No asset from the original game is used. Sprites are generated procedurally or authored
originally, and any third-party asset requires a manifest entry recording source, licence and
provenance before it may be committed.

---

## 10. Testing and CI

The repository currently has **no test infrastructure and no CI workflow** (`.github/` exists
but is empty). Both are introduced by this work.

### 10.1 The cross-engine determinism gate

The single test the leaderboard rests on. A golden fixture — seed plus scripted command log,
producing a state hash after N ticks — is computed in Node and committed. Playwright then
executes the identical simulation in **Chromium, Firefox and WebKit** and asserts every
engine produces the same hash.

This converts "we believe the arithmetic is portable" into a fact CI re-checks on every
commit, and it catches the failure mode where a Safari player's honest run would be rejected
by a V8 server.

### 10.2 Coverage

| Layer | Tool | Asserts |
|---|---|---|
| Simulation units | Vitest, `node` environment | Targeting, economy, interest cap, wave scheduling, HP curve, invariants (no negative HP, nothing off-track, creep count monotonic within a tick) |
| Determinism | Vitest + Playwright | Golden hash identical across Node, Chromium, Firefox, WebKit |
| Verification | Vitest | Tampered replays rejected; honest replays accepted; limits enforced |
| Balance sweep | Vitest, scheduled | Difficulty does not invert before wave 400; banking strategy within margin |
| Render smoke | Playwright, `channel: 'chromium'` | WebGPU initialises, a frame draws, canvas not blank, no console errors |
| Fallback smoke | Playwright, WebKit / Firefox | Canvas2D path engages and the game is playable without an adapter |
| Bundle budget | CI assertion | `/`, `/blog`, `/projects`, `/resume`, `/gallery`, `/contact` ship **zero** bytes from `src/game/**` |

The bundle budget row is a regression gate on the portfolio itself and is not optional.

### 10.3 CI

A first GitHub Actions workflow: typecheck → lint → Vitest → Playwright → build → bundle
budget. Playwright must use `channel: 'chromium'` rather than the default bundled headless
shell, which does not support WebGPU reliably. Where a CI runner has no GPU adapter, the
render smoke asserts the fallback path engages instead of failing.

---

## 11. Site integration

1. **Routes.** `/games` (index) and `/games/circle-td`. Both use the existing
   `buildMetadata()` helper from `src/lib/metadata.ts` for canonical URL and OpenGraph rather
   than hand-rolled metadata.
2. **Data.** `src/data/games.data.ts`, mirroring the shape and role of `projects.data.ts`.
3. **Sitemap.** `src/app/sitemap.ts` currently hand-maintains its static routes and derives
   project routes from data. Games routes are derived from `games.data.ts` the same way, so
   adding a title updates the sitemap automatically.
4. **Navigation.** A `Games` entry in `src/components/layout/Nav.tsx`. It takes a `children`
   dropdown once a second title exists; with one title it is a plain link.
5. **LCP.** A `<canvas>` is not an LCP candidate. The click-to-play gate — title, art,
   controls summary, current daily leaderboard — is the page's LCP element and paints before
   any game code is requested.
6. **Analytics.** `@vercel/analytics` is already site-wide. No game-specific telemetry in v1.

---

## 12. Open questions

Recorded rather than guessed. None blocks the implementation plan.

1. **Leaderboard depth.** Top 100 per day, or top 10 with a personal-best row? Affects only
   the index page query.
2. **Replay playback.** The replay data is sufficient to *watch* a top run. Genuinely
   compelling, and entirely additive — deferred past v1 and noted so the format is not
   narrowed in the meantime.
3. **Hard mode board.** Whether Hard shares a leaderboard page with Normal or gets its own
   route. Deferred with Hard mode itself.
4. **Daily seed rollover.** UTC midnight is assumed. If the board proves to have a
   single-timezone audience, a local-midnight variant could be revisited.

---

## Appendix A — sources

Research conducted 2026-09-18.

**Primary:** the surviving post-update SWF run under Ruffle at flashmuseum.net; David Scott's
own forum (novelconcepts.informe.com) recovered via the Wayback Machine, including launch and
patch threads, the tower-stats thread and the HP-list thread; David Scott's YouTube
work-in-progress videos (January–February 2007); the Wrigley press release; Candystand.com
page captures (2007-03-17 onward) and the Candystand blog strategy guide; BlueMaxima's
Flashpoint database entry `bc48e35b-be0e-4956-8fe8-a5dfdb1b2291`.

**Secondary:** JayIsGames review and comment thread; Gigazine's launch-day article with
eleven screenshots; FreeGamesNews; Overclockers UK forum thread; Wikipedia (Flash Element TD,
Candystand); the 2008 Game Developer interview with Scott and Preece.

**Technical:** caniuse.com WebGPU support data; MDN (WebGPU API, `GPU.requestAdapter`,
`GPUDevice.lost`, `Math`); the gpuweb Implementation-Status wiki; Chrome, WebKit and Mozilla
release notes; Next.js 16 documentation on lazy loading and Turbopack configuration; React
`StrictMode` documentation; Playwright browser documentation; Gaffer on Games, "Fix Your
Timestep".

---

## Appendix B — implementation sequence

Indicative only. The implementation plan is written separately and supersedes this.

1. Simulation foundation — fixed-point math, PRNG, trig tables, tick loop, golden-hash gate.
2. Circle TD rules — map, towers, creeps, waves, economy, lose condition.
3. Balance sweep harness and initial α / γ tuning.
4. Renderer interface and the Canvas2D backend (simpler, proves the boundary).
5. WebGPU backend — instanced sprites, then compute particles, then bloom.
6. Route shell, click-to-play gate, HUD, input recording.
7. Supabase table, verification route, leaderboard UI.
8. Site integration — nav, data, sitemap, metadata.
9. CI workflow and the bundle-budget gate.
