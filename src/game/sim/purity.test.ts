// src/game/sim/purity.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { sinFx, cosFx } from "@/game/sim/math/trig";

const ROOTS = ["src/game/sim", "src/game/titles/circle-td"];
const BANNED = [
  /\bwindow\b/, /\bdocument\b/, /\bnavigator\b/, /\bperformance\b/,
  /\bnew Date\b/, /\bDate\.now\b/,
  /Math\.random/, /Math\.sin/, /Math\.cos/, /Math\.tan/,
  /Math\.atan2?/, /Math\.pow/,
];
// trig.ts legitimately builds its table from Math.sin at load; allow-list it.
const ALLOW = new Set(["src/game/sim/math/trig.ts"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("simulation purity", () => {
  it("contains no banned globals or non-deterministic math", () => {
    const violations: string[] = [];
    for (const root of ROOTS) {
      let files: string[];
      try {
        files = walk(root);
      } catch (e: any) {
        if (e && e.code === "ENOENT") continue; // dir may not exist yet
        throw e;
      }
      for (const file of files) {
        if (ALLOW.has(file.replace(/\\/g, "/"))) continue;
        const src = readFileSync(file, "utf8");
        for (const re of BANNED) {
          if (re.test(src)) violations.push(`${file}: ${re}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("actually detects violations (guard is not vacuous)", () => {
    const bad = "window document navigator performance ; new Date() ; Date.now() ; Math.random() Math.sin() Math.cos() Math.tan() Math.atan2() Math.pow()";
    const missed = BANNED.filter((re) => !re.test(bad));
    expect(missed).toEqual([]);
  });

  it("trig runtime functions use no Math.* (only the table build may)", () => {
    expect(sinFx.toString()).not.toMatch(/Math\./);
    expect(cosFx.toString()).not.toMatch(/Math\./);
  });
});
