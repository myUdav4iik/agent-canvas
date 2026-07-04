#!/usr/bin/env tsx
/**
 * CLI test harness for Milestone 1.
 * Uses the local `claude` CLI by default. Set ANTHROPIC_API_KEY to use the SDK adapter instead.
 *
 * Usage:
 *   pnpm harness
 *   TASK="What is the square root of 144?" pnpm harness
 *   USE_SDK=1 pnpm harness     # force Anthropic SDK (requires ANTHROPIC_API_KEY)
 */
import "node:process";
import { randomUUID } from "node:crypto";
import type { AgentConfig, TaskConfig, TraceEvent } from "@agent-company/shared";
import type { LLMAdapter } from "../adapters/base";
import { AnthropicAdapter } from "../adapters/anthropic";
import { ClaudeCliAdapter } from "../adapters/claude-cli";
import { ToolRegistry } from "../tools/registry";
import { calculatorTool } from "../tools/builtin/calculator";
import { httpFetchTool } from "../tools/builtin/http-fetch";
import { webSearchTool } from "../tools/builtin/web-search";
import { agentRunner } from "../orchestrator/agent-runner";
import { RunContext } from "../safety/guards";

// ANSI colors
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

function colorEvent(event: TraceEvent): string {
  const ts = new Date(event.ts).toISOString().slice(11, 23);
  const prefix = `${c.gray}[${ts}]${c.reset} `;

  switch (event.type) {
    case "agent_started":
      return `${prefix}${c.bold}${c.blue}▶ AGENT STARTED${c.reset} ${c.bold}${event.agentName}${c.reset} → task ${event.taskId}`;
    case "agent_thought":
      return `${prefix}${c.cyan}💭 THOUGHT${c.reset} ${event.thought}`;
    case "token_stream":
      return ""; // printed inline
    case "tool_call":
      return `${prefix}${c.yellow}🔧 TOOL CALL${c.reset} ${c.bold}${event.tool}${c.reset}(${JSON.stringify(event.args)})  [${event.callId.slice(0, 8)}]`;
    case "tool_result":
      return `${prefix}${c.green}✅ TOOL RESULT${c.reset} [${event.callId.slice(0, 8)}] ${JSON.stringify(event.result).slice(0, 200)}${event.error ? c.red + " ERR: " + event.error + c.reset : ""}`;
    case "task_completed":
      return `\n${prefix}${c.bold}${c.green}✔ TASK COMPLETED${c.reset}\n${c.bold}Output:${c.reset} ${event.output}`;
    case "max_iterations_reached":
      return `${prefix}${c.red}⚠ MAX ITERATIONS REACHED${c.reset} (${event.iterations})`;
    case "run_completed":
      return `\n${prefix}${c.bold}${c.magenta}🏁 RUN COMPLETED${c.reset} ${event.durationMs}ms | ${event.totalTokens} tokens`;
    case "run_error":
      return `${prefix}${c.red}💥 RUN ERROR${c.reset} ${event.error}`;
    default:
      return `${prefix}${c.dim}${event.type}${c.reset}`;
  }
}

async function main() {
  const useSdk = Boolean(process.env["USE_SDK"]);
  const apiKey = process.env["ANTHROPIC_API_KEY"];

  if (useSdk && !apiKey) {
    console.error(`${c.red}Error: USE_SDK=1 requires ANTHROPIC_API_KEY to be set.${c.reset}`);
    process.exit(1);
  }

  const taskDescription =
    process.env["TASK"] ??
    "Calculate the area of a circle with radius 7.5 and also the volume of a sphere with the same radius. Show your work.";

  const runId = randomUUID();
  const agentId = randomUUID();
  const taskId = randomUUID();
  const nodeId = randomUUID();

  // Default to claude-cli; fall back to Anthropic SDK if USE_SDK=1
  const provider = useSdk ? "anthropic" : "claude-cli";
  const model = useSdk ? "claude-sonnet-4-6" : "sonnet";

  const agent: AgentConfig = {
    id: agentId,
    name: "Aria",
    role: "Research & Calculation Specialist",
    goal: "Complete tasks accurately using available tools",
    backstory: "A precise and methodical agent with expertise in mathematics and information retrieval.",
    llmProvider: provider,
    llmModel: model,
    llmParams: { temperature: 0.3, maxTokens: 2048 },
    memoryScope: [],
    maxIterations: 8,
    allowDelegation: false,
    verbose: true,
    tools: ["calculator", "http_fetch"],
  };

  const task: TaskConfig = {
    id: taskId,
    description: taskDescription,
    expectedOutput: "A clear, complete answer showing all calculations.",
    assignedAgentId: agentId,
    contextTaskIds: [],
    outputFormat: "text",
    humanInTheLoop: false,
  };

  const registry = new ToolRegistry();
  registry.register(calculatorTool);
  registry.register(httpFetchTool);
  registry.register(webSearchTool);

  let adapter: LLMAdapter;
  if (useSdk) {
    adapter = new AnthropicAdapter(agent.llmModel, apiKey!);
    console.log(`${c.dim}Adapter: Anthropic SDK (${agent.llmModel})${c.reset}`);
  } else {
    adapter = new ClaudeCliAdapter(agent.llmModel);
    console.log(`${c.dim}Adapter: claude CLI (model: ${agent.llmModel})${c.reset}`);
  }

  const ctx = new RunContext(runId, { timeoutMs: 5 * 60 * 1000 });

  console.log(`\n${c.bold}${c.magenta}═══ Agent Company — CLI Harness ═══${c.reset}`);
  console.log(`${c.dim}Run ID: ${runId}${c.reset}`);
  console.log(`${c.dim}Task:   ${taskDescription}${c.reset}\n`);

  let tokenBuf = "";
  const startMs = Date.now();

  try {
    for await (const event of agentRunner({ agent, task, context: "", adapter, registry, ctx, nodeId })) {
      if (event.type === "token_stream") {
        tokenBuf += event.token;
        process.stdout.write(event.token);
        continue;
      }

      if (tokenBuf) {
        process.stdout.write("\n");
        tokenBuf = "";
      }

      const line = colorEvent(event);
      if (line) console.log(line);
    }

    ctx.complete();
    const durationMs = Date.now() - startMs;
    console.log(`\n${c.dim}Done in ${durationMs}ms${c.reset}\n`);
  } catch (err) {
    console.error(`\n${c.red}Fatal: ${err instanceof Error ? err.message : String(err)}${c.reset}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
