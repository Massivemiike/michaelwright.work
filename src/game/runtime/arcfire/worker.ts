// src/game/runtime/arcfire/worker.ts
//
// The Web Worker entry (spec §1.4): host.ts bound to postMessage, so the sim
// and the AI's thinking never block the main thread. Loaded only by client.ts.
import { createArcfireHost } from "./host";
import type { HostEvent, HostRequest } from "./protocol";

const scope = self as unknown as {
  postMessage(ev: HostEvent, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<HostRequest>) => void) | null;
};
const host = createArcfireHost((ev, transfer) => scope.postMessage(ev, transfer));
scope.onmessage = (e) => host.receive(e.data);
