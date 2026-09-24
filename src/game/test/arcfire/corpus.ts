// src/game/test/arcfire/corpus.ts
//
// The Arcfire cross-engine corpus: fixed single-turn cases for EVERY roster
// weapon (keyed by weapon id, so a roster append only adds cases) plus a few
// whole-match specials. Each case fingerprints the board it leaves — the
// heightfield, tank x and moves left — and the points it scored. It never
// hashes settings, the pool, the hands or the RNG, so neither a roster append
// nor a MatchSettings change can move an existing case. Pure: Node (the
// corpus test) and each browser (the cross-engine harness) run this same code.
import { FNV_OFFSET, fnvFold, fnvHex } from "@/game/sim/hash";
import { createMatch, applyPick, applyTurn } from "@/game/titles/arcfire/match";
import { cloneMatch, type MatchSettings, type MatchState } from "@/game/titles/arcfire/state";
import { resolveTurn } from "@/game/titles/arcfire/resolve";
import { spansFromHeight } from "@/game/titles/arcfire/terrain";
import { ROSTER, ROSTER_INDEX } from "@/game/titles/arcfire/weapons/roster";
import { SUDDEN_DEATH_WEAPON } from "@/game/titles/arcfire/constants";
import type { Timeline } from "@/game/titles/arcfire/timeline";

export const CORPUS_SEED = 20260922;
export const CORPUS_SETTINGS: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [] };

export interface ShotCase {
  id: string; // `${weapon}|${board}|p${shooter}|w${wind}|m${move}|${angle}/${power}`
  w: string; // weapon id
  board: "hills" | "flat";
  shooter: 0 | 1;
  wind: number;
  move: -1 | 0 | 1;
  angle: number;
  power: number;
}

/** 15 cases per weapon: three plain aims, both winds, player 1, a move, six extreme aims, and two on flat ground. */
export function shotCases(): ShotCase[] {
  const out: ShotCase[] = [];
  const add = (w: string, board: "hills" | "flat", shooter: 0 | 1, wind: number, move: -1 | 0 | 1, angle: number, power: number): void => {
    out.push({ id: `${w}|${board}|p${shooter}|w${wind}|m${move}|${angle}/${power}`, w, board, shooter, wind, move, angle, power });
  };
  for (const { id: w } of ROSTER) {
    for (const [a, p] of [[35, 70], [50, 80], [65, 95]]) add(w, "hills", 0, 0, 0, a, p);
    add(w, "hills", 0, 40, 0, 50, 80);
    add(w, "hills", 0, -40, 0, 50, 80);
    add(w, "hills", 1, 0, 0, 130, 80);
    add(w, "hills", 0, 0, 1, 55, 75);
    for (const [a, p] of [[0, 100], [180, 100], [90, 0], [90, 100], [2, 30], [178, 30]]) add(w, "hills", 0, 0, 0, a, p);
    add(w, "flat", 0, 0, 0, 45, 60);
    add(w, "flat", 0, 0, 0, 0, 60); // volleys leave below the horizon; a beam cuts straight down to the floor
  }
  return out;
}

/** "hills": the corpus seed's terrain, tanks at spawn. "flat": y = 400, tanks at 300 / 700. Battle phase. */
function board(which: "hills" | "flat"): MatchState {
  const m = createMatch(CORPUS_SEED, CORPUS_SETTINGS);
  m.phase = "battle";
  if (which === "flat") {
    m.terrain.height.fill(400);
    spansFromHeight(m.terrain);
    m.tankX[0] = 300;
    m.tankX[1] = 700;
  }
  return m;
}

/** FNV-1a over the heightfield, tank x and moves left: what a shot can change besides the scores. */
export function hashBoard(m: MatchState): string {
  let h = FNV_OFFSET;
  for (let x = 0; x < m.terrain.height.length; x++) h = fnvFold(h, m.terrain.height[x]);
  for (const v of [m.tankX[0], m.tankX[1], m.movesLeft[0], m.movesLeft[1]]) h = fnvFold(h, v);
  return fnvHex(h);
}

export interface Fingerprint { board: string; points: number[] }

/** Every case's fingerprint, by id. `onTurn` sees each shot case's Timeline (Node-only coverage checks). */
export function runCorpus(onTurn?: (c: ShotCase, tl: Timeline) => void): Record<string, Fingerprint> {
  const bases = { hills: board("hills"), flat: board("flat") };
  const res: Record<string, Fingerprint> = {};
  for (const c of shotCases()) {
    const m = cloneMatch(bases[c.board]);
    m.shooter = c.shooter;
    m.wind = c.wind;
    const tl = resolveTurn(m, { move: c.move, weapon: ROSTER_INDEX[c.w], angle: c.angle, power: c.power });
    res[c.id] = { board: hashBoard(m), points: [tl.points[0], tl.points[1]] };
    if (onTurn) onTurn(c, tl);
  }
  {
    // a shell that crosses x in (-1, 0): off the world since Plan 2A's floor fix
    const m = createMatch(777, CORPUS_SETTINGS);
    m.phase = "battle";
    m.shooter = 0;
    const tl = resolveTurn(m, { move: 0, weapon: ROSTER_INDEX.railshot, angle: 129, power: 10 });
    res["special|left-edge|seed777|railshot|129/10"] = { board: hashBoard(m), points: [tl.points[0], tl.points[1]] };
  }
  for (const win of [false, true]) {
    // a whole tied match on low flat ground (everything shot off the world), then sudden death: missed, or won by a direct hit
    const m = createMatch(5, CORPUS_SETTINGS);
    while (m.phase === "draft") applyPick(m, m.poolOwner.findIndex((o) => o === -1));
    m.terrain.height.fill(450);
    spansFromHeight(m.terrain);
    const away = () => ({
      move: 0 as const,
      w: m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[m.shooter][0],
      angle: m.shooter === 0 ? 180 : 0,
      power: 100,
    });
    while (m.phase === "battle") applyTurn(m, away());
    if (win) applyTurn(m, { move: 0, w: SUDDEN_DEATH_WEAPON, angle: m.shooter === 0 ? 45 : 135, power: 72 });
    while (m.phase === "suddenDeath") applyTurn(m, away());
    res[`match|sudden-death-${win ? "win" : "draw"}`] = { board: hashBoard(m), points: [m.scores[0], m.scores[1], m.winner, m.shotsFired] };
  }
  return res;
}

/** One hex digest over every case, in id order: what the browsers must reproduce. */
export function corpusDigest(res: Record<string, Fingerprint>): string {
  let h = FNV_OFFSET;
  for (const id of Object.keys(res).sort()) {
    for (let i = 0; i < id.length; i++) h = fnvFold(h, id.charCodeAt(i));
    h = fnvFold(h, parseInt(res[id].board, 16));
    for (const p of res[id].points) h = fnvFold(h, p);
  }
  return fnvHex(h);
}
