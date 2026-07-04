"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { SplitSquareHorizontal, MergeIcon } from "lucide-react";
import type { ControlNodeData } from "@/lib/flow-convert";

const nodeSurface = "bg-[#0d1420] border border-[#1e2a40] shadow-[0_1px_3px_rgba(0,0,0,0.5)]";

export function StartNode({ data }: NodeProps & { data: ControlNodeData }) {
  return (
    <div
      className={[
        nodeSurface,
        "flex h-8 items-center justify-center rounded-full px-4",
      ].join(" ")}
    >
      <span
        className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"
        aria-hidden
      />
      <span className="text-[11px] font-semibold text-[#7d92ad] tracking-wide uppercase">
        {data.label || "Start"}
      </span>
      <Handle type="source" position={Position.Right} className="!bg-slate-500 !border-slate-800" />
    </div>
  );
}

export function EndNode({ data }: NodeProps & { data: ControlNodeData }) {
  return (
    <div
      className={[
        nodeSurface,
        "flex h-8 items-center justify-center rounded-full px-4",
      ].join(" ")}
    >
      <span className="text-[11px] font-semibold text-[#7d92ad] tracking-wide uppercase">
        {data.label || "End"}
      </span>
      <span
        className="ml-1.5 h-2 w-2 rounded-full border-2 border-[#475569]"
        aria-hidden
      />
      <Handle type="target" position={Position.Left} className="!bg-slate-500 !border-slate-800" />
    </div>
  );
}

export function ParallelNode({ data }: NodeProps & { data: ControlNodeData }) {
  return (
    <div
      className={[
        nodeSurface,
        "relative flex min-w-[128px] flex-col items-center rounded-lg px-3 py-2 gap-0.5",
      ].join(" ")}
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 h-full w-0.5 rounded-l-lg bg-cyan-600" />
      <SplitSquareHorizontal size={14} className="text-cyan-400" strokeWidth={2} />
      <p className="text-[11px] font-semibold text-[#7d92ad]">{data.label || "Parallel"}</p>
      <Handle type="target" position={Position.Left} className="!bg-cyan-500 !border-cyan-900" />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-cyan-500 !border-cyan-900"
        id="branch-0"
        style={{ top: "35%" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-cyan-500 !border-cyan-900"
        id="branch-1"
        style={{ top: "65%" }}
      />
    </div>
  );
}

export function JoinNode({ data }: NodeProps & { data: ControlNodeData }) {
  return (
    <div
      className={[
        nodeSurface,
        "relative flex min-w-[128px] flex-col items-center rounded-lg px-3 py-2 gap-0.5",
      ].join(" ")}
    >
      <div className="absolute left-0 top-0 h-full w-0.5 rounded-l-lg bg-cyan-600" />
      <MergeIcon size={14} className="text-cyan-400" strokeWidth={2} />
      <p className="text-[11px] font-semibold text-[#7d92ad]">{data.label || "Join"}</p>
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-cyan-500 !border-cyan-900"
        id="in-0"
        style={{ top: "35%" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-cyan-500 !border-cyan-900"
        id="in-1"
        style={{ top: "65%" }}
      />
      <Handle type="source" position={Position.Right} className="!bg-cyan-500 !border-cyan-900" />
    </div>
  );
}
