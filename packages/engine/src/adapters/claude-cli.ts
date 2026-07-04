import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { LLMAdapter, Message, CompletionOptions, StreamChunk, ToolSchema } from "./base";

/**
 * Adapter that drives the local `claude` CLI (Claude Code) instead of calling the
 * Anthropic API directly. Uses text-based ReAct format since the CLI does not
 * expose native tool-calling to subprocesses.
 *
 * Flow per iteration:
 *   spawn(claude -p --tools "" --system-prompt "..." --model "...")
 *   → stream stdout tokens
 *   → on close: parse "Action: / Action Input:" for tool calls
 *                  or "Final Answer:" for terminal output
 */
export class ClaudeCliAdapter implements LLMAdapter {
  readonly provider = "claude-cli";
  readonly model: string;
  private readonly cliPath: string;

  constructor(model: string = "sonnet", cliPath: string = "claude") {
    this.model = model;
    this.cliPath = cliPath;
  }

  async *complete(
    messages: Message[],
    opts: CompletionOptions,
  ): AsyncIterable<StreamChunk> {
    const { systemPrompt, userMessage, inputCharCount } = this.buildPrompt(messages, opts.tools ?? []);

    const args = [
      "--print",
      "--tools", "",                 // disable all Claude Code built-in tools
      "--no-session-persistence",    // don't write session files
      "--output-format", "text",     // raw text stream
      "--model", this.model,
      "--system-prompt", systemPrompt,
    ];

    const proc = spawn(this.cliPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    // Write user message to stdin
    proc.stdin.write(userMessage, "utf8");
    proc.stdin.end();

    // Collect stderr for error reporting (don't yield it)
    const stderrChunks: Buffer[] = [];
    proc.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    // Stream stdout tokens as they arrive
    let fullText = "";
    for await (const chunk of proc.stdout) {
      const text = (chunk as Buffer).toString("utf8");
      fullText += text;
      yield { kind: "token", text };
    }

    // Wait for process exit
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      proc.on("close", resolve);
      proc.on("error", reject);
    });

    if (exitCode !== 0 && exitCode !== null) {
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      throw new Error(`claude CLI exited with code ${exitCode}. stderr: ${stderr.slice(0, 500)}`);
    }

    // Parse the full response: does it contain a tool call?
    const parsed = parseReActResponse(fullText);
    if (parsed?.kind === "tool_call") {
      yield {
        kind: "tool_call",
        call: {
          callId: randomUUID(),
          name: parsed.name,
          args: parsed.args,
        },
      };
    }

    // CLI doesn't report usage — estimate from character counts (1 token ≈ 4 chars)
    yield { kind: "done", usage: { inputTokens: Math.ceil(inputCharCount / 4), outputTokens: Math.ceil(fullText.length / 4) } };
  }

  /**
   * Build the system prompt (passed via --system-prompt flag) and the user message
   * (sent via stdin). The system prompt contains the agent persona + tool instructions.
   * The user message contains the task + conversation history from prior iterations.
   */
  private buildPrompt(
    messages: Message[],
    tools: ToolSchema[],
  ): { systemPrompt: string; userMessage: string; inputCharCount: number } {
    const agentContext = messages[0]?.content ?? "";

    const toolSection =
      tools.length > 0
        ? `\n\n${buildToolInstructions(tools)}`
        : "\n\nWhen you have completed the task, respond with:\nFinal Answer: [your complete answer]";

    const systemPrompt = agentContext + toolSection;

    const history = messages.slice(1);
    const userMessage =
      history.length === 0
        ? "Please complete the task."
        : `Continue the conversation from where you left off:\n\n${formatHistory(history)}\n\nContinue:`;

    return { systemPrompt, userMessage, inputCharCount: systemPrompt.length + userMessage.length };
  }
}

function buildToolInstructions(tools: ToolSchema[]): string {
  const toolList = tools
    .map((t) => {
      const schema = t.inputSchema as {
        properties?: Record<string, { type: string; description?: string }>;
        required?: string[];
      };
      const props = Object.entries(schema.properties ?? {})
        .map(([k, v]) => `    "${k}" (${v.type}${schema.required?.includes(k) ? ", required" : ""}): ${v.description ?? ""}`)
        .join("\n");
      return `**${t.name}**: ${t.description}\n  Parameters:\n${props}`;
    })
    .join("\n\n");

  return `TOOL USE INSTRUCTIONS
=====================
When you need to use a tool, output EXACTLY this format (nothing else on those lines):

Thought: [your step-by-step reasoning]
Action: [tool_name]
Action Input: [{"param": "value"}]

After seeing an Observation, continue reasoning. When you have the final answer:

Thought: [final reasoning]
Final Answer: [your complete response]

If no tools are needed, respond directly with:

Final Answer: [your complete response]

AVAILABLE TOOLS
===============
${toolList}`;
}

/**
 * Convert the Message[] history (role: assistant / tool) back into
 * the text-based ReAct format so the model can continue the conversation.
 */
function formatHistory(messages: Message[]): string {
  return messages
    .map((msg) => {
      if (msg.role === "assistant") {
        // Extract tool call from the JSON we stored
        try {
          const parsed = JSON.parse(msg.content) as {
            tool_use?: { name: string; input: Record<string, unknown> };
          };
          if (parsed.tool_use) {
            return `Action: ${parsed.tool_use.name}\nAction Input: ${JSON.stringify(parsed.tool_use.input)}`;
          }
        } catch {
          // Plain text assistant message
        }
        return msg.content;
      }
      if (msg.role === "tool") {
        return `Observation: ${msg.content}`;
      }
      return `Human: ${msg.content}`;
    })
    .join("\n");
}

/**
 * Parse the model's raw text output for either a tool call or a final answer.
 * Returns null if the text is empty or unparseable.
 */
export function parseReActResponse(text: string):
  | { kind: "tool_call"; name: string; args: Record<string, unknown> }
  | { kind: "final_answer"; text: string }
  | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Tool call: look for Action: <name> followed by Action Input: <json>
  const actionMatch = trimmed.match(/Action:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\n/);
  // Match the JSON object after "Action Input:" — handles multi-line JSON
  const actionInputMatch = trimmed.match(/Action Input:\s*(\{[\s\S]*?\})\s*(?:\n|$)/);

  if (actionMatch?.[1] && actionInputMatch?.[1]) {
    const name = actionMatch[1].trim();
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(actionInputMatch[1]) as Record<string, unknown>;
    } catch {
      // Malformed JSON — pass empty args, the tool's executor will surface the error
    }
    return { kind: "tool_call", name, args };
  }

  // Final answer
  const finalMatch = trimmed.match(/Final Answer:\s*([\s\S]+)/);
  if (finalMatch?.[1]) {
    return { kind: "final_answer", text: finalMatch[1].trim() };
  }

  // No ReAct markers — treat the entire response as the final answer
  return { kind: "final_answer", text: trimmed };
}
