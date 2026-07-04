export type FlowNodeType =
  | "start"
  | "end"
  | "agent"
  | "task"
  | "loop"
  | "condition"
  | "parallel"
  | "join";

export type LoopType = "fixed-n" | "while" | "until" | "for-each";

export type EdgeType = "sequential" | "conditional" | "loop" | "parallel";

export interface FlowNodeConfig {
  id: string;
  flowId: string;
  type: FlowNodeType;
  positionX: number;
  positionY: number;
  label: string;
  agentId?: string;
  taskId?: string;
  loopType?: LoopType;
  loopMax?: number;
  /** Expression evaluated against RunState to break the loop */
  loopCondition?: string;
  /** Expression evaluated against RunState to choose branch */
  conditionExpr?: string;
  parallelBranchCount?: number;
}

export interface FlowEdgeConfig {
  id: string;
  flowId: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: EdgeType;
  label: string;
  /** Expression for conditional edges — truthy routes along this edge */
  condition?: string;
}

export interface FlowConfig {
  id: string;
  name: string;
  description: string;
  nodes: FlowNodeConfig[];
  edges: FlowEdgeConfig[];
}

/** Live run-time state threaded through the flow graph */
export interface RunState {
  runId: string;
  /** Output of each completed node, keyed by nodeId */
  outputs: Record<string, string>;
  /** Accumulated variables set by loop nodes, keyed by loopNodeId */
  loopAccumulators: Record<string, Record<string, unknown>>;
  /** Misc key-value store for condition expressions to read */
  vars: Record<string, unknown>;
  delegationDepth: number;
}
