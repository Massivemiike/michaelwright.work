// src/game/test/arcfire/balance.test.ts — the balance harness's pure half, on hand-built records (always on; no match is played)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ROSTER } from "@/game/titles/arcfire/weapons/roster";
import { aggregate, costs, costTable, judge, report, writePowers, type WeaponDefLite } from "./balance";
import type { MatchRecord, ShotRecord } from "./aiMatch";

const LITE: WeaponDefLite[] = [
  { id: "a", tag: "BLAST", tier: 1 }, // band 15-40
  { id: "b", tag: "BLAST", tier: 3 }, // band 50-90
  { id: "c", tag: "BLAST", tier: 2 }, // never held, never fired
  { id: "d", tag: "DIRT", tier: 1 }, // judged by win-rate contribution only
];

const shot = (p: number, w: number, pts: number, more: Partial<ShotRecord> = {}): ShotRecord => ({
  p, w, sd: false, pts, gift: 0, move: 0, reason: "best", reply: -1, replyDirt: -1, sims: 10, probes: 100, ms: 1, ...more,
});

const rec = (seed: number, hands: [number[], number[]], scores: [number, number], winner: number, shots: ShotRecord[]): MatchRecord => ({
  seed, tiers: ["ace", "ace"], firstPicker: 1, pool: [0, 1, 2, 3], hands, scores, winner, shots,
});

/** Out of seed order on purpose: aggregate sorts by seed. */
const RECORDS: MatchRecord[] = [
  rec(4, [[1], [0]], [0, 50], 1, [shot(0, 1, 0), shot(1, 0, 50)]),
  rec(2, [[0], [1, 3]], [50, 0], 0, [shot(0, 0, 50), shot(1, 1, 0), shot(1, 3, 0, { reason: "forcedDirt" })]),
  rec(1, [[0], [1, 3]], [50, 40], 0, [
    shot(0, 0, 50), shot(1, 3, 0, { reason: "dirt", reply: 70, replyDirt: 30 }), shot(1, 1, 40),
    shot(0, 0, 99, { sd: true }), // sudden death: excluded from every per-weapon figure
  ]),
  rec(3, [[0], [1]], [50, 50], 2, [shot(0, 0, 50), shot(1, 1, 40)]),
];

describe("the balance harness", () => {
  it("aggregates per weapon: net points, hits, turns, holdings and win-rate contribution", () => {
    const [a, b, c, d] = aggregate(RECORDS, LITE, 2);
    expect([a.shots, a.mean, a.sd, a.hit, a.held, a.contrib, a.meanTurn]).toEqual([4, 50, 0, 1, 4, 0.375, 1.25]); // 3 wins + a draw in 4 holdings
    expect(a.ci).toBeCloseTo(0.49, 10); // 1.96 x sqrt(0.25 / 4)
    expect([b.shots, b.mean, b.hit, b.held, b.contrib, b.meanTurn]).toEqual([4, 20, 0.5, 4, -0.375, 2]);
    expect([c.shots, c.held, c.contrib, c.verdict]).toEqual([0, 0, 0, "ok"]); // no data: no band verdict
    expect([d.dirt, d.shots, d.held, d.contrib, d.defensive, d.replyCut]).toEqual([true, 2, 2, -0.5, 1, 40]);
  });

  it("judges the tier bands and the +12% rule, and suggests a fix", () => {
    const [a, b, c, d] = aggregate(RECORDS, LITE, 2);
    expect([a.verdict, b.verdict, c.verdict, d.verdict]).toEqual(["HIGH+WR", "LOW", "ok", "ok"]);
    expect(a.suggestion).toBe("damage x 0.55 (to the band's middle, 27.5); reduce damage or spread: win-rate contribution +37.5% +- 49.0");
    expect(b.suggestion).toBe("structural: hit 50%, 40.0 points on a hit"); // a hit rate under 80%: the geometry, not the numbers
    expect(d.suggestion).toBe("1 defensive uses, estimated reply cut 40.0");
  });

  it("proposes powers (DIRT on the damaging weapons' least-squares line) and the pick rate they would give", () => {
    const rows = aggregate(RECORDS, LITE, 2);
    // the line through (0.375, 50), (-0.375, 20), (0, 0): slope 40, so d = 70/3 + 40 x (-0.5 - 0) = 3.33
    expect(rows.map((r) => r.power)).toEqual([50, 20, 1, 3]); // c: round(0) clamped to 1
    expect(rows.map((r) => r.pickRate)).toEqual([1, 1, 0, 0]); // the power draft takes a and b, the top 2 of every pool
    const shuffled = aggregate(RECORDS.slice().reverse(), LITE, 2);
    expect(shuffled).toEqual(rows); // the record order never matters
  });

  it("gates through the allow-list: FAIL, ACK and STALE ACK", () => {
    const j = judge(aggregate(RECORDS, LITE, 2), { b: "structural, owner tuning", c: "was failing" });
    expect([j.failing, j.acked, j.stale]).toEqual([["a"], ["b"], ["c"]]);
    const text = report(j, RECORDS, "T");
    expect(text).toContain("4 matches; player 0 won 2, the first shooter 2, draws 1; mean |margin| 27.5");
    expect(text).toContain("| a | 1 | 50.0 | 15-40 | 0.0 | 100 | 0.0 | +37.5 +- 49.0 | 1.3 | HIGH+WR | FAIL | 50 | 100 | damage x 0.55");
    expect(text).toContain("| b | 3 | 20.0 | 50-90 |");
    expect(text).toContain("| LOW | ACK | 20 | 100 | structural");
    expect(text).toContain("| d | 1 | - | WR only | - | - | 0.0 | -50.0 +- 69.3 | 2.5 | ok |  | 3 | 0 |");
    expect(text.endsWith("FAIL (1): a; ACK (1): b; STALE ACK: c")).toBe(true);
  });

  it("reports each tier's decision costs", () => {
    const mixed = RECORDS.map((r) => ({ ...r, tiers: ["rookie", "ace"] as MatchRecord["tiers"] }));
    mixed[0].shots[1] = { ...mixed[0].shots[1], sims: 3700, probes: 49900, ms: 9 };
    const c = costs(mixed);
    expect(c.map((t) => [t.tier, t.decisions, t.simsMax, t.probesMax, t.msMax])).toEqual([["rookie", 5, 10, 100, 1], ["ace", 6, 3700, 49900, 9]]);
    expect(costTable(c).split("\n")[3]).toBe("| ace | 6 | 625 / 3700 | 8400 / 49900 | 2.3 / 9.0 / 9.0 |");
  });
});

describe("the power write-back", () => {
  const src = readFileSync("src/game/titles/arcfire/weapons/roster.ts", "utf8");

  it("rewrites exactly one line per changed power, and is idempotent", () => {
    const w = writePowers(src, { pulse: 28, nova: 90 });
    expect(w.changed).toEqual(["pulse: 30 -> 28", "nova: 80 -> 90"]);
    const before = src.split("\n");
    const after = w.src.split("\n");
    expect(after.length).toBe(before.length);
    const diff = after.flatMap((l, i) => (l === before[i] ? [] : [l.trim()]));
    expect(diff).toEqual([
      'id: "pulse", name: "Pulse", tag: "BLAST", tier: 1, power: 28,',
      'id: "nova", name: "Nova", tag: "BLAST", tier: 3, power: 90,',
    ]);
    expect(writePowers(w.src, { pulse: 28, nova: 90 })).toEqual({ src: w.src, changed: [] });
    const same = writePowers(src, Object.fromEntries(ROSTER.map((d) => [d.id, d.power]))); // every id matches exactly once
    expect(same).toEqual({ src, changed: [] });
  });

  it("refuses a power outside 1..100, an unknown id and an ambiguous line, writing nothing", () => {
    for (const p of [0, 101, 2.5, Number.NaN]) expect(() => writePowers(src, { pulse: p })).toThrow(RangeError);
    expect(() => writePowers(src, { nosuch: 5 })).toThrow("power nosuch: 0 roster lines match, need exactly 1");
    const line = src.split("\n").find((l) => l.includes('id: "pulse"'))!;
    expect(() => writePowers(`${src}\n${line}`, { pulse: 28 })).toThrow("power pulse: 2 roster lines match, need exactly 1");
  });
});
