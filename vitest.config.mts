import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // Default stays "node" — the sim/logic tests under src/game are the
    // vast majority and don't need a DOM. GameClient.test.tsx (Task 5)
    // opts into jsdom per-file via a `// @vitest-environment jsdom`
    // pragma comment instead of flipping this globally.
    environment: "node",
    // Task 7 adds src/components/game/**/*.test.tsx (the HUD's React
    // components) — same jsdom-via-pragma opt-in as
    // src/app/games/**/*.test.tsx already uses; the global default stays
    // "node" for the sim/logic tests, which are still the vast majority.
    include: [
      "src/game/**/*.test.ts",
      "src/app/games/**/*.test.tsx",
      "src/components/game/**/*.test.tsx",
    ],
  },
});
