import { NextRequest, NextResponse } from "next/server";
import { readNote, writeNote, deleteNote } from "@agent-company/engine";
import { prisma } from "@/lib/db";
import { reindexNote } from "@agent-company/engine";

type Params = { params: Promise<{ path: string[] }> };

function joinPath(segments: string[]): string {
  return segments.join("/");
}

/** GET /api/vault/[...path] — read note */
export async function GET(_req: NextRequest, { params }: Params) {
  const { path: segments } = await params;
  const relativePath = joinPath(segments);
  const note = readNote(relativePath);
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(note);
}

/** PUT /api/vault/[...path] body: { content, append? } — write note */
export async function PUT(req: NextRequest, { params }: Params) {
  const { path: segments } = await params;
  const relativePath = joinPath(segments);
  const body = await req.json() as { content: string; append?: boolean };

  if (!body.content && body.content !== "") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  writeNote(relativePath, body.content, body.append ?? false);
  await reindexNote(prisma as unknown as Parameters<typeof reindexNote>[0], relativePath);

  const updated = readNote(relativePath);
  return NextResponse.json(updated ?? { path: relativePath });
}

/** DELETE /api/vault/[...path] — delete note */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { path: segments } = await params;
  const relativePath = joinPath(segments);

  deleteNote(relativePath);
  await prisma.vaultNote.delete({ where: { path: relativePath } }).catch(() => {});

  return NextResponse.json({ deleted: relativePath });
}
