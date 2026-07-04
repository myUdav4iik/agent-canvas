"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Node, Edge } from "@xyflow/react";
import { rfNodeToSavePayload, rfEdgeToSavePayload } from "@/lib/flow-convert";
import type { AnyNodeData } from "@/lib/flow-convert";

export interface FlowSummary {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  createdAt: string;
}

export interface FlowDetail extends FlowSummary {
  nodes: unknown[];
  edges: unknown[];
}

// ─── List flows ───────────────────────────────────────────────────────────────

export function useFlows() {
  return useQuery<FlowSummary[]>({
    queryKey: ["flows"],
    queryFn: () => fetch("/api/flows").then((r) => r.json()),
  });
}

// ─── Get one flow ─────────────────────────────────────────────────────────────

export function useFlow(id: string | null) {
  return useQuery<FlowDetail>({
    queryKey: ["flows", id],
    queryFn: () => fetch(`/api/flows/${id}`).then((r) => r.json()),
    enabled: Boolean(id),
  });
}

// ─── Create flow ──────────────────────────────────────────────────────────────

export function useCreateFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json() as Promise<FlowSummary>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flows"] }),
  });
}

// ─── Save flow (PUT) ──────────────────────────────────────────────────────────

export function useSaveFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nodes, edges, name }: { id: string; nodes: Node[]; edges: Edge[]; name: string }) => {
      const r = await fetch(`/api/flows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          nodes: (nodes as Node<AnyNodeData>[]).map(rfNodeToSavePayload),
          edges: edges.map(rfEdgeToSavePayload),
        }),
      });
      const data = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) throw new Error(data.error ?? `Save failed: ${r.status}`);
      return data;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["flows"] });
      qc.invalidateQueries({ queryKey: ["flows", id] });
    },
  });
}
