import type { AgentConfig, TaskConfig, FlowConfig, TraceEvent } from "@agent-company/shared";
import type { LLMAdapter } from "../adapters/base";
import type { ToolRegistry } from "../tools/registry";
import type { RunContext } from "../safety/guards";
import { agentRunner } from "./agent-runner";

export interface ParallelBranch {
  branchId: string;
  /** The task flow node id */
  nodeId: string;
  task: TaskConfig;
  agent: AgentConfig;
  context: string;
}

export interface ParallelRunnerOpts {
  /** The join node id (used for event correlation) */
  joinNodeId: string;
  branches: ParallelBranch[];
  adapterFactory: (agent: AgentConfig) => LLMAdapter;
  registry: ToolRegistry;
  ctx: RunContext;
}

export interface ParallelResult {
  /** Output per branchId */
  outputs: Record<string, string>;
  allEvents: TraceEvent[];
}

/**
 * Runs all branches concurrently. Emits branch_started for each branch,
 * collects all events from all branches (interleaved in completion order),
 * then emits parallel_join_completed once all branches finish.
 */
export async function* parallelRunner(
  opts: ParallelRunnerOpts,
): AsyncGenerator<TraceEvent, ParallelResult> {
  const { joinNodeId, branches, adapterFactory, registry, ctx } = opts;
  const outputs: Record<string, string> = {};
  const allEvents: TraceEvent[] = [];

  // Fan-out: collect all events from each branch into a buffer
  const branchPromises = branches.map(async (branch): Promise<TraceEvent[]> => {
    const events: TraceEvent[] = [];
    const started: TraceEvent = {
      type: "parallel_branch_started",
      runId: ctx.runId,
      joinNodeId,
      branchId: branch.branchId,
      ts: Date.now(),
    };
    events.push(started);

    const runner = agentRunner({
      agent: branch.agent,
      task: branch.task,
      context: branch.context,
      adapter: adapterFactory(branch.agent),
      registry,
      ctx,
      nodeId: branch.nodeId,
    });

    for await (const event of runner) {
      events.push(event);
      if (event.type === "task_completed") {
        outputs[branch.branchId] = event.output;
      }
    }

    return events;
  });

  // Emit branch_started events immediately so UI updates
  for (const branch of branches) {
    const startedEvent: TraceEvent = {
      type: "parallel_branch_started",
      runId: ctx.runId,
      joinNodeId,
      branchId: branch.branchId,
      ts: Date.now(),
    };
    yield startedEvent;
    allEvents.push(startedEvent);
  }

  // Await all branches concurrently
  const branchResults = await Promise.all(branchPromises);
  for (const events of branchResults) {
    // Skip the branch_started events we already yielded
    const body = events.slice(1);
    for (const event of body) {
      yield event;
      allEvents.push(event);
    }
  }

  const joinEvent: TraceEvent = {
    type: "parallel_join_completed",
    runId: ctx.runId,
    joinNodeId,
    branchCount: branches.length,
    ts: Date.now(),
  };
  yield joinEvent;
  allEvents.push(joinEvent);

  return { outputs, allEvents };
}
