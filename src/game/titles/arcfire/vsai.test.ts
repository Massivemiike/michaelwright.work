// src/game/titles/arcfire/vsai.test.ts — vs-AI flow, human-only replay, search-free resume (SHORT_SETTINGS: fast)
import { describe, it, expect } from "vitest";
import { makeRng, nextRange } from "@/game/sim/math/rng";
import { applyTurn, createMatch, toAct } from "./match";
import { SHORT_SETTINGS, STANDARD_SETTINGS, cloneMatch } from "./state";
import { hashMatch } from "./hash";
import { AI, HUMAN, advanceAi, aiToAct, maxHumanCommands, replayVsAi, resumeVsAi } from "./vsai";
import { scoreVsAi } from "./verify";
import { playVsAi } from "@/game/test/arcfire/vsaiGolden";
import type { ArcfireCommand } from "./replay";
import type { MatchState } from "./state";
import { moveTarget } from "./tanks";
import { SUDDEN_DEATH_WEAPON } from "./constants";

const S = SHORT_SETTINGS;

/** A cheap scripted human (the goldens use the grid human): the lowest free slot, then its first weapon at 45, power 70; its second shot moves toward the enemy when legal. */
const quick = (m: MatchState): ArcfireCommand => {
  if (m.phase === "draft") return { k: "pick", w: m.poolOwner.findIndex((o) => o === -1) };
  const w = m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[HUMAN][0];
  const move = m.hands[HUMAN].length === S.weaponsEach - 1 && moveTarget(m, HUMAN, 1) !== -1 ? 1 : 0;
  return { k: "turn", move, w, angle: 45, power: 70 };
};

/**
 * A tie-seeking scripted human (the final review's): the lowest free slot; each battle shot, the command from angles
 * 20..80 step 10 and powers 30..100 step 10 over its hand that leaves |margin| smallest, and in sudden death the
 * one that leaves the margin largest (the first of equals, on cloneMatch copies).
 */
const tieSeeker = (m: MatchState): ArcfireCommand => {
  if (m.phase === "draft") return { k: "pick", w: m.poolOwner.findIndex((o) => o === -1) };
  const sudden = m.phase === "suddenDeath";
  let best: ArcfireCommand | null = null;
  let bestV = 0;
  for (const w of sudden ? [SUDDEN_DEATH_WEAPON] : m.hands[HUMAN]) {
    for (let angle = 20; angle <= 80; angle += 10) {
      for (let power = 30; power <= 100; power += 10) {
        const c = cloneMatch(m);
        if (!applyTurn(c, { move: 0, w, angle, power }).ok) continue;
        const margin = c.scores[HUMAN] - c.scores[AI];
        const v = sudden ? margin : 0 - Math.abs(margin);
        if (best === null || v > bestV) {
          best = { k: "turn", move: 0, w, angle, power };
          bestV = v;
        }
      }
    }
  }
  return best!;
};

describe("vs-AI flow", () => {
  it("the AI acts after createMatch and after every human command, twice at the draft's end when the human picked first", () => {
    let aiFirst = -1;
    let humanFirst = -1;
    for (let seed = 1; aiFirst < 0 || humanFirst < 0; seed++) {
      if (createMatch(seed, S).firstPicker === AI) aiFirst = seed;
      else humanFirst = seed;
    }
    const a = createMatch(aiFirst, S);
    expect(advanceAi(a, "rookie").map((x) => x.k)).toEqual(["pick"]);
    expect(toAct(a)).toBe(HUMAN);
    const h = createMatch(humanFirst, S);
    expect(advanceAi(h, "rookie")).toEqual([]);
    const live = playVsAi(humanFirst, S, "rookie", quick);
    const lastPick = live.log.map((c) => c.k).lastIndexOf("pick");
    expect(live.log[lastPick - 1]).toBe(live.commands[S.weaponsEach - 1]); // the human's last pick ...
    expect(live.log[lastPick].k).toBe("pick"); // ... then the AI's last pick ...
    expect(live.log[lastPick + 1].k).toBe("turn"); // ... then the AI's opening shot
  }, 60_000);

  it("replays the human's commands alone to the live match, and resumes every prefix without a search", () => {
    for (const seed of [3, 4, 5]) {
      for (const tier of ["rookie", "veteran"] as const) {
        const live = playVsAi(seed, S, tier, quick);
        const r = replayVsAi({ seed, settings: S, tier, commands: live.commands });
        expect(r.ok && r.hash).toBe(hashMatch(live.state));
        expect(live.commands.length).toBeLessThanOrEqual(maxHumanCommands(S));
        if (seed !== 3 || tier !== "rookie") continue; // every prefix (Veteran: the bundled golden test resumes its full log)
        for (let k = 0; k <= live.log.length; k++) {
          const res = resumeVsAi({ seed, settings: S, log: live.log.slice(0, k) });
          expect(res.ok && res.droppedFrom).toBe(-1);
          if (!res.ok) return;
          expect(res.log).toEqual(live.log.slice(0, k));
          advanceAi(res.state, tier); // a host continues the AI after a resume
          const rr = replayVsAi({ seed, settings: S, tier, commands: res.humanLog });
          expect(rr.ok && rr.hash, `prefix ${k}`).toBe(hashMatch(res.state));
        }
      }
    }
  }, 120_000); // unbundled: about 8 s on the dev machine, so vitest's 5 s default would fail it

  it("resume drops a bad entry and everything after it, and never throws", () => {
    const live = playVsAi(4, S, "rookie", quick);
    const bad = live.log.slice();
    bad[7] = { k: "pick", w: 99 };
    const r = resumeVsAi({ seed: 4, settings: S, log: bad });
    expect(r.ok && r.droppedFrom).toBe(7);
    if (r.ok) expect(r.log).toEqual(live.log.slice(0, 7));
    expect(resumeVsAi({ seed: 4, settings: S, log: "nope" })).toEqual({ ok: false });
    expect(resumeVsAi({ seed: 4, settings: S, log: [null, 3] })).toMatchObject({ ok: true, droppedFrom: 0, log: [], humanLog: [] });
  }, 60_000);

  it("resume drops an illegal AI entry (a pick, then a turn) and restores the RNG draws it advanced", () => {
    const live = playVsAi(4, S, "rookie", quick);
    /** The first log index where the AI is to act in `phase`. */
    const firstAi = (phase: MatchState["phase"]): number => live.log.findIndex((_, i) => {
      const r = resumeVsAi({ seed: 4, settings: S, log: live.log.slice(0, i) });
      return r.ok && aiToAct(r.state) && r.state.phase === phase;
    });
    const cases: [number, ArcfireCommand][] = [
      [firstAi("draft"), { k: "pick", w: 99 }],
      [firstAi("battle"), { k: "turn", move: 0, w: 0, angle: 181, power: 50 }],
    ];
    for (const [i, illegal] of cases) {
      expect(i).toBeGreaterThanOrEqual(0);
      const bad = live.log.slice();
      bad[i] = illegal;
      const r = resumeVsAi({ seed: 4, settings: S, log: bad });
      const clean = resumeVsAi({ seed: 4, settings: S, log: live.log.slice(0, i) });
      expect(r).toMatchObject({ ok: true, droppedFrom: i, log: live.log.slice(0, i) });
      if (!r.ok || !clean.ok) return;
      expect(hashMatch(r.state), `the state and its RNG after dropping entry ${i}`).toBe(hashMatch(clean.state));
    }
  }, 60_000);

  it("rejects a bad human log at the right index", () => {
    const live = playVsAi(5, S, "rookie", quick);
    const cmds = live.commands;
    const at = (commands: unknown): unknown => {
      const r = replayVsAi({ seed: 5, settings: S, tier: "rookie", commands });
      return r.ok ? "ok" : `${r.reason}@${r.atIndex}`;
    };
    expect(at(cmds)).toBe("ok");
    expect(at([...cmds, cmds[cmds.length - 1]])).toBe(cmds.length === maxHumanCommands(S) ? `too_long@${maxHumanCommands(S)}` : `invalid_command@${cmds.length}`);
    const turnAt = cmds.findIndex((c) => c.k === "turn");
    const turn = cmds[turnAt] as Extract<ArcfireCommand, { k: "turn" }>;
    expect(at(cmds.map((c, i) => (i === turnAt ? { ...turn, angle: 181 } : c)))).toBe(`invalid_command@${turnAt}`);
    const aiWeapon = live.state.pool[live.state.poolOwner.indexOf(AI)]; // drafted by the AI: never in the human's hand
    expect(at(cmds.map((c, i) => (i === turnAt ? { ...turn, w: aiWeapon } : c)))).toBe(`invalid_command@${turnAt}`);
    expect(at([null])).toBe("invalid_command@0");
    expect(at([{ k: "x" }])).toBe("invalid_command@0");
    expect(at("nope")).toBe("invalid_command@0");
    expect(at(new Array(maxHumanCommands(S) + 1).fill(cmds[0]))).toBe(`too_long@${maxHumanCommands(S)}`);
  }, 60_000);

  it("never throws on 300 random logs", () => {
    const rng = makeRng(20260924);
    for (let n = 0; n < 300; n++) {
      const cmds: unknown[] = [];
      const len = nextRange(rng, 14);
      for (let i = 0; i < len; i++) {
        const k = nextRange(rng, 5);
        cmds.push(k === 0 ? { k: "pick", w: nextRange(rng, 14) - 1 } : k === 1 ? { k: "turn", move: nextRange(rng, 3) - 1, w: nextRange(rng, 33), angle: nextRange(rng, 200) - 10, power: nextRange(rng, 120) - 10 } : k === 2 ? null : k === 3 ? { k: "pick", w: 0.5 } : "x");
      }
      const r = replayVsAi({ seed: n, settings: S, tier: "rookie", commands: cmds });
      expect(r.ok || r.reason === "invalid_command" || r.reason === "too_long").toBe(true);
    }
  }, 60_000);

  it("allows 2 x weaponsEach + 1 human commands (21 in the daily)", () => {
    expect(maxHumanCommands(STANDARD_SETTINGS)).toBe(21);
  });

  it("plays a vs-AI match into sudden death: its replay, every resume prefix, its score and the length cap", () => {
    const seed = 18; // SHORT_SETTINGS vs Rookie: the tie-seeker ties the battle, then wins sudden death
    const live = playVsAi(seed, S, "rookie", tieSeeker);
    expect(live.state.shotsFired, "the match went into sudden death").toBe(2 * S.weaponsEach + 2);
    expect(live.commands.length).toBe(maxHumanCommands(S));
    const r = replayVsAi({ seed, settings: S, tier: "rookie", commands: live.commands });
    expect(r.ok && r.hash).toBe(hashMatch(live.state));
    for (let k = 0; k <= live.log.length; k++) {
      const res = resumeVsAi({ seed, settings: S, log: live.log.slice(0, k) });
      expect(res.ok && res.droppedFrom).toBe(-1);
      if (!res.ok) return;
      advanceAi(res.state, "rookie");
      const rr = replayVsAi({ seed, settings: S, tier: "rookie", commands: res.humanLog });
      expect(rr.ok && rr.hash, `prefix ${k}`).toBe(hashMatch(res.state));
    }
    const [hp, ap] = [live.state.scores[HUMAN], live.state.scores[AI]];
    expect(live.state.winner).toBe(HUMAN);
    expect(scoreVsAi(seed, live.commands, S, "rookie")).toEqual({ score: hp - ap, stat: hp, hash: hashMatch(live.state) });
    const extra = [...live.commands, live.commands[live.commands.length - 1]];
    expect(scoreVsAi(seed, extra, S, "rookie")).toEqual({ rejected: "too_long" });
    expect(replayVsAi({ seed, settings: S, tier: "rookie", commands: extra })).toEqual({ ok: false, reason: "too_long", atIndex: maxHumanCommands(S) });
  }, 60_000);
});
