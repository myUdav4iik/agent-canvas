"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface VaultNoteStub {
  path: string;
  title: string;
  tags: string[];
}

export interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileTreeNode[];
}

export interface VaultNote {
  path: string;
  title: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  body: string;
  wikilinks: string[];
}

export interface SearchHit {
  path: string;
  title: string;
  tags: string[];
  snippet: string;
  updatedAt: string;
}

export function useVaultTree() {
  return useQuery({
    queryKey: ["vault", "tree"],
    queryFn: async () => {
      const res = await fetch("/api/vault");
      if (!res.ok) throw new Error("Failed to load vault");
      return res.json() as Promise<{ tree: FileTreeNode; notes: VaultNoteStub[] }>;
    },
    staleTime: 10_000,
  });
}

export function useVaultNote(path: string | null) {
  return useQuery({
    queryKey: ["vault", "note", path],
    queryFn: async () => {
      const res = await fetch(`/api/vault/${path}`);
      if (!res.ok) throw new Error("Note not found");
      return res.json() as Promise<VaultNote>;
    },
    enabled: !!path,
    staleTime: 5_000,
  });
}

export function useSaveNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      const res = await fetch(`/api/vault/${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Save failed");
      return res.json() as Promise<VaultNote>;
    },
    onSuccess: (_, { path }) => {
      void qc.invalidateQueries({ queryKey: ["vault"] });
      void qc.invalidateQueries({ queryKey: ["vault", "note", path] });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      const res = await fetch(`/api/vault/${path}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vault"] });
    },
  });
}

export function useVaultSearch(q: string, tag: string) {
  return useQuery({
    queryKey: ["vault", "search", q, tag],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (tag) params.set("tag", tag);
      const res = await fetch(`/api/vault/search?${params.toString()}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json() as Promise<{ hits: SearchHit[]; total: number }>;
    },
    enabled: q.length > 1 || tag.length > 0,
    staleTime: 2_000,
  });
}
