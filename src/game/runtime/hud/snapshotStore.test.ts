// src/game/runtime/hud/snapshotStore.test.ts
//
// Node-env tests for the HUD's throttled snapshot store. Mirrors
// loop.test.ts's style: a fake, manually-advanced `now` instead of real
// timers, since the only interesting behavior here is the throttle
// arithmetic (accept the first push unconditionally; reject anything
// within HUD_INTERVAL_MS of the last accepted one; only ever call the
// snapshot producer when a push is actually accepted).
import { describe, it, expect } from "vitest";
import { makeRenderSnapshot } from "@/game/sim/engine";
import { createSnapshotStore, HUD_INTERVAL_MS } from "./snapshotStore";

const snap = (bank: number) => {
  const s = makeRenderSnapshot(0, 0);
  s.bank = bank;
  return s;
};

describe("createSnapshotStore", () => {
  it("getSnapshot returns the initial snapshot before any push", () => {
    const initial = snap(0);
    const store = createSnapshotStore(initial);
    expect(store.getSnapshot()).toBe(initial);
  });

  it("accepts the very first push regardless of `now`", () => {
    const store = createSnapshotStore(snap(0));
    const next = snap(125);
    store.push(() => next, 0);
    expect(store.getSnapshot()).toBe(next);
  });

  it("rejects a second push that arrives before HUD_INTERVAL_MS has elapsed", () => {
    const store = createSnapshotStore(snap(0));
    const first = snap(125);
    store.push(() => first, 1000);

    let called = false;
    store.push(() => {
      called = true;
      return snap(999);
    }, 1000 + HUD_INTERVAL_MS - 1);

    expect(called).toBe(false); // the producer must not even run for a rejected push
    expect(store.getSnapshot()).toBe(first);
  });

  it("accepts a push once HUD_INTERVAL_MS has elapsed since the last accepted one", () => {
    const store = createSnapshotStore(snap(0));
    store.push(() => snap(125), 1000);
    const second = snap(200);
    store.push(() => second, 1000 + HUD_INTERVAL_MS);
    expect(store.getSnapshot()).toBe(second);
  });

  it("notifies subscribers only on an accepted push", () => {
    const store = createSnapshotStore(snap(0));
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });

    store.push(() => snap(1), 0); // accepted (first push)
    store.push(() => snap(2), 1); // rejected (too soon)
    expect(notifications).toBe(1);

    store.push(() => snap(3), HUD_INTERVAL_MS); // accepted
    expect(notifications).toBe(2);
  });

  it("unsubscribe stops further notifications", () => {
    const store = createSnapshotStore(snap(0));
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });
    store.push(() => snap(1), 0);
    expect(notifications).toBe(1);

    unsubscribe();
    store.push(() => snap(2), HUD_INTERVAL_MS);
    expect(notifications).toBe(1); // unchanged
  });
});
