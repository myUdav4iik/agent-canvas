export type CrewProcess = "sequential" | "hierarchical";

export interface CrewConfig {
  id: string;
  name: string;
  process: CrewProcess;
  agentIds: string[];
  taskIds: string[];
  /** For hierarchical process: the manager agent ID */
  managerAgentId?: string;
  flowId?: string;
}
