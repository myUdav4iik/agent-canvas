/**
 * Converts between React Flow's node/edge format and the Prisma DB format.
 * Centralises all the messy field mapping in one place.
 */
import type { Node, Edge } from "@xyflow/react";
import type {
  FlowNode as DbNode,
  FlowEdge as DbEdge,
  Agent as DbAgent,
  Task as DbTask,
} from "@prisma/client";

// ─── Node data shapes (what lives inside each React Flow node's .data) ───────

export interface AgentNodeData extends Record<string, unknown> {
  label: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
  llmProvider: string;
  llmModel: string;
  temperature: number;
  maxTokens: number;
  maxIterations: number;
  allowDelegation: boolean;
  verbose: boolean;
  tools: string[];
  memoryScope: string[];
  /** DB id set after first save; used to upsert on subsequent saves */
  agentId?: string;
  /** Runtime only — not persisted */
  runState?: "idle" | "active" | "done" | "error";
}

export interface TaskNodeData extends Record<string, unknown> {
  label: string;
  description: string;
  expectedOutput: string;
  outputFormat: "text" | "json" | "markdown-note";
  humanInTheLoop: boolean;
  contextTaskIds: string[];
  /** DB id of the agent assigned to execute this task */
  assignedAgentId?: string;
  /** DB id set after first save */
  taskId?: string;
  runState?: "idle" | "active" | "done" | "error";
}

export interface LoopNodeData extends Record<string, unknown> {
  label: string;
  loopType: "fixed-n" | "while" | "until" | "for-each";
  loopMax: number;
  loopCondition: string;
  runState?: "idle" | "active" | "done" | "error";
  currentIteration?: number;
}

export interface ConditionNodeData extends Record<string, unknown> {
  label: string;
  conditionExpr: string;
  runState?: "idle" | "active" | "done" | "error";
}

export interface ControlNodeData extends Record<string, unknown> {
  label: string;
  runState?: "idle" | "active" | "done" | "error";
}

export type AnyNodeData =
  | AgentNodeData
  | TaskNodeData
  | LoopNodeData
  | ConditionNodeData
  | ControlNodeData;

// ─── DB → React Flow ─────────────────────────────────────────────────────────

export function dbNodeToRF(
  n: DbNode,
  agent?: DbAgent | null,
  task?: DbTask | null,
  /** Tool names from the AgentTool join table for this agent */
  toolNames: string[] = [],
): Node<AnyNodeData> {
  const base = {
    id: n.id,
    type: n.type,
    position: { x: n.positionX, y: n.positionY },
  };

  switch (n.type) {
    case "agent": {
      const llmParams = agent ? (JSON.parse(agent.llmParams) as { temperature?: number; maxTokens?: number }) : {};
      const data: AgentNodeData = {
        label: n.label || agent?.name || "Agent",
        name: agent?.name ?? "",
        role: agent?.role ?? "",
        goal: agent?.goal ?? "",
        backstory: agent?.backstory ?? "",
        llmProvider: agent?.llmProvider ?? "claude-cli",
        llmModel: agent?.llmModel ?? "sonnet",
        temperature: llmParams.temperature ?? 0.3,
        maxTokens: llmParams.maxTokens ?? 2048,
        maxIterations: agent?.maxIterations ?? 8,
        allowDelegation: agent?.allowDelegation ?? false,
        verbose: agent?.verbose ?? false,
        tools: toolNames,
        memoryScope: agent ? (JSON.parse(agent.memoryScope) as string[]) : [],
        ...(n.agentId ? { agentId: n.agentId } : {}),
      };
      return { ...base, data };
    }
    case "task": {
      const data: TaskNodeData = {
        label: n.label || "Task",
        description: task?.description ?? "",
        expectedOutput: task?.expectedOutput ?? "",
        outputFormat: (task?.outputFormat as TaskNodeData["outputFormat"]) ?? "text",
        humanInTheLoop: task?.humanInTheLoop ?? false,
        contextTaskIds: task ? (JSON.parse(task.contextTaskIds) as string[]) : [],
        ...(n.taskId ? { taskId: n.taskId } : {}),
        ...(task?.assignedAgentId ? { assignedAgentId: task.assignedAgentId } : {}),
      };
      return { ...base, data };
    }
    case "loop": {
      const data: LoopNodeData = {
        label: n.label || "Loop",
        loopType: (n.loopType as LoopNodeData["loopType"]) ?? "fixed-n",
        loopMax: n.loopMax ?? 3,
        loopCondition: n.loopCondition ?? "",
      };
      return { ...base, data };
    }
    case "condition": {
      const data: ConditionNodeData = {
        label: n.label || "Condition",
        conditionExpr: n.conditionExpr ?? "",
      };
      return { ...base, data };
    }
    default: {
      const data: ControlNodeData = { label: n.label || n.type };
      return { ...base, data };
    }
  }
}

export function dbEdgeToRF(e: DbEdge): Edge {
  const label = e.label || undefined;
  return {
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    type: e.type,
    ...(label !== undefined ? { label } : {}),
    // sourceHandle is not persisted; condition nodes name their handles "true"/"false",
    // so re-attach conditional edges to the matching handle instead of the default (first) one
    ...(label === "true" || label === "false" ? { sourceHandle: label } : {}),
    data: { condition: e.condition ?? undefined },
  };
}

// ─── React Flow → DB (upsert payload shapes) ─────────────────────────────────

export interface SaveNodePayload {
  rfId: string;
  type: string;
  positionX: number;
  positionY: number;
  label: string;
  agentData?: Omit<AgentNodeData, "label" | "runState">;
  taskData?: Omit<TaskNodeData, "label" | "runState">;
  loopType?: string;
  loopMax?: number;
  loopCondition?: string;
  conditionExpr?: string;
  parallelBranchCount?: number;
}

export interface SaveEdgePayload {
  rfId: string;
  sourceRfId: string;
  targetRfId: string;
  type: string;
  label: string;
  condition?: string;
}

export function rfNodeToSavePayload(n: Node<AnyNodeData>): SaveNodePayload {
  const payload: SaveNodePayload = {
    rfId: n.id,
    type: n.type ?? "start",
    positionX: n.position.x,
    positionY: n.position.y,
    label: (n.data as { label?: string }).label ?? "",
  };

  if (n.type === "agent") {
    payload.agentData = n.data as AgentNodeData;
  } else if (n.type === "task") {
    payload.taskData = n.data as TaskNodeData;
  } else if (n.type === "loop") {
    const d = n.data as LoopNodeData;
    payload.loopType = d.loopType;
    payload.loopMax = d.loopMax;
    payload.loopCondition = d.loopCondition;
  } else if (n.type === "condition") {
    payload.conditionExpr = (n.data as ConditionNodeData).conditionExpr;
  } else if (n.type === "parallel") {
    const bc = (n.data as { parallelBranchCount?: number }).parallelBranchCount;
    if (bc !== undefined) payload.parallelBranchCount = bc;
  }
  return payload;
}

export function rfEdgeToSavePayload(e: Edge): SaveEdgePayload {
  const condition = (e.data as { condition?: string } | undefined)?.condition;
  return {
    rfId: e.id,
    sourceRfId: e.source,
    targetRfId: e.target,
    type: e.type ?? "sequential",
    label: typeof e.label === "string" ? e.label : "",
    ...(condition !== undefined ? { condition } : {}),
  };
}
