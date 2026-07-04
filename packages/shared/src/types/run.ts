export type RunStatus = "running" | "completed" | "failed" | "killed" | "paused";

export interface RunConfig {
  id: string;
  flowId: string;
  status: RunStatus;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  totalTokens: number;
  totalCostUsd: number;
}

export interface RunMetrics {
  durationMs: number;
  totalTokens: number;
  totalCostUsd: number;
  toolCallCount: number;
  iterationCount: number;
}
