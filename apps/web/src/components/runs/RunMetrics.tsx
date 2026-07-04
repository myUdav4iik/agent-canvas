"use client";
import { useEffect, useState } from "react";
import type { RunMetrics } from "@/stores/run";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

const STATUS_DOT: Record<string, string> = {
  running:   "bg-blue-400 animate-pulse",
  completed: "bg-emerald-400",
  failed:    "bg-red-400",
  killed:    "bg-[#3d5070]",
  idle:      "bg-[#1e2a40]",
};

interface Props { metrics: RunMetrics; status: string; }

export function RunMetrics({ metrics, status }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status !== "running" || metrics.startedAt === 0) return;
    const id = setInterval(() => setElapsed(Date.now() - metrics.startedAt), 100);
    return () => clearInterval(id);
  }, [status, metrics.startedAt]);

  const displayMs = status === "running" ? elapsed : metrics.durationMs;

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-[#131c30] bg-[#080d18] text-[11px] text-[#7d92ad]">
      <span className="flex items-center gap-1.5">
        <span className={["h-1.5 w-1.5 rounded-full", STATUS_DOT[status] ?? STATUS_DOT.idle].join(" ")} />
        <span className="capitalize font-medium text-[#e2e8f4]">{status}</span>
      </span>

      <span className="h-3 w-px bg-[#1e2a40]" />

      <span className="flex items-center gap-1">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/>
        </svg>
        {formatDuration(displayMs)}
      </span>

      <span className="flex items-center gap-1">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="6"/><path d="M8 5v3m-2 2l2-2 2 2"/>
        </svg>
        {metrics.tokens.toLocaleString()} tokens
      </span>

      {metrics.costUsd > 0 && (
        <span className="text-[#3d5070]">
          ${metrics.costUsd.toFixed(4)}
        </span>
      )}
    </div>
  );
}
