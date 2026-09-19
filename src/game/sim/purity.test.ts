// src/game/sim/purity.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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
      try { files = walk(root); } catch { continue; } // dir may not exist yet
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
});
