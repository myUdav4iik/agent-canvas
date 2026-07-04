/**
 * Bridges the Next.js API layer and the @agent-company/engine package.
 * Loads a flow from the DB, builds runtime configs, runs the engine,
 * and streams TraceEvents to the run-bus + persists them to TraceEventRow.
 */
import { prisma } from "./db";
import * as runBus from "./run-bus";
import {
  flowRunner,
  createAdapter,
  ToolRegistry,
  RunContext,
  calculatorTool,
  httpFetchTool,
  createVaultReadTool,
  createVaultWriteTool,
  assembleVaultContext,
  reindexNote,
  writeNote,
} from "@agent-company/engine";
import type { AgentConfig, TaskConfig, FlowConfig, FlowNodeConfig, FlowEdgeConfig, LoopType, EdgeType } from "@agent-company/shared";

// Pinned to globalThis so HMR module re-evaluations don't lose in-flight run contexts.
declare global {
  // eslint-disable-next-line no-var
  var __engineActiveRuns: Map<string, RunContext> | undefined;
}

const activeRuns: Map<string, RunContext> = (globalThis.__engineActiveRuns ??= new Map());

export function killRun(runId: string): void {
  activeRuns.get(runId)?.kill();
}

export function resumeRun(
  runId: string,
  taskId: string,
  decision: import("@agent-company/engine").HumanDecision,
): boolean {
  return activeRuns.get(runId)?.resolveHuman(taskId, decision) ?? false;
}

export async function runEngine(runId: string, flowId: string): Promise<void> {
  console.log(`[engine] runEngine START runId=${runId} flowId=${flowId}`);
  const startedAt = Date.now();
  let sequence = 0;
  let ctx: RunContext | null = null;

  // Top-level guard: any unhandled throw publishes run_error and marks run failed
  const handleFatalError = async (err: unknown) => {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[engine] run ${runId} fatal error:`, err);
    const errorEvent = {
      type: "run_error" as const,
      runId,
      error: errorMsg,
      ts: Date.now(),
    };
    runBus.publish(runId, errorEvent);
    try {
      await prisma.traceEventRow.create({
        data: { runId, sequence: sequence++, eventType: "run_error", payload: JSON.stringify(errorEvent) },
      });
    } catch { /* non-fatal */ }
    try {
      await prisma.run.update({
        where: { id: runId },
        data: { status: "failed", completedAt: new Date(), durationMs: Date.now() - startedAt },
      });
    } catch { /* non-fatal */ }
    ctx?.complete();
    activeRuns.delete(runId);
    setTimeout(() => runBus.cleanup(runId), 200);
  };

  // ── 1. Load flow data ─────────────────────────────────────────────────────

  let flow;
  try {
    flow = await prisma.flow.findUnique({
      where: { id: flowId },
      include: { nodes: true, edges: true },
    });
  } catch (err) {
    await handleFatalError(err);
    return;
  }
  if (!flow) {
    await handleFatalError(new Error(`Flow not found: ${flowId}`));
    return;
  }

  console.log(`[engine] flow loaded: "${flow.name}" — ${flow.nodes.length} nodes, ${flow.edges.length} edges`);

  const nodeAgentIds = flow.nodes.map((n) => n.agentId).filter(Boolean) as string[];
  const taskIds = flow.nodes.map((n) => n.taskId).filter(Boolean) as string[];

  // Load tasks first so we can union their assignedAgentId values with nodeAgentIds.
  // FlowNodes created by older canvas saves may not carry agentId directly.
  const dbTasks = taskIds.length > 0
    ? await prisma.task.findMany({ where: { id: { in: taskIds } } })
    : [];

  const taskAssignedAgentIds = dbTasks.map((t) => t.assignedAgentId).filter(Boolean) as string[];
  const agentIds = [...new Set([...nodeAgentIds, ...taskAssignedAgentIds])];

  const dbAgents = agentIds.length > 0
    ? await prisma.agent.findMany({ where: { id: { in: agentIds } } })
    : [];

  const agentRowMap = Object.fromEntries(dbAgents.map((a) => [a.id, a]));
  const taskRowMap = Object.fromEntries(dbTasks.map((t) => [t.id, t]));

  // ── 2. Build FlowConfig ───────────────────────────────────────────────────

  const flowNodes: FlowNodeConfig[] = flow.nodes.map((n) => {
    const node: FlowNodeConfig = {
      id: n.id,
      flowId: n.flowId,
      type: n.type as FlowNodeConfig["type"],
      positionX: n.positionX,
      positionY: n.positionY,
      label: n.label,
    };
    if (n.agentId) node.agentId = n.agentId;
    if (n.taskId) node.taskId = n.taskId;
    if (n.loopType) node.loopType = n.loopType as LoopType;
    if (n.loopMax !== null && n.loopMax !== undefined) node.loopMax = n.loopMax;
    if (n.loopCondition) node.loopCondition = n.loopCondition;
    if (n.conditionExpr) node.conditionExpr = n.conditionExpr;
    if (n.parallelBranchCount !== null && n.parallelBranchCount !== undefined) node.parallelBranchCount = n.parallelBranchCount;
    return node;
  });

  const flowEdges: FlowEdgeConfig[] = flow.edges.map((e) => {
    const edge: FlowEdgeConfig = {
      id: e.id,
      flowId: e.flowId,
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
      type: e.type as EdgeType,
      label: e.label,
    };
    if (e.condition) edge.condition = e.condition;
    return edge;
  });

  const flowConfig: FlowConfig = {
    id: flow.id,
    name: flow.name,
    description: flow.description,
    nodes: flowNodes,
    edges: flowEdges,
  };

  // ── 3. Build AgentConfig map ──────────────────────────────────────────────

  const agents: Record<string, AgentConfig> = {};
  for (const row of dbAgents) {
    const llmParams = JSON.parse(row.llmParams) as { temperature?: number; maxTokens?: number };
    const memoryScope = JSON.parse(row.memoryScope) as string[];
    agents[row.id] = {
      id: row.id,
      name: row.name,
      role: row.role,
      goal: row.goal,
      backstory: row.backstory,
      llmProvider: row.llmProvider as AgentConfig["llmProvider"],
      llmModel: row.llmModel,
      llmParams,
      memoryScope,
      maxIterations: row.maxIterations,
      allowDelegation: row.allowDelegation,
      verbose: row.verbose,
      tools: [], // populated below from AgentTool join
    };
  }

  // Load agent tools
  if (agentIds.length > 0) {
    const agentTools = await prisma.agentTool.findMany({
      where: { agentId: { in: agentIds } },
      include: { tool: true },
    });
    for (const at of agentTools) {
      if (agents[at.agentId]) {
        agents[at.agentId]!.tools.push(at.tool.name);
      }
    }
  }

  console.log(`[engine] agents loaded: ${dbAgents.length} (ids: ${agentIds.join(", ") || "none"})`);
  console.log(`[engine] tasks loaded: ${dbTasks.length} (ids: ${taskIds.join(", ") || "none"})`);

  // ── 4. Build TaskConfig map (resolve assignedAgentId from graph) ──────────

  const tasks: Record<string, TaskConfig> = {};
  for (const node of flow.nodes) {
    if (node.type !== "task" || !node.taskId) continue;

    const dbTask = taskRowMap[node.taskId];
    if (!dbTask) continue;

    // Find the agent node connected to this task node via an incoming edge
    const incomingEdge = flow.edges.find((e) => e.targetNodeId === node.id);
    const agentFlowNode = incomingEdge
      ? flow.nodes.find((n) => n.id === incomingEdge.sourceNodeId && n.type === "agent")
      : null;

    const assignedAgentId = agentFlowNode?.agentId ?? dbTask.assignedAgentId ?? "";
    if (!assignedAgentId) continue; // Skip unassigned tasks

    const contextTaskIds = JSON.parse(dbTask.contextTaskIds) as string[];
    tasks[dbTask.id] = {
      id: dbTask.id,
      description: dbTask.description,
      expectedOutput: dbTask.expectedOutput,
      assignedAgentId,
      contextTaskIds,
      outputFormat: dbTask.outputFormat as TaskConfig["outputFormat"],
      humanInTheLoop: dbTask.humanInTheLoop,
    };
  }

  // ── 5. Adapter factory ────────────────────────────────────────────────────

  const adapterFactory = (agent: AgentConfig) =>
    createAdapter(agent.llmProvider, agent.llmModel);

  // ── 6. Run context ────────────────────────────────────────────────────────

  ctx = new RunContext(runId, {
    timeoutMs: 600_000, // 10 min
  });
  activeRuns.set(runId, ctx);

  // ── 7. Persist helper ─────────────────────────────────────────────────────

  const persistEvent = async (event: Parameters<typeof runBus.publish>[1]) => {
    try {
      await prisma.traceEventRow.create({
        data: {
          runId,
          sequence: sequence++,
          eventType: event.type,
          payload: JSON.stringify(event),
        },
      });
    } catch {
      // Non-fatal — don't interrupt the run if persistence fails
    }
  };

  // ── 8. Tool registry ──────────────────────────────────────────────────────

  // Vault event emitter — publishes vault_read/vault_write as trace events and re-indexes on write
  const emitVaultEvent = (event: { type: string; runId: string; agentId: string; notePath: string; ts: number }) => {
    runBus.publish(runId, event as Parameters<typeof runBus.publish>[1]);
    void persistEvent(event as Parameters<typeof runBus.publish>[1]);
    if (event.type === "vault_write") {
      void reindexNote(prisma as unknown as Parameters<typeof reindexNote>[0], event.notePath);
    }
  };

  const registry = new ToolRegistry();
  registry.register(calculatorTool);
  registry.register(httpFetchTool);

  // Per-agent registry factory: injects vault tools with the correct agent ID
  const registryFactory = (agent: AgentConfig): ToolRegistry => {
    const needsVaultRead = agent.tools.includes("vault_read");
    const needsVaultWrite = agent.tools.includes("vault_write");
    if (!needsVaultRead && !needsVaultWrite) return registry;

    const agentRegistry = new ToolRegistry();
    agentRegistry.register(calculatorTool);
    agentRegistry.register(httpFetchTool);
    if (needsVaultRead) agentRegistry.register(createVaultReadTool(runId));
    if (needsVaultWrite) agentRegistry.register(createVaultWriteTool(agent.id, emitVaultEvent));
    return agentRegistry;
  };

  // Memory context factory: prepend relevant vault notes before upstream task output
  const contextFactory = (agent: AgentConfig, task: TaskConfig, upstream: string): string => {
    const vaultCtx = assembleVaultContext(agent.memoryScope, task.description);
    return [vaultCtx, upstream].filter(Boolean).join("\n\n");
  };

  // ── 9. Execute ────────────────────────────────────────────────────────────

  console.log(`[engine] executable tasks: ${Object.keys(tasks).length} — ${Object.keys(tasks).join(", ") || "NONE"}`);
  for (const [id, t] of Object.entries(tasks)) {
    console.log(`  task ${id}: assignedAgentId=${t.assignedAgentId}, description="${t.description.slice(0, 60)}"`);
  }

  // Diagnose why no tasks were found so the user gets an actionable error
  if (Object.keys(tasks).length === 0) {
    const taskNodes = flow.nodes.filter((n) => n.type === "task");
    let reason: string;
    if (taskNodes.length === 0) {
      const nodeTypes = [...new Set(flow.nodes.map((n) => n.type))].join(", ");
      reason = `The flow has no Task nodes (found node types: ${nodeTypes || "none"}). Add a Task node to the canvas, connect it to an Agent node, and save.`;
    } else if (taskNodes.every((n) => !n.taskId)) {
      reason = `Found ${taskNodes.length} task node(s) but none have a saved taskId — the flow was saved before a bug fix. Open the canvas, reconfigure your task nodes, and save again.`;
    } else {
      reason = `Found ${taskNodes.length} task node(s) but could not resolve an assigned agent for any of them. Make sure each task node has an incoming connection from an Agent node and the flow has been saved.`;
    }
    const noTasksError = {
      type: "run_error" as const,
      runId,
      error: reason,
      ts: Date.now(),
    };
    runBus.publish(runId, noTasksError);
    await persistEvent(noTasksError);
    await prisma.run.update({
      where: { id: runId },
      data: { status: "failed", completedAt: new Date(), durationMs: Date.now() - startedAt },
    });
    ctx?.complete();
    activeRuns.delete(runId);
    setTimeout(() => runBus.cleanup(runId), 200);
    return;
  }

  let totalTokens = 0;
  let totalCostUsd = 0;

  console.log(`[engine] starting flowRunner for run ${runId}`);
  console.log(`[engine] agents map keys: [${Object.keys(agents).join(", ")}]`);
  console.log(`[engine] tasks map:`, Object.fromEntries(Object.entries(tasks).map(([k, t]) => [k, { assignedAgentId: t.assignedAgentId, desc: t.description.slice(0, 40) }])));

  try {
    const runner = flowRunner({
      flow: flowConfig,
      agents,
      tasks,
      adapterFactory,
      registry,
      ctx,
      registryFactory,
      contextFactory,
    });

    for await (const event of runner) {
      console.log(`[engine] event: ${event.type}`);
      runBus.publish(runId, event);
      void persistEvent(event);

      if (event.type === "run_completed") {
        totalTokens = event.totalTokens;
        totalCostUsd = event.totalCostUsd;
      }

      // Auto-write task output to vault when outputFormat is "markdown-note"
      if (event.type === "task_completed") {
        const task = tasks[event.taskId];
        if (task?.outputFormat === "markdown-note" && event.output) {
          const slug = task.description.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const notePath = `outputs/${slug || event.taskId}.md`;
          try {
            writeNote(notePath, event.output);
            void reindexNote(prisma as unknown as Parameters<typeof reindexNote>[0], notePath);
            const vaultEvent = { type: "vault_write" as const, runId, agentId: task.assignedAgentId, notePath, ts: Date.now() };
            runBus.publish(runId, vaultEvent);
            void persistEvent(vaultEvent);
            console.log(`[engine] auto-wrote vault note: ${notePath}`);
          } catch (err) {
            console.error(`[engine] failed to auto-write vault note:`, err);
          }
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "completed",
        completedAt: new Date(),
        durationMs,
        totalTokens,
        totalCostUsd,
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[engine] run ${runId} FAILED:`, err);
    const errorEvent = {
      type: "run_error" as const,
      runId,
      error: errorMsg,
      ts: Date.now(),
    };
    runBus.publish(runId, errorEvent);
    void persistEvent(errorEvent);

    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "failed",
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
      },
    });
  } finally {
    ctx?.complete();
    activeRuns.delete(runId);
    // Give SSE subscribers ~200ms to flush before cleaning up
    setTimeout(() => runBus.cleanup(runId), 200);
  }
}
