"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/ui/AppShell";
import { TraceTimeline } from "@/components/runs/TraceTimeline";
import { RunMetrics } from "@/components/runs/RunMetrics";
import { ReplayScrubber } from "@/components/runs/ReplayScrubber";
import { HumanInTheLoopCard } from "@/components/runs/HumanInTheLoopCard";
import { useRunStore } from "@/stores/run";
import { useSSE } from "@/hooks/useSSE";
import { useQuery } from "@tanstack/react-query";
import { deriveRunState } from "@/lib/derive-run-state";
import type { TraceEvent } from "@agent-company/shared";

interface RunDetail {
  id: string;
  status: string;
  flow: { id: string; name: string };
  startedAt: string;
  durationMs: number | null;
  totalTokens: number;
  totalCostUsd: number;
  events: { sequence: number; eventType: string; event: TraceEvent; timestamp: string }[];
}

type Speed = 1 | 2 | 5;

/** Interval between replay steps in milliseconds at each speed multiplier */
const REPLAY_INTERVAL_MS: Record<Speed, number> = { 1: 300, 2: 150, 5: 60 };

function RunDetailView({ runId }: { runId: string }) {
  const { activeRunId, events, tokenBuffers, metrics, runStatus, runError, pendingHumanPause } = useRunStore();

  const isActiveRun = activeRunId === runId;

  const { data } = useQuery<RunDetail>({
    queryKey: ["run", runId],
    queryFn: () => fetch(`/api/runs/${runId}`).then((r) => r.json()),
    enabled: !isActiveRun,
    refetchInterval: (query) => {
      const status = (query.state.data as RunDetail | undefined)?.status;
      return status === "running" ? 2000 : false;
    },
  });

  useSSE(isActiveRun ? runId : null);

  // ── Replay state (only meaningful for completed runs) ──────────────────────
  const allPersistedEvents = (data?.events ?? []).map((e) => e.event);
  const [replayPos, setReplayPos] = useState<number>(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<Speed>(1);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset scrubber position when run data loads
  useEffect(() => {
    if (!isActiveRun && allPersistedEvents.length > 0) {
      setReplayPos(allPersistedEvents.length - 1);
    }
  }, [isActiveRun, allPersistedEvents.length]);

  const stopPlayback = useCallback(() => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    setReplayPlaying(false);
  }, []);

  const startPlayback = useCallback(() => {
    if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    setReplayPlaying(true);
    setReplayPos((prev) => {
      // If already at end, restart from beginning
      return prev >= allPersistedEvents.length - 1 ? 0 : prev;
    });
    playIntervalRef.current = setInterval(() => {
      setReplayPos((prev) => {
        if (prev >= allPersistedEvents.length - 1) {
          stopPlayback();
          return prev;
        }
        return prev + 1;
      });
    }, REPLAY_INTERVAL_MS[replaySpeed]);
  }, [allPersistedEvents.length, replaySpeed, stopPlayback]);

  // Restart interval when speed changes mid-play
  useEffect(() => {
    if (replayPlaying) {
      startPlayback();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replaySpeed]);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  // ── Derived display values ─────────────────────────────────────────────────
  const showReplay = !isActiveRun && allPersistedEvents.length > 0;
  const replaySlice = showReplay ? allPersistedEvents.slice(0, replayPos + 1) : [];

  const { nodeStates: replayNodeStates, tokenBuffers: replayTokenBuffers } = showReplay
    ? deriveRunState(replaySlice)
    : { nodeStates: {}, tokenBuffers: {} };

  const displayEvents = isActiveRun ? events : replaySlice;
  const displayTokenBuffers = isActiveRun ? tokenBuffers : replayTokenBuffers;

  const displayStatus = isActiveRun ? runStatus : (data?.status ?? "running");
  const displayMetrics = isActiveRun
    ? metrics
    : {
        tokens: data?.totalTokens ?? 0,
        costUsd: data?.totalCostUsd ?? 0,
        durationMs: data?.durationMs ?? 0,
        startedAt: data ? new Date(data.startedAt).getTime() : 0,
      };

  return (
    <div className="flex flex-col h-full bg-[#080d18]">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-[#131c30]">
        <Link href="/runs" className="text-[11px] text-[#3d5070] hover:text-[#7d92ad] transition-colors">← Runs</Link>
        <span className="h-3 w-px bg-[#1e2a40]" />
        <span className="text-[12px] font-semibold text-[#e2e8f4]">
          {data?.flow.name ?? "Run"}
        </span>
        <span className="font-mono text-[9px] text-[#1e2a40]">{runId.slice(-8)}</span>
        {isActiveRun && (
          <button
            onClick={() => fetch(`/api/runs/${runId}`, { method: "DELETE" })}
            className="ml-auto rounded-md px-2.5 py-1 text-[11px] font-medium text-red-500 border border-red-900/50 hover:bg-red-950/40 hover:text-red-400 transition-colors"
          >
            Kill
          </button>
        )}
      </div>

      {/* Replay scrubber — only for completed runs */}
      {showReplay && (
        <ReplayScrubber
          totalEvents={allPersistedEvents.length}
          position={replayPos}
          playing={replayPlaying}
          speed={replaySpeed}
          onPosition={(pos) => { stopPlayback(); setReplayPos(pos); }}
          onPlay={startPlayback}
          onPause={stopPlayback}
          onSpeed={setReplaySpeed}
        />
      )}

      <RunMetrics metrics={displayMetrics} status={displayStatus} />

      {/* Error banner */}
      {isActiveRun && runStatus === "failed" && runError && (
        <div className="mx-3 mt-2 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-[11px] text-red-300 leading-relaxed">
          <span className="font-semibold text-red-400">Run failed: </span>
          {runError}
        </div>
      )}

      {/* Human-in-the-loop approval card */}
      {isActiveRun && runStatus === "paused" && pendingHumanPause && (
        <HumanInTheLoopCard runId={runId} pause={pendingHumanPause} />
      )}

      <div className="flex-1 overflow-hidden">
        {displayEvents.length === 0 && !isActiveRun ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[#3d5070] text-[12px]">
            <p>No events recorded for this run.</p>
          </div>
        ) : (
          <TraceTimeline
            events={displayEvents}
            tokenBuffers={displayTokenBuffers}
            autoScroll={isActiveRun && !replayPlaying}
          />
        )}
      </div>
    </div>
  );
}

export default function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  return (
    <AppShell>
      <RunDetailView runId={runId} />
    </AppShell>
  );
}
