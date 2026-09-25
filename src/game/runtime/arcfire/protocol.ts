// src/game/runtime/arcfire/protocol.ts
//
// The message protocol between the main thread (rendering, HUD, input,
// localStorage) and the Arcfire worker (sim + AI), spec §1.4. Type-only.
// Every message is structured-clone safe (plain objects, arrays, Int32Arrays);
// a snapshot's and a timeline's heights are fresh copies the host transfers.
// Every request carries an `id`; every event it causes echoes that id, in
// order. `seq` is an applied action's index in the match log (0, 1, 2, ...),
// so the UI can queue and play actions in order.
import type { MatchSettings, Phase } from "@/game/titles/arcfire/state";
import type { TurnCommand } from "@/game/titles/arcfire/match";
import type { ArcfireCommand } from "@/game/titles/arcfire/replay";
import type { Timeline } from "@/game/titles/arcfire/timeline";
import type { AiTier } from "@/game/titles/arcfire/ai/tiers";
import type { AiStats } from "@/game/titles/arcfire/ai/search";

/** vs-AI (the human is player 0) or "local" pass-and-play (both seats send commands; no AI). */
export type Opponent = AiTier | "local";

export type HostRequest =
  | { t: "start"; id: number; seed: number; settings: MatchSettings; opponent: Opponent; log?: readonly ArcfireCommand[] } // log: a resume blob's full log, both seats in order
  | { t: "pick"; id: number; poolIndex: number }
  | { t: "turn"; id: number; cmd: TurnCommand }
  | { t: "preview"; id: number; weapon: number; angle: number; power: number }; // the draft panel's looping preview

/** What the HUD and renderer need between timelines. */
export interface Snapshot {
  phase: Phase;
  toAct: number; // the seat whose command is awaited: 0 or 1, or -1 when over
  shooter: number;
  firstPicker: number;
  picksMade: number;
  shotsFired: number;
  pool: number[];
  poolOwner: number[];
  hands: [number[], number[]];
  scores: [number, number];
  tankX: [number, number];
  movesLeft: [number, number];
  wind: number;
  winner: number;
  heights: Int32Array; // the settled surface per column (a fresh copy, transferred)
  hash: string; // hashMatch: desync checks now, online play later
}

export type HostEvent =
  | { t: "state"; id: number; seq: number; snap: Snapshot; log: ArcfireCommand[]; humanLog: ArcfireCommand[]; droppedFrom: number } // after start/resume: log = the resume blob, humanLog = the daily submission
  | { t: "picked"; id: number; seq: number; by: number; poolIndex: number; snap: Snapshot }
  | { t: "shot"; id: number; seq: number; by: number; cmd: TurnCommand; timeline: Timeline; snap: Snapshot; ai: AiStats | null }
  | { t: "thinking"; id: number; by: number } // an AI turn's search starts now (the human's own event is already posted)
  | { t: "rejected"; id: number; reason: "invalid_command" | "not_your_move" | "no_match" | "bad_log" }
  | { t: "preview"; id: number; timeline: Timeline }
  | { t: "error"; id: number; message: string }; // a bug report path: the AI's commands are legal by construction
