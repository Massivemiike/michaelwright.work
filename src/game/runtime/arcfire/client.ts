// src/game/runtime/arcfire/client.ts
//
// The main thread's handle on the Arcfire worker: what Plan 3's GameClient
// (behind its ssr:false dynamic import) uses, and nothing else imports. It
// owns the request ids and the listeners; dispose() terminates the worker,
// which is also how the UI abandons an AI that is still thinking. Tests pass
// a factory that returns an in-process WorkerLike wired to createArcfireHost.
import type { MatchSettings } from "@/game/titles/arcfire/state";
import type { TurnCommand } from "@/game/titles/arcfire/match";
import type { ArcfireCommand } from "@/game/titles/arcfire/replay";
import type { HostEvent, HostRequest, Opponent } from "./protocol";

/** The part of a Worker the client uses. */
export interface WorkerLike {
  postMessage(req: HostRequest): void;
  terminate(): void;
  onmessage: ((e: { data: HostEvent }) => void) | null;
  onerror: ((e: { message: string }) => void) | null;
}

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never; // distributes over the union
export type Listener = (ev: HostEvent) => void;

const moduleWorker = (): WorkerLike =>
  new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;

export class ArcfireWorkerClient {
  private readonly worker: WorkerLike;
  private readonly listeners = new Set<Listener>();
  private nextId = 1;

  constructor(factory: () => WorkerLike = moduleWorker) {
    this.worker = factory();
    this.worker.onmessage = (e) => {
      for (const l of this.listeners) l(e.data);
    };
    this.worker.onerror = (e) => {
      for (const l of this.listeners) l({ t: "error", id: -1, message: e.message });
    };
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

  dispose(): void {
    this.worker.terminate();
    this.listeners.clear();
  }

  private send(req: WithoutId<HostRequest>): number {
    const id = this.nextId++;
    this.worker.postMessage({ ...req, id } as HostRequest);
    return id;
  }
}
