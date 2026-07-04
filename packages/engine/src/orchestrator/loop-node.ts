import type { AgentConfig, TaskConfig, FlowConfig, TraceEvent } from "@agent-company/shared";
import type { LLMAdapter } from "../adapters/base";
import type { ToolRegistry } from "../tools/registry";
import type { RunContext } from "../safety/guards";
import { agentRunner } from "./agent-runner";

export interface LoopNodeOpts {
  loopNodeId: string;
  loopType: "fixed-n" | "while" | "until" | "for-each";
  loopMax: number;
  loopCondition: string;
  /** The task+agent to run each iteration */
  bodyTask: TaskConfig;
  bodyAgent: AgentConfig;
  /** Initial context passed to iteration 1 */
  initialContext: string;
  /** The nodeId of the body task flow node (for UI state tracking) */
  bodyNodeId: string;
  adapterFactory: (agent: AgentConfig) => LLMAdapter;
  registry: ToolRegistry;
  ctx: RunContext;
  /** Live run state for condition expressions */
  runState: Record<string, unknown>;
}

export interface LoopResult {
  lastOutput: string;
  totalIterations: number;
  breakReason: "condition_met" | "max_iterations";
}

/**
 * Runs a loop body (one agent + one task) repeatedly according to loopType.
 * Yields TraceEvents for each iteration plus loop_iteration and loop_completed.
 */
export async function* loopNode(
  opts: LoopNodeOpts,
): AsyncGenerator<TraceEvent, LoopResult> {
  const {
    loopNodeId, loopType, loopMax, loopCondition,
    bodyTask, bodyAgent, initialContext, bodyNodeId,
    adapterFactory, registry, ctx, runState,
  } = opts;

  let iteration = 0;
  let lastOutput = "";
  let breakReason: LoopResult["breakReason"] = "max_iterations";
  const accumulator: Record<string, unknown> = {};

  const evalCondition = (expr: string): boolean => {
    if (!expr) return false;
    try {
      const fn = new Function(
        "state",
        "outputs",
        "accumulator",
        "iteration",
        `"use strict"; return Boolean(${expr});`,
      ) as (s: unknown, o: unknown, a: unknown, i: number) => boolean;
      return fn(runState, { [bodyTask.id]: lastOutput }, accumulator, iteration);
    } catch {
      return false;
    }
  };

  // for-each: split prior output into items
  const items: string[] =
    loopType === "for-each"
      ? (() => {
          try { return JSON.parse(lastOutput || initialContext) as string[]; } catch { return [initialContext]; }
        })()
      : [];

  const maxIter = loopType === "for-each" ? Math.min(items.length, loopMax) : loopMax;

  while (iteration < maxIter) {
    ctx.throwIfAborted();

    // while: check condition BEFORE running body
    if (loopType === "while" && iteration > 0 && !evalCondition(loopCondition)) {
      breakReason = "condition_met";
      break;
    }

    iteration++;
    const iterContext =
      loopType === "for-each"
        ? `Item ${iteration}: ${items[iteration - 1] ?? ""}`
        : iteration === 1
          ? initialContext
          : `Previous iteration output:\n${lastOutput}`;

    // Run the body agent+task
    const runner = agentRunner({
      agent: bodyAgent,
      task: bodyTask,
      context: iterContext,
      adapter: adapterFactory(bodyAgent),
      registry,
      ctx,
      nodeId: bodyNodeId,
    });

    for await (const event of runner) {
      yield event;
      if (event.type === "task_completed") lastOutput = event.output;
    }

    accumulator[`iter_${iteration}`] = lastOutput;
    accumulator["last"] = lastOutput;

    yield {
      type: "loop_iteration",
      runId: ctx.runId,
      loopNodeId,
      iteration,
      maxIterations: maxIter,
      accumulator: { ...accumulator },
      ts: Date.now(),
    };

    // until: check condition AFTER running body
    if (loopType === "until" && evalCondition(loopCondition)) {
      breakReason = "condition_met";
      break;
    }

    // fixed-n: just count
    if (loopType === "fixed-n" && iteration >= maxIter) {
      break;
    }
  }

  if (iteration >= maxIter && breakReason !== "condition_met") {
    breakReason = "max_iterations";
  }

  yield {
    type: "loop_completed",
    runId: ctx.runId,
    loopNodeId,
    totalIterations: iteration,
    breakReason,
    ts: Date.now(),
  };

  return { lastOutput, totalIterations: iteration, breakReason };
}
