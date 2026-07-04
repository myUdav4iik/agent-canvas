/**
 * Low-level vault filesystem operations.
 * All paths are relative to VAULT_DIR (process.env.VAULT_DIR ?? "./vault").
 * The vault directory is created on first write if it doesn't exist.
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface VaultNote {
  path: string;            // relative to vault root, e.g. "research/topic.md"
  title: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  body: string;
  wikilinks: string[];     // [[target]] link targets extracted from body
}

export interface FileTreeNode {
  name: string;
  path: string;            // relative to vault root
  isDir: boolean;
  children?: FileTreeNode[];
}

export function vaultDir(): string {
  return path.resolve(process.env["VAULT_DIR"] ?? "./vault");
}

export function absolutePath(relativePath: string): string {
  // Prevent path traversal
  const abs = path.resolve(vaultDir(), relativePath);
  if (!abs.startsWith(vaultDir())) {
    throw new Error(`Path traversal attempt: ${relativePath}`);
  }
  return abs;
}

export function extractWikilinks(body: string): string[] {
  const re = /\[\[([^\]]+)]]/g;
  const links: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m[1]) links.push(m[1].trim());
  }
  return [...new Set(links)];
}

export function readNote(relativePath: string): VaultNote | null {
  const abs = absolutePath(relativePath);
  if (!fs.existsSync(abs)) return null;

  const raw = fs.readFileSync(abs, "utf-8");
  const parsed = matter(raw);
  const fm = parsed.data as Record<string, unknown>;
  const title = (fm["title"] as string | undefined) ??
    path.basename(relativePath, ".md").replace(/-/g, " ");
  const tags = Array.isArray(fm["tags"]) ? (fm["tags"] as string[]) : [];

  return {
    path: relativePath,
    title,
    tags,
    frontmatter: fm,
    body: parsed.content,
    wikilinks: extractWikilinks(parsed.content),
  };
}

export function writeNote(relativePath: string, content: string, append = false): void {
  const abs = absolutePath(relativePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (append && fs.existsSync(abs)) {
    fs.appendFileSync(abs, "\n" + content, "utf-8");
  } else {
    fs.writeFileSync(abs, content, "utf-8");
  }
}

export function deleteNote(relativePath: string): void {
  const abs = absolutePath(relativePath);
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
}

export function listNotes(folder?: string): FileTreeNode {
  const root = folder ? absolutePath(folder) : vaultDir();
  const rootRelative = folder ?? ".";

  function buildTree(dir: string, rel: string): FileTreeNode {
    const name = path.basename(dir);
    const stat = fs.statSync(dir);

    if (!stat.isDirectory()) {
      return { name, path: rel, isDir: false };
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.name.startsWith("."))
      .sort((a, b) => {
        // Directories first, then files, alphabetically
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    return {
      name: rel === "." ? "vault" : name,
      path: rel,
      isDir: true,
      children: entries.map((e) =>
        buildTree(path.join(dir, e.name), rel === "." ? e.name : `${rel}/${e.name}`),
      ),
    };
  }

  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }

  return buildTree(root, rootRelative);
}

/** Walk all .md files in the vault, returning their relative paths. */
export function walkNotes(dir = vaultDir(), base = vaultDir()): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkNotes(full, base));
    } else if (entry.name.endsWith(".md")) {
      results.push(path.relative(base, full).replace(/\\/g, "/"));
    }
  }

  return results;
}
