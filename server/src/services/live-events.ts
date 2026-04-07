import { EventEmitter } from "node:events";
import type { LiveEvent, LiveEventType } from "@paperclipai/shared";

type LiveEventPayload = Record<string, unknown>;
type LiveEventListener = (event: LiveEvent) => void;

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

let nextEventId = 0;

// Pre-serialized JSON per event. A single WebSocket fanout can have dozens or
// hundreds of subscribers; previously every subscriber called
// `JSON.stringify(event)` on the same object, so the same payload was
// serialized N times per event. This WeakMap lets the first caller serialize
// the event and every subsequent caller reuse the cached string. Entries
// disappear as soon as the event object is garbage collected, so there is no
// unbounded growth.
const serializedCache = new WeakMap<LiveEvent, string>();

/**
 * Serialize a LiveEvent to JSON exactly once, regardless of how many
 * subscribers call this helper. Prefer this over `JSON.stringify(event)` in
 * any fan-out hot path (WebSocket broadcast, plugin host subscribers, ...).
 */
export function serializeLiveEvent(event: LiveEvent): string {
  const cached = serializedCache.get(event);
  if (cached !== undefined) return cached;
  const serialized = JSON.stringify(event);
  serializedCache.set(event, serialized);
  return serialized;
}

function toLiveEvent(input: {
  companyId: string;
  type: LiveEventType;
  payload?: LiveEventPayload;
}): LiveEvent {
  nextEventId += 1;
  return {
    id: nextEventId,
    companyId: input.companyId,
    type: input.type,
    createdAt: new Date().toISOString(),
    payload: input.payload ?? {},
  };
}

export function publishLiveEvent(input: {
  companyId: string;
  type: LiveEventType;
  payload?: LiveEventPayload;
}) {
  const event = toLiveEvent(input);
  emitter.emit(input.companyId, event);
  return event;
}

export function publishGlobalLiveEvent(input: {
  type: LiveEventType;
  payload?: LiveEventPayload;
}) {
  const event = toLiveEvent({ companyId: "*", type: input.type, payload: input.payload });
  emitter.emit("*", event);
  return event;
}

export function subscribeCompanyLiveEvents(companyId: string, listener: LiveEventListener) {
  emitter.on(companyId, listener);
  return () => emitter.off(companyId, listener);
}

export function subscribeGlobalLiveEvents(listener: LiveEventListener) {
  emitter.on("*", listener);
  return () => emitter.off("*", listener);
}
