// src/game/runtime/arcfire/client.ts
//
// The main thread's handle on the Arcfire worker: what Plan 3's GameClient
// (behind its ssr:false dynamic import) uses, and nothing else imports. It
// owns the request ids and the listeners; dispose() terminates the worker,
// which is also how the UI abandons an AI that is still thinking, and every
// request after it throws. Every listener gets every event: one that throws
// cannot starve the others, and its error is reported, never swallowed. Tests
// pass a factory that returns an in-process WorkerLike wired to createArcfireHost.
import type { MatchSettings } from "@/game/titles/arcfire/state";
import type { TurnCommand } from "@/game/titles/arcfire/match";
import type { ArcfireCommand } from "@/game/titles/arcfire/replay";
import type { HostEvent, HostRequest, Opponent } from "./protocol";

/** The part of a Worker the client uses. */
export interface WorkerLike {
  postMessage(req: HostRequest): void;
  terminate(): void;
  onmessage: ((e: { data: HostEvent }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null; // an ErrorEvent, or a plain Event when a module worker fails to load
}

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never; // distributes over the union
export type Listener = (ev: HostEvent) => void;

const moduleWorker = (): WorkerLike =>
  new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;

/** Surface a listener's error without stopping the rest: reportError where the platform has it, else a rethrow from a timer. */
function report(err: unknown): void {
  if (typeof reportError === "function") reportError(err);
  else {
    setTimeout(() => {
      throw err;
    }, 0);
  }
}

export class ArcfireWorkerClient {
  private readonly worker: WorkerLike;
  private readonly listeners = new Set<Listener>();
  private nextId = 1;
  private disposed = false;

  constructor(factory: () => WorkerLike = moduleWorker) {
    this.worker = factory();
    this.worker.onmessage = (e) => this.emit(e.data);
    this.worker.onerror = (e) => this.emit({ t: "error", id: -1, message: e.message ?? "arcfire worker failed to load" });
  }

  /** Subscribe; returns the unsubscribe. */
  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  start(seed: number, settings: MatchSettings, opponent: Opponent, log?: readonly ArcfireCommand[]): number {
    return this.send({ t: "start", seed, settings, opponent, log });
  }

  pick(poolIndex: number): number {
    return this.send({ t: "pick", poolIndex });
  }

  turn(cmd: TurnCommand): number {
    return this.send({ t: "turn", cmd });
  }

  preview(weapon: number, angle: number, power: number): number {
    return this.send({ t: "preview", weapon, angle, power });
  }

  /** Terminate the worker and drop every listener. Idempotent; every request after it throws. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.terminate();
    this.listeners.clear();
  }

  /** Every listener gets the event, even when an earlier one throws; each error is reported, never swallowed. */
  private emit(ev: HostEvent): void {
    for (const l of this.listeners) {
      try {
        l(ev);
      } catch (err) {
        report(err);
      }
    }
  }

  private send(req: WithoutId<HostRequest>): number {
    if (this.disposed) throw new Error("ArcfireWorkerClient: disposed");
    const id = this.nextId++;
    this.worker.postMessage({ ...req, id } as HostRequest);
    return id;
  }
}
