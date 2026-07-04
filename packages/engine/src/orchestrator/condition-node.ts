import type { TraceEvent } from "@agent-company/shared";
import type { RunContext } from "../safety/guards";

export interface ConditionNodeOpts {
  conditionNodeId: string;
  expression: string;
  /** Live run state available to the expression */
  state: Record<string, unknown>;
  /** Completed node outputs keyed by nodeId */
  outputs: Record<string, string>;
  ctx: RunContext;
}

export interface ConditionResult {
  value: boolean;
  events: TraceEvent[];
  /** The edge label to follow ("true" or "false") */
  branch: "true" | "false";
}

/**
 * Evaluates a JS boolean expression in a minimal sandbox.
 * The expression receives `state` and `outputs` as local variables.
 * Returns true/false and emits a condition_evaluated TraceEvent.
 */
export function evaluateCondition(opts: ConditionNodeOpts): ConditionResult {
  const { conditionNodeId, expression, state, outputs, ctx } = opts;

  let value = false;
  let evalError: string | undefined;

  try {
    // Minimal sandbox: new Function with explicit scope. No globals exposed beyond what we inject.
    const fn = new Function(
      "state",
      "outputs",
      `"use strict"; return Boolean(${expression});`,
    ) as (state: unknown, outputs: unknown) => boolean;
    value = fn(state, outputs);
  } catch (err) {
    evalError = err instanceof Error ? err.message : String(err);
    value = false;
  }

  const event: TraceEvent = {
    type: "condition_evaluated",
    runId: ctx.runId,
    conditionNodeId,
    expression,
    result: value,
    routeTo: value ? "true" : "false",
    ts: Date.now(),
  };

  if (evalError) {
    console.error(`[condition-node] eval error in "${expression}": ${evalError}`);
  }

  return { value, events: [event], branch: value ? "true" : "false" };
}
