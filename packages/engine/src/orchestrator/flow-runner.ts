import type {
  AgentConfig, TaskConfig, FlowConfig, FlowNodeConfig, TraceEvent,
} from "@agent-company/shared";
import type { LLMAdapter } from "../adapters/base";
import type { ToolRegistry } from "../tools/registry";
import type { RunContext } from "../safety/guards";
import { agentRunner } from "./agent-runner";
import { evaluateCondition } from "./condition-node";
import { loopNode } from "./loop-node";
import { parallelRunner, type ParallelBranch } from "./parallel-runner";
import { createDelegateTool } from "./delegation-runner";

export interface FlowRunnerOpts {
  flow: FlowConfig;
  agents: Record<string, AgentConfig>;
  tasks: Record<string, TaskConfig>;
  adapterFactory: (agent: AgentConfig) => LLMAdapter;
  registry: ToolRegistry;
  ctx: RunContext;
  /** Optional per-agent registry factory (e.g. to inject vault tools with the agent's id) */
  registryFactory?: (agent: AgentConfig) => ToolRegistry;
  /** Optional per-agent context augmenter (e.g. to prepend vault memory) */
  contextFactory?: (agent: AgentConfig, task: TaskConfig, upstreamContext: string) => string;
}

/** Live state threaded through graph traversal */
interface TraversalState {
  /** Completed node output by nodeId */
  outputs: Record<string, string>;
  /** JS-accessible vars for condition expressions */
  vars: Record<string, unknown>;
  /** Set of visited nodeIds (cycle guard) */
  visited: Set<string>;
}

/**
 * Full graph-traversal runner. Replaces sequentialRunner for flows that use
 * condition, loop, or parallel nodes.
 *
 * Traversal strategy: BFS from start nodes, dispatching each node to the right runner.
 * - start / end / join: pass-through (no work, advance to successors)
 * - agent + task nodes: run agentRunner
 * - condition node: evaluate expression, route to matching edge
 * - loop node: run loopNode for the body subgraph
 * - parallel node: fan out branches concurrently, wait at join
 */
export async function* flowRunner(
  opts: FlowRunnerOpts,
): AsyncGenerator<TraceEvent> {
  const { flow, agents, tasks, adapterFactory, registry, ctx, registryFactory, contextFactory } = opts;

  const state: TraversalState = { outputs: {}, vars: {}, visited: new Set() };
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Build adjacency maps for fast traversal
  const successors = new Map<string, FlowNodeConfig[]>();  // nodeId → outgoing nodes
  const nodeById = new Map<string, FlowNodeConfig>(flow.nodes.map((n) => [n.id, n]));

  for (const edge of flow.edges) {
    const targets = successors.get(edge.sourceNodeId) ?? [];
    const target = nodeById.get(edge.targetNodeId);
    if (target) targets.push(target);
    successors.set(edge.sourceNodeId, targets);
  }

  // Map: source nodeId + edge label → target nodeId (for conditional routing)
  const edgeByLabel = new Map<string, string>(); // `${src}:${label}` → targetNodeId
  const edgeByType = new Map<string, string[]>(); // `${src}:${type}` → targetNodeIds
  for (const edge of flow.edges) {
    if (edge.label) edgeByLabel.set(`${edge.sourceNodeId}:${edge.label}`, edge.targetNodeId);
    const key = `${edge.sourceNodeId}:${edge.type}`;
    const arr = edgeByType.get(key) ?? [];
    arr.push(edge.targetNodeId);
    edgeByType.set(key, arr);
  }

  // Build delegate tool registry per agent (lazy, only for agents with allowDelegation)
  const delegateRegistries = new Map<string, ToolRegistry>();
  const makeRegistryFor = (agent: AgentConfig, base: ToolRegistry = registry): ToolRegistry => {
    if (!agent.allowDelegation) return base;
    // Cache key: agentId + whether base differs from global registry
    const cacheKey = `${agent.id}:${base === registry ? "global" : "custom"}`;
    if (delegateRegistries.has(cacheKey)) return delegateRegistries.get(cacheKey)!;

    const collected: TraceEvent[] = [];
    const delegateTool = createDelegateTool(
      agent.id,
      agents,
      adapterFactory,
      base,
      ctx,
      (events) => collected.push(...events),
    );
    const r = Object.create(base) as typeof base;
    // Wrap execute to drain collected events
    const origExec = base.execute.bind(base);
    r.execute = async (name, args, rctx) => {
      if (name === "delegate") {
        const result = await delegateTool.execute(args, rctx);
        for (const e of collected.splice(0)) {
          pendingDelegationEvents.push(e);
        }
        return result;
      }
      return origExec(name, args, rctx);
    };
    r.getSchemasFor = (names) => {
      const schemas = base.getSchemasFor(names);
      if (names.includes("delegate") || agent.allowDelegation) {
        return [...schemas, { name: delegateTool.name, description: delegateTool.description, inputSchema: delegateTool.inputSchema }];
      }
      return schemas;
    };
    delegateRegistries.set(cacheKey, r);
    return r;
  };

  const pendingDelegationEvents: TraceEvent[] = [];

  // BFS queue: start from nodes with no incoming edges (or explicit 'start' nodes)
  const inDegree = new Map<string, number>(flow.nodes.map((n) => [n.id, 0]));
  for (const edge of flow.edges) {
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
  }

  const queue: FlowNodeConfig[] = flow.nodes.filter(
    (n) => inDegree.get(n.id) === 0 || n.type === "start",
  );

  while (queue.length > 0) {
    ctx.throwIfAborted();

    const node = queue.shift()!;
    if (state.visited.has(node.id)) continue;
    state.visited.add(node.id);

    // Flush any delegation events that were collected during tool calls
    while (pendingDelegationEvents.length > 0) {
      yield pendingDelegationEvents.shift()!;
    }

    switch (node.type) {
      case "start":
      case "end": {
        // Pass-through — enqueue successors
        enqueue(successors.get(node.id) ?? [], queue, state);
        break;
      }

      case "agent":
      case "task": {
        // Agent+task nodes: find the task (node may reference a taskId directly)
        if (!node.taskId) { enqueue(successors.get(node.id) ?? [], queue, state); break; }

        const task = tasks[node.taskId];
        if (!task) throw new Error(`Task not found: ${node.taskId}`);

        // Try task's assignedAgentId first, then fall back to the agentId stored directly on the node
        const agent = agents[task.assignedAgentId] ?? (node.agentId ? agents[node.agentId] : undefined);
        if (!agent) throw new Error(`Agent not found: ${task.assignedAgentId} (node.agentId=${node.agentId ?? "none"}, known agents: [${Object.keys(agents).join(", ")}])`);

        const upstreamContext = assembleContext(task.contextTaskIds, state.outputs);
        const context = contextFactory ? contextFactory(agent, task, upstreamContext) : upstreamContext;
        const baseRegistry = registryFactory ? registryFactory(agent) : registry;
        const agentRegistry = makeRegistryFor(agent, baseRegistry);

        for await (const event of agentRunner({ agent, task, context, adapter: adapterFactory(agent), registry: agentRegistry, ctx, nodeId: node.id })) {
          yield event;
          if (event.type === "task_completed") {
            state.outputs[node.id] = event.output;
            state.outputs[task.id] = event.output;
            state.vars[`output_${node.id}`] = event.output;
            totalInputTokens += event.inputTokens;
            totalOutputTokens += event.outputTokens;
          }
        }

        while (pendingDelegationEvents.length > 0) yield pendingDelegationEvents.shift()!;
        enqueue(successors.get(node.id) ?? [], queue, state);
        break;
      }

      case "condition": {
        const expr = node.conditionExpr ?? "false";
        const result = evaluateCondition({
          conditionNodeId: node.id,
          expression: expr,
          state: state.vars,
          outputs: state.outputs,
          ctx,
        });
        for (const e of result.events) yield e;

        // Route to the edge matching the boolean result
        const targetId =
          edgeByLabel.get(`${node.id}:${result.branch}`) ??
          edgeByLabel.get(`${node.id}:${result.value ? "yes" : "no"}`) ??
          (result.value
            ? (successors.get(node.id) ?? [])[0]?.id
            : (successors.get(node.id) ?? [])[1]?.id);

        if (targetId) {
          const target = nodeById.get(targetId);
          if (target) enqueue([target], queue, state);
        }
        break;
      }

      case "loop": {
        // Find the body node(s) — nodes reachable on the "body" edge, or just the first successor
        const bodyEdge = flow.edges.find(
          (e) => e.sourceNodeId === node.id && (e.label === "body" || e.type === "loop"),
        );
        const exitEdge = flow.edges.find(
          (e) => e.sourceNodeId === node.id && (e.label === "exit" || e.label === "done" || e.type === "sequential"),
        );

        const bodyNodeId = bodyEdge?.targetNodeId ?? (successors.get(node.id) ?? [])[0]?.id ?? "";
        const bodyFlowNode = nodeById.get(bodyNodeId);

        if (!bodyFlowNode?.taskId) {
          // No body task — skip loop, advance
          enqueue(successors.get(node.id) ?? [], queue, state);
          break;
        }

        const bodyTask = tasks[bodyFlowNode.taskId];
        const bodyAgent = bodyTask ? agents[bodyTask.assignedAgentId] : undefined;
        if (!bodyTask || !bodyAgent) {
          enqueue(successors.get(node.id) ?? [], queue, state);
          break;
        }

        const initialContext = assembleContext(bodyTask.contextTaskIds, state.outputs);

        for await (const event of loopNode({
          loopNodeId: node.id,
          loopType: (node.loopType ?? "fixed-n") as "fixed-n" | "while" | "until" | "for-each",
          loopMax: node.loopMax ?? 3,
          loopCondition: node.loopCondition ?? "",
          bodyTask,
          bodyAgent,
          initialContext,
          bodyNodeId,
          adapterFactory,
          registry,
          ctx,
          runState: state.vars,
        })) {
          yield event;
          if (event.type === "loop_completed") {
            // After loop: mark body node visited so BFS doesn't re-run it
            state.visited.add(bodyNodeId);
          }
          if (event.type === "task_completed") {
            state.outputs[bodyFlowNode.id] = event.output;
            state.outputs[bodyTask.id] = event.output;
            totalInputTokens += event.inputTokens;
            totalOutputTokens += event.outputTokens;
          }
        }

        // Advance to exit edge (sequential successor) after loop
        const exitTarget = exitEdge
          ? nodeById.get(exitEdge.targetNodeId)
          : (successors.get(node.id) ?? []).find((n) => n.id !== bodyNodeId);
        if (exitTarget) enqueue([exitTarget], queue, state);
        break;
      }

      case "parallel": {
        // Collect all parallel branches (outgoing edges)
        const branchEdges = flow.edges.filter((e) => e.sourceNodeId === node.id);
        const branches: ParallelBranch[] = [];

        for (const edge of branchEdges) {
          const branchNode = nodeById.get(edge.targetNodeId);
          if (!branchNode || branchNode.type === "join") continue;
          if (!branchNode.taskId) continue;

          const task = tasks[branchNode.taskId];
          const agent = task ? agents[task.assignedAgentId] : undefined;
          if (!task || !agent) continue;

          branches.push({
            branchId: edge.id,
            nodeId: branchNode.id,
            task,
            agent,
            context: assembleContext(task.contextTaskIds, state.outputs),
          });
        }

        if (branches.length === 0) { enqueue(successors.get(node.id) ?? [], queue, state); break; }

        // Find join node
        const joinNodeId = branchEdges
          .map((e) => nodeById.get(e.targetNodeId))
          .find((n) => n?.type === "join")?.id ?? `join-${node.id}`;

        for await (const event of parallelRunner({ joinNodeId, branches, adapterFactory, registry, ctx })) {
          yield event;
          if (event.type === "task_completed") {
            state.outputs[event.nodeId ?? ""] = event.output;
            totalInputTokens += event.inputTokens;
            totalOutputTokens += event.outputTokens;
          }
          if (event.type === "parallel_join_completed") {
            // Mark all branch nodes as visited
            for (const b of branches) state.visited.add(b.nodeId);
          }
        }

        // Advance from join node (or the node after the parallel)
        const joinNode = flow.nodes.find((n) => n.id === joinNodeId && n.type === "join");
        if (joinNode) {
          state.visited.add(joinNode.id);
          enqueue(successors.get(joinNode.id) ?? [], queue, state);
        } else {
          enqueue(successors.get(node.id) ?? [], queue, state);
        }
        break;
      }

      case "join": {
        // Already handled by parallel — just advance
        enqueue(successors.get(node.id) ?? [], queue, state);
        break;
      }

      default:
        enqueue(successors.get(node.id) ?? [], queue, state);
    }
  }

  yield {
    type: "run_completed",
    runId: ctx.runId,
    durationMs: 0, // engine-client patches this from wall time
    totalTokens: totalInputTokens + totalOutputTokens,
    totalCostUsd: 0, // cost estimation requires provider-specific pricing tables
    ts: Date.now(),
  };
}

function enqueue(nodes: FlowNodeConfig[], queue: FlowNodeConfig[], state: TraversalState) {
  for (const n of nodes) {
    if (!state.visited.has(n.id)) queue.push(n);
  }
}

function assembleContext(contextTaskIds: string[], outputs: Record<string, string>): string {
  if (contextTaskIds.length === 0) return "";
  return contextTaskIds
    .map((id) => outputs[id] ? `### Context\n${outputs[id]}` : null)
    .filter(Boolean)
    .join("\n\n");
}
