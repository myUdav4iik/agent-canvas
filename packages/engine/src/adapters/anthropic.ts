import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type { LLMAdapter, Message, CompletionOptions, StreamChunk } from "./base";

export class AnthropicAdapter implements LLMAdapter {
  readonly provider = "anthropic";
  readonly model: string;
  private client: Anthropic;

  constructor(model: string, apiKey?: string) {
    this.model = model;
    this.client = new Anthropic({ apiKey: apiKey ?? process.env["ANTHROPIC_API_KEY"] });
  }

  async *complete(
    messages: Message[],
    opts: CompletionOptions,
  ): AsyncIterable<StreamChunk> {
    const anthropicMessages = messages.map(toAnthropicMessage);
    const tools = opts.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
    }));

    const stream = await this.client.messages.stream({
      model: this.model,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.3,
      messages: anthropicMessages,
      ...(tools && tools.length > 0 ? { tools } : {}),
    });

    let inputTokens = 0;
    let outputTokens = 0;
    let currentToolName = "";
    let currentToolId = "";
    // Accumulate JSON string for tool_input deltas
    let toolInputBuf = "";

    for await (const event of stream) {
      if (event.type === "message_start") {
        inputTokens = event.message.usage.input_tokens;
      } else if (event.type === "message_delta") {
        outputTokens = event.usage.output_tokens;
      } else if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          currentToolName = event.content_block.name;
          currentToolId = event.content_block.id;
          toolInputBuf = "";
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield { kind: "token", text: event.delta.text };
        } else if (event.delta.type === "input_json_delta") {
          toolInputBuf += event.delta.partial_json;
        }
      } else if (event.type === "content_block_stop") {
        if (currentToolName) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(toolInputBuf) as Record<string, unknown>;
          } catch {
            // partial JSON — treat as empty args
          }
          yield {
            kind: "tool_call",
            call: {
              callId: currentToolId || randomUUID(),
              name: currentToolName,
              args,
            },
          };
          currentToolName = "";
          currentToolId = "";
          toolInputBuf = "";
        }
      } else if (event.type === "message_stop") {
        yield { kind: "done", usage: { inputTokens, outputTokens } };
      }
    }
  }
}

function toAnthropicMessage(msg: Message): Anthropic.MessageParam {
  if (msg.role === "tool") {
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: msg.toolCallId ?? "",
          content: msg.content,
        },
      ],
    };
  }
  return { role: msg.role as "user" | "assistant", content: msg.content };
}
