// src/lib/leaderboard/config.ts
//
// Public-board launch flag. Submission (POST /api/games/scores) always
// works so the owner can playtest; the PUBLIC board display (gate LCP +
// arcade index) is hidden until this flips true. Flip ONLY after all three
// launch-gate conditions are met (see the plan's "Open items / launch
// gate"): (a) balance frozen after owner playtest, (b) cross-engine
// determinism gate green, (c) balance sweep passing.
export const LEADERBOARD_PUBLIC = false;

// Mirror of @/game/titles/circle-td/version SIM_VERSION for use in GUARDED src/lib code
// (the lazy-boundary guard forbids importing @/game from src/lib). Kept in
// sync by src/game/test/leaderboard-sim-version.test.ts.
export const LEADERBOARD_SIM_VERSION = 2;
