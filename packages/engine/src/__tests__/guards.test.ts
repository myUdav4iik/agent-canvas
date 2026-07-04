import { describe, it, expect, vi } from "vitest";
import { RunContext, RunKilledError, RunTimeoutError, DelegationDepthError } from "../safety/guards";

describe("RunContext", () => {
  describe("kill()", () => {
    it("aborts the signal with RunKilledError", () => {
      const ctx = new RunContext("r1", { timeoutMs: 60_000 });
      ctx.kill();
      expect(ctx.signal.aborted).toBe(true);
      expect(ctx.signal.reason).toBeInstanceOf(RunKilledError);
    });

    it("throwIfAborted throws after kill", () => {
      const ctx = new RunContext("r1", { timeoutMs: 60_000 });
      ctx.kill();
      expect(() => ctx.throwIfAborted()).toThrow(RunKilledError);
    });
  });

  describe("timeout", () => {
    it("fires RunTimeoutError after timeout", async () => {
      const ctx = new RunContext("r1", { timeoutMs: 30 });
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(ctx.signal.aborted).toBe(true);
      expect(ctx.signal.reason).toBeInstanceOf(RunTimeoutError);
    });

    it("complete() prevents timeout from firing", async () => {
      const ctx = new RunContext("r1", { timeoutMs: 30 });
      ctx.complete();
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(ctx.signal.aborted).toBe(false);
    });
  });

  describe("delegation depth", () => {
    it("allows delegation within cap", () => {
      const ctx = new RunContext("r1", { maxDelegationDepth: 3, timeoutMs: 60_000 });
      ctx.enterDelegation();
      ctx.enterDelegation();
      ctx.enterDelegation();
      expect(ctx.delegationDepth).toBe(3);
      ctx.complete();
    });

    it("throws DelegationDepthError when cap exceeded", () => {
      const ctx = new RunContext("r1", { maxDelegationDepth: 2, timeoutMs: 60_000 });
      ctx.enterDelegation();
      ctx.enterDelegation();
      expect(() => ctx.enterDelegation()).toThrow(DelegationDepthError);
      ctx.complete();
    });

    it("exitDelegation decrements depth", () => {
      const ctx = new RunContext("r1", { maxDelegationDepth: 3, timeoutMs: 60_000 });
      ctx.enterDelegation();
      ctx.enterDelegation();
      ctx.exitDelegation();
      expect(ctx.delegationDepth).toBe(1);
      ctx.complete();
    });

    it("exitDelegation never goes below 0", () => {
      const ctx = new RunContext("r1", { timeoutMs: 60_000 });
      ctx.exitDelegation();
      expect(ctx.delegationDepth).toBe(0);
      ctx.complete();
    });
  });

  describe("human-in-the-loop", () => {
    it("waitForHuman resolves when resolveHuman is called", async () => {
      const ctx = new RunContext("r1", { timeoutMs: 60_000 });
      const promise = ctx.waitForHuman("task-1");
      const resolved = ctx.resolveHuman("task-1", { decision: "approve" });
      expect(resolved).toBe(true);
      const decision = await promise;
      expect(decision.decision).toBe("approve");
      ctx.complete();
    });

    it("resolveHuman returns false if no pending pause", () => {
      const ctx = new RunContext("r1", { timeoutMs: 60_000 });
      expect(ctx.resolveHuman("task-none", { decision: "approve" })).toBe(false);
      ctx.complete();
    });

    it("hasPendingHuman returns true while waiting", () => {
      const ctx = new RunContext("r1", { timeoutMs: 60_000 });
      const _promise = ctx.waitForHuman("task-1");
      expect(ctx.hasPendingHuman("task-1")).toBe(true);
      ctx.resolveHuman("task-1", { decision: "reject" });
      ctx.complete();
    });

    it("hasPendingHuman returns false after resolution", async () => {
      const ctx = new RunContext("r1", { timeoutMs: 60_000 });
      const promise = ctx.waitForHuman("task-1");
      ctx.resolveHuman("task-1", { decision: "approve" });
      await promise;
      expect(ctx.hasPendingHuman("task-1")).toBe(false);
      ctx.complete();
    });

    it("waitForHuman rejects when run is killed", async () => {
      const ctx = new RunContext("r1", { timeoutMs: 60_000 });
      const promise = ctx.waitForHuman("task-1");
      ctx.kill();
      await expect(promise).rejects.toBeInstanceOf(RunKilledError);
    });

    it("edit decision carries editedOutput", async () => {
      const ctx = new RunContext("r1", { timeoutMs: 60_000 });
      const promise = ctx.waitForHuman("task-1");
      ctx.resolveHuman("task-1", { decision: "edit", editedOutput: "Custom answer" });
      const decision = await promise;
      expect(decision.decision).toBe("edit");
      expect(decision.editedOutput).toBe("Custom answer");
      ctx.complete();
    });
  });

  describe("external abort signal chaining", () => {
    it("aborts when external signal fires", () => {
      const outer = new AbortController();
      const ctx = new RunContext("r1", { signal: outer.signal, timeoutMs: 60_000 });
      outer.abort();
      expect(ctx.signal.aborted).toBe(true);
      ctx.complete();
    });
  });
});
