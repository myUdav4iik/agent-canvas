"use client";
import type { TraceEvent } from "@agent-company/shared";

// SVG path data for inline icons (viewBox 0 0 16 16)
const ICONS: Record<string, string> = {
  play:    "M3 2l10 6-10 6V2z",
  thought: "M2 8a6 6 0 1010.5 4.1L14 14l-1.9-1.5A6 6 0 002 8z",
  tool:    "M9.5 2.5l4 4-7 7-1-3-3-1 7-7zM10 6l-5.5 5.5",
  check:   "M2 8l4 4 8-8",
  flag:    "M3 2v12M3 2l10 3-10 4v5",
  error:   "M8 2a6 6 0 100 12A6 6 0 008 2zm0 3v4m0 2.5v.5",
  warn:    "M8 2L14 13H2L8 2zm0 4.5v3m0 2v.5",
  loop:    "M13 5H7a4 4 0 000 8h2m2-10l2 2-2 2",
  branch:  "M6 2v8m0 0l-3 3m3-3l3 3M10 2v4",
  split:   "M8 2v12M4 6l4-4 4 4M4 10l4 4 4-4",
  merge:   "M4 4l4 4-4 4M12 4l-4 4 4 4",
  human:   "M8 6a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3 14a5 5 0 0110 0",
  book:    "M2 3h6a2 2 0 012 2v10a2 2 0 01-2-2H2V3zm12 0h-4a2 2 0 00-2 2v10a2 2 0 002-2h4V3z",
  pencil:  "M11 2l3 3-9 9H2v-3L11 2z",
};

interface EventConfig { icon: string; color: string; label: string; }

const EVENT_CONFIG: Record<string, EventConfig> = {
  agent_started:           { icon: "play",   color: "#3b82f6", label: "Agent" },
  agent_thought:           { icon: "thought", color: "#7d92ad", label: "Thought" },
  token_stream:            { icon: "pencil", color: "#3d5070", label: "Stream" },
  tool_call:               { icon: "tool",   color: "#f59e0b", label: "Tool call" },
  tool_result:             { icon: "check",  color: "#10b981", label: "Result" },
  task_completed:          { icon: "check",  color: "#10b981", label: "Completed" },
  run_completed:           { icon: "flag",   color: "#10b981", label: "Run done" },
  run_error:               { icon: "error",  color: "#ef4444", label: "Error" },
  max_iterations_reached:  { icon: "warn",   color: "#f59e0b", label: "Max iters" },
  delegation_started:      { icon: "branch", color: "#8b5cf6", label: "Delegating" },
  delegation_completed:    { icon: "branch", color: "#8b5cf6", label: "Delegated" },
  loop_iteration:          { icon: "loop",   color: "#f59e0b", label: "Loop" },
  loop_completed:          { icon: "loop",   color: "#f59e0b", label: "Loop done" },
  condition_evaluated:     { icon: "branch", color: "#06b6d4", label: "Condition" },
  parallel_branch_started: { icon: "split",  color: "#06b6d4", label: "Branch" },
  parallel_join_completed: { icon: "merge",  color: "#06b6d4", label: "Join" },
  human_in_the_loop_pause: { icon: "human",  color: "#f59e0b", label: "Review" },
  vault_read:              { icon: "book",   color: "#8b5cf6", label: "Vault read" },
  vault_write:             { icon: "pencil", color: "#8b5cf6", label: "Vault write" },
};

function Icon({ name, color }: { name: string; color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
      stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className="shrink-0 mt-px"
    >
      <path d={ICONS[name] ?? ICONS.play} />
    </svg>
  );
}

function Detail({ event }: { event: TraceEvent }) {
  switch (event.type) {
    case "agent_started":
      return <span className="text-[#7d92ad]">{event.agentName}</span>;
    case "tool_call":
      return (
        <span>
          <span className="font-mono text-amber-300/80">{event.tool}</span>
          <span className="ml-2 font-mono text-[10px] text-[#3d5070]">
            {JSON.stringify(event.args).slice(0, 100)}
          </span>
        </span>
      );
    case "tool_result":
      return (
        <span className="font-mono text-[10px] text-[#7d92ad] break-all">
          {JSON.stringify(event.result).slice(0, 160)}
          {event.error && <span className="ml-2 text-red-400">{event.error}</span>}
        </span>
      );
    case "task_completed":
      return (
        <span className="text-[11px] text-[#7d92ad] leading-relaxed break-words">
          {event.output.slice(0, 320)}{event.output.length > 320 && "…"}
        </span>
      );
    case "human_in_the_loop_pause":
      return (
        <span className="text-amber-300/80 text-[11px]">
          {event.description.slice(0, 100)}{event.description.length > 100 && "…"}
        </span>
      );
    case "run_error":
      return <span className="text-red-400 break-words">{event.error}</span>;
    case "max_iterations_reached":
      return <span className="text-amber-400/80">{event.iterations} iters</span>;
    case "run_completed":
      return (
        <span className="text-[#7d92ad]">
          {event.durationMs}ms · {event.totalTokens.toLocaleString()} tokens
        </span>
      );
    case "loop_iteration":
      return <span className="text-amber-400/80">iter {event.iteration}/{event.maxIterations}</span>;
    case "condition_evaluated":
      return (
        <span>
          <span className="font-mono text-[10px] text-[#3d5070]">{event.expression.slice(0, 36)}</span>
          <span className={`ml-1.5 text-[10px] font-semibold ${event.result ? "text-emerald-400" : "text-red-400"}`}>
            → {event.result ? "true" : "false"}
          </span>
        </span>
      );
    default:
      return null;
  }
}

interface Props { event: TraceEvent; isTokenGroup?: boolean; tokenText?: string; }

export function TraceEventItem({ event, isTokenGroup, tokenText }: Props) {
  if (isTokenGroup && tokenText) {
    return (
      <div className="mx-3 my-1 rounded-md border-l-2 border-blue-800/50 bg-[#141c2e] px-3 py-2 font-mono text-[11px] text-[#e2e8f4] leading-[1.7] whitespace-pre-wrap break-words">
        {tokenText}
      </div>
    );
  }

  if (event.type === "token_stream") return null;

  const cfg = EVENT_CONFIG[event.type] ?? { icon: "play", color: "#3d5070", label: event.type };
  const ts = new Date(event.ts).toLocaleTimeString("en", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="flex items-start gap-2.5 px-3 py-1.5 hover:bg-[#141c2e]/50 group transition-colors">
      <Icon name={cfg.icon} color={cfg.color} />
      <div className="flex-1 min-w-0 leading-none">
        <span
          className="text-[10px] font-semibold uppercase tracking-wide mr-2"
          style={{ color: cfg.color }}
        >
          {cfg.label}
        </span>
        <span className="text-[11px]">
          <Detail event={event} />
        </span>
      </div>
      <span className="font-mono text-[9px] text-[#1e2a40] shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {ts}
      </span>
    </div>
  );
}
