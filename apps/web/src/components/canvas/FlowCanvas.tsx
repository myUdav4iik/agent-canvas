"use client";
import { useCallback, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  MarkerType,
  useReactFlow,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useCanvasStore } from "@/stores/canvas";
import { useRunStore } from "@/stores/run";
import { AgentNode } from "./nodes/AgentNode";
import { TaskNode } from "./nodes/TaskNode";
import { LoopNode } from "./nodes/LoopNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { StartNode, EndNode, ParallelNode, JoinNode } from "./nodes/ControlNodes";
import { SequentialEdge, ConditionalEdge, LoopEdge, ParallelEdge } from "./edges";
import type { AgentNodeData, TaskNodeData, LoopNodeData, ConditionNodeData, ControlNodeData } from "@/lib/flow-convert";

// Must be defined outside the component to prevent recreation on every render
const nodeTypes = {
  agent: AgentNode,
  task: TaskNode,
  loop: LoopNode,
  condition: ConditionNode,
  start: StartNode,
  end: EndNode,
  parallel: ParallelNode,
  join: JoinNode,
};

const edgeTypes = {
  sequential: SequentialEdge,
  conditional: ConditionalEdge,
  loop: LoopEdge,
  parallel: ParallelEdge,
};

function defaultDataForType(type: string): Record<string, unknown> {
  switch (type) {
    case "agent":
      return {
        label: "Agent", name: "Agent", role: "", goal: "", backstory: "",
        llmProvider: "claude-cli", llmModel: "sonnet", temperature: 0.3, maxTokens: 2048,
        maxIterations: 8, allowDelegation: false, verbose: false, tools: [], memoryScope: [],
      } satisfies AgentNodeData;
    case "task":
      return {
        label: "Task", description: "", expectedOutput: "",
        outputFormat: "text", humanInTheLoop: false, contextTaskIds: [],
      } satisfies TaskNodeData;
    case "loop":
      return { label: "Loop", loopType: "fixed-n", loopMax: 3, loopCondition: "" } satisfies LoopNodeData;
    case "condition":
      return { label: "Condition", conditionExpr: "" } satisfies ConditionNodeData;
    default:
      return { label: type.charAt(0).toUpperCase() + type.slice(1) } satisfies ControlNodeData;
  }
}

export function FlowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, selectNode, selectedNodeId } =
    useCanvasStore();
  const nodeStates = useRunStore((s) => s.nodeStates);

  // Merge live run states into node data for visual feedback
  const nodesWithState = useMemo(
    () =>
      nodes.map((node) => {
        const runState =
          node.type === "agent"
            ? nodeStates[(node.data as AgentNodeData).agentId ?? ""] ?? nodeStates[node.id]
            : nodeStates[node.id];
        if (!runState) return node;
        return { ...node, data: { ...node.data, runState } };
      }),
    [nodes, nodeStates],
  );

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Drag-from-palette handler
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow-node-type");
      if (!type) return;

      // Account for the current pan/zoom so the node lands where it was dropped
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position: { x: position.x - 90, y: position.y - 30 },
        data: defaultDataForType(type),
      };
      addNode(newNode);
      selectNode(newNode.id);
    },
    [addNode, selectNode, screenToFlowPosition],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => selectNode(node.id),
    [selectNode],
  );

  const onPaneClick = useCallback(() => selectNode(null), [selectNode]);

  return (
    <div ref={reactFlowWrapper} className="relative h-full w-full">
      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-center">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="opacity-[0.12]">
            <path d="M20 4L36 13V27L20 36L4 27V13L20 4Z" stroke="#7d92ad" strokeWidth="1.5" />
            <path d="M20 4V36M4 13L36 27M36 13L4 27" stroke="#7d92ad" strokeWidth="0.75" />
          </svg>
          <p className="text-[13px] font-medium text-[#3d5070]">Drag a node from the palette to start</p>
        </div>
      )}
      <ReactFlow
        nodes={nodesWithState}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        defaultEdgeOptions={{
          type: "sequential",
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "#2d3d57" },
        }}
        snapToGrid
        snapGrid={[16, 16]}
        fitView
        className="bg-[#020810]"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} color="#1e2a40" gap={20} size={1} />
        <MiniMap
          nodeColor={(n) => {
            const colors: Record<string, string> = {
              agent: "#3b82f6", task: "#8b5cf6", loop: "#f59e0b",
              condition: "#10b981", parallel: "#06b6d4", join: "#06b6d4",
              start: "#475569", end: "#475569",
            };
            return colors[n.type ?? ""] ?? "#2d3d57";
          }}
          maskColor="rgba(2,8,16,0.6)"
          style={{ backgroundColor: "#0d1420", border: "1px solid #1e2a40", borderRadius: 6 }}
        />
        <Controls />
      </ReactFlow>
    </div>
  );
}
