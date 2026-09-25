// src/game/runtime/arcfire/host.ts
//
// The Arcfire worker's brain as a pure module: it owns one match and its log,
// applies the local player's commands, runs the AI whenever it is the AI's
// move, and reports every action through `post`. No `self`, no clock, no DOM:
// Node tests drive it directly, and worker.ts binds it to postMessage.
// Runtime code (outside the purity roots) that never decides anything: every
// decision comes from vsai.ts and ai/**, so the worker can't make a replay
// diverge. A human command's event is posted BEFORE the AI starts, so the
// AI's search overlaps the human shot's playback on the main thread.
import { createMatch, toAct, type TurnCommand } from "@/game/titles/arcfire/match";
import { applyCommand, type ArcfireCommand } from "@/game/titles/arcfire/replay";
import { hashMatch } from "@/game/titles/arcfire/hash";
import { resolveTurn } from "@/game/titles/arcfire/resolve";
import { spansFromHeight } from "@/game/titles/arcfire/terrain";
import { ROSTER } from "@/game/titles/arcfire/weapons/roster";
import { SHORT_SETTINGS, type MatchState } from "@/game/titles/arcfire/state";
import { AI, HUMAN, aiToAct, resumeVsAi, stepAi } from "@/game/titles/arcfire/vsai";
import type { Timeline } from "@/game/titles/arcfire/timeline";
import type { AiStats } from "@/game/titles/arcfire/ai/search";
import type { HostEvent, HostRequest, Opponent, Snapshot } from "./protocol";

export type Post = (ev: HostEvent, transfer: Transferable[]) => void;

export function snapshot(m: MatchState): Snapshot {
  return {
    phase: m.phase, toAct: toAct(m), shooter: m.shooter, firstPicker: m.firstPicker, picksMade: m.picksMade, shotsFired: m.shotsFired,
    pool: m.pool.slice(), poolOwner: Array.from(m.poolOwner), hands: [m.hands[0].slice(), m.hands[1].slice()],
    scores: [m.scores[0], m.scores[1]], tankX: [m.tankX[0], m.tankX[1]], movesLeft: [m.movesLeft[0], m.movesLeft[1]],
    wind: m.wind, winner: m.winner, heights: m.terrain.height.slice(), hash: hashMatch(m),
  };
}

const isInt = (v: unknown, lo: number, hi: number): boolean => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const OPPONENTS: readonly unknown[] = ["rookie", "veteran", "ace", "local"];

/** The draft panel's preview board: flat ground at y = 400, tanks at 300 / 700, player 0 to shoot, no wind. */
function previewBoard(): MatchState {
  const p = createMatch(1, SHORT_SETTINGS);
  p.phase = "battle";
  p.terrain.height.fill(400);
  spansFromHeight(p.terrain);
  p.tankX[0] = 300;
  p.tankX[1] = 700;
  p.shooter = 0;
  return p;
}

export function createArcfireHost(post: Post): { receive(req: HostRequest): void } {
  let m: MatchState | null = null;
  let opponent: Opponent = "local";
  let log: ArcfireCommand[] = []; // every command in order, both seats: the resume blob
  let humanLog: ArcfireCommand[] = []; // the human's only (vs-AI): the daily submission

  const vsAi = (): boolean => opponent !== "local";

  /** Post one applied action (the log already holds it). */
  function applied(id: number, by: number, c: ArcfireCommand, timeline: Timeline | null, ai: AiStats | null): void {
    const snap = snapshot(m!);
    const seq = log.length - 1;
    if (c.k === "pick") post({ t: "picked", id, seq, by, poolIndex: c.w, snap }, [snap.heights.buffer]);
    else if (timeline !== null) post({ t: "shot", id, seq, by, cmd: { move: c.move, w: c.w, angle: c.angle, power: c.power }, timeline, snap, ai }, [snap.heights.buffer, timeline.settle.heights.buffer]);
  }

  /** Run the AI until it is not its move, reporting each action under request `id`. */
  function runAi(id: number): void {
    while (m !== null && opponent !== "local" && aiToAct(m)) {
      if (m.phase !== "draft") post({ t: "thinking", id, by: AI }, []);
      const a = stepAi(m, opponent);
      if (a === null) return;
      const c: ArcfireCommand = a.k === "pick" ? { k: "pick", w: a.w } : { k: "turn", ...a.cmd };
      log.push(c);
      applied(id, AI, c, a.k === "turn" ? a.timeline : null, a.k === "turn" ? a.plan.stats : null);
    }
  }

  function start(req: Extract<HostRequest, { t: "start" }>): void {
    const saved: unknown = req.log ?? [];
    // build the new match first: a start that fails leaves the current match and its opponent as they were
    let next: MatchState | null = null;
    let nextLog: ArcfireCommand[] = [];
    let nextHuman: ArcfireCommand[] = [];
    let droppedFrom = -1;
    if (Array.isArray(saved) && OPPONENTS.includes(req.opponent)) {
      try {
        if (req.opponent !== "local") {
          const r = resumeVsAi({ seed: req.seed, settings: req.settings, log: saved });
          if (r.ok) {
            next = r.state;
            nextLog = r.log;
            nextHuman = r.humanLog;
            droppedFrom = r.droppedFrom;
          }
        } else { // pass-and-play: the valid prefix of a plain 2-player log
          const p = createMatch(req.seed, req.settings);
          for (let i = 0; i < saved.length; i++) {
            if (!applyCommand(p, saved[i]).ok) { droppedFrom = i; break; }
            nextLog.push(saved[i] as ArcfireCommand);
          }
          next = p;
        }
      } catch {
        next = null; // createMatch rejected the settings: a damaged blob like any other
      }
    }
    if (next === null) { // a log that is not an array, an unknown opponent, or settings createMatch rejects
      post({ t: "rejected", id: req.id, reason: "bad_log" }, []);
      return;
    }
    opponent = req.opponent;
    m = next;
    log = nextLog;
    humanLog = nextHuman;
    const snap = snapshot(m);
    post({ t: "state", id: req.id, seq: log.length, snap, log: log.slice(), humanLog: humanLog.slice(), droppedFrom }, [snap.heights.buffer]);
    runAi(req.id); // the AI's opening pick, or the reply a save was taken before
  }

  function preview(req: Extract<HostRequest, { t: "preview" }>): void {
    if (!isInt(req.weapon, 0, ROSTER.length - 1) || !isInt(req.angle, 0, 180) || !isInt(req.power, 0, 100)) {
      post({ t: "rejected", id: req.id, reason: "invalid_command" }, []);
      return;
    }
    const timeline = resolveTurn(previewBoard(), { move: 0, weapon: req.weapon, angle: req.angle, power: req.power });
    post({ t: "preview", id: req.id, timeline }, [timeline.settle.heights.buffer]);
  }

  function command(req: Extract<HostRequest, { t: "pick" | "turn" }>): void {
    if (m === null) { post({ t: "rejected", id: req.id, reason: "no_match" }, []); return; }
    const by = toAct(m);
    if (by === -1 || (vsAi() && by !== HUMAN)) { post({ t: "rejected", id: req.id, reason: "not_your_move" }, []); return; }
    // a fresh plain entry (the log never aliases a request), applied by applyCommand, which never throws:
    // a malformed request (a null cmd, a string angle) is invalid_command, never an error event
    const cmd: Partial<TurnCommand> = req.t === "turn" && typeof req.cmd === "object" && req.cmd !== null ? req.cmd : {};
    const c = (req.t === "pick"
      ? { k: "pick", w: req.poolIndex }
      : { k: "turn", move: cmd.move, w: cmd.w, angle: cmd.angle, power: cmd.power }) as ArcfireCommand;
    const r = applyCommand(m, c);
    if (!r.ok) { post({ t: "rejected", id: req.id, reason: "invalid_command" }, []); return; }
    log.push(c);
    if (vsAi()) humanLog.push(c);
    applied(req.id, by, c, r.timeline, null);
    runAi(req.id); // starts at once: the search overlaps the human shot's playback
  }

  return {
    receive(req: HostRequest): void {
      try {
        if (req.t === "start") start(req);
        else if (req.t === "preview") preview(req);
        else command(req);
      } catch (e) {
        post({ t: "error", id: req.id, message: e instanceof Error ? e.message : String(e) }, []);
      }
    },
  };
}
