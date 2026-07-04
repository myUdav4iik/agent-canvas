"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Play, Download, Upload, ChevronDown } from "lucide-react";
import { useCanvasStore } from "@/stores/canvas";
import { useRunStore } from "@/stores/run";
import { useSSE } from "@/hooks/useSSE";
import { useFlows, useCreateFlow, useSaveFlow } from "@/hooks/useFlow";
import { useQueryClient } from "@tanstack/react-query";

const btn = {
  ghost: "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-[#7d92ad] transition-colors hover:bg-[#141c2e] hover:text-[#e2e8f4] disabled:opacity-30 disabled:cursor-not-allowed",
  primary: "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
};

export function TopBar() {
  const router = useRouter();
  const qc = useQueryClient();
  const { flowId, flowName, isDirty, nodes, edges, setFlowName, setFlowId, loadFlow, markSaved } = useCanvasStore();
  const { data: flows = [] } = useFlows();
  const createFlow = useCreateFlow();
  const saveFlow = useSaveFlow();
  const [editingName, setEditingName] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!flowId) {
      const created = await createFlow.mutateAsync({ name: flowName });
      setFlowId(created.id);
      await saveFlow.mutateAsync({ id: created.id, name: flowName, nodes, edges });
      router.replace(`/canvas?flowId=${created.id}`);
    } else {
      await saveFlow.mutateAsync({ id: flowId, name: flowName, nodes, edges });
    }
    markSaved();
  };

  const handleLoadFlow = (id: string) => router.push(`/canvas?flowId=${id}`);
  const handleNewFlow = () => {
    loadFlow({ id: "", name: "Untitled Flow", nodes: [], edges: [] });
    router.push("/canvas");
  };

  const saving = createFlow.isPending || saveFlow.isPending;
  const { activeRunId, runStatus, startRun } = useRunStore();
  useSSE(activeRunId);

  const handleRun = async () => {
    if (!flowId) return;
    if (isDirty) {
      await saveFlow.mutateAsync({ id: flowId, name: flowName, nodes, edges });
      markSaved();
    }
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flowId }),
    });
    const { runId } = (await res.json()) as { runId: string };
    startRun(runId);
    router.push(`/runs/${runId}`);
  };

  const isRunning = runStatus === "running";

  const handleExport = () => {
    if (!flowId) return;
    const a = document.createElement("a");
    a.href = `/api/flows/${flowId}/export`;
    a.click();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as unknown;
      const res = await fetch("/api/flows/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle),
      });
      const body = (await res.json()) as { flowId?: string; error?: string };
      if (!res.ok || !body.flowId) { setImportError(body.error ?? "Import failed"); return; }
      await qc.invalidateQueries({ queryKey: ["flows"] });
      router.push(`/canvas?flowId=${body.flowId}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b border-[#131c30] bg-[#080d18] px-3">
      {/* ── Flow identity ── */}
      <div className="flex items-center gap-1.5 min-w-0">
        {editingName ? (
          <input
            ref={nameRef}
            className="rounded-md border border-[#2d3d57] bg-[#141c2e] px-2 py-0.5 text-[12px] text-[#e2e8f4] outline-none focus:border-blue-500/60 w-40"
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingName(false); }}
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="flex items-center gap-1 text-[12px] font-medium text-[#e2e8f4] hover:text-white truncate max-w-[200px]"
            title="Click to rename"
          >
            {flowName}
            {isDirty && (
              <span className="h-1 w-1 rounded-full bg-blue-400 shrink-0" title="Unsaved changes" />
            )}
          </button>
        )}

        {/* Flow picker */}
        <div className="relative">
          <select
            className={[
              "appearance-none rounded-md border border-[#1e2a40] bg-[#141c2e]",
              "pl-2 pr-6 py-0.5 text-[11px] text-[#7d92ad] outline-none cursor-pointer",
              "hover:border-[#2d3d57] focus:border-blue-500/50 transition-colors",
            ].join(" ")}
            value={flowId ?? ""}
            onChange={(e) => {
              if (e.target.value === "__new__") handleNewFlow();
              else if (e.target.value) handleLoadFlow(e.target.value);
            }}
          >
            <option value="">flows</option>
            <option value="__new__">+ New flow</option>
            {flows.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <ChevronDown
            size={10}
            className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[#3d5070]"
          />
        </div>
      </div>

      <div className="flex-1" />

      {/* ── Keyboard hint ── */}
      <span className="hidden text-[10px] text-[#3d5070] md:block select-none">
        ⌘Z · ⌘⇧Z
      </span>

      {/* ── Import error ── */}
      {importError && (
        <span className="text-[10px] text-red-400 max-w-[160px] truncate" title={importError}>
          {importError}
        </span>
      )}

      {/* ── File ops ── */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={handleExport}
          disabled={!flowId}
          className={btn.ghost}
          title="Export flow as JSON"
        >
          <Download size={12} strokeWidth={2} />
          Export
        </button>
        <label className={[btn.ghost, "cursor-pointer"].join(" ")} title="Import flow from JSON">
          <Upload size={12} strokeWidth={2} />
          Import
          <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
        </label>
      </div>

      {/* ── Divider ── */}
      <div className="h-4 w-px bg-[#1e2a40] mx-1" />

      {/* ── Save ── */}
      <button
        onClick={handleSave}
        disabled={saving || (!isDirty && Boolean(flowId))}
        className={[btn.primary, "bg-[#1e2a40] text-[#7d92ad] hover:bg-[#2d3d57] hover:text-[#e2e8f4]"].join(" ")}
      >
        <Save size={12} strokeWidth={2} />
        {saving ? "Saving…" : "Save"}
      </button>

      {/* ── Run ── */}
      <button
        onClick={handleRun}
        disabled={!flowId || isRunning}
        className={[btn.primary, isRunning ? "bg-emerald-800 text-emerald-200" : "bg-emerald-700 hover:bg-emerald-600"].join(" ")}
        title={!flowId ? "Save flow first" : isRunning ? "Run in progress" : "Run flow"}
      >
        <Play size={11} strokeWidth={2.5} className="fill-current" />
        {isRunning ? "Running…" : "Run"}
      </button>
    </header>
  );
}
