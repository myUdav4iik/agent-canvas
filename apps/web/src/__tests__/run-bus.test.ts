import { describe, it, expect, beforeEach, vi } from "vitest";
import * as bus from "../lib/run-bus";
import type { TraceEvent } from "@agent-company/shared";

// Clear the globalThis singletons before each test so state doesn't bleed.
beforeEach(() => {
  globalThis.__runBusSubscribers?.clear();
  globalThis.__runBusBuffers?.clear();
});

const mkEvent = (ts: number): TraceEvent =>
  ({ type: "agent_started", runId: "r1", agentId: "a1", agentName: "A", taskId: "t1", ts }) as TraceEvent;

describe("run-bus", () => {
  it("delivers published events to live subscribers", () => {
    const received: TraceEvent[] = [];
    bus.subscribe("r1", (e) => received.push(e));
    bus.publish("r1", mkEvent(1));
    bus.publish("r1", mkEvent(2));
    expect(received).toHaveLength(2);
  });

  it("replays buffered events to late subscribers", () => {
    bus.publish("r1", mkEvent(1));
    bus.publish("r1", mkEvent(2));

    const received: TraceEvent[] = [];
    bus.subscribe("r1", (e) => received.push(e));

    expect(received).toHaveLength(2);
  });

  it("replays buffer then delivers new events in order", () => {
    bus.publish("r1", mkEvent(1));
    bus.publish("r1", mkEvent(2));

    const received: Array<{ ts: number }> = [];
    bus.subscribe("r1", (e) => received.push(e as { ts: number }));

    bus.publish("r1", mkEvent(3));

    expect(received.map((e) => e.ts)).toEqual([1, 2, 3]);
  });

  it("isolates events by runId", () => {
    bus.publish("r1", mkEvent(1));
    bus.publish("r2", { ...mkEvent(2), runId: "r2" });

    const r1Received: TraceEvent[] = [];
    bus.subscribe("r1", (e) => r1Received.push(e));
    expect(r1Received).toHaveLength(1);

    const r2Received: TraceEvent[] = [];
    bus.subscribe("r2", (e) => r2Received.push(e));
    expect(r2Received).toHaveLength(1);
  });

  it("unsubscribe stops future delivery", () => {
    const received: TraceEvent[] = [];
    const unsub = bus.subscribe("r1", (e) => received.push(e));

    bus.publish("r1", mkEvent(1));
    unsub();
    bus.publish("r1", mkEvent(2));

    expect(received).toHaveLength(1);
  });

  it("cleanup removes live subscribers and eventually clears buffer", () => {
    vi.useFakeTimers();

    bus.publish("r1", mkEvent(1));

    const received: TraceEvent[] = [];
    bus.subscribe("r1", (e) => received.push(e));
    expect(received).toHaveLength(1);

    bus.cleanup("r1");

    // Buffer kept for 60 s — new subscribers still get replay
    const received2: TraceEvent[] = [];
    bus.subscribe("r1", (e) => received2.push(e));
    expect(received2).toHaveLength(1);

    // After 60 s buffer is gone — new subscribers get nothing
    vi.advanceTimersByTime(60_001);
    const received3: TraceEvent[] = [];
    bus.subscribe("r1", (e) => received3.push(e));
    expect(received3).toHaveLength(0);

    vi.useRealTimers();
  });

  it("does not replay across runIds", () => {
    bus.publish("r1", mkEvent(1));

    const received: TraceEvent[] = [];
    bus.subscribe("r2", (e) => received.push(e));
    expect(received).toHaveLength(0);
  });
});
