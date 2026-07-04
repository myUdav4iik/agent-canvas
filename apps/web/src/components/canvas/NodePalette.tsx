"use client";
import {
  Play, Bot, ClipboardList, GitBranch, RefreshCw,
  SplitSquareHorizontal, MergeIcon, Square, type LucideIcon,
} from "lucide-react";
import { useResizable } from "@/hooks/useResizable";

interface NodeDef {
  type: string;
  label: string;
  Icon: LucideIcon;
  accent: string;
}

const NODE_TYPES: NodeDef[] = [
  { type: "start",     label: "Start",     Icon: Play,                   accent: "#475569" },
  { type: "agent",     label: "Agent",     Icon: Bot,                    accent: "#3b82f6" },
  { type: "task",      label: "Task",      Icon: ClipboardList,          accent: "#8b5cf6" },
  { type: "condition", label: "Condition", Icon: GitBranch,              accent: "#10b981" },
  { type: "loop",      label: "Loop",      Icon: RefreshCw,              accent: "#f59e0b" },
  { type: "parallel",  label: "Parallel",  Icon: SplitSquareHorizontal,  accent: "#06b6d4" },
  { type: "join",      label: "Join",      Icon: MergeIcon,              accent: "#06b6d4" },
  { type: "end",       label: "End",       Icon: Square,                 accent: "#475569" },
];

export function NodePalette() {
  const { width, handleProps } = useResizable({ defaultWidth: 168, minWidth: 128, maxWidth: 280, direction: "right" });

  const onDragStart = (event: React.DragEvent, type: string) => {
    event.dataTransfer.setData("application/reactflow-node-type", type);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside
      className="relative flex flex-col flex-shrink-0 border-r border-[#1e2a40] bg-[#0d1420]"
      style={{ width }}
    >
      <div className="px-3 pt-3 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#3d5070]">
          Nodes
        </p>
      </div>

      <div className="flex flex-col gap-px px-2 pb-3">
        {NODE_TYPES.map(({ type, label, Icon, accent }) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            className={[
              "relative flex cursor-grab items-center gap-2.5",
              "rounded-md px-2.5 py-2 text-[12px] font-medium select-none",
              "border border-transparent bg-transparent text-[#7d92ad]",
              "transition-colors hover:bg-[#141c2e] hover:text-[#e2e8f4] hover:border-[#1e2a40]",
              "active:cursor-grabbing active:bg-[#141c2e]",
            ].join(" ")}
          >
            {/* Accent swatch */}
            <span
              className="h-3.5 w-[3px] rounded-full shrink-0"
              style={{ backgroundColor: accent }}
            />
            <Icon size={13} strokeWidth={2} className="shrink-0" style={{ color: accent }} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="mt-auto px-3 pb-3 border-t border-[#131c30] pt-2.5">
        <p className="text-[10px] text-[#3d5070] leading-relaxed">
          Drag onto canvas
        </p>
      </div>

      {/* Resize handle */}
      <div
        {...handleProps}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-blue-500/30"
      />
    </aside>
  );
}
