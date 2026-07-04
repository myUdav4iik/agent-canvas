import { NextResponse } from "next/server";
import { listNotes, walkNotes, readNote } from "@agent-company/engine";

/** GET /api/vault — returns full file tree + flat notes list */
export async function GET() {
  try {
    const tree = listNotes();
    const paths = walkNotes();
    const notes = paths.map((p) => {
      const n = readNote(p);
      return n
        ? { path: n.path, title: n.title, tags: n.tags }
        : { path: p, title: p, tags: [] };
    });
    return NextResponse.json({ tree, notes });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
