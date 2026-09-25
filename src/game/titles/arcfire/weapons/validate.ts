// src/game/titles/arcfire/weapons/validate.ts
//
// The static half of the weapon contract: weaponErrors(def) lists every rule a
// WeaponDef breaks ([] = valid), and the cost bounds resolveTurn relies on.
// The roster test requires [] for every entry. The ranges keep every product
// in the sim below 2^53 and every data-fed divisor >= 1. The runtime guards in
// damage.ts / primitives.ts let the degenerate defs the totality test covers
// (zeros, count 0, a cyclic stage, the launch maxima) resolve without throwing;
// data far outside these ranges (a huge carve radius, NaN) is not covered.
// weaponErrors itself never throws: a missing or null nested object is reported
// as `<path>: missing`; a cyclic stage is reported at a back-reference and not
// descended into; a split or delay inside a delay list is reported and not
// descended into (a delay list nests nothing); and a stage is checked at most
// once per depth, which bounds the stage bodies checked by stages x
// MAX_STAGE_DEPTH. A def with a cycle is still rejected (at least one cyclic or
// too-deep report). Not every cost is memoised: a delay's `then` list is
// checked once per reference to it, and the static bounds maxShells /
// maxTurnSteps (run when a def has no other error) follow every path to the
// depth limit, so a def that shares stages or lists heavily costs more than
// linear time.
import type { Blast, Effect, Stage, WeaponDef } from "./types";
import { MAX_FLIGHT_STEPS, MAX_SHELLS, MAX_STAGE_DEPTH, MAX_TURN_STEPS } from "../constants";

const isInt = (v: unknown, lo: number, hi: number): boolean =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/** A non-null object: the guard before reading any nested field. */
const isObj = (v: unknown): v is object => typeof v === "object" && v !== null;

function check(errs: string[], path: string, v: unknown, lo: number, hi: number): void {
  if (!isInt(v, lo, hi)) errs.push(`${path}: ${String(v)} is not an integer in [${lo}, ${hi}]`);
}

/** Push `<path>: missing` unless v is an object; true when it is. */
function present(errs: string[], path: string, v: unknown): boolean {
  if (isObj(v)) return true;
  errs.push(`${path}: missing`);
  return false;
}

function checkBlast(errs: string[], path: string, b: Blast): void {
  if (!present(errs, path, b)) return;
  check(errs, `${path}.radius`, b.radius, 1, 200);
  check(errs, `${path}.damage`, b.damage, 1, 200);
  if (b.falloff !== undefined && b.falloff !== "linear" && b.falloff !== "quadratic") errs.push(`${path}.falloff: unknown`);
}

const EFFECT_KEYS = ["blast", "split", "roll", "dig", "burn", "build", "quake", "delay"];

function checkEffects(
  errs: string[], path: string, effects: readonly Effect[], apexList: boolean, depth: number, inDelay: boolean, onPath: Set<Stage>,
  seen: Map<Stage, number>,
): void {
  if (!Array.isArray(effects) || effects.length === 0) {
    errs.push(`${path}: must be a non-empty effect list`);
    return;
  }
  effects.forEach((e, i) => {
    const p = `${path}[${i}]`;
    if (!present(errs, p, e)) return;
    const keys = Object.keys(e);
    if (keys.length !== 1 || !EFFECT_KEYS.includes(keys[0])) {
      errs.push(`${p}: an effect has exactly one known key`);
      return;
    }
    if (!present(errs, `${p}.${keys[0]}`, (e as unknown as Record<string, unknown>)[keys[0]])) return;
    if (inDelay && (keys[0] === "split" || keys[0] === "delay")) {
      errs.push(`${p}: a delay cannot schedule a ${keys[0]}`);
      return; // not descended into: a self-containing or deep delay chain is this one report
    }
    if ("blast" in e) checkBlast(errs, `${p}.blast`, e.blast);
    else if ("split" in e) {
      const s = e.split;
      check(errs, `${p}.split.count`, s.count, 1, 9);
      check(errs, `${p}.split.spreadDeg`, s.spreadDeg, 0, 180);
      check(errs, `${p}.split.speedPct`, s.speedPct, 1, 200);
      if (s.gapPx !== undefined) check(errs, `${p}.split.gapPx`, s.gapPx, 0, 200);
      if (s.from !== "up" && s.from !== "ahead" && s.from !== "cone") errs.push(`${p}.split.from: unknown`);
      else if (s.from !== "up" && !apexList) errs.push(`${p}.split.from: "${s.from}" only in an apex stage's effects (at an impact the heading points into the ground)`);
      checkStage(errs, `${p}.split.child`, s.child, depth + 1, onPath, seen);
    } else if ("roll" in e) {
      check(errs, `${p}.roll.maxDistance`, e.roll.maxDistance, 1, 1200);
      checkBlast(errs, `${p}.roll.then`, e.roll.then);
    } else if ("dig" in e) {
      const d = e.dig;
      check(errs, `${p}.dig.length`, d.length, 1, 400);
      check(errs, `${p}.dig.width`, d.width, 2, 32);
      if (d.blastEvery !== undefined || d.each !== undefined) {
        if (d.each === undefined || d.blastEvery === undefined) errs.push(`${p}.dig: blastEvery and each come together`);
        else {
          check(errs, `${p}.dig.blastEvery`, d.blastEvery, 1, d.length);
          checkBlast(errs, `${p}.dig.each`, d.each);
        }
      }
      if (d.then !== undefined) checkBlast(errs, `${p}.dig.then`, d.then);
    } else if ("burn" in e) {
      check(errs, `${p}.burn.flow`, e.burn.flow, 0, 1200);
      check(errs, `${p}.burn.pool`, e.burn.pool, 0, 400);
      check(errs, `${p}.burn.damage`, e.burn.damage, 1, 200);
    } else if ("build" in e) {
      const b = e.build;
      if (b.shape === "wall") {
        check(errs, `${p}.build.width`, b.width, 1, 200);
        check(errs, `${p}.build.height`, b.height, 1, 200);
      } else if (b.shape === "ball" || b.shape === "level") check(errs, `${p}.build.radius`, b.radius, 1, 200);
      else errs.push(`${p}.build.shape: unknown`);
    } else if ("quake" in e) {
      check(errs, `${p}.quake.reach`, e.quake.reach, 1, 1200);
      check(errs, `${p}.quake.damage`, e.quake.damage, 1, 200);
      check(errs, `${p}.quake.furrow`, e.quake.furrow, 0, 50);
    } else {
      check(errs, `${p}.delay.steps`, e.delay.steps, 1, 600);
      checkEffects(errs, `${p}.delay.then`, e.delay.then as Effect[], false, depth, true, onPath, seen);
    }
  });
}

/**
 * Check one stage. `onPath` holds the stages from the root down to this one:
 * meeting one of them again is a cycle, reported once at that back-reference
 * and not descended into (a stage that refers to itself k times costs k
 * checks, not k^4). `seen` maps each stage to a bitmask of the depths it was
 * checked at: a second check at the same depth would walk the same stages to
 * the same depth limit, so it is skipped, AFTER the cycle and depth checks (so
 * this reference itself is still reported when it closes a cycle or goes too
 * deep). A back-reference inside a skipped stage can go unreported on this
 * path, since the earlier check saw other ancestors; each cycle still gets at
 * least one report (cyclic, or too deep), so the def is still rejected. That
 * bounds the stage bodies checked by stages x MAX_STAGE_DEPTH, where
 * a multi-stage cycle with k back-references per stage used to cost k^L. Not
 * "this depth or a shallower one": a shallower check hits the depth limit
 * later, so it can miss an over-deep path through the stage.
 */
function checkStage(errs: string[], path: string, st: Stage, depth: number, onPath: Set<Stage>, seen: Map<Stage, number>): void {
  if (!present(errs, path, st)) return;
  if (onPath.has(st)) {
    errs.push(`${path}: cyclic stage, so its stages nest deeper than ${MAX_STAGE_DEPTH}`);
    return;
  }
  if (depth > MAX_STAGE_DEPTH) {
    errs.push(`${path}: stages nest deeper than ${MAX_STAGE_DEPTH}`);
    return;
  }
  const at = seen.get(st) ?? 0;
  if ((at & (1 << depth)) !== 0) return; // already checked at this depth
  seen.set(st, at | (1 << depth));
  onPath.add(st);
  if (st.on !== "impact" && st.on !== "apex") errs.push(`${path}.on: unknown`);
  checkEffects(errs, `${path}.effects`, st.effects, st.on === "apex", depth, false, onPath, seen);
  if (st.early !== undefined) {
    if (st.on !== "apex") errs.push(`${path}.early: only on an apex stage`);
    checkEffects(errs, `${path}.early`, st.early, false, depth, false, onPath, seen);
  }
  if (st.homing !== undefined) {
    if (st.on !== "impact") errs.push(`${path}.homing: only on an impact stage`);
    if (present(errs, `${path}.homing`, st.homing)) check(errs, `${path}.homing.degPerStep`, st.homing.degPerStep, 1, 10);
  }
  if (st.bounce !== undefined) {
    if (st.on !== "impact") errs.push(`${path}.bounce: only on an impact stage`);
    if (present(errs, `${path}.bounce`, st.bounce)) {
      check(errs, `${path}.bounce.times`, st.bounce.times, 1, 10);
      check(errs, `${path}.bounce.restitutionPct`, st.bounce.restitutionPct, 1, 100);
      if (st.bounce.blastEach !== undefined) checkBlast(errs, `${path}.bounce.blastEach`, st.bounce.blastEach);
    }
  }
  onPath.delete(st);
}

/** Shells one stage's shell can lead to, itself included (the larger of its effects and its early list). */
function stageShells(st: Stage, depth: number): number {
  if (depth > MAX_STAGE_DEPTH) return MAX_SHELLS + 1;
  const list = (effects: readonly Effect[] | undefined): number => {
    let n = 0;
    for (const e of effects ?? []) if ("split" in e) n += e.split.count * stageShells(e.split.child, depth + 1);
    return n;
  };
  return 1 + Math.max(list(st.effects), list(st.early));
}

/** Steps from one stage's shell's spawn to the last thing it can cause. */
function stageSteps(st: Stage, depth: number): number {
  if (depth > MAX_STAGE_DEPTH) return MAX_TURN_STEPS + 1;
  let tail = 0;
  for (const e of [...st.effects, ...(st.early ?? [])]) {
    if ("delay" in e && e.delay.steps > tail) tail = e.delay.steps;
    if ("split" in e) tail = Math.max(tail, stageSteps(e.split.child, depth + 1));
  }
  return MAX_FLIGHT_STEPS + tail;
}

/** Static upper bound on the shells one turn with `def` creates. */
export function maxShells(def: WeaponDef): number {
  if (def.launch.kind === "beam" || !def.stage) return 0;
  return (def.launch.count ?? 1) * stageShells(def.stage, 1);
}

/** Static upper bound on the steps one turn with `def` runs. */
export function maxTurnSteps(def: WeaponDef): number {
  if (def.launch.kind === "beam" || !def.stage) return 1;
  return stageSteps(def.stage, 1);
}

/** Every rule `def` breaks; [] when it is valid. */
export function weaponErrors(def: WeaponDef): string[] {
  const errs: string[] = [];
  if (!present(errs, "def", def)) return errs;
  if (typeof def.id !== "string" || def.id === "") errs.push("id: empty");
  check(errs, "tier", def.tier, 1, 3);
  check(errs, "power", def.power, 1, 100);
  const l = def.launch;
  if (!present(errs, "launch", l)) {
    if (def.stage !== undefined) checkStage(errs, "stage", def.stage, 1, new Set(), new Map());
    return errs;
  }
  check(errs, "launch.count", l.count ?? 1, 1, 9);
  check(errs, "launch.spreadDeg", l.spreadDeg ?? 0, 0, 180);
  if (l.kind === "shell") {
    check(errs, "launch.speedPct", l.speedPct ?? 100, 1, 300);
    check(errs, "launch.gravityPct", l.gravityPct ?? 100, 0, 200);
    if (!def.stage) errs.push("stage: a shell launch needs one");
    else checkStage(errs, "stage", def.stage, 1, new Set(), new Map());
  } else if (l.kind === "beam") {
    check(errs, "launch.length", l.length, 1, 1400);
    check(errs, "launch.width", l.width, 2, 12);
    check(errs, "launch.damage", l.damage, 1, 200);
    if (def.stage) errs.push("stage: a beam has none");
  } else errs.push("launch.kind: unknown");
  if (errs.length === 0) {
    if (maxShells(def) > MAX_SHELLS) errs.push(`maxShells ${maxShells(def)} > MAX_SHELLS ${MAX_SHELLS}`);
    if (maxTurnSteps(def) > MAX_TURN_STEPS) errs.push(`maxTurnSteps ${maxTurnSteps(def)} > MAX_TURN_STEPS ${MAX_TURN_STEPS}`);
  }
  return errs;
}
