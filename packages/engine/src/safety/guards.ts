import {
  DEFAULT_MAX_DELEGATION_DEPTH,
  DEFAULT_RUN_TIMEOUT_MS,
} from "@agent-company/shared";

export class DelegationDepthError extends Error {
  constructor(depth: number) {
    super(`Delegation depth cap reached (depth=${depth}). Refusing to spawn further subagents.`);
    this.name = "DelegationDepthError";
  }
}

export class RunTimeoutError extends Error {
  constructor() {
    super("Run exceeded global timeout and was aborted.");
    this.name = "RunTimeoutError";
  }
}

export class RunKilledError extends Error {
  constructor() {
    super("Run was killed by user.");
    this.name = "RunKilledError";
  }
}

export interface HumanDecision {
  decision: "approve" | "edit" | "reject";
  editedOutput?: string;
}

/** Threaded through every async call in a run to enforce safety caps */
export class RunContext {
  readonly runId: string;
  readonly signal: AbortSignal;
  readonly maxDelegationDepth: number;
  delegationDepth: number = 0;

  private _abortController: AbortController;
  private _timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  /** Pending human-in-the-loop resume resolvers keyed by taskId */
  private _pendingResumeResolvers = new Map<string, (decision: HumanDecision) => void>();

  constructor(
    runId: string,
    opts: {
      timeoutMs?: number;
      maxDelegationDepth?: number;
      signal?: AbortSignal;
    } = {},
  ) {
    this.runId = runId;
    this.maxDelegationDepth = opts.maxDelegationDepth ?? DEFAULT_MAX_DELEGATION_DEPTH;
    this._abortController = new AbortController();

    // Chain external kill signal
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => this._abortController.abort());
    }

    const timeoutMs = opts.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
    this._timeoutHandle = setTimeout(() => {
      this._abortController.abort(new RunTimeoutError());
    }, timeoutMs);

    this.signal = this._abortController.signal;
  }

  kill(): void {
    if (this._timeoutHandle) clearTimeout(this._timeoutHandle);
    this._abortController.abort(new RunKilledError());
  }

  complete(): void {
    if (this._timeoutHandle) clearTimeout(this._timeoutHandle);
  }

  /** Call before spawning a delegation; throws if depth cap exceeded */
  enterDelegation(): void {
    this.delegationDepth++;
    if (this.delegationDepth > this.maxDelegationDepth) {
      throw new DelegationDepthError(this.delegationDepth);
    }
  }

  exitDelegation(): void {
    this.delegationDepth = Math.max(0, this.delegationDepth - 1);
  }

  throwIfAborted(): void {
    if (this.signal.aborted) {
      const reason = this.signal.reason;
      if (reason instanceof Error) throw reason;
      throw new RunKilledError();
    }
  }

  /**
   * Pause execution waiting for a human decision on the given taskId.
   * Resolves when `resolveHuman()` is called (via the resume API).
   * Rejects immediately if the run is aborted while waiting.
   */
  waitForHuman(taskId: string): Promise<HumanDecision> {
    return new Promise<HumanDecision>((resolve, reject) => {
      const abortHandler = () => reject(new RunKilledError());
      this.signal.addEventListener("abort", abortHandler, { once: true });
      this._pendingResumeResolvers.set(taskId, (decision) => {
        this.signal.removeEventListener("abort", abortHandler);
        resolve(decision);
      });
    });
  }

  /** Called by the resume API to unblock a paused task. */
  resolveHuman(taskId: string, decision: HumanDecision): boolean {
    const resolver = this._pendingResumeResolvers.get(taskId);
    if (!resolver) return false;
    this._pendingResumeResolvers.delete(taskId);
    resolver(decision);
    return true;
  }

  hasPendingHuman(taskId: string): boolean {
    return this._pendingResumeResolvers.has(taskId);
  }
}
