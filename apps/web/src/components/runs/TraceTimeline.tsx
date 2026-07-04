"use client";
import { useEffect, useRef } from "react";
import type { TraceEvent } from "@agent-company/shared";
import { TraceEventItem } from "./TraceEventItem";

interface Props {
  events: TraceEvent[];
  /** Accumulated token text per agentId for streaming display */
  tokenBuffers: Record<string, string>;
  autoScroll?: boolean;
}

/**
 * Renders the trace event list. Token streams are collapsed into a single
 * streaming text block per agent, shown after the agent_started event.
 * Individual token_stream events are hidden.
 */
export function TraceTimeline({ events, tokenBuffers, autoScroll = true }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events.length, autoScroll]);

  if (events.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[#3d5070] text-[12px]">
        <svg className="animate-spin h-4 w-4 text-[#2d3d57]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>Waiting for events…</span>
      </div>
    );
  }

  // Build a collapsed view: collapse token_stream into a streaming block per agent
  type Row =
    | { kind: "event"; event: TraceEvent }
    | { kind: "tokens"; agentId: string; text: string };

  const rows: Row[] = [];
  const seenTokenAgents = new Set<string>();

  for (const event of events) {
    if (event.type === "token_stream") {
      if (!seenTokenAgents.has(event.agentId)) {
        seenTokenAgents.add(event.agentId);
        rows.push({ kind: "tokens", agentId: event.agentId, text: tokenBuffers[event.agentId] ?? "" });
      } else {
        // Update existing token row
        const row = [...rows].reverse().find((r) => r.kind === "tokens" && r.agentId === event.agentId);
        if (row && row.kind === "tokens") {
          row.text = tokenBuffers[event.agentId] ?? row.text + event.token;
        }
      }
      continue;
    }

    // Non-token event — if this agent's token block was open, "close" it so next agent gets fresh block
    if ("agentId" in event) {
      seenTokenAgents.delete(event.agentId);
    }

    rows.push({ kind: "event", event });
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto py-1">
      {rows.map((row, i) =>
        row.kind === "tokens" ? (
          <TraceEventItem
            key={`tok-${row.agentId}-${i}`}
            event={{ type: "token_stream", runId: "", agentId: row.agentId, token: "", ts: 0 }}
            isTokenGroup
            tokenText={row.text}
          />
        ) : (
          <TraceEventItem key={i} event={row.event} />
        ),
      )}
      <div ref={bottomRef} />
    </div>
  );
}
