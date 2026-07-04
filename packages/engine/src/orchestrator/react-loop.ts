import { randomUUID } from "node:crypto";
import type { AgentConfig, TaskConfig, TraceEvent } from "@agent-company/shared";
import type { LLMAdapter, Message } from "../adapters/base";
import type { ToolRegistry } from "../tools/registry";
import type { RunContext } from "../safety/guards";

/**
 * Core ReAct (Reason + Act) loop.
 *
 * Yields TraceEvents. Terminates on:
 *   - Final answer from the model (task_completed)
 *   - maxIterations exceeded (max_iterations_reached)
 *   - AbortSignal fired (throws RunTimeoutError / RunKilledError)
 *
 * The caller is responsible for persisting and forwarding events.
 */
export async function* reactLoop(
  agent: AgentConfig,
  task: TaskConfig,
  context: string,
  adapter: LLMAdapter,
  registry: ToolRegistry,
  ctx: RunContext,
  /** nodeId of the task node in the flow graph (for UI state tracking) */
  nodeId: string,
): AsyncGenerator<TraceEvent> {
  ctx.throwIfAborted();

  yield {
    type: "agent_started",
    runId: ctx.runId,
    agentId: agent.id,
    agentName: agent.name,
    taskId: task.id,
    ts: Date.now(),
  };

  // Human-in-the-loop: pause before running the LLM if requested
  if (task.humanInTheLoop) {
    yield {
      type: "human_in_the_loop_pause",
      runId: ctx.runId,
      taskId: task.id,
      nodeId,
      description: task.description,
      context,
      ts: Date.now(),
    };

    const decision = await ctx.waitForHuman(task.id);
    if (decision.decision === "reject") {
      yield {
        type: "task_completed",
        runId: ctx.runId,
        taskId: task.id,
        nodeId,
        output: "[Rejected by human reviewer]",
        inputTokens: 0,
        outputTokens: 0,
        ts: Date.now(),
      };
      return;
    }
    if (decision.decision === "edit" && decision.editedOutput !== undefined) {
      yield {
        type: "task_completed",
        runId: ctx.runId,
        taskId: task.id,
        nodeId,
        output: decision.editedOutput,
        inputTokens: 0,
        outputTokens: 0,
        ts: Date.now(),
      };
      return;
    }
    // decision === "approve": continue with LLM execution
  }

  const toolSchemas = registry.getSchemasFor(agent.tools);
  const messages: Message[] = buildSystemMessages(agent, task, context);
  let iterations = 0;
  let lastAnswer = "";
  let finalUsageInputTokens = 0;
  let finalUsageOutputTokens = 0;

  while (iterations < agent.maxIterations) {
    ctx.throwIfAborted();
    iterations++;

    let responseText = "";
    let pendingToolCall: { callId: string; name: string; args: Record<string, unknown> } | null = null;

    for await (const chunk of adapter.complete(messages, { tools: toolSchemas })) {
      ctx.throwIfAborted();

      if (chunk.kind === "token") {
        responseText += chunk.text;
        yield {
          type: "token_stream",
          runId: ctx.runId,
          agentId: agent.id,
          token: chunk.text,
          ts: Date.now(),
        };
      } else if (chunk.kind === "tool_call") {
        pendingToolCall = chunk.call;
        yield {
          type: "tool_call",
          runId: ctx.runId,
          agentId: agent.id,
          tool: chunk.call.name,
          args: chunk.call.args,
          callId: chunk.call.callId,
          ts: Date.now(),
        };
      } else if (chunk.kind === "done") {
        finalUsageInputTokens += chunk.usage.inputTokens;
        finalUsageOutputTokens += chunk.usage.outputTokens;
      }
    }

    if (pendingToolCall) {
      // Execute the tool and feed the observation back
      let toolResult: unknown;
      let toolError: string | undefined;
      try {
        toolResult = await registry.execute(pendingToolCall.name, pendingToolCall.args, ctx);
      } catch (err) {
        toolError = err instanceof Error ? err.message : String(err);
        toolResult = { error: toolError };
      }

      yield {
        type: "tool_result",
        runId: ctx.runId,
        agentId: agent.id,
        callId: pendingToolCall.callId,
        result: toolResult,
        ...(toolError !== undefined ? { error: toolError } : {}),
        ts: Date.now(),
      };

      // Append the assistant's tool call and the observation to message history
      messages.push({
        role: "assistant",
        content: JSON.stringify({
          tool_use: { id: pendingToolCall.callId, name: pendingToolCall.name, input: pendingToolCall.args },
        }),
      });
      messages.push({
        role: "tool",
        toolCallId: pendingToolCall.callId,
        content: JSON.stringify(toolResult),
      });

      // Continue looping — the model will reason on the observation next
      continue;
    }

    // No tool call → this is the final answer.
    // Strip "Final Answer:" prefix emitted by text-based ReAct adapters (e.g. ClaudeCliAdapter).
    lastAnswer = extractFinalAnswer(responseText.trim());
    break;
  }

  if (iterations >= agent.maxIterations && !lastAnswer) {
    yield {
      type: "max_iterations_reached",
      runId: ctx.runId,
      agentId: agent.id,
      taskId: task.id,
      iterations,
      ts: Date.now(),
    };
    // Use whatever the last response was as output
    lastAnswer = `[Max iterations (${agent.maxIterations}) reached. Last response: ${lastAnswer}]`;
  }

  yield {
    type: "task_completed",
    runId: ctx.runId,
    taskId: task.id,
    nodeId,
    output: lastAnswer,
    inputTokens: finalUsageInputTokens,
    outputTokens: finalUsageOutputTokens,
    ts: Date.now(),
  };
}

/** Strip "Final Answer: " prefix produced by text-based ReAct adapters. No-op for native tool-calling adapters. */
function extractFinalAnswer(text: string): string {
  const match = text.match(/Final Answer:\s*([\s\S]+)/);
  return match?.[1]?.trim() ?? text;
}

function buildSystemMessages(
  agent: AgentConfig,
  task: TaskConfig,
  context: string,
): Message[] {
  const system = `You are ${agent.name}, a ${agent.role}.

## Your Goal
${agent.goal}

## Your Backstory
${agent.backstory}

## Current Task
${task.description}

## Expected Output
${task.expectedOutput}
${context ? `\n## Context from Previous Tasks\n${context}` : ""}

Use the available tools when needed to complete the task. Think step by step. When you have a final answer, output it directly without any additional commentary.`;

  return [{ role: "user", content: system }];
}
