import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import type { LLMAdapter, Message, CompletionOptions, StreamChunk } from "./base";

export class OpenAIAdapter implements LLMAdapter {
  readonly provider = "openai";
  readonly model: string;
  private client: OpenAI;

  constructor(model: string, apiKey?: string) {
    this.model = model;
    this.client = new OpenAI({ apiKey: apiKey ?? process.env["OPENAI_API_KEY"] });
  }

  async *complete(messages: Message[], opts: CompletionOptions): AsyncIterable<StreamChunk> {
    const oaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map(toOAIMessage);
    const tools: OpenAI.Chat.ChatCompletionTool[] | undefined =
      opts.tools && opts.tools.length > 0
        ? opts.tools.map((t) => ({
            type: "function" as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.inputSchema as Record<string, unknown>,
            },
          }))
        : undefined;

    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.3,
      messages: oaiMessages,
      ...(tools ? { tools, tool_choice: "auto" } : {}),
      stream: true,
      stream_options: { include_usage: true },
    });

    // Accumulate tool call deltas (OpenAI may split across chunks)
    const toolCallBuffers: Record<number, { id: string; name: string; argsBuf: string }> = {};
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      const usage = chunk.usage;

      if (usage) {
        inputTokens = usage.prompt_tokens;
        outputTokens = usage.completion_tokens;
      }

      if (!delta) continue;

      if (delta.content) {
        yield { kind: "token", text: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallBuffers[idx]) {
            toolCallBuffers[idx] = { id: tc.id ?? randomUUID(), name: tc.function?.name ?? "", argsBuf: "" };
          }
          if (tc.function?.name) toolCallBuffers[idx]!.name = tc.function.name;
          if (tc.function?.arguments) toolCallBuffers[idx]!.argsBuf += tc.function.arguments;
        }
      }

      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason === "tool_calls") {
        for (const buf of Object.values(toolCallBuffers)) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(buf.argsBuf) as Record<string, unknown>; } catch { /* partial */ }
          yield { kind: "tool_call", call: { callId: buf.id, name: buf.name, args } };
        }
      }

      if (finishReason === "stop" || finishReason === "tool_calls") {
        yield { kind: "done", usage: { inputTokens, outputTokens } };
      }
    }
  }
}

function toOAIMessage(msg: Message): OpenAI.Chat.ChatCompletionMessageParam {
  if (msg.role === "tool") {
    return { role: "tool", content: msg.content, tool_call_id: msg.toolCallId ?? "" };
  }
  return { role: msg.role as "user" | "assistant", content: msg.content };
}
