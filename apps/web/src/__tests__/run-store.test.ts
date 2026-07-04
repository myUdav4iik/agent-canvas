import { describe, it, expect, beforeEach } from "vitest";
import { useRunStore } from "../stores/run";
import type { TraceEvent } from "@agent-company/shared";

const RUN_ID = "run-test";

function ts() { return Date.now(); }

/** Reset the store to initial state before each test */
function resetStore() {
  useRunStore.getState().clearRun();
}

describe("useRunStore", () => {
  beforeEach(resetStore);

  describe("startRun()", () => {
    it("sets activeRunId and clears prior state", () => {
      const { startRun } = useRunStore.getState();
      startRun("run-abc");
      const s = useRunStore.getState();
      expect(s.activeRunId).toBe("run-abc");
      expect(s.runStatus).toBe("running");
      expect(s.events).toHaveLength(0);
      expect(s.nodeStates).toEqual({});
      expect(s.pendingHumanPause).toBeNull();
    });
  });

  describe("clearRun()", () => {
    it("resets everything to initial state", () => {
      useRunStore.getState().startRun("run-1");
      useRunStore.getState().clearRun();
      const s = useRunStore.getState();
      expect(s.activeRunId).toBeNull();
      expect(s.runStatus).toBe("idle");
    });
  });

  describe("applyEvent()", () => {
    beforeEach(() => {
      useRunStore.getState().startRun(RUN_ID);
    });

    it("accumulates events", () => {
      const { applyEvent } = useRunStore.getState();
      applyEvent({ type: "agent_started", runId: RUN_ID, agentId: "a1", agentName: "A", taskId: "t1", ts: ts() });
      applyEvent({ type: "agent_started", runId: RUN_ID, agentId: "a2", agentName: "B", taskId: "t2", ts: ts() });
      expect(useRunStore.getState().events).toHaveLength(2);
    });

    it("marks agent as active on agent_started", () => {
      useRunStore.getState().applyEvent({
        type: "agent_started", runId: RUN_ID, agentId: "agent-x", agentName: "X", taskId: "t1", ts: ts(),
      });
      expect(useRunStore.getState().nodeStates["agent-x"]).toBe("active");
    });

    it("appends tokens to tokenBuffers", () => {
      const { applyEvent } = useRunStore.getState();
      applyEvent({ type: "token_stream", runId: RUN_ID, agentId: "a1", token: "He", ts: ts() });
      applyEvent({ type: "token_stream", runId: RUN_ID, agentId: "a1", token: "llo", ts: ts() });
      expect(useRunStore.getState().tokenBuffers["a1"]).toBe("Hello");
    });

    it("marks node done and status running on task_completed", () => {
      useRunStore.getState().applyEvent({
        type: "task_completed", runId: RUN_ID, taskId: "t1", nodeId: "node-1", output: "ok", inputTokens: 10, outputTokens: 5, ts: ts(),
      });
      expect(useRunStore.getState().nodeStates["node-1"]).toBe("done");
      expect(useRunStore.getState().runStatus).toBe("running");
    });

    it("sets status=completed and captures metrics on run_completed", () => {
      useRunStore.getState().applyEvent({
        type: "run_completed",
        runId: RUN_ID,
        durationMs: 1234,
        totalTokens: 500,
        totalCostUsd: 0.001,
        ts: ts(),
      });
      const s = useRunStore.getState();
      expect(s.runStatus).toBe("completed");
      expect(s.metrics.tokens).toBe(500);
      expect(s.metrics.costUsd).toBe(0.001);
      expect(s.metrics.durationMs).toBe(1234);
    });

    it("sets status=failed and marks node error on run_error", () => {
      useRunStore.getState().applyEvent({
        type: "run_error", runId: RUN_ID, error: "boom", nodeId: "node-err", ts: ts(),
      });
      const s = useRunStore.getState();
      expect(s.runStatus).toBe("failed");
      expect(s.nodeStates["node-err"]).toBe("error");
    });

    it("sets status=paused and pendingHumanPause on human_in_the_loop_pause", () => {
      useRunStore.getState().applyEvent({
        type: "human_in_the_loop_pause",
        runId: RUN_ID,
        taskId: "task-pause",
        nodeId: "node-pause",
        description: "Review this",
        context: "some context",
        ts: ts(),
      });
      const s = useRunStore.getState();
      expect(s.runStatus).toBe("paused");
      expect(s.pendingHumanPause).toMatchObject({
        taskId: "task-pause",
        nodeId: "node-pause",
        description: "Review this",
      });
    });

    it("clears pendingHumanPause and resets to running on matching task_completed", () => {
      const { applyEvent } = useRunStore.getState();
      applyEvent({
        type: "human_in_the_loop_pause",
        runId: RUN_ID,
        taskId: "task-pause",
        nodeId: "node-pause",
        description: "Review",
        context: "",
        ts: ts(),
      });
      applyEvent({
        type: "task_completed",
        runId: RUN_ID,
        taskId: "task-pause",
        nodeId: "node-pause",
        output: "approved output",
        inputTokens: 0,
        outputTokens: 0,
        ts: ts(),
      });
      const s = useRunStore.getState();
      expect(s.pendingHumanPause).toBeNull();
      expect(s.runStatus).toBe("running");
      expect(s.nodeStates["node-pause"]).toBe("done");
    });

    it("does not clear pendingHumanPause on unrelated task_completed", () => {
      const { applyEvent } = useRunStore.getState();
      applyEvent({
        type: "human_in_the_loop_pause",
        runId: RUN_ID,
        taskId: "task-pause",
        nodeId: "node-pause",
        description: "Review",
        context: "",
        ts: ts(),
      });
      applyEvent({
        type: "task_completed",
        runId: RUN_ID,
        taskId: "other-task",
        nodeId: "other-node",
        output: "unrelated",
        inputTokens: 0,
        outputTokens: 0,
        ts: ts(),
      });
      expect(useRunStore.getState().pendingHumanPause?.taskId).toBe("task-pause");
    });
  });
});
