"use client";
import type { ReactNode, ComponentType } from "react";
import type { LucideProps } from "lucide-react";

type RunState = "idle" | "active" | "done" | "error";

interface BaseNodeProps {
  children?: ReactNode;
  selected?: boolean;
  /** Hex color for the left accent bar and icon tint */
  accentColor: string;
  /** Lucide icon component */
  Icon: ComponentType<LucideProps>;
  title: string;
  subtitle?: string | undefined;
  runState?: RunState;
  badge?: string | undefined;
}

const STATE_RING: Record<RunState, string> = {
  idle:   "",
  active: "ring-1 ring-blue-500/60 ring-offset-1 ring-offset-[#020810]",
  done:   "ring-1 ring-emerald-500/50 ring-offset-1 ring-offset-[#020810]",
  error:  "ring-1 ring-red-500/60 ring-offset-1 ring-offset-[#020810]",
};

const STATE_DOT_COLOR: Record<RunState, string> = {
  idle:   "#3d5070",
  active: "#3b82f6",
  done:   "#10b981",
  error:  "#ef4444",
};

const STATE_DOT_ANIM: Record<RunState, string> = {
  idle:   "",
  active: "animate-pulse",
  done:   "",
  error:  "",
};

export function BaseNode({
  children,
  selected,
  accentColor,
  Icon,
  title,
  subtitle,
  runState = "idle",
  badge,
}: BaseNodeProps) {
  return (
    <div
      className={[
        "relative min-w-[192px] max-w-[224px] rounded-lg overflow-hidden",
        "border border-[#1e2a40] bg-[#0d1420]",
        "shadow-[0_1px_3px_rgba(0,0,0,0.5),0_4px_16px_rgba(0,0,0,0.3)]",
        selected
          ? "border-blue-500/50 shadow-[0_0_0_1px_rgba(59,130,246,0.2),0_4px_20px_rgba(0,0,0,0.4)]"
          : "",
        STATE_RING[runState],
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 h-full w-0.5"
        style={{ backgroundColor: accentColor }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 pl-[14px] pr-2.5 py-2 bg-[#141c2e]">
        <Icon size={13} style={{ color: accentColor }} strokeWidth={2.2} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="truncate text-[12px] font-semibold text-[#e2e8f4] leading-[1.3]">
            {title}
          </p>
          {subtitle && (
            <p className="truncate text-[10px] text-[#3d5070] leading-[1.3] mt-px">
              {subtitle}
            </p>
          )}
        </div>
        {/* Status dot */}
        <span
          className={["h-1.5 w-1.5 rounded-full shrink-0 transition-colors", STATE_DOT_ANIM[runState]].join(" ")}
          style={{ backgroundColor: STATE_DOT_COLOR[runState] }}
        />
      </div>

      {/* Body */}
      {children}

      {/* Badge */}
      {badge && (
        <div
          className="absolute -top-2 -right-2 rounded-full px-1.5 py-px text-[9px] font-bold text-white leading-none shadow"
          style={{ backgroundColor: accentColor }}
        >
          {badge}
        </div>
      )}
    </div>
  );
}
