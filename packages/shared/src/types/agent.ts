export type LLMProvider = "anthropic" | "openai" | "ollama" | "claude-cli";

export interface LLMParams {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
  llmProvider: LLMProvider;
  llmModel: string;
  llmParams: LLMParams;
  /** Vault folder paths or #tags the agent can read/write */
  memoryScope: string[];
  maxIterations: number;
  allowDelegation: boolean;
  verbose: boolean;
  /** Tool names from the registry this agent can use */
  tools: string[];
}

/** Shape returned from Prisma (before parsing JSON fields) */
export interface AgentRow {
  id: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
  llmProvider: string;
  llmModel: string;
  llmParams: string;   // JSON
  memoryScope: string; // JSON
  maxIterations: number;
  allowDelegation: boolean;
  verbose: boolean;
  createdAt: Date;
  updatedAt: Date;
}
