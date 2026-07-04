# Contributing

Thanks for your interest in agent-canvas!

## Setup

```bash
pnpm install
cp .env.example apps/web/.env    # add your ANTHROPIC_API_KEY
pnpm --filter web db:push        # create the SQLite schema
pnpm --filter web db:seed        # seed the four example flows
pnpm dev                         # → http://localhost:3000
```

The seed is **restorative** — if you break the example flows while hacking on the canvas, `pnpm --filter web db:seed` resets them to a known good state without touching your own flows.

## Monorepo layout

- `packages/shared` — types only; the `TraceEvent` union is the engine↔UI contract. Change it deliberately.
- `packages/engine` — the orchestrator. **Must stay free of React/Next imports.** Testable in isolation.
- `apps/web` — Next.js app. Never calls LLM providers directly; everything goes through the engine.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before touching the engine or the streaming pipeline.

## Checks

Run these before opening a PR:

```bash
pnpm typecheck                         # tsc across all packages (strict mode)
pnpm --filter engine exec vitest run   # engine unit tests
```

For engine changes, exercise a real flow too: `pnpm dev`, load an example flow, Run, and watch the trace. The CLI harness (`pnpm harness`) runs a single ReAct loop without the UI.

## Conventions

- TypeScript strict mode; no `any` unless unavoidable.
- New engine capabilities should emit new `TraceEvent` types rather than side-channel state.
- Flow-graph semantics live in edge labels (`body`/`exit`, `true`/`false`) — keep the seed (`apps/web/prisma/seed.ts`) as the canonical reference for well-formed graphs.
- UI screenshots in the README are generated: `node scripts/screenshots.mjs` (dev server must be running).

## Pull requests

- Keep PRs focused; one concern per PR.
- Describe *what* changed and *why*; include screenshots for UI changes.
- If you change the Prisma schema, note that the project uses `prisma db push` (no migration files).
