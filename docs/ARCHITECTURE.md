# Architecture

agent-canvas is a pnpm monorepo with a strict boundary: the execution engine (`packages/engine`) is plain TypeScript with zero React/Next dependencies, and the web app (`apps/web`) never talks to an LLM directly. The two communicate exclusively through the **TraceEvent** contract defined in `packages/shared`.

## Key decisions

| Area | Choice | Reason |
|---|---|---|
| Orchestration | Custom ReAct loop, no framework | Full control, readable in one sitting, no abstraction tax |
| Streaming | SSE via `ReadableStream` | One-way, native in Next.js route handlers, no WebSocket complexity |
| Flow storage | Structured `FlowNode`/`FlowEdge` rows | Queryable; avoids opaque JSON blobs |
| Vault | Real `.md` files + SQLite index | Files are portable; DB enables fast search/backlinks |
| Condition sandbox | `new Function()` with isolated scope | Strict mode, no globals exposed; no external sandbox dependency |
| Undo/redo | Zustand immutable history stack | Fast for canvas operations |

## The TraceEvent contract

`packages/shared/src/types/trace.ts` defines a discriminated union of **19 event types** — agent lifecycle (`agent_started`, `agent_thought`, `token_stream`, `task_completed`), tools (`tool_call`, `tool_result`), control flow (`loop_iteration`, `loop_completed`, `condition_evaluated`, `parallel_branch_started`, `parallel_join_completed`), delegation (`delegation_started/_completed`), vault I/O (`vault_read`, `vault_write`), safety (`max_iterations_reached`, `run_error`, `human_in_the_loop_pause`), and `run_completed`.

Every event carries `runId` and `ts`. This single union is:

1. **streamed** to the browser over SSE as it happens,
2. **persisted** to SQLite (`TraceEventRow`, ordered by `sequence`) for the timeline and replay,
3. **reduced** into canvas node states (`apps/web/src/lib/derive-run-state.ts`).

Adding a feature to the engine means adding an event type; the UI picks it up from one switch.

## Engine

### ReAct loop — `packages/engine/src/orchestrator/react-loop.ts`

An async generator: builds the system prompt from agent config (role/goal/backstory) + task + upstream context, then iterates: stream LLM completion → if the model called tools, execute them via the registry and feed results back → otherwise the text is the final answer (`task_completed`). Terminates on final answer, `maxIterations`, or an aborted `RunContext`.

### Flow runner — `packages/engine/src/orchestrator/flow-runner.ts`

Graph traversal over the saved flow: BFS starting from `start` nodes (and any node with in-degree 0), dispatching each node type:

- **task** → ReAct loop via `agent-runner`; output recorded under both nodeId and taskId so downstream `contextTaskIds` can assemble context
- **condition** → evaluates the JS expression against `{ outputs, vars }`, then routes along the edge whose **label** matches the boolean result
- **loop** → runs the body subgraph via `loop-node` up to `loopMax` / until the break condition
- **parallel** → fans out branch tasks concurrently, waits at the `join` node

### Edge-label routing conventions

Routing is driven by edge labels/types, not geometry:

| Edge | type | label |
|---|---|---|
| Loop → body node | `loop` | `body` |
| Loop → next node after loop | `sequential` | `exit` |
| Condition → true branch | `conditional` | `true` |
| Condition → false branch | `conditional` | `false` |

The seed (`apps/web/prisma/seed.ts`) is the canonical reference for a well-formed graph. It is **restorative**: re-running it wipes and rebuilds the example flows' graphs.

### Adapters — `packages/engine/src/adapters/`

`LLMAdapter` is a minimal interface: `complete(messages, opts): AsyncIterable<StreamChunk>` where chunks are `token | tool_call | done`. Implementations: `anthropic` (SDK), `claude-cli` (spawns the Claude CLI), `openai`, `ollama`. `factory.ts` maps an agent's `llmProvider` string to an adapter — swapping providers is data, not code.

### Safety — `packages/engine/src/safety/guards.ts`

`RunContext` carries an `AbortSignal` honored at every await point: global run timeout, kill switch (Stop button), per-agent iteration caps, loop iteration caps, and delegation depth limit.

## Streaming pipeline

```
flow-runner (async generator)
  → engine-client.ts        consumes events, persists TraceEventRow, patches Run totals
  → run-bus.ts              in-process EventEmitter, fan-out per runId
  → /api/runs/[runId]/stream/route.ts   SSE ReadableStream per subscriber
  → useRunStream hook       dispatches into Zustand run store
  → canvas node glow + trace timeline + metrics
```

Because events are also persisted, a page refresh mid-run replays history from the DB and then continues live from the bus.

## Vault

- `VaultFS` (`packages/engine/src/memory/vault-fs.ts`) — path-sandboxed CRUD on real `.md` files under `VAULT_DIR`; rejects traversal outside the vault.
- Indexer parses frontmatter, `#tags`, and `[[wikilinks]]` into `VaultNote`/`NoteLink` rows for search, backlinks, and the force-directed graph view.
- Agents get `vault_read`/`vault_write`/`vault_search` tools; an agent's `memoryScope` (folders/tags) controls which notes are pre-loaded into its context.
- Tasks with `outputFormat: "markdown-note"` auto-save their final output as a note.

## Web app

- **Canvas** — React Flow with custom node components (`components/canvas/nodes/`), Zustand store with undo/redo (`stores/canvas.ts`), save = wholesale `PUT /api/flows/[id]` (delete + recreate rows in a transaction).
- **Runs** — timeline of TraceEvents, per-node metrics, replay scrubber (`components/runs/ReplayScrubber.tsx`) that re-derives canvas state at any event index, human-in-the-loop approval card.
- **Vault** — file tree, CodeMirror 6 editor with wikilink autocomplete/highlighting, backlinks panel, graph view (react-force-graph-2d).

## Database

Prisma + SQLite (`apps/web/prisma/schema.prisma`). Core models: `Agent`, `Task`, `Tool`/`AgentTool`, `Flow`/`FlowNode`/`FlowEdge`, `Run`/`TraceEventRow`, `VaultNote`/`NoteLink`. Deleting a `Flow` cascades to its nodes, edges, runs, and trace events. The project uses `prisma db push` (no migration files).
