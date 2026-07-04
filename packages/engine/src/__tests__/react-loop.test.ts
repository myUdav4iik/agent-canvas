import { describe, it, expect } from "vitest";
import { reactLoop } from "../orchestrator/react-loop";
import { RunContext } from "../safety/guards";
import type { LLMAdapter, StreamChunk, Message, CompletionOptions } from "../adapters/base";
import type { AgentConfig, TaskConfig } from "@agent-company/shared";
import { ToolRegistry } from "../tools/registry";

/** Creates a mock adapter that yields a fixed sequence of chunks per call */
function mockAdapter(calls: StreamChunk[][]): LLMAdapter {
  let callIndex = 0;
  return {
    provider: "mock",
    model: "mock-model",
    async *complete(_messages: Message[], _opts: CompletionOptions): AsyncIterable<StreamChunk> {
      const chunks = calls[callIndex++] ?? [{ kind: "done" as const, usage: { inputTokens: 0, outputTokens: 0 } }];
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "agent-1",
    name: "TestAgent",
    role: "tester",
    goal: "test things",
    backstory: "I am a test agent",
    llmProvider: "mock" as AgentConfig["llmProvider"],
    llmModel: "mock",
    llmParams: {},
    memoryScope: [],
    maxIterations: 5,
    allowDelegation: false,
    verbose: false,
    tools: [],
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskConfig> = {}): TaskConfig {
  return {
    id: "task-1",
    description: "Write a test",
    expectedOutput: "A test result",
    assignedAgentId: "agent-1",
    contextTaskIds: [],
    outputFormat: "text",
    humanInTheLoop: false,
    ...overrides,
  };
}

async function collectEvents<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const events: T[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("reactLoop", () => {
  it("emits agent_started then task_completed for a simple answer", async () => {
    const ctx = new RunContext("run-1", { timeoutMs: 10_000 });
    const adapter = mockAdapter([
      [
        { kind: "token", text: "The answer is 42." },
        { kind: "done", usage: { inputTokens: 10, outputTokens: 5 } },
      ],
    ]);
    const reg = new ToolRegistry();

    const events = await collectEvents(
      reactLoop(makeAgent(), makeTask(), "", adapter, reg, ctx, "node-1"),
    );

    expect(events[0]!.type).toBe("agent_started");
    expect(events.at(-1)!.type).toBe("task_completed");
    const completed = events.find((e) => e.type === "task_completed");
    expect(completed).toBeDefined();
    if (completed?.type === "task_completed") {
      expect(completed.output).toBe("The answer is 42.");
    }
    ctx.complete();
  });

  it("emits token_stream events for each token chunk", async () => {
    const ctx = new RunContext("run-1", { timeoutMs: 10_000 });
    const adapter = mockAdapter([
      [
        { kind: "token", text: "Hello " },
        { kind: "token", text: "world" },
        { kind: "done", usage: { inputTokens: 5, outputTokens: 2 } },
      ],
    ]);
    const reg = new ToolRegistry();

    const events = await collectEvents(
      reactLoop(makeAgent(), makeTask(), "", adapter, reg, ctx, "node-1"),
    );

    const tokens = events.filter((e) => e.type === "token_stream");
    expect(tokens).toHaveLength(2);
    ctx.complete();
  });

  it("handles tool call → tool result → final answer sequence", async () => {
    const ctx = new RunContext("run-1", { timeoutMs: 10_000 });
    const adapter = mockAdapter([
      // First call: tool use
      [
        {
          kind: "tool_call",
          call: { callId: "call-1", name: "calculator", args: { expression: "2+2" } },
        },
        { kind: "done", usage: { inputTokens: 10, outputTokens: 5 } },
      ],
      // Second call after tool result: final answer
      [
        { kind: "token", text: "The result is 4." },
        { kind: "done", usage: { inputTokens: 15, outputTokens: 4 } },
      ],
    ]);

    const reg = new ToolRegistry();
    reg.register({
      name: "calculator",
      description: "calc",
      inputSchema: {},
      execute: async () => ({ result: "4" }),
    });

    const events = await collectEvents(
      reactLoop(makeAgent({ tools: ["calculator"] }), makeTask(), "", adapter, reg, ctx, "node-1"),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("tool_call");
    expect(types).toContain("tool_result");
    expect(types).toContain("task_completed");
    ctx.complete();
  });

  it("emits max_iterations_reached when maxIterations hit", async () => {
    const ctx = new RunContext("run-1", { timeoutMs: 10_000 });
    // Adapter always returns a tool call, so the loop never terminates naturally
    const adapter = mockAdapter(
      Array.from({ length: 10 }, () => [
        {
          kind: "tool_call" as const,
          call: { callId: "call-x", name: "calculator", args: { expression: "1" } },
        },
        { kind: "done" as const, usage: { inputTokens: 1, outputTokens: 1 } },
      ]),
    );

    const reg = new ToolRegistry();
    reg.register({
      name: "calculator",
      description: "calc",
      inputSchema: {},
      execute: async () => ({ result: "1" }),
    });

    const events = await collectEvents(
      reactLoop(makeAgent({ maxIterations: 3, tools: ["calculator"] }), makeTask(), "", adapter, reg, ctx, "node-1"),
    );

    expect(events.some((e) => e.type === "max_iterations_reached")).toBe(true);
    ctx.complete();
  });

  it("pauses for human approval when humanInTheLoop=true", async () => {
    const ctx = new RunContext("run-1", { timeoutMs: 10_000 });
    const adapter = mockAdapter([
      [
        { kind: "token", text: "Done." },
        { kind: "done", usage: { inputTokens: 5, outputTokens: 2 } },
      ],
    ]);
    const reg = new ToolRegistry();
    const task = makeTask({ humanInTheLoop: true });

    // Approve immediately when the loop pauses
    const runPromise = collectEvents(reactLoop(makeAgent(), task, "", adapter, reg, ctx, "node-1"));

    // Resolve after a tick so the loop has time to reach the pause
    await new Promise((r) => setImmediate(r));
    ctx.resolveHuman(task.id, { decision: "approve" });

    const events = await runPromise;
    expect(events.some((e) => e.type === "human_in_the_loop_pause")).toBe(true);
    expect(events.some((e) => e.type === "task_completed")).toBe(true);
    ctx.complete();
  });

  it("short-circuits with rejection output when human rejects", async () => {
    const ctx = new RunContext("run-1", { timeoutMs: 10_000 });
    const adapter = mockAdapter([]);
    const reg = new ToolRegistry();
    const task = makeTask({ humanInTheLoop: true });

    const runPromise = collectEvents(reactLoop(makeAgent(), task, "", adapter, reg, ctx, "node-1"));

    await new Promise((r) => setImmediate(r));
    ctx.resolveHuman(task.id, { decision: "reject" });

    const events = await runPromise;
    const completed = events.find((e) => e.type === "task_completed");
    expect(completed).toBeDefined();
    if (completed?.type === "task_completed") {
      expect(completed.output).toContain("Rejected");
    }
    ctx.complete();
  });

  it("uses editedOutput when human edits", async () => {
    const ctx = new RunContext("run-1", { timeoutMs: 10_000 });
    const adapter = mockAdapter([]);
    const reg = new ToolRegistry();
    const task = makeTask({ humanInTheLoop: true });

    const runPromise = collectEvents(reactLoop(makeAgent(), task, "", adapter, reg, ctx, "node-1"));

    await new Promise((r) => setImmediate(r));
    ctx.resolveHuman(task.id, { decision: "edit", editedOutput: "My custom answer" });

    const events = await runPromise;
    const completed = events.find((e) => e.type === "task_completed");
    if (completed?.type === "task_completed") {
      expect(completed.output).toBe("My custom answer");
    }
    ctx.complete();
  });

  it("aborts mid-loop when run is killed", async () => {
    const ctx = new RunContext("run-1", { timeoutMs: 10_000 });
    // Adapter never yields done — simulates a hanging call
    const adapter: LLMAdapter = {
      provider: "mock",
      model: "mock",
      async *complete() {
        // hang forever
        await new Promise<void>((_, reject) => {
          ctx.signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
        yield { kind: "done", usage: { inputTokens: 0, outputTokens: 0 } };
      },
    };
    const reg = new ToolRegistry();

    const runPromise = collectEvents(reactLoop(makeAgent(), makeTask(), "", adapter, reg, ctx, "node-1"));
    ctx.kill();

    await expect(runPromise).rejects.toThrow();
  });
});
