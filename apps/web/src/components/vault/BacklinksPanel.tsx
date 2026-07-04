"use client";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";

interface BacklinksPanelProps { notePath: string | null; onNavigate: (path: string) => void; }

function useBacklinks(notePath: string | null) {
  return useQuery({
    queryKey: ["vault", "backlinks", notePath],
    queryFn: async () => {
      if (!notePath) return [];
      const res = await fetch(`/api/vault/search?q=${encodeURIComponent(`[[${notePath.replace(".md", "")}]]`)}`);
      if (!res.ok) return [];
      const data = await res.json() as { hits: { path: string; title: string }[] };
      return data.hits.filter((h) => h.path !== notePath);
    },
    enabled: !!notePath,
    staleTime: 10_000,
  });
}

export function BacklinksPanel({ notePath, onNavigate }: BacklinksPanelProps) {
  const { data: backlinks = [], isLoading } = useBacklinks(notePath);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#131c30]">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[#3d5070]">
          Backlinks
          {backlinks.length > 0 && (
            <span className="ml-1.5 text-[#3d5070]">({backlinks.length})</span>
          )}
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {!notePath && (
          <p className="px-1 text-[11px] text-[#3d5070]">Select a note</p>
        )}
        {notePath && isLoading && (
          <p className="px-1 text-[11px] text-[#3d5070]">Loading…</p>
        )}
        {notePath && !isLoading && backlinks.length === 0 && (
          <p className="px-1 text-[11px] text-[#3d5070]">No backlinks yet</p>
        )}
        {backlinks.map((link) => (
          <button
            key={link.path}
            onClick={() => onNavigate(link.path)}
            className={[
              "w-full text-left flex items-start gap-2 px-2 py-2 rounded-md",
              "transition-colors border border-transparent",
              "hover:bg-[#141c2e] hover:border-[#1e2a40]",
            ].join(" ")}
          >
            <FileText size={11} strokeWidth={1.8} className="shrink-0 mt-0.5 text-[#3d5070]" />
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-[#7d92ad] truncate">{link.title}</div>
              <div className="text-[10px] text-[#3d5070] truncate font-mono">{link.path}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
