"use client";
import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { useVaultSearch } from "@/hooks/useVault";

interface VaultSearchProps { isOpen: boolean; onClose: () => void; onSelect: (path: string) => void; }

export function VaultSearch({ isOpen, onClose, onSelect }: VaultSearchProps) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, isFetching } = useVaultSearch(q, tag);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQ(""); setTag(""); }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function highlight(text: string, query: string): React.ReactNode {
    if (!query || !text) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-blue-600/40 text-blue-200 rounded px-0.5">{part}</mark>
        : part,
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl rounded-xl border border-[#1e2a40] bg-[#0d1420] shadow-[0_8px_40px_rgba(0,0,0,0.7)] overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-[#131c30]">
          <Search size={14} strokeWidth={2} className="text-[#3d5070] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search vault…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 bg-transparent text-[13px] text-[#e2e8f4] placeholder:text-[#3d5070] outline-none"
          />
          <div className="flex items-center gap-1.5">
            {isFetching && <span className="text-[10px] text-[#3d5070] animate-pulse">Searching…</span>}
            <button
              onClick={onClose}
              className="flex h-5 w-5 items-center justify-center rounded text-[#3d5070] hover:text-[#7d92ad] hover:bg-[#141c2e] transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Tag filter chips */}
        {["ai", "agents", "research", "code"].length > 0 && (
          <div className="flex gap-1.5 px-3 py-2 border-b border-[#131c30] overflow-x-auto">
            <span className="text-[10px] text-[#3d5070] flex-shrink-0 self-center">Tag:</span>
            {["ai", "agents", "research", "code"].map((t) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? "" : t)}
                className={[
                  "flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium border transition-colors",
                  tag === t
                    ? "border-blue-600/50 text-blue-300 bg-blue-600/15"
                    : "border-[#1e2a40] text-[#3d5070] hover:border-[#2d3d57] hover:text-[#7d92ad]",
                ].join(" ")}
              >
                #{t}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {(!q || q.length < 2) && !tag ? (
            <p className="py-8 text-center text-[12px] text-[#3d5070]">Type to search…</p>
          ) : (q.length >= 2 || tag) && (!data || data.hits.length === 0) && !isFetching ? (
            <p className="py-8 text-center text-[12px] text-[#3d5070]">No results found</p>
          ) : (
            data?.hits.map((hit) => (
              <button
                key={hit.path}
                onClick={() => { onSelect(hit.path); onClose(); }}
                className="w-full text-left px-3 py-2.5 hover:bg-[#141c2e] border-b border-[#0d1420] last:border-0 transition-colors"
              >
                <div className="flex items-baseline justify-between mb-0.5 gap-2">
                  <span className="text-[12px] font-medium text-[#e2e8f4] truncate">
                    {highlight(hit.title, q)}
                  </span>
                  <span className="font-mono text-[9px] text-[#3d5070] shrink-0">{hit.path}</span>
                </div>
                {hit.snippet && (
                  <p className="text-[11px] text-[#7d92ad] leading-relaxed line-clamp-2">
                    {highlight(hit.snippet, q)}
                  </p>
                )}
                {hit.tags.length > 0 && (
                  <div className="flex gap-1.5 mt-1">
                    {hit.tags.map((t) => (
                      <span key={t} className="text-[9px] text-blue-400">#{t}</span>
                    ))}
                  </div>
                )}
              </button>
            ))
          )}
        </div>

        {data && data.total > 30 && (
          <div className="px-3 py-1.5 text-[10px] text-[#3d5070] border-t border-[#131c30] text-center">
            Showing 30 of {data.total} — refine your query
          </div>
        )}
      </div>
    </div>
  );
}
