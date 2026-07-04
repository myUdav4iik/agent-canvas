import { randomUUID } from "node:crypto";
import type { LLMAdapter, Message, CompletionOptions, StreamChunk } from "./base";

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
}

interface OllamaTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface OllamaChunk {
  message?: {
    content?: string;
    tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
  };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaAdapter implements LLMAdapter {
  readonly provider = "ollama";
  readonly model: string;
  private baseUrl: string;

  constructor(model: string, baseUrl?: string) {
    this.model = model;
    this.baseUrl = (baseUrl ?? process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434").replace(/\/$/, "");
  }

  async *complete(messages: Message[], opts: CompletionOptions): AsyncIterable<StreamChunk> {
    const ollamaMessages: OllamaMessage[] = messages.map(toOllamaMessage);
    const tools: OllamaTool[] | undefined =
      opts.tools && opts.tools.length > 0
        ? opts.tools.map((t) => ({
            type: "function" as const,
            function: { name: t.name, description: t.description, parameters: t.inputSchema as Record<string, unknown> },
          }))
        : undefined;

    const body = JSON.stringify({
      model: this.model,
      messages: ollamaMessages,
      stream: true,
      options: {
        temperature: opts.temperature ?? 0.3,
        num_predict: opts.maxTokens ?? 4096,
      },
      ...(tools ? { tools } : {}),
    });

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!res.ok || !res.body) {
      throw new Error(`Ollama API error ${res.status}: ${await res.text()}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let inputTokens = 0;
    let outputTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        let chunk: OllamaChunk;
        try { chunk = JSON.parse(line) as OllamaChunk; } catch { continue; }

        if (chunk.prompt_eval_count) inputTokens = chunk.prompt_eval_count;
        if (chunk.eval_count) outputTokens = chunk.eval_count;

        if (chunk.message?.content) {
          yield { kind: "token", text: chunk.message.content };
        }

        if (chunk.message?.tool_calls) {
          for (const tc of chunk.message.tool_calls) {
            yield {
              kind: "tool_call",
              call: {
                callId: randomUUID(),
                name: tc.function.name,
                args: tc.function.arguments,
              },
            };
          }
        }

        if (chunk.done) {
          yield { kind: "done", usage: { inputTokens, outputTokens } };
        }
      }
    }
  }
}

function toOllamaMessage(msg: Message): OllamaMessage {
  if (msg.role === "tool") return { role: "tool", content: msg.content };
  return { role: msg.role as OllamaMessage["role"], content: msg.content };
}
