"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ClipboardList, UserCheck } from "lucide-react";
import { BaseNode } from "./BaseNode";
import type { TaskNodeData } from "@/lib/flow-convert";

const FORMAT_LABEL: Record<string, string> = {
  text: "text",
  json: "json",
  "markdown-note": "→ vault",
};

export function TaskNode({ data, selected }: NodeProps & { data: TaskNodeData }) {
  const formatLabel = data.outputFormat ? FORMAT_LABEL[data.outputFormat] ?? data.outputFormat : undefined;

  return (
    <BaseNode
      selected={selected}
      accentColor="#8b5cf6"
      Icon={ClipboardList}
      title={data.label || "Task"}
      subtitle={formatLabel}
      runState={data.runState ?? "idle"}
    >
      <Handle type="target" position={Position.Left} className="!bg-violet-500 !border-violet-900" />
      <div className="px-[14px] pb-2.5 pt-1.5">
        <p className="line-clamp-2 text-[10px] text-[#7d92ad] leading-[1.5]">
          {data.description || "No description"}
        </p>
        {data.humanInTheLoop && (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-px text-[9px] font-medium text-amber-300 bg-amber-950/40 border border-amber-900/40">
            <UserCheck size={9} strokeWidth={2} />
            human review
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-violet-500 !border-violet-900" />
    </BaseNode>
  );
}
