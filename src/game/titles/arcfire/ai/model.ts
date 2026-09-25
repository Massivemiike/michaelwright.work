// src/game/titles/arcfire/ai/model.ts
//
// The AI's only knowledge of weapons, derived from WeaponDef data (no weapon
// ids anywhere in the AI), so an appended weapon needs no AI code:
//   probeModelOf: what the probe flies for a weapon (spec §5 step 1): the
//     launch's speed and gravity scales plus the first stage's flight
//     modifiers (homing, terrain bounces, wall bounces, stop at the apex),
//     and for an apex split the centre child it continues along;
//   dealsDamage: whether a weapon can score at all (the DIRT weapons cannot).
import type { Effect, Stage, WeaponDef } from "../weapons/types";

/** How a probe shell flies until its terminal trigger: the ballistics.ts Shell fields a Stage arms. */
export interface FlightMods {
  stopAtApex: boolean;
  homeDeg: number;
  bounces: number;
  wallBounces: number;
  restitutionPct: number;
}

export interface ProbeModel {
  key: string; // equal keys fly identically, so one landing grid serves every weapon with that key
  beam: { length: number; width: number; count: number; spreadDeg: number } | null; // beams: straight lines on the beam dial
  speedPct: number;
  gravityPct: number;
  mods: FlightMods;
  apex: { from: "up" | "ahead" | "cone"; speedPct: number; child: FlightMods } | null; // an apex split: its centre child
}

const modsOf = (st: Stage): FlightMods => ({
  stopAtApex: st.on === "apex",
  homeDeg: st.homing ? st.homing.degPerStep : 0,
  bounces: st.bounce && !st.bounce.walls ? st.bounce.times : 0,
  wallBounces: st.bounce && st.bounce.walls ? st.bounce.times : 0,
  restitutionPct: st.bounce ? st.bounce.restitutionPct : 100,
});

const modsKey = (f: FlightMods): string => `${f.stopAtApex ? 1 : 0}/${f.homeDeg}/${f.bounces}/${f.wallBounces}/${f.restitutionPct}`;

const PLAIN: FlightMods = { stopAtApex: false, homeDeg: 0, bounces: 0, wallBounces: 0, restitutionPct: 100 };

export function probeModelOf(def: WeaponDef): ProbeModel {
  const l = def.launch;
  if (l.kind === "beam") {
    const beam = { length: l.length, width: l.width, count: l.count ?? 1, spreadDeg: l.spreadDeg ?? 0 };
    return { key: `beam/${beam.length}/${beam.width}/${beam.count}/${beam.spreadDeg}`, beam, speedPct: 0, gravityPct: 0, mods: PLAIN, apex: null };
  }
  const speedPct = l.speedPct ?? 100;
  const gravityPct = l.gravityPct ?? 100;
  const st = def.stage;
  if (!st) return { key: `s/${speedPct}/${gravityPct}`, beam: null, speedPct, gravityPct, mods: PLAIN, apex: null };
  const mods = modsOf(st);
  let apex: ProbeModel["apex"] = null;
  if (st.on === "apex") {
    for (const e of st.effects) {
      if ("split" in e) {
        apex = { from: e.split.from, speedPct: e.split.speedPct, child: modsOf(e.split.child) };
        break;
      }
    }
  }
  const key = `s/${speedPct}/${gravityPct}/${modsKey(mods)}` + (apex ? `/${apex.from}/${apex.speedPct}/${modsKey(apex.child)}` : "");
  return { key, beam: null, speedPct, gravityPct, mods, apex };
}

/** Can this weapon score points at all? False exactly for pure DIRT (a build and nothing that hurts, anywhere in its stages). */
export function dealsDamage(def: WeaponDef): boolean {
  if (def.launch.kind === "beam") return def.launch.damage > 0;
  const seen = new Set<Stage>(); // a cyclic definition adds nothing new
  const listHurts = (list: readonly Effect[] | undefined): boolean => {
    for (const e of list ?? []) {
      if ("blast" in e || "roll" in e || "burn" in e || "quake" in e) return true;
      if ("dig" in e && (e.dig.then !== undefined || e.dig.each !== undefined)) return true;
      if ("split" in e && stageHurts(e.split.child)) return true;
      if ("delay" in e && listHurts(e.delay.then)) return true;
    }
    return false;
  };
  const stageHurts = (st: Stage): boolean => {
    if (seen.has(st)) return false;
    seen.add(st);
    return st.bounce?.blastEach !== undefined || listHurts(st.effects) || listHurts(st.early);
  };
  return def.stage !== undefined && stageHurts(def.stage);
}
