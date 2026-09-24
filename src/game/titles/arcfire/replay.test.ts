import { describe, it, expect } from "vitest";
import { createMatch, applyPick, applyTurn } from "./match";
import { replayMatch, type ArcfireCommand } from "./replay";
import { hashMatch } from "./hash";
import type { MatchSettings } from "./state";
import { SUDDEN_DEATH_WEAPON } from "./constants";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: true, guaranteeTags: [] };

/** Play a whole match with a fixed strategy, recording the command log. */
function play(seed: number) {
  const m = createMatch(seed, SMALL);
  const log: ArcfireCommand[] = [];
  while (m.phase === "draft") {
    const w = m.poolOwner.findIndex((o) => o === -1);
    applyPick(m, w);
    log.push({ k: "pick", w });
  }
  while (m.phase !== "over") {
    const p = m.shooter;
    const cmd = {
      move: 0 as const,
      w: m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[p][0],
      angle: p === 0 ? 50 : 130,
      power: 65,
    };
    applyTurn(m, cmd);
    log.push({ k: "turn", ...cmd });
  }
  return { m, log };
}

describe("replayMatch", () => {
  it("reproduces a live match's final hash from its log", () => {
    const { m, log } = play(77);
    const r = replayMatch({ seed: 77, settings: SMALL, commands: log });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hash).toBe(hashMatch(m));
  });
  it("rejects a log with an illegal command and reports where", () => {
    const { log } = play(77);
    const bad = [...log];
    bad[3] = { k: "pick", w: 99 };
    expect(replayMatch({ seed: 77, settings: SMALL, commands: bad })).toEqual({
      ok: false, reason: "invalid_command", atIndex: 3,
    });
  });
  it("rejects a turn issued during the draft", () => {
    expect(
      replayMatch({ seed: 1, settings: SMALL, commands: [{ k: "turn", move: 0, w: 0, angle: 45, power: 50 }] })
    ).toEqual({ ok: false, reason: "invalid_command", atIndex: 0 });
  });
  it("rejects a turn after the match is over", () => {
    const { log } = play(77);
    const extra: ArcfireCommand = { k: "turn", move: 0, w: SUDDEN_DEATH_WEAPON, angle: 45, power: 50 };
    expect(replayMatch({ seed: 77, settings: SMALL, commands: [...log, extra] })).toEqual({
      ok: false, reason: "invalid_command", atIndex: log.length,
    });
  });
  it("accepts an unfinished log (resume re-simulates one, spec §6.5)", () => {
    const { log } = play(77);
    const picks = log.filter((c) => c.k === "pick");
    for (const partial of [picks, log.slice(0, picks.length + 2)]) {
      const r = replayMatch({ seed: 77, settings: SMALL, commands: partial });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.state.phase).not.toBe("over");
    }
  });
});

describe("replayMatch on a malformed log", () => {
  const bad = (commands: unknown) => replayMatch({ seed: 1, settings: SMALL, commands: commands as ArcfireCommand[] });

  it("rejects an unknown command kind", () => {
    expect(bad([{ k: "pick", w: 0 }, { k: "PICK", w: 1 }])).toEqual({ ok: false, reason: "invalid_command", atIndex: 1 });
  });
  it("rejects a null or non-object entry instead of throwing", () => {
    expect(bad([{ k: "pick", w: 0 }, { k: "pick", w: 1 }, null])).toEqual({ ok: false, reason: "invalid_command", atIndex: 2 });
    expect(bad([7])).toEqual({ ok: false, reason: "invalid_command", atIndex: 0 });
  });
  it("rejects commands that aren't an array", () => {
    expect(bad({ k: "pick", w: 0 })).toEqual({ ok: false, reason: "invalid_command", atIndex: 0 });
    expect(bad(null)).toEqual({ ok: false, reason: "invalid_command", atIndex: 0 });
  });
});
