// src/game/runtime/arcfire/client.test.ts — the worker client's event plumbing and its disposal, on a fake worker
import { describe, it, expect, vi, afterEach } from "vitest";
import { SHORT_SETTINGS } from "@/game/titles/arcfire/state";
import { ArcfireWorkerClient, type WorkerLike } from "./client";
import type { HostEvent, HostRequest } from "./protocol";

type FakeWorker = WorkerLike & { posted: HostRequest[]; terminated: number };

function fakeWorker(): FakeWorker {
  const w: FakeWorker = {
    posted: [],
    terminated: 0,
    onmessage: null,
    onerror: null,
    postMessage: (req) => {
      w.posted.push(req);
    },
    terminate: () => {
      w.terminated++;
    },
  };
  return w;
}

const EV: HostEvent = { t: "thinking", id: 3, by: 1 };
const boom = new Error("listener boom");

/** A client with two listeners: the first throws `boom`, the second records what it sees. */
function twoListeners(fake: FakeWorker): string[] {
  const client = new ArcfireWorkerClient(() => fake);
  const seen: string[] = [];
  client.on(() => {
    seen.push("first");
    throw boom;
  });
  client.on((ev) => seen.push(`second ${ev.t}`));
  return seen;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ArcfireWorkerClient's listeners", () => {
  it("deliver every event to every listener even when one throws, and report the error (reportError)", () => {
    const report = vi.fn();
    vi.stubGlobal("reportError", report);
    const fake = fakeWorker();
    const seen = twoListeners(fake);
    fake.onmessage!({ data: EV });
    fake.onerror!({ message: "x" });
    expect(seen).toEqual(["first", "second thinking", "first", "second error"]);
    expect(report.mock.calls).toEqual([[boom], [boom]]);
  });

  it("rethrow a listener's error from a timer where there is no reportError, after every listener ran", () => {
    vi.stubGlobal("reportError", undefined);
    vi.useFakeTimers();
    const fake = fakeWorker();
    const seen = twoListeners(fake);
    fake.onmessage!({ data: EV }); // nothing thrown here
    expect(seen).toEqual(["first", "second thinking"]);
    expect(() => vi.runAllTimers()).toThrow("listener boom"); // surfaced, not swallowed
  });

  it("get a worker load failure (a plain Event, with no message) as an error event with a message", () => {
    const fake = fakeWorker();
    const client = new ArcfireWorkerClient(() => fake);
    const seen: HostEvent[] = [];
    client.on((ev) => seen.push(ev));
    fake.onerror!(new Event("error") as never);
    fake.onerror!({ message: "SyntaxError: bad token" });
    expect(seen).toEqual([
      { t: "error", id: -1, message: "arcfire worker failed to load" },
      { t: "error", id: -1, message: "SyntaxError: bad token" },
    ]);
  });
});

describe("ArcfireWorkerClient.dispose", () => {
  it("terminates the worker once; after it every request throws and posts nothing", () => {
    const fake = fakeWorker();
    const client = new ArcfireWorkerClient(() => fake);
    const seen: HostEvent[] = [];
    client.on((ev) => seen.push(ev));
    expect(client.preview(0, 45, 50)).toBe(1);
    client.dispose();
    client.dispose(); // idempotent
    expect(fake.terminated).toBe(1);
    const requests = [
      () => client.start(1, SHORT_SETTINGS, "rookie"),
      () => client.pick(0),
      () => client.turn({ move: 0, w: 0, angle: 45, power: 50 }),
      () => client.preview(0, 45, 50),
    ];
    for (const request of requests) expect(request).toThrow(new Error("ArcfireWorkerClient: disposed"));
    expect(fake.posted.map((r) => r.t)).toEqual(["preview"]);
    fake.onmessage?.({ data: EV }); // a late event reaches no listener
    expect(seen).toEqual([]);
  });
});
