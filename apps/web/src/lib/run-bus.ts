/**
 * In-process pub/sub for streaming TraceEvents from the engine to SSE clients.
 *
 * Events are buffered so late-connecting SSE clients (who missed early events
 * due to navigation delay) receive a full replay on subscribe.
 *
 * State is stored on globalThis so that Turbopack/webpack HMR module
 * re-evaluations don't create a fresh Map — the engine and the SSE route always
 * share the same singleton regardless of how many times this module reloads.
 */
import type { TraceEvent } from "@agent-company/shared";

type Handler = (event: TraceEvent) => void;

declare global {
  // eslint-disable-next-line no-var
  var __runBusSubscribers: Map<string, Set<Handler>> | undefined;
  // eslint-disable-next-line no-var
  var __runBusBuffers: Map<string, TraceEvent[]> | undefined;
}

const subscribers: Map<string, Set<Handler>> = (globalThis.__runBusSubscribers ??= new Map());
const eventBuffers: Map<string, TraceEvent[]> = (globalThis.__runBusBuffers ??= new Map());

const MAX_BUFFER = 2000;

/** Publish an event to all subscribers and buffer it for late subscribers. */
export function publish(runId: string, event: TraceEvent): void {
  // Buffer first
  if (!eventBuffers.has(runId)) eventBuffers.set(runId, []);
  const buf = eventBuffers.get(runId)!;
  buf.push(event);
  if (buf.length > MAX_BUFFER) buf.shift();

  const liveCount = subscribers.get(runId)?.size ?? 0;
  console.log(`[run-bus] publish ${event.type} runId=${runId} liveSubscribers=${liveCount} bufferSize=${buf.length}`);

  // Then deliver to live subscribers
  subscribers.get(runId)?.forEach((h) => h(event));
}

/**
 * Subscribe to events for a run.
 * Immediately replays any buffered events to the handler so late-connecting
 * clients get a full history. Returns an unsubscribe function.
 */
export function subscribe(runId: string, handler: Handler): () => void {
  // Replay buffered events synchronously before registering the handler.
  // Node.js is single-threaded: no new publish() calls can interleave here.
  const buffered = eventBuffers.get(runId) ?? [];
  console.log(`[run-bus] subscribe runId=${runId} replayingBuffered=${buffered.length}`);
  for (const event of buffered) {
    handler(event);
  }

  if (!subscribers.has(runId)) subscribers.set(runId, new Set());
  subscribers.get(runId)!.add(handler);
  console.log(`[run-bus] subscribe runId=${runId} liveSubscribers=${subscribers.get(runId)!.size}`);

  return () => {
    subscribers.get(runId)?.delete(handler);
    if (subscribers.get(runId)?.size === 0) subscribers.delete(runId);
  };
}

/**
 * Remove live subscribers for a run after it terminates.
 * The event buffer is kept for a grace period so page refreshes and
 * late-connecting SSE clients can still replay the full run history.
 */
export function cleanup(runId: string): void {
  subscribers.delete(runId);
  // Drop buffer after 60 s — by then any live page will have switched to DB polling
  setTimeout(() => eventBuffers.delete(runId), 60_000);
}
