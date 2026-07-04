import { describe, it, expect } from "vitest";
import { evaluateCondition } from "../orchestrator/condition-node";
import { RunContext } from "../safety/guards";

function makeCtx() {
  return new RunContext("run-test", { timeoutMs: 5000 });
}

describe("evaluateCondition", () => {
  it("returns true for a truthy expression", () => {
    const ctx = makeCtx();
    const result = evaluateCondition({
      conditionNodeId: "c1",
      expression: "1 === 1",
      state: {},
      outputs: {},
      ctx,
    });
    expect(result.value).toBe(true);
    expect(result.branch).toBe("true");
    ctx.complete();
  });

  it("returns false for a falsy expression", () => {
    const ctx = makeCtx();
    const result = evaluateCondition({
      conditionNodeId: "c1",
      expression: "1 === 2",
      state: {},
      outputs: {},
      ctx,
    });
    expect(result.value).toBe(false);
    expect(result.branch).toBe("false");
    ctx.complete();
  });

  it("can access outputs variable", () => {
    const ctx = makeCtx();
    const result = evaluateCondition({
      conditionNodeId: "c1",
      expression: "outputs['task1'].includes('PASS')",
      state: {},
      outputs: { task1: "QUALITY_PASS: great output" },
      ctx,
    });
    expect(result.value).toBe(true);
    ctx.complete();
  });

  it("can access state variable", () => {
    const ctx = makeCtx();
    const result = evaluateCondition({
      conditionNodeId: "c1",
      expression: "state.score >= 7",
      state: { score: 8 },
      outputs: {},
      ctx,
    });
    expect(result.value).toBe(true);
    ctx.complete();
  });

  it("emits a condition_evaluated trace event", () => {
    const ctx = makeCtx();
    const result = evaluateCondition({
      conditionNodeId: "node-cond-1",
      expression: "true",
      state: {},
      outputs: {},
      ctx,
    });
    expect(result.events).toHaveLength(1);
    const ev = result.events[0]!;
    expect(ev.type).toBe("condition_evaluated");
    if (ev.type === "condition_evaluated") {
      expect(ev.conditionNodeId).toBe("node-cond-1");
      expect(ev.result).toBe(true);
      expect(ev.routeTo).toBe("true");
    }
    ctx.complete();
  });

  it("returns false and does not throw on invalid expression", () => {
    const ctx = makeCtx();
    const result = evaluateCondition({
      conditionNodeId: "c1",
      expression: "this is not valid JS {{{{",
      state: {},
      outputs: {},
      ctx,
    });
    expect(result.value).toBe(false);
    expect(result.branch).toBe("false");
    ctx.complete();
  });

  it("uses Object.values pattern from seed", () => {
    const ctx = makeCtx();
    const result = evaluateCondition({
      conditionNodeId: "c1",
      expression: "Object.values(outputs).some(function(v){ return String(v).indexOf('QUALITY_PASS') !== -1; })",
      state: {},
      outputs: { nodeA: "This is QUALITY_PASS result" },
      ctx,
    });
    expect(result.value).toBe(true);
    ctx.complete();
  });
});
