"use client";
import { create } from "zustand";
import type { TraceEvent } from "@agent-company/shared";

export type NodeRunState = "idle" | "active" | "done" | "error";

export interface RunMetrics {
  tokens: number;
  costUsd: number;
  durationMs: number;
  startedAt: number;
}

/** Pending human approval: set when human_in_the_loop_pause event arrives */
export interface PendingHumanPause {
  taskId: string;
  nodeId: string;
  description: string;
  context: string;
}

interface RunStore {
  activeRunId: string | null;
  runStatus: "idle" | "running" | "completed" | "failed" | "killed" | "paused";
  /** Set when run_error is received */
  runError: string | null;
  /** Non-null while waiting for human approval */
  pendingHumanPause: PendingHumanPause | null;

  /** TraceEvents in order received */
  events: TraceEvent[];

  /** Per-node UI state keyed by flow node ID */
  nodeStates: Record<string, NodeRunState>;

  /** Per-agent accumulated token stream keyed by agentId */
  tokenBuffers: Record<string, string>;

  metrics: RunMetrics;

  // Actions
  startRun: (runId: string) => void;
  applyEvent: (event: TraceEvent) => void;
  clearRun: () => void;
}

const initialMetrics: RunMetrics = { tokens: 0, costUsd: 0, durationMs: 0, startedAt: 0 };

export const useRunStore = create<RunStore>((set, get) => ({
  activeRunId: null,
  runStatus: "idle",
  runError: null,
  pendingHumanPause: null,
  events: [],
  nodeStates: {},
  tokenBuffers: {},
  metrics: { ...initialMetrics },

  startRun(runId) {
    set({
      activeRunId: runId,
      runStatus: "running",
      runError: null,
      pendingHumanPause: null,
      events: [],
      nodeStates: {},
      tokenBuffers: {},
      metrics: { ...initialMetrics, startedAt: Date.now() },
    });
  },

  applyEvent(event) {
    set((s) => {
      const events = [...s.events, event];
      const nodeStates = { ...s.nodeStates };
      const tokenBuffers = { ...s.tokenBuffers };
      const metrics = { ...s.metrics };

      switch (event.type) {
        case "agent_started":
          // Mark the node that owns this agent as active.
          // We'll update nodeStates by agentId for now; canvas maps nodeId → agentId separately.
          nodeStates[event.agentId] = "active";
          break;

        case "token_stream":
          tokenBuffers[event.agentId] = (tokenBuffers[event.agentId] ?? "") + event.token;
          break;

        case "task_completed":
          nodeStates[event.nodeId] = "done";
          // Clear human pause if this task was the one paused
          if (s.pendingHumanPause?.taskId === event.taskId) {
            return { events, nodeStates, tokenBuffers, metrics, pendingHumanPause: null, runStatus: "running" as const };
          }
          break;

        case "run_completed":
          metrics.tokens = event.totalTokens;
          metrics.costUsd = event.totalCostUsd;
          metrics.durationMs = event.durationMs || Date.now() - s.metrics.startedAt;
          return { events, nodeStates, tokenBuffers, metrics, runStatus: "completed" };

        case "run_error":
          if (event.nodeId) nodeStates[event.nodeId] = "error";
          return { events, nodeStates, tokenBuffers, metrics, runStatus: "failed", runError: event.error };

        case "human_in_the_loop_pause":
          nodeStates[event.nodeId] = "active";
          return {
            events,
            nodeStates,
            tokenBuffers,
            metrics,
            runStatus: "paused" as const,
            pendingHumanPause: {
              taskId: event.taskId,
              nodeId: event.nodeId,
              description: event.description,
              context: event.context,
            },
          };

        case "max_iterations_reached":
          // Leave as-is; task_completed or run_error follows
          break;
      }

      return { events, nodeStates, tokenBuffers, metrics };
    });
  },

  clearRun() {
    set({
      activeRunId: null,
      runStatus: "idle",
      runError: null,
      events: [],
      nodeStates: {},
      tokenBuffers: {},
      metrics: { ...initialMetrics },
    });
  },
}));
