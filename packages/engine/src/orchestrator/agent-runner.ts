import type { AgentConfig, TaskConfig, TraceEvent } from "@agent-company/shared";
import type { LLMAdapter } from "../adapters/base";
import type { ToolRegistry } from "../tools/registry";
import type { RunContext } from "../safety/guards";
import { reactLoop } from "./react-loop";

export interface AgentRunnerOpts {
  agent: AgentConfig;
  task: TaskConfig;
  /** Assembled context from upstream task outputs + vault memory */
  context: string;
  adapter: LLMAdapter;
  registry: ToolRegistry;
  ctx: RunContext;
  /** React Flow node ID for this task (used for UI state tracking) */
  nodeId: string;
}

/**
 * Runs a single agent on a single task.
 * Returns the final output string and emits all TraceEvents via the async generator.
 */
export async function* agentRunner(opts: AgentRunnerOpts): AsyncGenerator<TraceEvent, string> {
  const { agent, task, context, adapter, registry, ctx, nodeId } = opts;
  let output = "";

  for await (const event of reactLoop(agent, task, context, adapter, registry, ctx, nodeId)) {
    yield event;
    if (event.type === "task_completed") {
      output = event.output;
    }
  }

  return output;
}
