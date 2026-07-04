export type OutputFormat = "text" | "json" | "markdown-note";

export interface TaskConfig {
  id: string;
  description: string;
  expectedOutput: string;
  assignedAgentId: string;
  /** IDs of upstream tasks whose outputs feed in as context */
  contextTaskIds: string[];
  outputFormat: OutputFormat;
  /** JSON Schema string if outputFormat is "json" */
  outputSchema?: string;
  humanInTheLoop: boolean;
}
