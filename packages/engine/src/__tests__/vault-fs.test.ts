import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Override VAULT_DIR before importing vault-fs so all paths use the temp dir
let tmpDir: string;

// We import dynamically in each test suite so the env var is set first
async function getVaultFs() {
  return import("../memory/vault-fs");
}

describe("vault-fs", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-fs-test-"));
    process.env["VAULT_DIR"] = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env["VAULT_DIR"];
  });

  describe("absolutePath()", () => {
    it("resolves a relative path inside vault", async () => {
      const { absolutePath } = await getVaultFs();
      const abs = absolutePath("notes/hello.md");
      expect(abs).toBe(path.join(tmpDir, "notes/hello.md"));
    });

    it("throws on path traversal attempt", async () => {
      const { absolutePath } = await getVaultFs();
      expect(() => absolutePath("../../etc/passwd")).toThrow("Path traversal");
    });
  });

  describe("writeNote() + readNote()", () => {
    it("writes and reads a plain markdown note", async () => {
      const { writeNote, readNote } = await getVaultFs();
      writeNote("test.md", "# Hello\n\nWorld");
      const note = readNote("test.md");
      expect(note).not.toBeNull();
      expect(note!.body.trim()).toBe("# Hello\n\nWorld");
    });

    it("parses frontmatter title and tags", async () => {
      const { writeNote, readNote } = await getVaultFs();
      writeNote("meta.md", "---\ntitle: My Note\ntags: [foo, bar]\n---\nBody text");
      const note = readNote("meta.md");
      expect(note!.title).toBe("My Note");
      expect(note!.tags).toEqual(["foo", "bar"]);
      expect(note!.body.trim()).toBe("Body text");
    });

    it("derives title from filename when frontmatter is missing", async () => {
      const { writeNote, readNote } = await getVaultFs();
      writeNote("my-cool-note.md", "content");
      const note = readNote("my-cool-note.md");
      expect(note!.title).toBe("my cool note");
    });

    it("creates nested directories on write", async () => {
      const { writeNote, readNote } = await getVaultFs();
      writeNote("research/deep/nested.md", "deep content");
      const note = readNote("research/deep/nested.md");
      expect(note!.body.trim()).toBe("deep content");
    });

    it("returns null when note does not exist", async () => {
      const { readNote } = await getVaultFs();
      expect(readNote("nonexistent.md")).toBeNull();
    });

    it("appends to existing note when append=true", async () => {
      const { writeNote, readNote } = await getVaultFs();
      writeNote("append.md", "Line 1");
      writeNote("append.md", "Line 2", true);
      const note = readNote("append.md");
      expect(note!.body).toContain("Line 1");
      expect(note!.body).toContain("Line 2");
    });
  });

  describe("extractWikilinks()", () => {
    it("extracts wikilinks from body", async () => {
      const { extractWikilinks } = await getVaultFs();
      const links = extractWikilinks("See [[Research Notes]] and [[Data Analysis]].");
      expect(links).toEqual(["Research Notes", "Data Analysis"]);
    });

    it("deduplicates identical wikilinks", async () => {
      const { extractWikilinks } = await getVaultFs();
      const links = extractWikilinks("[[A]] and [[A]] again");
      expect(links).toEqual(["A"]);
    });

    it("returns empty array when no wikilinks", async () => {
      const { extractWikilinks } = await getVaultFs();
      expect(extractWikilinks("No links here.")).toEqual([]);
    });

    it("stores wikilinks on a read note", async () => {
      const { writeNote, readNote } = await getVaultFs();
      writeNote("linked.md", "See [[Other Note]] for details.");
      const note = readNote("linked.md");
      expect(note!.wikilinks).toEqual(["Other Note"]);
    });
  });

  describe("deleteNote()", () => {
    it("deletes an existing note", async () => {
      const { writeNote, deleteNote, readNote } = await getVaultFs();
      writeNote("to-delete.md", "bye");
      deleteNote("to-delete.md");
      expect(readNote("to-delete.md")).toBeNull();
    });

    it("is a no-op when note does not exist", async () => {
      const { deleteNote } = await getVaultFs();
      expect(() => deleteNote("ghost.md")).not.toThrow();
    });
  });

  describe("walkNotes()", () => {
    it("returns empty array for empty vault", async () => {
      const { walkNotes } = await getVaultFs();
      expect(walkNotes()).toEqual([]);
    });

    it("returns relative paths for all .md files", async () => {
      const { writeNote, walkNotes } = await getVaultFs();
      writeNote("a.md", "a");
      writeNote("b.md", "b");
      writeNote("sub/c.md", "c");
      const paths = walkNotes().sort();
      expect(paths).toEqual(["a.md", "b.md", "sub/c.md"]);
    });

    it("ignores non-md files", async () => {
      const { walkNotes } = await getVaultFs();
      fs.writeFileSync(path.join(tmpDir, "image.png"), "");
      fs.writeFileSync(path.join(tmpDir, "note.md"), "");
      const paths = walkNotes();
      expect(paths).toEqual(["note.md"]);
    });
  });

  describe("listNotes()", () => {
    it("returns a tree structure", async () => {
      const { writeNote, listNotes } = await getVaultFs();
      writeNote("folder/note.md", "hi");
      const tree = listNotes();
      expect(tree.isDir).toBe(true);
      expect(tree.children?.some((c) => c.name === "folder")).toBe(true);
    });
  });
});
