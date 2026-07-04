import type { AgentConfig, TaskConfig, FlowConfig, TraceEvent } from "@agent-company/shared";
import type { LLMAdapter } from "../adapters/base";
import type { ToolRegistry } from "../tools/registry";
import type { RunContext } from "../safety/guards";
import { agentRunner } from "./agent-runner";

export interface SequentialRunnerOpts {
  flow: FlowConfig;
  agents: Record<string, AgentConfig>;
  tasks: Record<string, TaskConfig>;
  /** Task outputs from prior runs to use as initial context */
  priorOutputs?: Record<string, string>;
  adapterFactory: (agent: AgentConfig) => LLMAdapter;
  registry: ToolRegistry;
  ctx: RunContext;
}

/**
 * Runs all task nodes in topological order (sequential process).
 * Each task's output is fed as context to downstream tasks.
 *
 * Returns a map of nodeId → output for all completed tasks.
 */
export async function* sequentialRunner(
  opts: SequentialRunnerOpts,
): AsyncGenerator<TraceEvent, Record<string, string>> {
  const { flow, agents, tasks, priorOutputs = {}, adapterFactory, registry, ctx } = opts;
  const outputs: Record<string, string> = { ...priorOutputs };
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Build execution order: topological sort of flow nodes
  const taskNodes = flow.nodes.filter((n) => n.type === "task" || n.type === "agent");
  const ordered = topologicalSort(taskNodes.map((n) => n.id), flow);

  for (const nodeId of ordered) {
    ctx.throwIfAborted();

    const node = flow.nodes.find((n) => n.id === nodeId);
    if (!node || !node.taskId) continue;

    const task = tasks[node.taskId];
    if (!task) throw new Error(`Task not found: ${node.taskId}`);

    const agent = agents[task.assignedAgentId];
    if (!agent) throw new Error(`Agent not found: ${task.assignedAgentId}`);

    // Assemble context from upstream task outputs
    const context = assembleContext(task.contextTaskIds, tasks, outputs);

    const runner = agentRunner({
      agent,
      task,
      context,
      adapter: adapterFactory(agent),
      registry,
      ctx,
      nodeId,
    });

    let nodeOutput = "";
    for await (const event of runner) {
      yield event;
      if (event.type === "task_completed") {
        nodeOutput = event.output;
        totalInputTokens += event.inputTokens;
        totalOutputTokens += event.outputTokens;
      }
    }

    outputs[nodeId] = nodeOutput;
    // Also index by taskId for context resolution
    outputs[task.id] = nodeOutput;
  }

  yield {
    type: "run_completed",
    runId: ctx.runId,
    durationMs: 0,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalCostUsd: 0,
    ts: Date.now(),
  };

  return outputs;
}

function assembleContext(
  contextTaskIds: string[],
  tasks: Record<string, TaskConfig>,
  outputs: Record<string, string>,
): string {
  if (contextTaskIds.length === 0) return "";
  return contextTaskIds
    .map((taskId) => {
      const task = tasks[taskId];
      const output = outputs[taskId];
      if (!output) return null;
      return `### Output of "${task?.description ?? taskId}"\n${output}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Simple Kahn's algorithm topological sort on nodeIds */
function topologicalSort(nodeIds: string[], flow: FlowConfig): string[] {
  const inDegree = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const adj = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  const nodeSet = new Set(nodeIds);

  for (const edge of flow.edges) {
    if (nodeSet.has(edge.sourceNodeId) && nodeSet.has(edge.targetNodeId)) {
      adj.get(edge.sourceNodeId)!.push(edge.targetNodeId);
      inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return result;
}
