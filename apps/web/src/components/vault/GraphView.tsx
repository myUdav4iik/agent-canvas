"use client";
import { useEffect, useState } from "react";
import type { VaultNoteStub } from "@/hooks/useVault";

const TAG_COLORS: Record<string, string> = {
  ai: "#6366f1",
  agents: "#8b5cf6",
  research: "#06b6d4",
  code: "#10b981",
  default: "#64748b",
};

function noteColor(tags: string[]): string {
  for (const t of tags) {
    if (TAG_COLORS[t]) return TAG_COLORS[t];
  }
  return TAG_COLORS["default"]!;
}

// Dynamically imported ForceGraph2D — client only
let ForceGraph2D: React.ComponentType<Record<string, unknown>> | null = null;

interface GraphViewProps {
  notes: VaultNoteStub[];
  onSelect: (path: string) => void;
}

export function GraphView({ notes, onSelect }: GraphViewProps) {
  const [mounted, setMounted] = useState(false);
  const [GraphComponent, setGraphComponent] = useState<React.ComponentType<Record<string, unknown>> | null>(null);

  useEffect(() => {
    if (ForceGraph2D) {
      setGraphComponent(() => ForceGraph2D);
      setMounted(true);
      return;
    }
    void import("react-force-graph-2d").then((m) => {
      ForceGraph2D = m.default as React.ComponentType<Record<string, unknown>>;
      setGraphComponent(() => ForceGraph2D);
      setMounted(true);
    });
  }, []);

  const graphData = {
    nodes: notes.map((n) => ({
      id: n.path,
      label: n.title,
      val: Math.max(1, n.tags.length),
      color: noteColor(n.tags),
    })),
    links: [] as { source: string; target: string }[],
  };

  if (!mounted || !GraphComponent) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        Loading graph…
      </div>
    );
  }

  return (
    <GraphComponent
      graphData={graphData}
      nodeLabel="label"
      nodeColor={(n: Record<string, unknown>) => (n["color"] as string) ?? "#64748b"}
      nodeVal={(n: Record<string, unknown>) => (n["val"] as number) ?? 1}
      linkColor={() => "#374151"}
      backgroundColor="#030712"
      onNodeClick={(n: Record<string, unknown>) => onSelect(n["id"] as string)}
    />
  );
}
