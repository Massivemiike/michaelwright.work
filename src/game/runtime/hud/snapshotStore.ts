// src/game/runtime/hud/snapshotStore.ts
//
// Throttled snapshot subscription for the HUD (Task 7, Plan 2). The sim
// ticks at 30Hz (loop.ts's SIM_HZ) and GameClient's own render loop runs
// at display refresh rate (typically 60Hz) — pushing a fresh RenderSnapshot
// into React on every one of those would re-render the whole HUD tree far
// faster than any human needs to read a number. This module is the
// throttle: GameClient calls `push` from its own render(alpha) callback
// every frame, but the snapshot handed back through `getSnapshot` (and the
// notification to `subscribe`d listeners, e.g. React's
// useSyncExternalStore) only actually changes at most once every
// HUD_INTERVAL_MS (~10Hz).
//
// `push` takes a snapshot PRODUCER, not a precomputed snapshot, so a
// rejected call (the common case — 5 out of 6 frames at 60Hz/10Hz) never
// pays for calling it (e.g. sim.snapshot(), which allocates a fresh
// RenderSnapshot with several typed arrays every time).
//
// Deliberately lives outside src/game/sim and src/game/titles/circle-td
// (the purity-guarded paths — see purity.test.ts's ROOTS): it needs
// wall-clock time (`now`, injected by the caller rather than read from
// `performance` internally, so this stays plain-data and unit-testable
// with a fake clock the same way loop.test.ts tests loop.ts), which the
// sim itself is never allowed to touch. Still plain TS — no React, no DOM.
import type { RenderSnapshot } from "@/game/titles/circle-td/snapshot";

export const HUD_HZ = 10;
export const HUD_INTERVAL_MS = 1000 / HUD_HZ;

export interface SnapshotStore {
  /** The most recently accepted snapshot. Stable identity between accepted pushes, per useSyncExternalStore's contract. */
  getSnapshot(): RenderSnapshot;
  subscribe(listener: () => void): () => void;
  /**
   * Offers a fresh snapshot for wall-clock time `now`. Only adopts it (and
   * notifies subscribers) if HUD_INTERVAL_MS has elapsed since the last
   * accepted push; otherwise a no-op, and `getSnapshotFn` is never called.
   */
  push(getSnapshotFn: () => RenderSnapshot, now: number): void;
}

export function createSnapshotStore(initial: RenderSnapshot): SnapshotStore {
  let current = initial;
  // -Infinity so the very first push is always accepted regardless of `now`.
  let lastPush = -Infinity;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    push(getSnapshotFn, now) {
      if (now - lastPush < HUD_INTERVAL_MS) return;
      lastPush = now;
      current = getSnapshotFn();
      for (const listener of listeners) listener();
    },
  };
}
