import type { RegisteredTool } from "../registry";
import type { RunContext } from "../../safety/guards";
import { walkNotes, readNote } from "../../memory/vault-fs";

export function createVaultReadTool(runId: string): RegisteredTool {
  return {
    name: "vault_read",
    description:
      "Search the knowledge vault and return matching note content. Use strategy 'title' to find by title keyword, 'tag' to find by tag, or 'path' for an exact relative path.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keyword, tag name, or relative file path" },
        strategy: {
          type: "string",
          enum: ["title", "tag", "path"],
          description: "How to match the query against notes",
        },
      },
      required: ["query", "strategy"],
    },
    async execute(args, ctx: RunContext) {
      const query = (args["query"] as string ?? "").toLowerCase().trim();
      const strategy = (args["strategy"] as string) ?? "title";

      if (strategy === "path") {
        const note = readNote(query);
        if (!note) return { error: `Note not found at path: ${query}` };
        return { path: note.path, title: note.title, content: note.body, tags: note.tags };
      }

      const allPaths = walkNotes();
      const matches: Array<ReturnType<typeof readNote>> = [];

      for (const p of allPaths) {
        const note = readNote(p);
        if (!note) continue;
        const hit =
          strategy === "title"
            ? note.title.toLowerCase().includes(query)
            : note.tags.some((t) => t.toLowerCase().includes(query));
        if (hit) matches.push(note);
        if (matches.length >= 3) break; // cap at 3 results
      }

      if (matches.length === 0) return { error: `No notes found for query: "${query}" (strategy: ${strategy})` };

      return {
        results: matches.map((n) => ({
          path: n!.path,
          title: n!.title,
          tags: n!.tags,
          content: n!.body.slice(0, 3000),
        })),
      };
    },
  };
}
