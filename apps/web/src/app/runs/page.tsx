"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/ui/AppShell";

interface RunSummary {
  id: string;
  status: string;
  startedAt: string;
  durationMs: number | null;
  totalTokens: number;
  totalCostUsd: number;
  flow: { name: string };
}

const STATUS_DOT: Record<string, string> = {
  running:   "bg-blue-400 animate-pulse",
  completed: "bg-emerald-400",
  failed:    "bg-red-400",
  killed:    "bg-[#3d5070]",
};

const STATUS_TEXT: Record<string, string> = {
  running:   "text-blue-300",
  completed: "text-emerald-300",
  failed:    "text-red-300",
  killed:    "text-[#3d5070]",
};

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export default function RunsPage() {
  const { data: runs = [], isLoading } = useQuery<RunSummary[]>({
    queryKey: ["runs"],
    queryFn: () => fetch("/api/runs").then((r) => r.json()),
    refetchInterval: 3000,
  });

  return (
    <AppShell>
      <div className="flex flex-col h-full bg-[#080d18]">
        {/* Page header */}
        <div className="flex items-center px-4 py-2.5 border-b border-[#131c30]">
          <h1 className="text-[13px] font-semibold text-[#e2e8f4]">Runs</h1>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-[#3d5070] text-[12px]">
            Loading…
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[#3d5070]">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="opacity-30">
              <circle cx="16" cy="16" r="14" stroke="#7d92ad" strokeWidth="1.5"/>
              <path d="M12 10l10 6-10 6V10z" fill="#7d92ad"/>
            </svg>
            <p className="text-[12px]">No runs yet</p>
            <Link href="/canvas" className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors">
              Build a flow on the canvas →
            </Link>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-[#080d18] border-b border-[#131c30]">
                <tr className="text-[10px] font-semibold uppercase tracking-widest text-[#3d5070] text-left">
                  <th className="px-4 py-2">Flow</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Duration</th>
                  <th className="px-4 py-2">Tokens</th>
                  <th className="px-4 py-2">Started</th>
                  <th className="px-4 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="group border-b border-[#0d1420] hover:bg-[#0d1420] transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-2.5">
                      <Link href={`/runs/${run.id}`} className="block">
                        <span className="text-[12px] font-medium text-[#e2e8f4] group-hover:text-white transition-colors">
                          {run.flow.name}
                        </span>
                        <span className="ml-2 font-mono text-[9px] text-[#1e2a40]">
                          {run.id.slice(-8)}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/runs/${run.id}`} className="flex items-center gap-1.5">
                        <span className={["h-1.5 w-1.5 rounded-full", STATUS_DOT[run.status] ?? "bg-[#1e2a40]"].join(" ")} />
                        <span className={["text-[11px] font-medium capitalize", STATUS_TEXT[run.status] ?? "text-[#7d92ad]"].join(" ")}>
                          {run.status}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-[#7d92ad]">
                      <Link href={`/runs/${run.id}`} className="block font-mono">
                        {formatDuration(run.durationMs)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-[#7d92ad]">
                      <Link href={`/runs/${run.id}`} className="block font-mono">
                        {run.totalTokens.toLocaleString()}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-[#3d5070]">
                      <Link href={`/runs/${run.id}`} className="block">
                        {new Date(run.startedAt).toLocaleString("en", {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/runs/${run.id}`} className="flex justify-end text-[#1e2a40] group-hover:text-[#3d5070] transition-colors">
                        <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
