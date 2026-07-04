"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import type { ConditionNodeData } from "@/lib/flow-convert";

export function ConditionNode({ data, selected }: NodeProps & { data: ConditionNodeData }) {
  return (
    <div className="relative flex h-[72px] w-[148px] items-center justify-center">
      {/* Diamond background */}
      <div
        className={[
          "absolute inset-0 rounded-md border bg-[#0d1420]",
          "shadow-[0_1px_3px_rgba(0,0,0,0.5),0_4px_16px_rgba(0,0,0,0.3)]",
          selected
            ? "border-emerald-500/50 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]"
            : "border-[#1e2a40]",
        ].join(" ")}
        style={{ transform: "rotate(45deg)" }}
      />

      {/* Content */}
      <div className="relative z-10 max-w-[110px] text-center px-2">
        <div className="flex items-center justify-center gap-1 mb-0.5">
          <GitBranch size={11} style={{ color: "#10b981" }} strokeWidth={2.2} />
          <p className="text-[11px] font-semibold text-[#e2e8f4] leading-none">
            {data.label || "Condition"}
          </p>
        </div>
        {data.conditionExpr && (
          <p className="truncate font-mono text-[8px] text-emerald-400/50">
            {data.conditionExpr.slice(0, 24)}
          </p>
        )}
      </div>

      {/* Handles — offset to diamond corners */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-emerald-500 !border-emerald-900"
        style={{ left: -4 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        className="!bg-emerald-500 !border-emerald-900"
        style={{ right: -4 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!bg-red-500 !border-red-900"
        style={{ bottom: -4 }}
      />
    </div>
  );
}
