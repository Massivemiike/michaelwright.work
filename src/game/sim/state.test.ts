import { describe, it, expect } from "vitest";
import { makeCreeps, addCreep, removeCreep, CREEP_AIR } from "./state";

describe("creep SoA", () => {
  it("adds and reports count", () => {
    const c = makeCreeps();
    const s = addCreep(c, { id: 1, dist: 0, hp: 10, maxHp: 10, speed: 100, flags: CREEP_AIR, entrance: 0 });
    expect(s).toBe(0);
    expect(c.count).toBe(1);
    expect(c.flags[0]).toBe(CREEP_AIR);
  });
  it("swap-removes without leaving holes", () => {
    const c = makeCreeps();
    addCreep(c, { id: 1, dist: 0, hp: 10, maxHp: 10, speed: 100, flags: 0, entrance: 0 });
    addCreep(c, { id: 2, dist: 0, hp: 20, maxHp: 20, speed: 100, flags: 0, entrance: 1 });
    removeCreep(c, 0);
    expect(c.count).toBe(1);
    expect(c.id[0]).toBe(2); // slot 1 swapped into slot 0
  });
});
