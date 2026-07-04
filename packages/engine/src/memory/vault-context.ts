/**
 * Assembles vault memory context for an agent before its ReAct loop runs.
 *
 * Strategy:
 *   1. Load all notes matching the agent's memoryScope (folder prefixes / #tags)
 *   2. Score each note by keyword overlap with the task description (simple TF)
 *   3. Return the top N notes formatted as a context block
 */
import { walkNotes, readNote } from "./vault-fs";

const TOP_N = 5;
const MAX_BODY_CHARS = 2000;

function score(noteBody: string, query: string): number {
  const tokens = query.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
  const body = noteBody.toLowerCase();
  return tokens.reduce((s, t) => s + (body.includes(t) ? 1 : 0), 0);
}

function matchesScope(notePath: string, scope: string[]): boolean {
  if (scope.length === 0) return false;
  return scope.some((s) => {
    const tag = s.startsWith("#");
    if (tag) return false; // tag filtering handled after reading note
    const folder = s.endsWith("/") ? s : `${s}/`;
    return notePath.startsWith(folder);
  });
}

export function assembleVaultContext(memoryScope: string[], taskDescription: string): string {
  if (memoryScope.length === 0) return "";

  const allPaths = walkNotes();
  const candidates = allPaths.filter((p) => matchesScope(p, memoryScope));

  // Read + score notes
  const scored = candidates
    .map((p) => {
      const note = readNote(p);
      if (!note) return null;

      // Check tag scope too
      const hasTagScope = memoryScope.some((s) => {
        if (!s.startsWith("#")) return false;
        const tag = s.slice(1);
        return note.tags.includes(tag);
      });

      const pathMatches = matchesScope(p, memoryScope);
      if (!pathMatches && !hasTagScope) return null;

      return { note, score: score(note.body + " " + note.title, taskDescription) };
    })
    .filter(Boolean) as { note: ReturnType<typeof readNote> & object; score: number }[];

  // Sort by score desc, take top N
  const topNotes = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N);

  if (topNotes.length === 0) return "";

  const blocks = topNotes.map(({ note }) => {
    const n = note as NonNullable<ReturnType<typeof readNote>>;
    const body = n.body.length > MAX_BODY_CHARS
      ? n.body.slice(0, MAX_BODY_CHARS) + "\n… (truncated)"
      : n.body;
    return `### Vault: ${n.title} (${n.path})\n\n${body}`;
  });

  return `## Memory Vault Context\n\n${blocks.join("\n\n---\n\n")}`;
}
