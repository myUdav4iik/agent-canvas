import type { ToolCall } from "@agent-company/shared";

export interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  /** Present when role is "tool" */
  toolCallId?: string;
}

export interface CompletionOptions {
  tools?: ToolSchema[];
  maxTokens?: number;
  temperature?: number;
}

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
}

/** Yielded items from the adapter stream */
export type StreamChunk =
  | { kind: "token"; text: string }
  | { kind: "tool_call"; call: ToolCall }
  | { kind: "done"; usage: UsageStats };

/** Provider-agnostic LLM interface. Each adapter streams chunks. */
export interface LLMAdapter {
  readonly provider: string;
  readonly model: string;

  complete(
    messages: Message[],
    opts: CompletionOptions,
  ): AsyncIterable<StreamChunk>;
}
