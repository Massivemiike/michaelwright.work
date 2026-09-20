#!/usr/bin/env node
// scripts/check-bundle-budget.mjs
//
// CI bundle-budget gate for the games feature (Plan 2, Task 9): confirms
// the compiled *production build output* never ships game-engine code
// (src/game/**) into a marketing/portfolio route's initial page load.
//
// This complements — it does not replace — src/game/test/lazy-boundary.
// test.ts, which is a *source*-level import-graph scan (no guarded file
// imports @/game/**, by alias or by relative path). That test can never
// see a bundler/config change that somehow pulled src/game/** into a
// shared chunk despite every import being correctly gated behind
// `next/dynamic(..., { ssr: false })` — this script checks the actual
// bytes `next build` produced, which is the thing that actually ships to
// a visitor's browser.
//
// Method:
//   1. Find the built chunk(s) under .next/static/chunks/** that contain a
//      string literal unique to the game engine's compiled JS (an Error
//      message from Canvas2DRenderer.ts). A string literal is used as the
//      marker, not an identifier, because minification renames identifiers
//      but leaves string contents alone.
//   2. Scan every prerendered route's HTML under .next/server/app/**/*.html
//      for a <script src=...> or <link href=...> reference to one of those
//      chunk files. Next only emits such a reference in a route's initial
//      HTML for code that route's initial JS payload actually needs; code
//      reached only via a click-triggered `next/dynamic` import is fetched
//      later, via a runtime JS call, and is never referenced in the initial
//      HTML at all.
//   3. Fail if any prerendered route references a game chunk. Also fail
//      (loudly, not silently) if no chunk contains any marker at all — that
//      means the marker string was changed/removed in src/game/** and this
//      check can no longer verify anything until it's updated.
//
// This intentionally avoids hand-parsing Turbopack's internal manifest
// format (build-manifest.json, client-reference-manifest.js, etc.) — that
// format is undocumented, has already changed shape across Next versions,
// and isn't necessary here: the actual HTML bytes a route serves are the
// real, stable contract this check needs.
//
// Known limitation: routes that are fully dynamic (ƒ — server-rendered per
// request, no prerendered .html on disk; /blog and /api/contact in this
// build) aren't scanned here, since there's no static HTML artifact to
// grep. That gap is covered instead by the source-level import-graph test,
// which DOES scan src/app/blog — /blog renders through the exact same root
// layout/Nav/Footer/PageWrapper chrome as every statically prerendered
// route already covered here, so there's no separate code path by which it
// could reach a different chunk graph for that shared chrome.
//
// Usage: node scripts/check-bundle-budget.mjs   (after `next build`)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const NEXT_DIR = ".next";
const CHUNKS_DIR = join(NEXT_DIR, "static", "chunks");
const APP_DIR = join(NEXT_DIR, "server", "app");

// String literal(s) that only ever appear in compiled src/game/** output.
// Sourced from Canvas2DRenderer.ts (init throw) and WebGpuRenderer.ts
// (WEBGPU_BUNDLE_MARKER — the pipeline-build failure throw). Two markers so
// BOTH the always-loaded game chunk (Canvas2D) AND the separate
// dynamically-imported WebGPU chunk are verified never to be referenced by a
// prerendered marketing route's initial HTML. If NEITHER matches anything,
// the "no chunk contains any marker" check below fails loudly (stale guard).
const GAME_MARKERS = [
  "Canvas2DRenderer: 2D canvas context unavailable",
  "WebGpuRenderer: WebGPU pipeline build failed",
];

function walk(dir) {
  let out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out = out.concat(walk(full));
    else out.push(full);
  }
  return out;
}

function fail(msg) {
  console.error(`\n✗ bundle-budget: ${msg}\n`);
  process.exit(1);
}

// 1. Find every built chunk containing a game-engine marker string.
let chunkFiles;
try {
  chunkFiles = walk(CHUNKS_DIR).filter((f) => f.endsWith(".js"));
} catch (e) {
  fail(`could not read ${CHUNKS_DIR} — run "next build" first (${e.message})`);
}

const gameChunkBasenames = new Set();
for (const file of chunkFiles) {
  const src = readFileSync(file, "utf8");
  if (GAME_MARKERS.some((marker) => src.includes(marker))) {
    gameChunkBasenames.add(file.split(/[\\/]/).pop());
  }
}

if (gameChunkBasenames.size === 0) {
  fail(
    "no built chunk contains any known game-engine marker string — this check is " +
      "stale (the marker text was likely changed or removed in src/game/**) and can no " +
      "longer verify anything. Update GAME_MARKERS in scripts/check-bundle-budget.mjs."
  );
}

// 2. Scan every prerendered route's HTML for a reference to a game chunk.
let htmlFiles;
try {
  htmlFiles = walk(APP_DIR).filter((f) => f.endsWith(".html"));
} catch (e) {
  fail(`could not read ${APP_DIR} — run "next build" first (${e.message})`);
}

if (htmlFiles.length === 0) fail(`no prerendered .html files found under ${APP_DIR}`);

const CHUNK_REF = /\/_next\/static\/chunks\/([^"'\s)]+\.js)/g;
const violations = [];

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(CHUNK_REF)) {
    const basename = match[1];
    if (gameChunkBasenames.has(basename)) violations.push({ file, basename });
  }
}

if (violations.length > 0) {
  const lines = violations
    .map((v) => `  - ${v.file} references game chunk ${v.basename}`)
    .join("\n");
  fail(
    `${violations.length} prerendered route(s) reference game-engine code in their initial HTML:\n${lines}`
  );
}

console.log(
  `✓ bundle-budget: ${htmlFiles.length} prerendered route(s) scanned, game engine ` +
    `chunk(s) [${[...gameChunkBasenames].join(", ")}] referenced by none of them.`
);
