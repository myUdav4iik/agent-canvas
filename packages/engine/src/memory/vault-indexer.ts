/**
 * Keeps the Prisma VaultNote + NoteLink tables in sync with the filesystem vault.
 *
 * Usage:
 *   import { indexVault, watchVault } from "@agent-company/engine";
 *
 *   await indexVault(prisma);         // full scan on startup
 *   watchVault(prisma);               // incremental re-index on file change
 */
import fs from "node:fs";
import path from "node:path";
import { walkNotes, readNote, vaultDir } from "./vault-fs";

// Minimal Prisma client shape we need (avoids importing @prisma/client in engine)
export interface VaultPrismaClient {
  vaultNote: {
    upsert(args: {
      where: { path: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }): Promise<{ id: string; path: string }>;
    findUnique(args: { where: { path: string } }): Promise<{ id: string } | null>;
    findMany(args?: { where?: Record<string, unknown> }): Promise<{ id: string; path: string }[]>;
    delete(args: { where: { path: string } }): Promise<void>;
  };
  noteLink: {
    upsert(args: {
      where: { fromNoteId_toNoteId: { fromNoteId: string; toNoteId: string } };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }): Promise<void>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<void>;
  };
}

async function indexFile(prisma: VaultPrismaClient, relativePath: string): Promise<void> {
  const note = readNote(relativePath);
  if (!note) return;

  const row = await prisma.vaultNote.upsert({
    where: { path: relativePath },
    update: {
      title: note.title,
      tags: JSON.stringify(note.tags),
      frontmatter: JSON.stringify(note.frontmatter),
      body: note.body,
    },
    create: {
      path: relativePath,
      title: note.title,
      tags: JSON.stringify(note.tags),
      frontmatter: JSON.stringify(note.frontmatter),
      body: note.body,
    },
  });

  // Remove stale outgoing links then re-create current ones
  await prisma.noteLink.deleteMany({ where: { fromNoteId: row.id } });

  for (const target of note.wikilinks) {
    // Resolve target: try exact path match, then title match
    const targetPath = target.endsWith(".md") ? target : `${target}.md`;
    const targetRow =
      await prisma.vaultNote.findUnique({ where: { path: targetPath } }) ??
      (await prisma.vaultNote.findMany()).find(
        (n) => n.path.toLowerCase().includes(target.toLowerCase()),
      ) ?? null;

    if (targetRow && targetRow.id !== row.id) {
      await prisma.noteLink.upsert({
        where: { fromNoteId_toNoteId: { fromNoteId: row.id, toNoteId: targetRow.id } },
        update: {},
        create: { fromNoteId: row.id, toNoteId: targetRow.id },
      });
    }
  }
}

/** Full vault scan — run once on app startup. */
export async function indexVault(prisma: VaultPrismaClient): Promise<void> {
  const paths = walkNotes();
  // Index all files (upsert — safe to run multiple times)
  for (const p of paths) {
    try {
      await indexFile(prisma, p);
    } catch (err) {
      console.warn(`[vault-indexer] Failed to index ${p}:`, err);
    }
  }
  console.log(`[vault-indexer] Indexed ${paths.length} notes.`);
}

/** Watch the vault directory for changes and re-index incrementally. */
export function watchVault(prisma: VaultPrismaClient): () => void {
  const dir = vaultDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const watcher = fs.watch(dir, { recursive: true }, (event, filename) => {
    if (!filename || !filename.endsWith(".md")) return;
    const relativePath = filename.replace(/\\/g, "/");

    const abs = path.join(dir, relativePath);
    if (!fs.existsSync(abs)) {
      // File deleted
      prisma.vaultNote.delete({ where: { path: relativePath } }).catch(() => {});
      return;
    }

    indexFile(prisma, relativePath).catch((err) =>
      console.warn(`[vault-indexer] Re-index failed for ${relativePath}:`, err),
    );
  });

  return () => watcher.close();
}

/** Re-index a single file after an agent writes it. */
export async function reindexNote(prisma: VaultPrismaClient, relativePath: string): Promise<void> {
  await indexFile(prisma, relativePath);
}
