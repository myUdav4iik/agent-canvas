"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot } from "lucide-react";
import { BaseNode } from "./BaseNode";
import type { AgentNodeData } from "@/lib/flow-convert";

export function AgentNode({ data, selected }: NodeProps & { data: AgentNodeData }) {
  const toolCount = data.tools.length;

  return (
    <BaseNode
      selected={selected}
      accentColor="#3b82f6"
      Icon={Bot}
      title={data.name || "Agent"}
      subtitle={data.role || undefined}
      runState={data.runState ?? "idle"}
    >
      <Handle type="target" position={Position.Left} className="!bg-blue-500 !border-blue-800" />
      <div className="px-[14px] pb-2.5 pt-1.5">
        <p className="text-[10px] text-[#7d92ad] font-mono">
          {data.llmProvider}/{data.llmModel}
        </p>
        {toolCount > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {data.tools.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded px-1.5 py-px text-[9px] font-medium text-blue-300 bg-blue-950/40 border border-blue-900/40"
              >
                {t}
              </span>
            ))}
            {toolCount > 3 && (
              <span className="text-[9px] text-[#3d5070]">+{toolCount - 3}</span>
            )}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-blue-500 !border-blue-800" />
    </BaseNode>
  );
}
