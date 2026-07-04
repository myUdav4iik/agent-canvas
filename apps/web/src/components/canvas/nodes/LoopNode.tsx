"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { RefreshCw } from "lucide-react";
import { BaseNode } from "./BaseNode";
import type { LoopNodeData } from "@/lib/flow-convert";

export function LoopNode({ data, selected }: NodeProps & { data: LoopNodeData }) {
  const iterLabel = data.currentIteration !== undefined
    ? `${data.currentIteration} / ${data.loopMax}`
    : `max ${data.loopMax}`;

  const badge = data.currentIteration !== undefined
    ? `${data.currentIteration}/${data.loopMax}`
    : undefined;

  return (
    <BaseNode
      selected={selected}
      accentColor="#f59e0b"
      Icon={RefreshCw}
      title={data.label || "Loop"}
      subtitle={`${data.loopType} · ${iterLabel}`}
      runState={data.runState ?? "idle"}
      badge={badge}
    >
      <Handle type="target" position={Position.Left} className="!bg-amber-500 !border-amber-900" />
      {data.loopCondition && (
        <div className="px-[14px] pb-2 pt-1">
          <p className="truncate font-mono text-[9px] text-amber-400/60">{data.loopCondition}</p>
        </div>
      )}
      {/* body → right, done → bottom */}
      <Handle type="source" position={Position.Right} className="!bg-amber-500 !border-amber-900" id="body" />
      <Handle type="source" position={Position.Bottom} className="!bg-amber-500 !border-amber-900" id="done" />
    </BaseNode>
  );
}
