import { describe, it, expect } from "vitest";
import { deriveRunState } from "../lib/derive-run-state";
import type { TraceEvent } from "@agent-company/shared";

const RUN_ID = "run-test";

function ts() { return Date.now(); }

describe("deriveRunState", () => {
  it("returns empty state for empty event list", () => {
    const { nodeStates, tokenBuffers } = deriveRunState([]);
    expect(nodeStates).toEqual({});
    expect(tokenBuffers).toEqual({});
  });

  it("marks agent as active on agent_started", () => {
    const events: TraceEvent[] = [
      { type: "agent_started", runId: RUN_ID, agentId: "agent-1", agentName: "A", taskId: "t1", ts: ts() },
    ];
    const { nodeStates } = deriveRunState(events);
    expect(nodeStates["agent-1"]).toBe("active");
  });

  it("accumulates token stream per agent", () => {
    const events: TraceEvent[] = [
      { type: "token_stream", runId: RUN_ID, agentId: "agent-1", token: "Hello ", ts: ts() },
      { type: "token_stream", runId: RUN_ID, agentId: "agent-1", token: "world", ts: ts() },
      { type: "token_stream", runId: RUN_ID, agentId: "agent-2", token: "foo", ts: ts() },
    ];
    const { tokenBuffers } = deriveRunState(events);
    expect(tokenBuffers["agent-1"]).toBe("Hello world");
    expect(tokenBuffers["agent-2"]).toBe("foo");
  });

  it("marks node as done on task_completed", () => {
    const events: TraceEvent[] = [
      { type: "task_completed", runId: RUN_ID, taskId: "t1", nodeId: "node-1", output: "result", inputTokens: 10, outputTokens: 5, ts: ts() },
    ];
    const { nodeStates } = deriveRunState(events);
    expect(nodeStates["node-1"]).toBe("done");
  });

  it("marks node as error on run_error with nodeId", () => {
    const events: TraceEvent[] = [
      { type: "run_error", runId: RUN_ID, error: "Something broke", nodeId: "node-err", ts: ts() },
    ];
    const { nodeStates } = deriveRunState(events);
    expect(nodeStates["node-err"]).toBe("error");
  });

  it("does not throw on run_error without nodeId", () => {
    const events: TraceEvent[] = [
      { type: "run_error", runId: RUN_ID, error: "global error", ts: ts() },
    ];
    expect(() => deriveRunState(events)).not.toThrow();
  });

  it("marks node as active on human_in_the_loop_pause", () => {
    const events: TraceEvent[] = [
      {
        type: "human_in_the_loop_pause",
        runId: RUN_ID,
        taskId: "t1",
        nodeId: "node-pause",
        description: "Review this",
        context: "",
        ts: ts(),
      },
    ];
    const { nodeStates } = deriveRunState(events);
    expect(nodeStates["node-pause"]).toBe("active");
  });

  it("replays full lifecycle: started → streaming → done", () => {
    const events: TraceEvent[] = [
      { type: "agent_started", runId: RUN_ID, agentId: "agent-1", agentName: "A", taskId: "t1", ts: ts() },
      { type: "token_stream", runId: RUN_ID, agentId: "agent-1", token: "partial", ts: ts() },
      { type: "task_completed", runId: RUN_ID, taskId: "t1", nodeId: "node-1", output: "final", inputTokens: 10, outputTokens: 5, ts: ts() },
    ];
    const { nodeStates, tokenBuffers } = deriveRunState(events);
    expect(nodeStates["agent-1"]).toBe("active"); // agent-level key
    expect(nodeStates["node-1"]).toBe("done");     // node-level key
    expect(tokenBuffers["agent-1"]).toBe("partial");
  });

  it("derives correct state from a slice (replay position = mid-run)", () => {
    const all: TraceEvent[] = [
      { type: "agent_started", runId: RUN_ID, agentId: "a1", agentName: "A", taskId: "t1", ts: ts() },
      { type: "task_completed", runId: RUN_ID, taskId: "t1", nodeId: "node-1", output: "done", inputTokens: 10, outputTokens: 5, ts: ts() },
      { type: "agent_started", runId: RUN_ID, agentId: "a2", agentName: "B", taskId: "t2", ts: ts() },
      { type: "task_completed", runId: RUN_ID, taskId: "t2", nodeId: "node-2", output: "done2", inputTokens: 10, outputTokens: 5, ts: ts() },
    ];

    // Slice at event 2 (after first task_completed, before second agent_started)
    const { nodeStates } = deriveRunState(all.slice(0, 2));
    expect(nodeStates["node-1"]).toBe("done");
    expect(nodeStates["node-2"]).toBeUndefined(); // not yet reached
  });
});
