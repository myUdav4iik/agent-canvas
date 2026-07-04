import { describe, it, expect, vi } from "vitest";
import { ToolRegistry } from "../tools/registry";
import { RunContext } from "../safety/guards";
import type { RegisteredTool } from "../tools/registry";

function makeCtx() {
  return new RunContext("run-test", { timeoutMs: 5000 });
}

function makeTool(name: string, returnValue: unknown = { ok: true }): RegisteredTool {
  return {
    name,
    description: `Test tool: ${name}`,
    inputSchema: { type: "object", properties: { x: { type: "string" } } },
    execute: vi.fn().mockResolvedValue(returnValue),
  };
}

describe("ToolRegistry", () => {
  it("registers and checks for tools", () => {
    const reg = new ToolRegistry();
    const tool = makeTool("my_tool");
    reg.register(tool);
    expect(reg.has("my_tool")).toBe(true);
    expect(reg.has("other_tool")).toBe(false);
  });

  it("executes a registered tool", async () => {
    const ctx = makeCtx();
    const reg = new ToolRegistry();
    reg.register(makeTool("calc", { result: "42" }));
    const result = await reg.execute("calc", { x: "test" }, ctx);
    expect(result).toEqual({ result: "42" });
    ctx.complete();
  });

  it("throws on unknown tool", async () => {
    const ctx = makeCtx();
    const reg = new ToolRegistry();
    await expect(reg.execute("nonexistent", {}, ctx)).rejects.toThrow("Unknown tool: nonexistent");
    ctx.complete();
  });

  it("getSchemasFor returns subset of registered tools", () => {
    const reg = new ToolRegistry();
    reg.register(makeTool("tool_a"));
    reg.register(makeTool("tool_b"));
    reg.register(makeTool("tool_c"));

    const schemas = reg.getSchemasFor(["tool_a", "tool_c"]);
    expect(schemas).toHaveLength(2);
    expect(schemas.map((s) => s.name)).toEqual(["tool_a", "tool_c"]);
  });

  it("getSchemasFor silently skips unknown tool names", () => {
    const reg = new ToolRegistry();
    reg.register(makeTool("tool_a"));
    const schemas = reg.getSchemasFor(["tool_a", "missing"]);
    expect(schemas).toHaveLength(1);
    expect(schemas[0]!.name).toBe("tool_a");
  });

  it("getAll returns all registered tools", () => {
    const reg = new ToolRegistry();
    reg.register(makeTool("a"));
    reg.register(makeTool("b"));
    expect(reg.getAll()).toHaveLength(2);
  });

  it("overwrites tool with same name on re-register", () => {
    const reg = new ToolRegistry();
    reg.register(makeTool("tool_a", { v: 1 }));
    reg.register(makeTool("tool_a", { v: 2 }));
    // Only one entry
    expect(reg.getAll()).toHaveLength(1);
  });
});
