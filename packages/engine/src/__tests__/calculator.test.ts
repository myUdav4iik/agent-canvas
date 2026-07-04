import { describe, it, expect } from "vitest";
import { calculatorTool } from "../tools/builtin/calculator";
import { RunContext } from "../safety/guards";

function makeCtx() {
  const ctx = new RunContext("run-test", { timeoutMs: 5000 });
  return ctx;
}

describe("calculatorTool", () => {
  it("evaluates simple addition", async () => {
    const ctx = makeCtx();
    const result = await calculatorTool.execute({ expression: "2 + 2" }, ctx) as { result: string };
    expect(result.result).toBe("4");
    ctx.complete();
  });

  it("evaluates multiplication", async () => {
    const ctx = makeCtx();
    const result = await calculatorTool.execute({ expression: "6 * 7" }, ctx) as { result: string };
    expect(result.result).toBe("42");
    ctx.complete();
  });

  it("evaluates sqrt", async () => {
    const ctx = makeCtx();
    const result = await calculatorTool.execute({ expression: "sqrt(144)" }, ctx) as { result: string };
    expect(result.result).toBe("12");
    ctx.complete();
  });

  it("evaluates floating point", async () => {
    const ctx = makeCtx();
    const result = await calculatorTool.execute({ expression: "1 / 3" }, ctx) as { result: string };
    expect(Number(result.result)).toBeCloseTo(0.333, 2);
    ctx.complete();
  });

  it("evaluates complex expression", async () => {
    const ctx = makeCtx();
    const result = await calculatorTool.execute({ expression: "(10 + 5) * 2 - 4" }, ctx) as { result: string };
    expect(result.result).toBe("26");
    ctx.complete();
  });

  it("throws on invalid expression", async () => {
    const ctx = makeCtx();
    await expect(
      calculatorTool.execute({ expression: "not_a_number ++" }, ctx),
    ).rejects.toThrow("Calculator error");
    ctx.complete();
  });

  it("has correct name and schema", () => {
    expect(calculatorTool.name).toBe("calculator");
    expect(calculatorTool.inputSchema).toMatchObject({
      type: "object",
      properties: { expression: { type: "string" } },
      required: ["expression"],
    });
  });
});
