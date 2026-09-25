// src/game/runtime/arcfire/host.test.ts — the worker's host and client, driven in Node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SHORT_SETTINGS, STANDARD_SETTINGS } from "@/game/titles/arcfire/state";
import { replayVsAi } from "@/game/titles/arcfire/vsai";
import type { ArcfireCommand } from "@/game/titles/arcfire/replay";
import { createArcfireHost } from "./host";
import { ArcfireWorkerClient, type WorkerLike } from "./client";
import type { HostEvent, HostRequest } from "./protocol";

function harness(): { events: HostEvent[]; send: (req: HostRequest) => HostEvent[] } {
  const events: HostEvent[] = [];
  const host = createArcfireHost((ev) => events.push(ev));
  return {
    events,
    send(req) {
      const from = events.length;
      host.receive(req);
      return events.slice(from);
    },
  };
}

/** Send the human's commands; returns every event. */
function drive(h: ReturnType<typeof harness>, commands: ArcfireCommand[]): void {
  let id = 10;
  for (const c of commands) {
    const out = c.k === "pick" ? h.send({ t: "pick", id: id++, poolIndex: c.w }) : h.send({ t: "turn", id: id++, cmd: { move: c.move, w: c.w, angle: c.angle, power: c.power } });
    expect(out[0].t === "picked" || out[0].t === "shot", JSON.stringify(out[0])).toBe(true);
    expect((out[0] as { by: number }).by).toBe(0); // the human's own event first, before the AI thinks
    for (let i = 1; i < out.length; i++) {
      const e = out[i];
      if (e.t === "thinking") expect(out[i + 1]).toMatchObject({ t: "shot", by: 1 });
      else expect(e).toMatchObject({ by: 1 });
    }
  }
}

describe("the Arcfire host", () => {
  it("plays the vs-AI win golden to its hash, and resumes it mid-draft, mid-battle and finished", () => {
    const g = JSON.parse(readFileSync("src/game/titles/arcfire/determinism.vsai.golden.json", "utf8")).win;
    const h = harness();
    h.send({ t: "start", id: 1, seed: g.seed, settings: STANDARD_SETTINGS, opponent: "veteran" });
    drive(h, g.commands);
    const last = [...h.events].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
    expect(last.snap.hash).toBe(g.hash);
    expect(last.snap.phase).toBe("over");
    expect(h.send({ t: "pick", id: 99, poolIndex: 0 })).toEqual([{ t: "rejected", id: 99, reason: "not_your_move" }]); // over: nobody's move
    const log = h.events.flatMap((e): ArcfireCommand[] => (e.t === "picked" ? [{ k: "pick", w: e.poolIndex }] : e.t === "shot" ? [{ k: "turn", ...e.cmd }] : []));
    expect(log.map((_, i) => i)).toEqual(h.events.flatMap((e) => (e.t === "picked" || e.t === "shot" ? [e.seq] : []))); // seq = the log index
    for (const k of [13, 30, log.length]) { // mid-draft, mid-battle, finished
      const r = harness();
      const out = r.send({ t: "start", id: 1, seed: g.seed, settings: STANDARD_SETTINGS, opponent: "veteran", log: log.slice(0, k) });
      expect(out[0]).toMatchObject({ t: "state", droppedFrom: -1, seq: k });
      const human = (out[0] as Extract<HostEvent, { t: "state" }>).humanLog;
      drive(r, g.commands.slice(human.length));
      const end = [...r.events].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
      expect(end.snap.hash, `resumed after ${k}`).toBe(g.hash);
    }
  }, 120000);

  it("rejects what it must, and never lets a request change a match it refuses", () => {
    const h = harness();
    expect(h.send({ t: "pick", id: 1, poolIndex: 0 })).toEqual([{ t: "rejected", id: 1, reason: "no_match" }]);
    expect(h.send({ t: "start", id: 2, seed: 7, settings: SHORT_SETTINGS, opponent: "rookie", log: "x" as never })).toEqual([{ t: "rejected", id: 2, reason: "bad_log" }]);
    const started = h.send({ t: "start", id: 3, seed: 7, settings: SHORT_SETTINGS, opponent: "rookie" });
    const snap = (started[0] as Extract<HostEvent, { t: "state" }>).snap;
    const hash = [...h.events].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
    expect(h.send({ t: "turn", id: 4, cmd: { move: 0, w: 0, angle: 45, power: 50 } })).toEqual([{ t: "rejected", id: 4, reason: "invalid_command" }]); // a turn in the draft
    expect(h.send({ t: "pick", id: 5, poolIndex: 99 })).toEqual([{ t: "rejected", id: 5, reason: "invalid_command" }]);
    expect(h.send({ t: "preview", id: 6, weapon: 99, angle: 45, power: 50 })).toEqual([{ t: "rejected", id: 6, reason: "invalid_command" }]);
    const pv = h.send({ t: "preview", id: 7, weapon: 1, angle: 45, power: 60 });
    expect(pv[0].t === "preview" && pv[0].timeline.events.some((e) => e.kind === "blast")).toBe(true);
    for (const bad of [
      { settings: { ...SHORT_SETTINGS, weaponsEach: 0 }, opponent: "local" }, { settings: null, opponent: "rookie" }, { settings: SHORT_SETTINGS, opponent: "boss" },
      { settings: SHORT_SETTINGS, opponent: "rookie", log: null }, { settings: SHORT_SETTINGS, opponent: "local", log: null }, // present, but not an array
      { seed: undefined, settings: SHORT_SETTINGS, opponent: "rookie" }, { seed: 1.5, settings: SHORT_SETTINGS, opponent: "local" },
      { seed: "7", settings: SHORT_SETTINGS, opponent: "rookie" }, // a seed that is not an integer
    ]) {
      expect(h.send({ t: "start", id: 8, seed: 7, ...bad } as never), JSON.stringify(bad)).toEqual([{ t: "rejected", id: 8, reason: "bad_log" }]); // a damaged blob
    }
    expect(([...h.events].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>).snap.hash).toBe(hash.snap.hash); // untouched
    expect(snap.phase).toBe("draft");
    const free = hash.snap.poolOwner.findIndex((o) => o === -1);
    expect(h.send({ t: "pick", id: 9, poolIndex: free }).map((e) => e.t)).toEqual(["picked", "picked"]); // still against Rookie: the AI picks back
  }, 60_000);

  it("plays pass-and-play without the AI, and resumes it as a plain 2-player log", () => {
    const h = harness();
    h.send({ t: "start", id: 1, seed: 9, settings: SHORT_SETTINGS, opponent: "local" });
    const cmds: ArcfireCommand[] = [];
    for (let i = 0; i < 2 * SHORT_SETTINGS.weaponsEach; i++) {
      const last = [...h.events].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
      const w = last.snap.poolOwner.findIndex((o) => o === -1);
      expect(h.send({ t: "pick", id: 2 + i, poolIndex: w })[0]).toMatchObject({ t: "picked", by: last.snap.toAct });
      cmds.push({ k: "pick", w });
    }
    expect(h.events.some((e) => e.t === "thinking" || ("by" in e && e.t !== "picked"))).toBe(false);
    for (const cmd of [null, undefined, "x", { move: 0, w: 0, angle: "45", power: 50 }]) { // malformed in battle: rejected, never an error
      expect(h.send({ t: "turn", id: 90, cmd: cmd as never })).toEqual([{ t: "rejected", id: 90, reason: "invalid_command" }]);
    }
    expect(h.send({ t: "pick", id: 91, poolIndex: "3" as never })).toEqual([{ t: "rejected", id: 91, reason: "invalid_command" }]);
    const r = harness();
    const out = r.send({ t: "start", id: 1, seed: 9, settings: SHORT_SETTINGS, opponent: "local", log: cmds });
    expect(out.length).toBe(1);
    expect((out[0] as Extract<HostEvent, { t: "state" }>).snap.phase).toBe("battle");
  }, 60_000);
});

describe("ArcfireWorkerClient", () => {
  it("round-trips a short match against Rookie through a fake worker, with increasing ids", () => {
    let terminated = false;
    const fake: WorkerLike = { onmessage: null, onerror: null, terminate: () => { terminated = true; }, postMessage: () => undefined };
    const host = createArcfireHost((ev) => fake.onmessage!({ data: ev }));
    fake.postMessage = (req) => host.receive(req);
    const client = new ArcfireWorkerClient(() => fake);
    const seen: HostEvent[] = [];
    client.on((ev) => seen.push(ev));
    const ids = [client.start(21, SHORT_SETTINGS, "rookie")];
    const commands: ArcfireCommand[] = [];
    for (let guard = 0; guard < 40; guard++) {
      const last = [...seen].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
      if (last.snap.phase === "over") break;
      if (last.snap.phase === "draft") {
        const w = last.snap.poolOwner.findIndex((o) => o === -1);
        ids.push(client.pick(w));
        commands.push({ k: "pick", w });
      } else {
        const w = last.snap.phase === "suddenDeath" ? 0 : last.snap.hands[0][0];
        ids.push(client.turn({ move: 0, w, angle: 45, power: 70 }));
        commands.push({ k: "turn", move: 0, w, angle: 45, power: 70 });
      }
    }
    expect(ids).toEqual(ids.map((_, i) => i + 1));
    const end = [...seen].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
    expect(end.snap.phase).toBe("over");
    const r = replayVsAi({ seed: 21, settings: SHORT_SETTINGS, tier: "rookie", commands });
    expect(r.ok && r.hash).toBe(end.snap.hash);
    client.dispose();
    expect(terminated).toBe(true);
  }, 60_000);
});
