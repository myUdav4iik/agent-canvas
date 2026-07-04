"use client";
import { Suspense, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";
import { AppShell } from "@/components/ui/AppShell";
import { TopBar } from "@/components/ui/TopBar";
import { FlowCanvas } from "@/components/canvas/FlowCanvas";
import { NodePalette } from "@/components/canvas/NodePalette";
import { InspectorPanel } from "@/components/canvas/InspectorPanel";
import { useCanvasStore } from "@/stores/canvas";
import { useFlow } from "@/hooks/useFlow";
import type { Node, Edge } from "@xyflow/react";
import type { AnyNodeData } from "@/lib/flow-convert";

function CanvasLoader({ flowId }: { flowId: string }) {
  const { data, isSuccess } = useFlow(flowId);
  const loadFlow = useCanvasStore((s) => s.loadFlow);

  useEffect(() => {
    if (!isSuccess || !data) return;
    const nodes = data.nodes as Node<AnyNodeData>[];
    const edges = data.edges as Edge[];
    loadFlow({ id: data.id, name: data.name, nodes, edges });
  }, [isSuccess, data, loadFlow]);

  return null;
}

function KeyboardHandler() {
  const { undo, redo, canUndo, canRedo } = useCanvasStore();

  const handler = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "z" && !e.shiftKey && canUndo()) { e.preventDefault(); undo(); }
      if (meta && (e.key === "Z" || (e.key === "z" && e.shiftKey)) && canRedo()) { e.preventDefault(); redo(); }
    },
    [undo, redo, canUndo, canRedo],
  );

  useEffect(() => {
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handler]);

  return null;
}

function CanvasContent() {
  const searchParams = useSearchParams();
  const flowId = searchParams.get("flowId");

  return (
    <ReactFlowProvider>
      {flowId && <CanvasLoader flowId={flowId} />}
      <KeyboardHandler />
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <NodePalette />
        <FlowCanvas />
        <InspectorPanel />
      </div>
    </ReactFlowProvider>
  );
}

export default function CanvasPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="flex flex-1 items-center justify-center text-[#3d5070] text-[12px]">Loading canvas…</div>}>
        <CanvasContent />
      </Suspense>
    </AppShell>
  );
}
