/**
 * Engine → UI event contract. Define once, never break.
 * Every execution primitive emits one or more of these 19 event types.
 * The UI is a pure consumer — it never needs to know engine internals.
 */
export type TraceEvent =
  | { type: "agent_started";           runId: string; agentId: string; agentName: string; taskId: string; ts: number }
  | { type: "agent_thought";           runId: string; agentId: string; thought: string; ts: number }
  | { type: "token_stream";            runId: string; agentId: string; token: string; ts: number }
  | { type: "tool_call";               runId: string; agentId: string; tool: string; args: unknown; callId: string; ts: number }
  | { type: "tool_result";             runId: string; agentId: string; callId: string; result: unknown; error?: string; ts: number }
  | { type: "task_completed";          runId: string; taskId: string; nodeId: string; output: string; inputTokens: number; outputTokens: number; ts: number }
  | { type: "delegation_started";      runId: string; parentAgentId: string; childAgentId: string; childAgentName: string; subtask: string; depth: number; ts: number }
  | { type: "delegation_completed";    runId: string; parentAgentId: string; childAgentId: string; result: string; ts: number }
  | { type: "loop_iteration";          runId: string; loopNodeId: string; iteration: number; maxIterations: number; accumulator: unknown; ts: number }
  | { type: "loop_completed";          runId: string; loopNodeId: string; totalIterations: number; breakReason: "condition_met" | "max_iterations"; ts: number }
  | { type: "condition_evaluated";     runId: string; conditionNodeId: string; expression: string; result: boolean; routeTo: string; ts: number }
  | { type: "parallel_branch_started"; runId: string; joinNodeId: string; branchId: string; ts: number }
  | { type: "parallel_join_completed"; runId: string; joinNodeId: string; branchCount: number; ts: number }
  | { type: "run_completed";           runId: string; durationMs: number; totalTokens: number; totalCostUsd: number; ts: number }
  | { type: "run_error";               runId: string; error: string; agentId?: string; nodeId?: string; ts: number }
  | { type: "max_iterations_reached";  runId: string; agentId: string; taskId: string; iterations: number; ts: number }
  | { type: "human_in_the_loop_pause"; runId: string; taskId: string; nodeId: string; description: string; context: string; ts: number }
  | { type: "vault_read";              runId: string; agentId: string; notePath: string; ts: number }
  | { type: "vault_write";             runId: string; agentId: string; notePath: string; ts: number };

export type TraceEventType = TraceEvent["type"];

/** Narrow a TraceEvent to a specific type */
export type ExtractEvent<T extends TraceEventType> = Extract<TraceEvent, { type: T }>;
