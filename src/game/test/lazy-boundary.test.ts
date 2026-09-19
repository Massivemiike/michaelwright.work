// src/game/test/lazy-boundary.test.ts
//
// Task 8's CI gate: the whole point of gating the actual game engine
// (sim + renderer + HUD, everything under src/game/**) behind
// PlayGate.tsx's click-triggered `dynamic(() => import("./GameClient"))`
// is that NOTHING else on the site pays for it. A single careless
// top-level `import` from src/game/** in the root layout, the shared
// Nav/Footer/PageWrapper chrome (which every page — including the
// arcade itself — renders), or any marketing/blog/project/gallery/
// contact/resume page would put the sim/renderer/HUD in a shared chunk
// downloaded by every visitor, not just players. This is a static
// source-text scan, same shape as src/game/sim/purity.test.ts.
//
// src/app/games/**, src/game/**, and (final-review finding #9)
// src/components/game/** are deliberately NOT scanned here — that's the
// boundary being exercised (GameClient.tsx, PlayGate.tsx's own dynamic
// import, every file under src/game/** itself, and the game's own HUD
// components are all SUPPOSED to reference @/game/**), not a hole in the
// guard. Everything else reachable from the marketing site — the root
// layout, every marketing/blog/project/gallery/contact/resume page, and
// (finding #9) the REST of src/components/**, plus src/lib, src/data, and
// src/types — is guarded below.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import sitemap from "@/app/sitemap";
import { SITE_URL } from "@/lib/metadata";
import { games } from "@/data/games.data";

// Every quoted specifier following a static `from`, a dynamic
// `import(`, or a `require(` — i.e. every module reference a scanned
// file makes, not just ones already shaped like "@/game/...". Each hit
// is then classified by isGameSpecifier below: an alias-only regex (the
// original version of this guard) would miss a RELATIVE path that
// reaches the exact same files — e.g. `from "../../../game/titles/
// circle-td"` from three levels down in src/app/projects/** resolves
// into src/game/ just as surely as the @/game alias does, and would
// leak the engine into a shared/marketing chunk just as badly.
const IMPORT_SPECIFIER = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;

// True if `specifier`, written inside `fromFile`, resolves into
// src/game/** — either directly via the `@/game` alias, or via a
// relative specifier (`./`, `../`) that lands there once resolved
// against the importing file's own directory. Bare package specifiers
// ("react", "next/dynamic") and every OTHER "@/..." alias (e.g.
// "@/data/games.data", which merely shares the substring "game") are
// never flagged.
function isGameSpecifier(specifier: string, fromFile: string): boolean {
  if (specifier === "@/game" || specifier.startsWith("@/game/")) return true;
  if (specifier.startsWith(".")) {
    // `resolve` normalizes ".."/"." segments AND the separator style, so
    // this works whether `fromFile`/`specifier` use "/" or (on Windows)
    // "\\" — then re-normalized to "/" for a single substring check.
    const resolved = resolve(dirname(fromFile), specifier).split(sep).join("/");
    return resolved.includes("/src/game/") || resolved.endsWith("/src/game");
  }
  return false;
}

// Every @/game-or-relative-into-src/game specifier a file references —
// empty when the file makes none.
function findGameImports(src: string, fromFile: string): string[] {
  const hits: string[] = [];
  for (const match of src.matchAll(IMPORT_SPECIFIER)) {
    const specifier = match[1];
    if (isGameSpecifier(specifier, fromFile)) hits.push(specifier);
  }
  return hits;
}

function walk(path: string): string[] {
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  const out: string[] = [];
  for (const name of readdirSync(path)) out.push(...walk(join(path, name)));
  return out;
}

// Final-review finding #9: src/components/game/** is the game's OWN HUD
// layer (TowerPalette/SelectedTowerPanel/Hud/etc.) — it's SUPPOSED to
// import @/game/** (content.ts's TOWERS, rules.ts's towerDamage, and so
// on), and it only ever reaches the browser via GameClient's dynamic
// import chain, same as src/app/games/** and src/game/** themselves
// (deliberately excluded from GUARDED_ROOTS below for the same reason).
// Excluding it here is the boundary being exercised, not a hole in the
// guard.
const EXCLUDED_PREFIX = "src/components/game";

function isExcluded(file: string): boolean {
  const normalized = file.split(sep).join("/");
  return normalized === EXCLUDED_PREFIX || normalized.startsWith(`${EXCLUDED_PREFIX}/`);
}

function collectFiles(roots: string[]): string[] {
  return roots
    .flatMap((root) => {
      try {
        return walk(root);
      } catch (e: unknown) {
        // A root that doesn't exist yet (e.g. no error.tsx in this repo)
        // is not a violation — nothing to scan there.
        if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") return [];
        throw e;
      }
    })
    .filter(
      (f) =>
        (f.endsWith(".ts") || f.endsWith(".tsx")) &&
        !f.endsWith(".test.ts") &&
        !f.endsWith(".test.tsx") &&
        !isExcluded(f)
    );
}

// Every surface that must never import @/game/**: the root layout and
// the other global App Router special files (error/not-found/loading —
// rendered site-wide the same way layout.tsx is), the homepage, every
// marketing/blog/project/gallery/contact/resume page, and — final-review
// finding #9 — ALL marketing-reachable shared code: every component under
// src/components/** (except src/components/game itself, excluded above),
// plus src/lib, src/data, and src/types. The original version of this list
// only guarded src/components/layout (Nav/Footer/PageWrapper, imported BY
// layout.tsx) — real, unguarded surfaces sitting right next to it
// (src/components/hero, src/components/background, src/lib, src/data...)
// could have picked up a @/game/** import with nothing here to catch it,
// since none of them are reachable only through the lazy /games/circle-td
// route.
const GUARDED_ROOTS = [
  "src/app/layout.tsx",
  "src/app/error.tsx",
  "src/app/not-found.tsx",
  "src/app/loading.tsx",
  "src/app/page.tsx",
  "src/app/blog",
  "src/app/contact",
  "src/app/gallery",
  "src/app/projects",
  "src/app/resume",
  "src/components",
  "src/lib",
  "src/data",
  "src/types",
];

describe("lazy boundary: src/game/** never leaks into marketing chrome", () => {
  it("no guarded file imports from src/game/**, by alias or by relative path", () => {
    const violations: string[] = [];
    for (const file of collectFiles(GUARDED_ROOTS)) {
      const src = readFileSync(file, "utf8");
      if (findGameImports(src, file).length > 0) violations.push(file);
    }
    expect(violations).toEqual([]);
  });

  it("actually detects a real @/game alias import (guard is not vacuous)", () => {
    const fromFile = "src/app/layout.tsx";
    const staticImport = `import { makeSim } from "@/game/titles/circle-td";`;
    const dynamicImport = `const load = () => import("@/game/titles/circle-td");`;
    const bareRequire = `const m = require("@/game/runtime/loop");`;
    expect(findGameImports(staticImport, fromFile)).toEqual(["@/game/titles/circle-td"]);
    expect(findGameImports(dynamicImport, fromFile)).toEqual(["@/game/titles/circle-td"]);
    expect(findGameImports(bareRequire, fromFile)).toEqual(["@/game/runtime/loop"]);
  });

  it("also catches a RELATIVE import that resolves into src/game/** — not just the @/game alias", () => {
    // Three levels down from src/game/ itself (mirrors a real guarded
    // file such as src/app/projects/trnscode/page.tsx), reaching the sim
    // via a relative path instead of the alias. This is exactly the leak
    // an alias-only regex would miss entirely — the bug this test fixes.
    const fromFile = "src/app/projects/trnscode/page.tsx";
    const relativeImport = `import { makeSim } from "../../../game/titles/circle-td";`;
    expect(findGameImports(relativeImport, fromFile)).toEqual([
      "../../../game/titles/circle-td",
    ]);

    // A shallower relative path from directly inside src/app/ (one level
    // up from src/, i.e. "../game/...") also resolves into src/game/.
    const fromShallowFile = "src/app/page.tsx";
    const shallowRelative = `import type { SimConfig } from "../game/titles/circle-td";`;
    expect(findGameImports(shallowRelative, fromShallowFile)).toEqual([
      "../game/titles/circle-td",
    ]);
  });

  it("does not false-positive on an unrelated '@/game...'/relative-looking specifier, or a bare comment", () => {
    const fromFile = "src/components/layout/Nav.tsx";
    const ok = [
      `// mentions @/game/foo in a comment only, never imported`,
      `const gamePlanPath = "@/game-plan/foo";`, // "@/game-plan", not "@/game/"
      `import { Game } from "@/data/games.data";`, // "@/data", not "@/game"
      `import { helper } from "../../lib/utils";`, // relative, but resolves outside src/game/
    ].join("\n");
    expect(findGameImports(ok, fromFile)).toEqual([]);
  });

  // Final-review finding #9's own self-checks: prove the widened
  // GUARDED_ROOTS (src/components/**, src/lib, src/data, src/types) would
  // actually catch a leak, and that src/components/game stays excluded on
  // purpose rather than by accident.
  it("catches a synthetic @/game import from each newly-guarded root (src/lib, src/data, src/types, src/components/** outside game)", () => {
    const staticImport = `import { makeSim } from "@/game/titles/circle-td";`;
    for (const fromFile of [
      "src/lib/someHelper.ts",
      "src/data/someList.data.ts",
      "src/types/someType.ts",
      "src/components/hero/HeroSlide.tsx",
      "src/components/background/NodeNetworkCanvas.tsx",
    ]) {
      expect(findGameImports(staticImport, fromFile)).toEqual(["@/game/titles/circle-td"]);
    }
  });

  it("excludes src/components/game/** from the scan (the game's own HUD layer, which IS supposed to import @/game/**)", () => {
    expect(isExcluded("src/components/game/TowerPalette.tsx")).toBe(true);
    expect(isExcluded("src/components/game")).toBe(true);
    // A sibling directory that merely starts with the same prefix string
    // must NOT be excluded by a sloppy startsWith("src/components/game")
    // check — "src/components/gameplay" is a different, hypothetical
    // directory that would still need guarding.
    expect(isExcluded("src/components/gameplay/Foo.tsx")).toBe(false);
    expect(isExcluded("src/components/layout/Nav.tsx")).toBe(false);
  });

  it("collectFiles actually omits src/components/game files from a real scan of the repo", () => {
    const scanned = collectFiles(["src/components"]);
    expect(scanned.some((f) => f.split(sep).join("/").includes("/src/components/game/"))).toBe(false);
    // Sanity: the scan isn't accidentally empty — real, non-game components exist and are included.
    expect(scanned.length).toBeGreaterThan(0);
  });
});

describe("sitemap includes the arcade routes", () => {
  it("lists /games and every playable game route, derived from games.data.ts", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain(`${SITE_URL}/games`);
    // Named explicitly (not just via the games.data.ts round-trip below)
    // so a bug in the data file itself can't make this assertion vacuous.
    expect(urls).toContain(`${SITE_URL}/games/circle-td`);
    for (const game of games.filter((g) => g.status === "playable")) {
      expect(urls).toContain(`${SITE_URL}/games/${game.slug}`);
    }
  });
});
