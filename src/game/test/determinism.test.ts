// src/game/test/determinism.test.ts
//
// The golden determinism gate: a fixed scripted replay's hash/score/wave
// are pinned to a committed fixture. This test file (not replay.ts itself)
// is allowed to touch node:fs — it's a *.test.ts, excluded from the purity
// guard's scan.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runReplay, type Replay } from "@/game/sim/replay";
import { SIM_VERSION } from "@/game/sim/types";

const FIXTURE = join("src/game/test/determinism.golden.json");

// A fixed scripted run — deterministic input, moderate length.
const REPLAY: Replay = {
  seed: 20260918,
  simVersion: SIM_VERSION,
  mode: "daily",
  commands: [
    { tick: 0, type: "place", tower: 4, tile: 12 },
    { tick: 60, type: "place", tower: 1, tile: 40 },
    { tick: 600, type: "upgrade", tile: 12 },
    { tick: 1200, type: "place", tower: 4, tile: 55 },
  ],
};

describe("determinism golden gate", () => {
  it("reproduces the committed hash (or writes it on first run)", () => {
    const result = runReplay(REPLAY);

    if (!existsSync(FIXTURE)) {
      writeFileSync(FIXTURE, JSON.stringify({ replay: REPLAY, ...result }, null, 2) + "\n");
      // eslint-disable-next-line no-console
      console.warn("golden fixture written — inspect and commit it");
    }

    const golden = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(result.hash).toBe(golden.hash);
    expect(result.score).toBe(golden.score);
    expect(result.wave).toBe(golden.wave);
  });
});
