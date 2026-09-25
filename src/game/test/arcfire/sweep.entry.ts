// src/game/test/arcfire/sweep.entry.ts
//
// Bundled by sweep.ts with esbuild and loaded once per worker thread: the
// sweep's matches run as one module, as the worker and the verifier run the
// sim (vitest's module runner is 4-5x slower, 2A K3).
export { playAiMatch } from "./aiMatch";
