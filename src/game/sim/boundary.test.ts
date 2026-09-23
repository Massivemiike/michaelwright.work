// src/game/sim/boundary.test.ts
//
// src/game/sim/ is the title-agnostic engine: math, the FNV-1a primitives, the
// TitleDef contract and the generic verifier. Only registry.ts — the slug →
// TitleDef binding — may import a title. Everything else here must work for
// any title, so a title import anywhere else fails this test.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("engine boundary", () => {
  it("no src/game/sim module except registry.ts imports a title", () => {
    const offenders = walk("src/game/sim")
      .map((f) => f.replace(/\\/g, "/"))
      .filter((f) => f !== "src/game/sim/registry.ts")
      .filter((f) => /@\/game\/titles\//.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
