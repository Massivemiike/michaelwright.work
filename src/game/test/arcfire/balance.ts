// src/game/test/arcfire/balance.ts
//
// The balance harness's pure half (spec §4.3): aggregate Ace-vs-Ace match
// records per weapon, judge each weapon against its tier band and the +12%
// win-rate rule, suggest a fix, compute the `power` table, and rewrite the
// `power:` literals of roster.ts. Test support (outside the purity roots):
// floats are fine here. Records are sorted by seed first, so a report is
// identical whatever the thread count or shard order.
import type { MatchRecord } from "./aiMatch";

export interface WeaponDefLite { id: string; tag: string; tier: number }

export const BANDS: Record<number, [number, number]> = { 1: [15, 40], 2: [30, 60], 3: [50, 90] };
export const WR_LIMIT = 0.12;

export interface WeaponRow {
  id: string;
  tier: number;
  dirt: boolean;
  shots: number;
  mean: number; // net points per shot: dealt minus gifted (the AI's own value)
  sd: number;
  gifted: number; // points gifted per shot
  hit: number; // share of shots that dealt damage
  held: number; // (match, player) hands holding it
  contrib: number; // the holder's win rate (a draw counts 1/2) minus 1/2
  ci: number; // 95% half-width of contrib
  meanTurn: number; // the mean battle turn it was fired on (1-based)
  defensive: number; // DIRT: shots the DIRT rule fired
  replyCut: number; // DIRT: the mean estimated reply cut over those shots
  verdict: "ok" | "HIGH" | "LOW" | "WR" | "HIGH+WR" | "LOW+WR";
  suggestion: string;
  power: number; // the proposed roster power
  pickRate: number; // how often Ace's power draft would take it, with the proposed powers, when it is in the pool
}

export function aggregate(records: MatchRecord[], roster: readonly WeaponDefLite[], picksPerMatch: number): WeaponRow[] {
  const recs = records.slice().sort((a, b) => a.seed - b.seed);
  const rows: WeaponRow[] = roster.map((def, w) => {
    const dirt = def.tag === "DIRT";
    let shots = 0, net = 0, net2 = 0, dealt = 0, gifted = 0, hits = 0, turnSum = 0, held = 0, won = 0, defensive = 0, cut = 0;
    for (const r of recs) {
      let turn = 0;
      for (const s of r.shots) {
        if (s.sd) continue;
        turn++;
        if (s.w !== w) continue;
        const v = s.pts - s.gift;
        shots++;
        net += v;
        net2 += v * v;
        dealt += s.pts;
        gifted += s.gift;
        if (s.pts > 0) hits++;
        turnSum += turn;
        if (s.reason === "dirt") {
          defensive++;
          cut += s.reply - s.replyDirt;
        }
      }
      for (const p of [0, 1]) {
        if (!r.hands[p].includes(w)) continue;
        held++;
        won += r.winner === p ? 1 : r.winner === 2 ? 0.5 : 0;
      }
    }
    const mean = shots > 0 ? net / shots : 0;
    const sd = shots > 1 ? Math.sqrt(Math.max(0, net2 / shots - mean * mean)) : 0;
    const contrib = held > 0 ? won / held - 0.5 : 0;
    const ci = held > 0 ? 1.96 * Math.sqrt(0.25 / held) : 0;
    const hit = shots > 0 ? hits / shots : 0;
    const [lo, hi] = BANDS[def.tier];
    const band = dirt || shots === 0 ? "" : mean > hi ? "HIGH" : mean < lo ? "LOW" : ""; // never fired: no data, no band verdict
    const wr = contrib > WR_LIMIT;
    const verdict = (band && wr ? `${band}+WR` : band || (wr ? "WR" : "ok")) as WeaponRow["verdict"];
    const parts: string[] = [];
    if (band) {
      const mid = (lo + hi) / 2;
      parts.push(hit >= 0.8
        ? `damage x ${(mid / mean).toFixed(2)} (to the band's middle, ${mid})`
        : `structural: hit ${(100 * hit).toFixed(0)}%, ${(hits > 0 ? dealt / hits : 0).toFixed(1)} points on a hit`);
    }
    if (wr) parts.push(`reduce damage or spread: win-rate contribution +${(100 * contrib).toFixed(1)}% +- ${(100 * ci).toFixed(1)}`);
    if (dirt) parts.push(`${defensive} defensive uses, estimated reply cut ${(defensive > 0 ? cut / defensive : 0).toFixed(1)}`);
    return {
      id: def.id, tier: def.tier, dirt, shots, mean, sd, gifted: shots > 0 ? gifted / shots : 0, hit, held, contrib, ci,
      meanTurn: shots > 0 ? turnSum / shots : 0, defensive, replyCut: defensive > 0 ? cut / defensive : 0,
      verdict, suggestion: parts.join("; "), power: 0, pickRate: 0,
    };
  });
  // power: a damaging weapon's net points per shot; a DIRT weapon's win-rate contribution converted to
  // points by the least-squares line (net per shot against contribution) through the damaging weapons
  const dmg = rows.filter((r) => !r.dirt);
  const mx = dmg.reduce((s, r) => s + r.contrib, 0) / dmg.length;
  const my = dmg.reduce((s, r) => s + r.mean, 0) / dmg.length;
  let sxy = 0, sxx = 0;
  for (const r of dmg) {
    sxy += (r.contrib - mx) * (r.mean - my);
    sxx += (r.contrib - mx) * (r.contrib - mx);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  for (const r of rows) r.power = Math.min(100, Math.max(1, Math.round(r.dirt ? my + slope * (r.contrib - mx) : r.mean)));
  // pick rate with the proposed powers: Ace's draft takes the highest power first (ties: the lower roster index)
  const byPower = (a: number, b: number): number => rows[b].power - rows[a].power || a - b;
  const inPool = rows.map(() => 0);
  const picked = rows.map(() => 0);
  for (const r of recs) {
    const order = r.pool.slice().sort(byPower);
    order.forEach((w, rank) => {
      inPool[w]++;
      if (rank < picksPerMatch) picked[w]++;
    });
  }
  rows.forEach((r, w) => { r.pickRate = inPool[w] > 0 ? picked[w] / inPool[w] : 0; });
  return rows;
}

export interface Judged { rows: WeaponRow[]; failing: string[]; acked: string[]; stale: string[] }

/** The gate: a failing weapon on the allow-list is ACK (reported, not failed); an allow-listed weapon now passing is STALE ACK. */
export function judge(rows: WeaponRow[], allow: Record<string, string>): Judged {
  const failing: string[] = [];
  const acked: string[] = [];
  const stale: string[] = [];
  for (const r of rows) {
    const bad = r.verdict !== "ok";
    if (bad && allow[r.id] !== undefined) acked.push(r.id);
    else if (bad) failing.push(r.id);
    else if (allow[r.id] !== undefined) stale.push(r.id);
  }
  return { rows, failing, acked, stale };
}

const signed = (v: number): string => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(1)}`;

export function report(j: Judged, records: MatchRecord[], title: string): string {
  const n = records.length;
  let p0 = 0, draws = 0, first = 0, margin = 0;
  for (const r of records) {
    if (r.winner === 0) p0++;
    if (r.winner === 2) draws++;
    if (r.winner === 1 - r.firstPicker) first++;
    margin += Math.abs(r.scores[0] - r.scores[1]);
  }
  const lines = [
    `### ${title}`,
    "",
    `${n} matches; player 0 won ${p0}, the first shooter ${first}, draws ${draws}; mean |margin| ${(margin / n).toFixed(1)}`,
    "",
    "| weapon | T | net/shot | band | sd | hit % | gift | WR contrib (95%) | turn | verdict | gate | power | pick % | suggestion |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of j.rows) {
    const band = r.dirt ? "WR only" : `${BANDS[r.tier][0]}-${BANDS[r.tier][1]}`;
    const gate = j.failing.includes(r.id) ? "FAIL" : j.acked.includes(r.id) ? "ACK" : j.stale.includes(r.id) ? "STALE ACK" : "";
    lines.push(`| ${r.id} | ${r.tier} | ${r.dirt ? "-" : r.mean.toFixed(1)} | ${band} | ${r.dirt ? "-" : r.sd.toFixed(1)} | ${r.dirt ? "-" : (100 * r.hit).toFixed(0)} | ${r.gifted.toFixed(1)} | ${signed(r.contrib)} +- ${(100 * r.ci).toFixed(1)} | ${r.meanTurn.toFixed(1)} | ${r.verdict} | ${gate} | ${r.power} | ${(100 * r.pickRate).toFixed(0)} | ${r.suggestion} |`);
  }
  lines.push("", `FAIL (${j.failing.length}): ${j.failing.join(", ") || "none"}; ACK (${j.acked.length}): ${j.acked.join(", ") || "none"}; STALE ACK: ${j.stale.join(", ") || "none"}`);
  return lines.join("\n");
}

export interface TierCost {
  tier: string;
  decisions: number;
  simsMean: number;
  simsMax: number;
  probesMean: number;
  probesMax: number;
  msMean: number; // ShotRecord.ms: wall time under the sweep's own load (every core busy), so an upper bound
  msP99: number;
  msMax: number;
}

/** Per-tier decision costs over every shot of `records` (sudden death included). The counts are exact and seed-determined; ms is not. */
export function costs(records: MatchRecord[]): TierCost[] {
  const by = new Map<string, { sims: number[]; probes: number[]; ms: number[] }>();
  for (const r of records) {
    for (const s of r.shots) {
      const tier = r.tiers[s.p];
      let b = by.get(tier);
      if (b === undefined) {
        b = { sims: [], probes: [], ms: [] };
        by.set(tier, b);
      }
      b.sims.push(s.sims);
      b.probes.push(s.probes);
      b.ms.push(s.ms);
    }
  }
  const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
  const top = (v: number[]): number => v.reduce((a, b) => (b > a ? b : a), 0);
  return ["rookie", "veteran", "ace"].filter((t) => by.has(t)).map((tier) => {
    const b = by.get(tier)!;
    const ms = b.ms.slice().sort((x, y) => x - y);
    return {
      tier, decisions: b.sims.length, simsMean: mean(b.sims), simsMax: top(b.sims), probesMean: mean(b.probes), probesMax: top(b.probes),
      msMean: mean(ms), msP99: ms[Math.min(ms.length - 1, Math.floor(0.99 * ms.length))], msMax: ms[ms.length - 1],
    };
  });
}

export function costTable(c: TierCost[]): string {
  const lines = [
    "| tier | decisions | sims mean / max | probe flights mean / max | ms mean / p99 / max (under the sweep's load) |",
    "|---|---|---|---|---|",
  ];
  for (const t of c) {
    lines.push(`| ${t.tier} | ${t.decisions} | ${t.simsMean.toFixed(0)} / ${t.simsMax} | ${t.probesMean.toFixed(0)} / ${t.probesMax} | ${t.msMean.toFixed(1)} / ${t.msP99.toFixed(1)} / ${t.msMax.toFixed(1)} |`);
  }
  return lines.join("\n");
}

/**
 * Rewrite each weapon's `power: N` literal in roster.ts's source text. Each id must match exactly one
 * `id: "<id>", name: "...", tag: "...", tier: n, power: N` and each power must be an integer in 1..100,
 * or it throws and nothing is written. Returns the new text and the changes as `id: old -> new`.
 */
export function writePowers(src: string, powers: Record<string, number>): { src: string; changed: string[] } {
  let out = src;
  const changed: string[] = [];
  for (const [id, p] of Object.entries(powers)) {
    if (!Number.isInteger(p) || p < 1 || p > 100) throw new RangeError(`power ${id}: ${p} is not an integer in 1..100`);
    const re = new RegExp(`(id: "${id}", name: "[^"]*", tag: "[A-Z]+", tier: [123], power: )(\\d+)`, "g");
    const hits = out.match(re);
    if (hits === null || hits.length !== 1) throw new Error(`power ${id}: ${hits === null ? 0 : hits.length} roster lines match, need exactly 1`);
    out = out.replace(re, (_all: string, head: string, old: string) => {
      if (Number(old) !== p) changed.push(`${id}: ${old} -> ${p}`);
      return `${head}${p}`;
    });
  }
  return { src: out, changed };
}
