"use client";
import { useEffect, useRef } from "react";
import { useRunStore } from "@/stores/run";
import type { TraceEvent } from "@agent-company/shared";

/**
 * Opens an EventSource to /api/runs/{runId}/stream and dispatches
 * each parsed TraceEvent to the run store. Closes on terminal events.
 */
export function useSSE(runId: string | null) {
  const applyEvent = useRunStore((s) => s.applyEvent);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!runId) return;

    // Close any previous connection
    esRef.current?.close();

    console.log(`[useSSE] opening EventSource for runId=${runId}`);
    const es = new EventSource(`/api/runs/${runId}/stream`);
    esRef.current = es;

    es.onopen = () => {
      console.log(`[useSSE] connected runId=${runId}`);
    };

    es.onmessage = (e) => {
      if (!e.data || e.data.startsWith(":")) return; // ignore SSE comments
      try {
        const event = JSON.parse(e.data as string) as TraceEvent;
        console.log(`[useSSE] received event ${event.type} runId=${runId}`);
        applyEvent(event);
        if (event.type === "run_completed" || event.type === "run_error") {
          console.log(`[useSSE] terminal event ${event.type} — closing runId=${runId}`);
          es.close();
        }
      } catch (err) {
        console.error(`[useSSE] failed to parse SSE frame:`, e.data, err);
      }
    };

    es.onerror = (err) => {
      console.error(`[useSSE] EventSource error runId=${runId}`, err);
      // Browser auto-reconnects on error; we only close on terminal events
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [runId, applyEvent]);
}
