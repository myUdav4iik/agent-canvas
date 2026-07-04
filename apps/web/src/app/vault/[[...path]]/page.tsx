"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Edit3, Share2, Search } from "lucide-react";
import { useVaultTree } from "@/hooks/useVault";
import { FileTree } from "@/components/vault/FileTree";
import { NoteEditor } from "@/components/vault/NoteEditor";
import { BacklinksPanel } from "@/components/vault/BacklinksPanel";
import { GraphView } from "@/components/vault/GraphView";
import { VaultSearch } from "@/components/vault/VaultSearch";
import { AppShell } from "@/components/ui/AppShell";

export default function VaultPage() {
  const router = useRouter();
  const params = useParams();
  const rawPath = params["path"];
  const activePath = rawPath
    ? (Array.isArray(rawPath) ? rawPath.join("/") : rawPath)
    : null;

  const { data, isLoading } = useVaultTree();
  const [view, setView] = useState<"editor" | "graph">("editor");
  const [searchOpen, setSearchOpen] = useState(false);

  const navigate = useCallback((path: string) => router.push(`/vault/${path}`), [router]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen((o) => !o); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!activePath && data?.notes?.[0]) router.replace(`/vault/${data.notes[0].path}`);
  }, [activePath, data, router]);

  return (
    <AppShell>
      <div className="flex h-screen overflow-hidden bg-[#080d18]">
        {/* Left: File tree */}
        <div className="w-52 flex-shrink-0 border-r border-[#131c30] bg-[#0d1420] flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#131c30]">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-[#3d5070]">Vault</h2>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setView("editor")}
                title="Editor"
                className={[
                  "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                  view === "editor"
                    ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
                    : "text-[#3d5070] hover:text-[#7d92ad] hover:bg-[#141c2e]",
                ].join(" ")}
              >
                <Edit3 size={11} strokeWidth={2} />
              </button>
              <button
                onClick={() => setView("graph")}
                title="Graph"
                className={[
                  "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                  view === "graph"
                    ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
                    : "text-[#3d5070] hover:text-[#7d92ad] hover:bg-[#141c2e]",
                ].join(" ")}
              >
                <Share2 size={11} strokeWidth={2} />
              </button>
              <button
                onClick={() => setSearchOpen(true)}
                title="Search (⌘K)"
                className="flex h-6 w-6 items-center justify-center rounded-md text-[#3d5070] hover:text-[#7d92ad] hover:bg-[#141c2e] transition-colors"
              >
                <Search size={11} strokeWidth={2} />
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center flex-1 text-[#3d5070] text-[11px]">
              Loading…
            </div>
          ) : data?.tree ? (
            <FileTree node={data.tree} activePath={activePath} onSelect={navigate} />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-[#3d5070] text-[11px] text-center px-4 gap-1.5">
              <p className="text-[#7d92ad]">No notes yet</p>
              <p className="leading-relaxed">Run an agent with vault-write access to create your first note.</p>
            </div>
          )}
        </div>

        {/* Center */}
        <div className="flex-1 overflow-hidden">
          {view === "graph" ? (
            <GraphView notes={data?.notes ?? []} onSelect={navigate} />
          ) : activePath ? (
            <NoteEditor notePath={activePath} onNavigate={navigate} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-[#3d5070] gap-2">
              <p className="text-[13px] font-medium text-[#7d92ad]">Memory Vault</p>
              <p className="text-[11px]">Select a note or press ⌘K to search</p>
            </div>
          )}
        </div>

        {/* Right: Backlinks */}
        {view === "editor" && (
          <div className="w-60 flex-shrink-0 border-l border-[#131c30] bg-[#0d1420]">
            <BacklinksPanel notePath={activePath} onNavigate={navigate} />
          </div>
        )}
      </div>

      <VaultSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} onSelect={navigate} />
    </AppShell>
  );
}
