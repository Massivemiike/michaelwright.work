// src/game/runtime/render/Renderer.ts
//
// Renderer contract (Task 4, Plan 2): draws a pair of RenderSnapshots
// interpolated by `alpha`, plus a queue of transient hit-flash events.
//
// Everything under src/game/runtime/** is deliberately outside the sim
// purity guard (see src/game/sim/purity.test.ts's ROOTS: only
// src/game/sim and src/game/titles/circle-td are walked) — this file and
// its Canvas2D implementation may use canvas/DOM APIs, Math.*, and ordinary
// floating-point freely. It owns no gameplay state: the sim
// (src/game/sim + src/game/titles/**) is the only source of truth, and a
// Renderer only ever reads a RenderSnapshot, never mutates simulation
// state.
//
// Canvas2D implements this today (canvas2d/Canvas2DRenderer.ts); a future
// WebGPU backend (Plan 3) drops in behind the same interface — callers
// (the Task 5 mount component) depend only on `Renderer`/`RendererCaps`,
// never on a concrete class.
import type { RenderSnapshot } from "@/game/sim/engine";

export interface RendererCaps {
  kind: "canvas2d" | "webgpu";
  particles: boolean;
}

// A single instant of "something got hit," in world-space (the same
// stage-px space as RenderSnapshot's *XY arrays). `kind` is an opaque small
// integer the eventual sim hit feed (Task 6) will use to distinguish, say,
// a splash impact from a single-target one — typed here so the Renderer
// signature is final even though nothing produces real HitEvents yet.
export interface HitEvent {
  x: number;
  y: number;
  kind: number;
}

export interface Renderer {
  init(canvas: HTMLCanvasElement): Promise<void>;
  // Device-pixel aware: cssW/cssH are CSS pixels, dpr the device pixel
  // ratio to render at. The renderer owns backing-store sizing and the
  // resulting world→screen fit; a ResizeObserver in the Task 5 mount
  // component just reports the box it measured (and is also where any
  // "cap dpr at 2 on mobile" policy belongs — this interface takes
  // whatever dpr it's given).
  resize(cssW: number, cssH: number, dpr: number): void;
  frame(prev: RenderSnapshot, curr: RenderSnapshot, alpha: number, hits: HitEvent[]): void;
  // Inverse of the world->screen fit transform resize()/frame() establish:
  // maps a pointer/mouse event's viewport-space clientX/clientY back to the
  // same world-space (stage-px) coordinates RenderSnapshot's *XY arrays and
  // content.ts's geometry already live in. Task 6's input layer (
  // src/game/runtime/input/pointer.ts) feeds the result straight into
  // tileAtWorld for pointer -> tile hit-testing. `canvas` is passed
  // explicitly rather than assumed to be whatever element `init()` saw, so
  // this stays a pure function of its arguments plus whatever transform
  // state the last resize() call computed.
  screenToWorld(clientX: number, clientY: number, canvas: HTMLCanvasElement): { x: number; y: number };
  destroy(): void;
  readonly caps: RendererCaps;

  // Final-review finding #7: promoted onto the shared interface from a
  // Canvas2D-only pair GameClient.tsx used to reach via `instanceof
  // Canvas2DRenderer`. That leak meant a future WebGPU backend (Plan 3)
  // would silently lose range rings/placement ghosts the moment it dropped
  // in behind this interface, since the instanceof check would simply fail
  // and skip both calls. Now any Renderer implementation gets them by
  // construction.

  /** Range-ring highlight for a PLACED tower, by its RenderSnapshot index — `null` clears it. */
  setHighlightTower(index: number | null): void;

  // Placement ghost / hover marker for a NOT-yet-placed tower. `tile: -1`
  // clears it; `towerType: -1` draws just a plain hover marker (nothing
  // armed to place). `affordable` (final-review finding #2) tells the
  // implementation whether `towerType` costs more than the player's
  // current bank, so the ghost can render visibly dimmer rather than
  // looking placeable when it isn't — GameClient computes this from live
  // SimState.bank, never the renderer's own concern.
  setHighlight(tile: number, towerType: number, affordable: boolean): void;
}

// One creep's drawable state for a single rendered frame, keyed by the
// sim's stable creep id (RenderSnapshot.creepId) rather than array index —
// index is NOT a stable identity across ticks (SimState's removeCreep is a
// swap-with-last compaction; ids are permanent, slots are not).
export interface InterpCreep {
  id: number;
  x: number;
  y: number;
  hp01: number;
  flags: number;
}

// The one pure, unit-tested piece of this module (see Renderer.test.ts) —
// everything else here is either a type or a canvas side effect that only a
// real browser can meaningfully verify (Task 9: jsdom's canvas is a stub).
// Title/DOM-agnostic on purpose: takes two RenderSnapshots and a blend
// factor, returns plain data.
//
// For every creep alive in `curr`, returns its draw position: lerp(prev,
// curr, alpha) when the same id is also present in `prev` (ordinary
// frame-to-frame motion), or curr's own position verbatim when it isn't
// (the creep spawned this tick — there is no prior position to lerp from).
// hp01 and flags are never interpolated or read from `prev`; they always
// come straight from `curr`, since they aren't motion and don't need
// smoothing. Output order and length follow curr's creep list exactly — a
// creep that died between prev and curr (present in prev, absent from
// curr) contributes nothing.
export function interpolateById(
  prev: RenderSnapshot,
  curr: RenderSnapshot,
  alpha: number
): InterpCreep[] {
  const prevIndexById = new Map<number, number>();
  for (let i = 0; i < prev.creepCount; i++) {
    prevIndexById.set(prev.creepId[i], i);
  }

  const out: InterpCreep[] = new Array(curr.creepCount);
  for (let i = 0; i < curr.creepCount; i++) {
    const id = curr.creepId[i];
    const cx = curr.creepXY[i * 2];
    const cy = curr.creepXY[i * 2 + 1];
    const pi = prevIndexById.get(id);
    let x = cx;
    let y = cy;
    if (pi !== undefined) {
      const px = prev.creepXY[pi * 2];
      const py = prev.creepXY[pi * 2 + 1];
      x = px + (cx - px) * alpha;
      y = py + (cy - py) * alpha;
    }
    out[i] = { id, x, y, hp01: curr.creepHp01[i], flags: curr.creepFlags[i] };
  }
  return out;
}
