import type { TraceEvent } from "@agent-company/shared";
import type { NodeRunState } from "@/stores/run";

export interface DerivedRunState {
  nodeStates: Record<string, NodeRunState>;
  tokenBuffers: Record<string, string>;
}

/**
 * Pure function: re-derive node states and token buffers from a slice of trace events.
 * Mirrors the logic in useRunStore.applyEvent but operates over an arbitrary slice.
 */
export function deriveRunState(events: TraceEvent[]): DerivedRunState {
  const nodeStates: Record<string, NodeRunState> = {};
  const tokenBuffers: Record<string, string> = {};

  for (const event of events) {
    switch (event.type) {
      case "agent_started":
        nodeStates[event.agentId] = "active";
        break;
      case "token_stream":
        tokenBuffers[event.agentId] = (tokenBuffers[event.agentId] ?? "") + event.token;
        break;
      case "task_completed":
        nodeStates[event.nodeId] = "done";
        break;
      case "run_error":
        if (event.nodeId) nodeStates[event.nodeId] = "error";
        break;
      case "human_in_the_loop_pause":
        nodeStates[event.nodeId] = "active";
        break;
    }
  }

  return { nodeStates, tokenBuffers };
}
