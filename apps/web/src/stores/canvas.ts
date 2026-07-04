"use client";
import { create } from "zustand";
import { applyNodeChanges, applyEdgeChanges } from "@xyflow/react";
import type { Node, Edge, NodeChange, EdgeChange, Connection } from "@xyflow/react";

const MAX_HISTORY = 50;

interface Snapshot {
  nodes: Node[];
  edges: Edge[];
}

interface CanvasStore {
  // React Flow state
  nodes: Node[];
  edges: Edge[];

  // Current flow metadata
  flowId: string | null;
  flowName: string;
  isDirty: boolean;

  // Selection
  selectedNodeId: string | null;

  // Undo/redo
  past: Snapshot[];
  future: Snapshot[];

  // React Flow change handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // Deliberate mutations (push to history)
  addNode: (node: Node) => void;
  updateNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void;
  removeNode: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;

  // Selection
  selectNode: (id: string | null) => void;

  // Flow lifecycle
  loadFlow: (flow: { id: string; name: string; nodes: Node[]; edges: Edge[] }) => void;
  setFlowName: (name: string) => void;
  setFlowId: (id: string) => void;
  markSaved: () => void;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

function snapshot(nodes: Node[], edges: Edge[]): Snapshot {
  return { nodes: [...nodes], edges: [...edges] };
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  flowId: null,
  flowName: "Untitled Flow",
  isDirty: false,
  selectedNodeId: null,
  past: [],
  future: [],

  // ── React Flow change handlers (fine-grained, no history for drags) ──────

  onNodesChange(changes) {
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes), isDirty: true }));
  },

  onEdgesChange(changes) {
    const deletions = changes.filter((c) => c.type === "remove");
    if (deletions.length > 0) {
      const { nodes, edges, past } = get();
      set({
        edges: applyEdgeChanges(changes, edges),
        past: [...past.slice(-MAX_HISTORY), snapshot(nodes, edges)],
        future: [],
        isDirty: true,
      });
    } else {
      set((s) => ({ edges: applyEdgeChanges(changes, s.edges), isDirty: true }));
    }
  },

  onConnect(connection) {
    const { nodes, edges, past } = get();
    const newEdge: Edge = {
      id: `e-${connection.source}-${connection.target}-${Date.now()}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? null,
      targetHandle: connection.targetHandle ?? null,
      type: "sequential",
    };
    set({
      edges: [...edges, newEdge],
      past: [...past.slice(-MAX_HISTORY), snapshot(nodes, edges)],
      future: [],
      isDirty: true,
    });
  },

  // ── Deliberate mutations ─────────────────────────────────────────────────

  addNode(node) {
    const { nodes, edges, past } = get();
    set({
      nodes: [...nodes, node],
      past: [...past.slice(-MAX_HISTORY), snapshot(nodes, edges)],
      future: [],
      isDirty: true,
    });
  },

  updateNodeData(nodeId, data) {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
      ),
      isDirty: true,
    }));
  },

  removeNode(nodeId) {
    const { nodes, edges, past } = get();
    set({
      nodes: nodes.filter((n) => n.id !== nodeId),
      edges: edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
      past: [...past.slice(-MAX_HISTORY), snapshot(nodes, edges)],
      future: [],
      isDirty: true,
    });
  },

  removeEdge(edgeId) {
    const { nodes, edges, past } = get();
    set({
      edges: edges.filter((e) => e.id !== edgeId),
      past: [...past.slice(-MAX_HISTORY), snapshot(nodes, edges)],
      future: [],
      isDirty: true,
    });
  },

  // ── Selection ────────────────────────────────────────────────────────────

  selectNode(id) {
    set({ selectedNodeId: id });
  },

  // ── Flow lifecycle ───────────────────────────────────────────────────────

  loadFlow({ id, name, nodes, edges }) {
    set({ flowId: id, flowName: name, nodes, edges, past: [], future: [], isDirty: false, selectedNodeId: null });
  },

  setFlowName(name) {
    set({ flowName: name, isDirty: true });
  },

  setFlowId(id) {
    set({ flowId: id });
  },

  markSaved() {
    set({ isDirty: false });
  },

  // ── History ──────────────────────────────────────────────────────────────

  undo() {
    const { past, nodes, edges, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1]!;
    set({
      nodes: prev.nodes,
      edges: prev.edges,
      past: past.slice(0, -1),
      future: [snapshot(nodes, edges), ...future.slice(0, MAX_HISTORY - 1)],
      isDirty: true,
    });
  },

  redo() {
    const { future, nodes, edges, past } = get();
    if (future.length === 0) return;
    const next = future[0]!;
    set({
      nodes: next.nodes,
      edges: next.edges,
      future: future.slice(1),
      past: [...past.slice(-MAX_HISTORY), snapshot(nodes, edges)],
      isDirty: true,
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));
