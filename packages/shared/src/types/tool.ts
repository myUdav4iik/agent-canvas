export type BuiltinToolName =
  | "calculator"
  | "http_fetch"
  | "web_search"
  | "vault_read"
  | "vault_write"
  | "code_runner"
  | "delegate"; // synthetic delegation tool, injected at runtime

export type ToolType = "builtin" | "user_defined";

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the arguments object */
  argsSchema: Record<string, unknown>;
}

export interface ToolConfig {
  id: string;
  name: string;
  description: string;
  type: ToolType;
  argsSchema: Record<string, unknown>;
  /** For user_defined tools: JS function body receiving (args) */
  funcBody?: string;
  /** For user_defined tools: HTTP endpoint to POST args to */
  httpEndpoint?: string;
}

export interface ToolCall {
  callId: string;
  name: string;
  args: Record<string, unknown>;
}

export type ToolResult = {
  callId: string;
  result: unknown;
  error?: string;
};
