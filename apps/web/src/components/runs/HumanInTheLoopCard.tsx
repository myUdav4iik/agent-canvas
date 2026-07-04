"use client";
import { useState } from "react";
import type { PendingHumanPause } from "@/stores/run";

interface Props { runId: string; pause: PendingHumanPause; }

const btn = {
  base: "rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40",
  approve: "bg-emerald-800 hover:bg-emerald-700 text-emerald-100",
  edit:    "bg-[#141c2e] hover:bg-[#1e2a40] text-[#7d92ad] border border-[#1e2a40] hover:border-[#2d3d57]",
  submit:  "bg-blue-700 hover:bg-blue-600 text-white",
  cancel:  "bg-transparent text-[#3d5070] hover:text-[#7d92ad]",
  reject:  "bg-red-950/60 hover:bg-red-900/60 text-red-400 border border-red-900/40",
};

export function HumanInTheLoopCard({ runId, pause }: Props) {
  const [mode, setMode] = useState<"review" | "edit">("review");
  const [editedOutput, setEditedOutput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(decision: "approve" | "edit" | "reject") {
    if (decision === "edit" && !editedOutput.trim()) { setError("Edited output cannot be empty."); return; }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/runs/${runId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: pause.taskId, decision, ...(decision === "edit" ? { editedOutput: editedOutput.trim() } : {}) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-3 my-2 rounded-lg border border-amber-800/40 bg-amber-950/15 p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-400">
          Awaiting Review
        </span>
      </div>

      {/* Task */}
      <div>
        <p className="text-[10px] text-[#3d5070] uppercase tracking-wide mb-1">Task</p>
        <p className="text-[12px] text-[#e2e8f4] leading-relaxed">{pause.description}</p>
      </div>

      {/* Context */}
      {pause.context && (
        <div>
          <p className="text-[10px] text-[#3d5070] uppercase tracking-wide mb-1">Context</p>
          <pre className="text-[11px] text-[#7d92ad] bg-[#141c2e] rounded-md p-2 overflow-x-auto whitespace-pre-wrap max-h-28 overflow-y-auto font-mono leading-relaxed border border-[#1e2a40]">
            {pause.context}
          </pre>
        </div>
      )}

      {/* Edit textarea */}
      {mode === "edit" && (
        <div>
          <p className="text-[10px] text-[#3d5070] uppercase tracking-wide mb-1">Override output</p>
          <textarea
            className="w-full rounded-md border border-[#1e2a40] bg-[#141c2e] text-[12px] text-[#e2e8f4] p-2 resize-y min-h-[72px] outline-none focus:border-blue-500/50 placeholder:text-[#3d5070] leading-relaxed"
            placeholder="Enter the output to use instead…"
            value={editedOutput}
            onChange={(e) => setEditedOutput(e.target.value)}
            disabled={submitting}
          />
        </div>
      )}

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => submit("approve")} disabled={submitting} className={[btn.base, btn.approve].join(" ")}>
          Approve
        </button>
        {mode === "review" ? (
          <button onClick={() => setMode("edit")} disabled={submitting} className={[btn.base, btn.edit].join(" ")}>
            Edit output…
          </button>
        ) : (
          <>
            <button onClick={() => submit("edit")} disabled={submitting} className={[btn.base, btn.submit].join(" ")}>
              Use edited
            </button>
            <button onClick={() => { setMode("review"); setEditedOutput(""); }} disabled={submitting} className={[btn.base, btn.cancel].join(" ")}>
              Cancel
            </button>
          </>
        )}
        <button onClick={() => submit("reject")} disabled={submitting} className={[btn.base, btn.reject].join(" ")}>
          Reject
        </button>
      </div>
    </div>
  );
}
