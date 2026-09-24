// src/game/sim/purity.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { sinFx, cosFx } from "@/game/sim/math/trig";

const ARCFIRE_ROOT = "src/game/titles/arcfire";
const ROOTS = ["src/game/sim", "src/game/titles/circle-td", ARCFIRE_ROOT];
const BANNED = [
  /\bwindow\b/, /\bdocument\b/, /\bnavigator\b/, /\bperformance\b/,
  /\bnew Date\b/, /\bDate\.now\b/,
  /Math\.random/, /Math\.sin/, /Math\.cos/, /Math\.tan/,
  /Math\.atan2?/, /Math\.pow/,
  /Math\.exp\b/, /Math\.expm1/, /Math\.log\b/, /Math\.log2/, /Math\.log10/,
  /Math\.log1p/, /Math\.hypot/, /Math\.cbrt/, /Math\.asin/, /Math\.acos/,
  /Math\.sinh/, /Math\.cosh/, /Math\.tanh/,
  // The `**` exponent operator — banned for the same cross-engine-drift
  // reason as Math.pow. Requires an operand-ish character (word char or
  // closing bracket) before it so this doesn't match a `/**` JSDoc/comment
  // opener (which has no such character immediately before the `*`s).
  /[\w)\]]\s*\*\*\s*[\w(]/,
];
// trig.ts legitimately builds its table from Math.sin at load; allow-list it.
const ALLOW = new Set(["src/game/sim/math/trig.ts"]);
// Arcfire never uses the shared trig table (built from floating-point sine at
// load, a cross-engine risk); its aim comes only from the baked aimTable.ts.
const SHARED_TRIG_IMPORT = /math\/trig["']/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

/** The non-test .ts files under a root. A missing root throws and an empty one fails: either would make the guard vacuous. */
function sources(root: string): string[] {
  const files = walk(root);
  expect(files.length, `${root} yielded no files`).toBeGreaterThan(0);
  return files;
}

describe("simulation purity", () => {
  it("contains no banned globals or non-deterministic math", () => {
    const violations: string[] = [];
    for (const root of ROOTS) {
      for (const file of sources(root)) {
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
    const bad =
      "window document navigator performance ; new Date() ; Date.now() ; " +
      "Math.random() Math.sin() Math.cos() Math.tan() Math.atan2() Math.pow() " +
      "Math.exp() Math.expm1() Math.log() Math.log2() Math.log10() Math.log1p() " +
      "Math.hypot() Math.cbrt() Math.asin() Math.acos() Math.sinh() Math.cosh() Math.tanh() " +
      "a ** b";
    const missed = BANNED.filter((re) => !re.test(bad));
    expect(missed).toEqual([]);
  });

  it("the `**` ban does not false-positive on a `/**` JSDoc comment opener", () => {
    const ok = "/**\n * a JSDoc comment, not an exponent\n */\nconst x = 1;";
    const exponentBan = BANNED.find((re) => re.source.includes("\\*\\*"))!;
    expect(exponentBan.test(ok)).toBe(false);
  });

  it("Arcfire never imports the shared trig table", () => {
    const offenders = sources(ARCFIRE_ROOT).filter((file) => SHARED_TRIG_IMPORT.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the shared-trig check catches a trig import (guard is not vacuous)", () => {
    expect(SHARED_TRIG_IMPORT.test('import { sinFx } from "@/game/sim/math/trig";')).toBe(true);
    expect(SHARED_TRIG_IMPORT.test("import { cosFx } from '../../sim/math/trig';")).toBe(true);
    expect(SHARED_TRIG_IMPORT.test('import { aimCos, aimSin } from "./aimTable";')).toBe(false);
  });

  it("trig runtime functions use no Math.* (only the table build may)", () => {
    expect(sinFx.toString()).not.toMatch(/Math\./);
    expect(cosFx.toString()).not.toMatch(/Math\./);
  });
});
