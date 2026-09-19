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
// src/app/games/** and src/game/** are deliberately NOT scanned here —
// that's the boundary being exercised (GameClient.tsx, PlayGate.tsx's
// own dynamic import, and every file under src/game/** itself are
// SUPPOSED to reference @/game/**), not a hole in the guard.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import sitemap from "@/app/sitemap";
import { SITE_URL } from "@/lib/metadata";
import { games } from "@/data/games.data";

// Matches a static `from "@/game/..."` / `from "@/game"`, a dynamic
// `import("@/game/...")`, or a `require("@/game/...")` — covers both
// import forms, since even a stray dynamic import outside PlayGate.tsx
// would still make some non-game page fire an extra chunk request no
// visitor asked for.
const GAME_IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']@\/game(?:\/|["'])/;

function walk(path: string): string[] {
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  const out: string[] = [];
  for (const name of readdirSync(path)) out.push(...walk(join(path, name)));
  return out;
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
        !f.endsWith(".test.tsx")
    );
}

// Every surface that must never import @/game/**: the root layout and
// the other global App Router special files (error/not-found/loading —
// rendered site-wide the same way layout.tsx is), the shared layout
// chrome (Nav/Footer/PageWrapper — imported BY layout.tsx, so this is
// the set that actually protects everything else), the homepage, and
// every marketing/blog/project/gallery/contact/resume page.
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
  "src/components/layout",
];

describe("lazy boundary: @/game/** never leaks into marketing chrome", () => {
  it("no guarded file imports from @/game/**", () => {
    const violations: string[] = [];
    for (const file of collectFiles(GUARDED_ROOTS)) {
      const src = readFileSync(file, "utf8");
      if (GAME_IMPORT.test(src)) violations.push(file);
    }
    expect(violations).toEqual([]);
  });

  it("actually detects a real import shape (guard is not vacuous)", () => {
    const staticImport = `import { makeSim } from "@/game/titles/circle-td";`;
    const dynamicImport = `const load = () => import("@/game/titles/circle-td");`;
    const bareRequire = `const m = require("@/game/runtime/loop");`;
    expect(GAME_IMPORT.test(staticImport)).toBe(true);
    expect(GAME_IMPORT.test(dynamicImport)).toBe(true);
    expect(GAME_IMPORT.test(bareRequire)).toBe(true);
  });

  it("does not false-positive on an unrelated '@/game...'-shaped string or a comment", () => {
    const ok = [
      `// mentions @/game/foo in a comment only, never imported`,
      `const gamePlanPath = "@/game-plan/foo";`, // "@/game-plan", not "@/game/"
      `import { Game } from "@/data/games.data";`, // "@/data", not "@/game"
    ].join("\n");
    expect(GAME_IMPORT.test(ok)).toBe(false);
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
