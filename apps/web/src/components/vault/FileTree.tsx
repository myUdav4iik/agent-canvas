"use client";
import { useState } from "react";
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from "lucide-react";
import type { FileTreeNode } from "@/hooks/useVault";

interface FileTreeProps {
  node: FileTreeNode;
  activePath: string | null;
  onSelect: (path: string) => void;
  depth?: number;
}

function TreeNode({ node, activePath, onSelect, depth = 0 }: FileTreeProps) {
  const [open, setOpen] = useState(depth < 2);

  if (!node.isDir) {
    const isActive = activePath === node.path;
    return (
      <button
        onClick={() => onSelect(node.path)}
        title={node.path}
        style={{ paddingLeft: `${8 + (depth + 1) * 12}px` }}
        className={[
          "w-full text-left flex items-center gap-1.5 py-[3px] pr-2 rounded-md text-[12px] truncate transition-colors",
          isActive
            ? "bg-blue-600/20 text-[#e2e8f4] border border-blue-600/30"
            : "text-[#7d92ad] hover:bg-[#141c2e] hover:text-[#e2e8f4] border border-transparent",
        ].join(" ")}
      >
        <FileText size={11} strokeWidth={1.8} className="shrink-0 opacity-60" />
        <span className="truncate">{node.name.replace(/\.md$/, "")}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        className="w-full text-left flex items-center gap-1.5 py-[3px] pr-2 text-[11px] font-medium text-[#3d5070] hover:text-[#7d92ad] transition-colors"
      >
        {open ? <ChevronDown size={10} className="shrink-0" /> : <ChevronRight size={10} className="shrink-0" />}
        {open ? <FolderOpen size={11} strokeWidth={1.8} className="shrink-0" /> : <Folder size={11} strokeWidth={1.8} className="shrink-0" />}
        {node.name}
      </button>
      {open && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} activePath={activePath} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ node, activePath, onSelect }: { node: FileTreeNode; activePath: string | null; onSelect: (path: string) => void; }) {
  return (
    <div className="overflow-y-auto py-1.5 px-1.5">
      <TreeNode node={node} activePath={activePath} onSelect={onSelect} depth={0} />
    </div>
  );
}
