import type { RegisteredTool } from "../registry";
import type { RunContext } from "../../safety/guards";
import { writeNote } from "../../memory/vault-fs";

/** Emitter callback type — mirrors the one in engine-client */
export type EventEmitter = (event: { type: string; runId: string; agentId: string; notePath: string; ts: number }) => void;

export function createVaultWriteTool(agentId: string, emitEvent: EventEmitter): RegisteredTool {
  return {
    name: "vault_write",
    description:
      "Write or append content to a markdown note in the knowledge vault. The path is relative to the vault root (e.g. 'research/ai-agents.md'). Set append=true to add content without overwriting.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path within the vault, including .md extension",
        },
        content: {
          type: "string",
          description: "Markdown content to write",
        },
        append: {
          type: "boolean",
          description: "If true, append to existing file instead of overwriting",
        },
      },
      required: ["path", "content"],
    },
    async execute(args, ctx: RunContext) {
      const notePath = (args["path"] as string ?? "").trim();
      const content = args["content"] as string ?? "";
      const append = (args["append"] as boolean | undefined) ?? false;

      if (!notePath) return { error: "path is required" };
      if (!notePath.endsWith(".md")) return { error: "path must end with .md" };

      writeNote(notePath, content, append);

      emitEvent({
        type: "vault_write",
        runId: ctx.runId,
        agentId,
        notePath,
        ts: Date.now(),
      });

      return { success: true, path: notePath, appended: append };
    },
  };
}
