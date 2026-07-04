import type { AgentConfig, TaskConfig, TraceEvent } from "@agent-company/shared";
import type { LLMAdapter } from "../adapters/base";
import type { ToolRegistry, RegisteredTool } from "../tools/registry";
import type { RunContext } from "../safety/guards";
import { DelegationDepthError } from "../safety/guards";
import { reactLoop } from "./react-loop";

export interface DelegationOpts {
  parentAgentId: string;
  childAgent: AgentConfig;
  subtask: string;
  context?: string;
  adapter: LLMAdapter;
  registry: ToolRegistry;
  ctx: RunContext;
}

/**
 * Runs a nested agent as a delegation. Emits delegation_started / delegation_completed
 * around the inner reactLoop, and enforces the delegation depth cap.
 */
export async function* delegationRunner(
  opts: DelegationOpts,
): AsyncGenerator<TraceEvent, string> {
  const { parentAgentId, childAgent, subtask, context = "", adapter, registry, ctx } = opts;

  ctx.enterDelegation();

  yield {
    type: "delegation_started",
    runId: ctx.runId,
    parentAgentId,
    childAgentId: childAgent.id,
    childAgentName: childAgent.name,
    subtask,
    depth: ctx.delegationDepth,
    ts: Date.now(),
  };

  const syntheticTask: TaskConfig = {
    id: `delegation-${Date.now()}`,
    description: subtask,
    expectedOutput: "Complete the subtask and return the result.",
    assignedAgentId: childAgent.id,
    contextTaskIds: [],
    outputFormat: "text",
    humanInTheLoop: false,
  };

  let result = "";
  try {
    for await (const event of reactLoop(
      childAgent,
      syntheticTask,
      context,
      adapter,
      registry,
      ctx,
      `delegation-${childAgent.id}`,
    )) {
      yield event;
      if (event.type === "task_completed") result = event.output;
    }
  } finally {
    ctx.exitDelegation();
  }

  yield {
    type: "delegation_completed",
    runId: ctx.runId,
    parentAgentId,
    childAgentId: childAgent.id,
    result,
    ts: Date.now(),
  };

  return result;
}

/**
 * Creates a "delegate" tool and registers it for agents that allow delegation.
 * The tool calls delegationRunner when invoked by the reactLoop.
 */
export function createDelegateTool(
  parentAgentId: string,
  agents: Record<string, AgentConfig>,
  adapterFactory: (agent: AgentConfig) => LLMAdapter,
  registry: ToolRegistry,
  ctx: RunContext,
  emitEvents: (events: TraceEvent[]) => void,
): RegisteredTool {
  return {
    name: "delegate",
    description:
      "Delegate a subtask to a specialist sub-agent. Use when a specific skill or deep research is needed.",
    inputSchema: {
      type: "object",
      properties: {
        toAgentId: {
          type: "string",
          description: "The ID of the agent to delegate to",
        },
        subtask: {
          type: "string",
          description: "Clear description of the subtask for the agent to complete",
        },
        context: {
          type: "string",
          description: "Optional context to pass to the sub-agent",
        },
      },
      required: ["toAgentId", "subtask"],
    },
    async execute(args) {
      const toAgentId = args["toAgentId"] as string;
      const subtask = args["subtask"] as string;
      const context = (args["context"] as string | undefined) ?? "";

      const childAgent = agents[toAgentId];
      if (!childAgent) throw new Error(`Agent not found: ${toAgentId}`);

      const adapter = adapterFactory(childAgent);
      const collectedEvents: TraceEvent[] = [];

      const runner = delegationRunner({
        parentAgentId,
        childAgent,
        subtask,
        context,
        adapter,
        registry,
        ctx,
      });

      let result = "";
      for await (const event of runner) {
        collectedEvents.push(event);
        if (event.type === "delegation_completed") result = event.result;
      }

      emitEvents(collectedEvents);
      return { result };
    },
  };
}
