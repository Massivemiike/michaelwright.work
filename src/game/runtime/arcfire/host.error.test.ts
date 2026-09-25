// src/game/runtime/arcfire/host.error.test.ts — a throw while a save is re-applied is a bug: `error`, never bad_log
import { describe, it, expect, vi } from "vitest";
import { SHORT_SETTINGS } from "@/game/titles/arcfire/state";
import { resumeVsAi } from "@/game/titles/arcfire/vsai";
import { applyCommand } from "@/game/titles/arcfire/replay";
import { createArcfireHost } from "./host";
import type { HostEvent, HostRequest } from "./protocol";

// the real functions, wrapped so that one call can be made to throw (a simulated sim bug)
vi.mock("@/game/titles/arcfire/vsai", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/game/titles/arcfire/vsai")>();
  return { ...real, resumeVsAi: vi.fn(real.resumeVsAi) };
});
vi.mock("@/game/titles/arcfire/replay", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/game/titles/arcfire/replay")>();
  return { ...real, applyCommand: vi.fn(real.applyCommand) };
});

function harness(): (req: HostRequest) => HostEvent[] {
  const events: HostEvent[] = [];
  const host = createArcfireHost((ev) => events.push(ev));
  return (req) => {
    const from = events.length;
    host.receive(req);
    return events.slice(from);
  };
}

const bug = (): never => {
  throw new Error("simulated sim bug");
};

/** The first free pool slot after these events (the last snapshot: the AI may have picked after the state). */
const freeSlot = (out: HostEvent[]): number =>
  ([...out].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>).snap.poolOwner.findIndex((o) => o === -1);

describe("the Arcfire host's start", () => {
  it("posts error when re-applying a vs-AI save throws, and keeps the current match and its opponent", () => {
    const send = harness();
    const w = freeSlot(send({ t: "start", id: 1, seed: 9, settings: SHORT_SETTINGS, opponent: "local" }));
    vi.mocked(resumeVsAi).mockImplementationOnce(bug);
    expect(send({ t: "start", id: 2, seed: 7, settings: SHORT_SETTINGS, opponent: "rookie", log: [] })).toEqual([
      { t: "error", id: 2, message: "simulated sim bug" },
    ]);
    const ref = harness(); // the same pass-and-play match, never disturbed
    ref({ t: "start", id: 1, seed: 9, settings: SHORT_SETTINGS, opponent: "local" });
    const out = send({ t: "pick", id: 3, poolIndex: w });
    expect(out.map((e) => e.t)).toEqual(["picked"]); // no AI answers: still pass-and-play
    expect(out).toEqual(ref({ t: "pick", id: 3, poolIndex: w }));
  });

  it("posts error when re-applying a pass-and-play save throws, and keeps the current match and its opponent", () => {
    const send = harness();
    const started = send({ t: "start", id: 1, seed: 7, settings: SHORT_SETTINGS, opponent: "rookie" });
    const w = freeSlot(started);
    vi.mocked(applyCommand).mockImplementationOnce(bug);
    expect(send({ t: "start", id: 2, seed: 9, settings: SHORT_SETTINGS, opponent: "local", log: [{ k: "pick", w: 0 }] })).toEqual([
      { t: "error", id: 2, message: "simulated sim bug" },
    ]);
    const ref = harness(); // the same Rookie match, never disturbed
    expect(ref({ t: "start", id: 1, seed: 7, settings: SHORT_SETTINGS, opponent: "rookie" })).toEqual(started);
    const out = send({ t: "pick", id: 3, poolIndex: w });
    expect(out.map((e) => e.t)).toEqual(["picked", "picked"]); // still against Rookie: the AI picks back
    expect(out).toEqual(ref({ t: "pick", id: 3, poolIndex: w }));
  });
});
