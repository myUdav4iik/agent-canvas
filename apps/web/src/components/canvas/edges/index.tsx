"use client";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";

const LABEL_BASE = [
  "absolute rounded px-1.5 py-px",
  "text-[9px] font-semibold uppercase tracking-wide leading-none",
  "border",
].join(" ");

// ─── Sequential ───────────────────────────────────────────────────────────────

export function SequentialEdge(props: EdgeProps) {
  const [path] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    borderRadius: 8,
  });
  return (
    <BaseEdge
      path={path}
      {...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
      style={{ stroke: "#2d3d57", strokeWidth: 1.5 }}
    />
  );
}

// ─── Conditional ─────────────────────────────────────────────────────────────

export function ConditionalEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });

  const isTrue = String(props.label).toLowerCase() === "true" || props.sourceHandleId === "true";
  const color = isTrue ? "#10b981" : "#ef4444";
  const labelColor = isTrue
    ? "text-emerald-300 bg-emerald-950/60 border-emerald-800/50"
    : "text-red-300 bg-red-950/60 border-red-800/50";

  return (
    <>
      <BaseEdge
        path={path}
        {...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
        style={{ stroke: color, strokeWidth: 1.5, strokeDasharray: "5 3", opacity: 0.8 }}
      />
      {props.label && (
        <EdgeLabelRenderer>
          <div
            className={[LABEL_BASE, labelColor].join(" ")}
            style={{
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            {props.label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// ─── Loop ─────────────────────────────────────────────────────────────────────

export function LoopEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    curvature: 0.5,
  });

  return (
    <>
      <BaseEdge
        path={path}
        {...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
        style={{ stroke: "#f59e0b", strokeWidth: 1.5, strokeDasharray: "8 4", opacity: 0.75 }}
      />
      {props.label && (
        <EdgeLabelRenderer>
          <div
            className={[LABEL_BASE, "text-amber-300 bg-amber-950/60 border-amber-800/50 rounded-full"].join(" ")}
            style={{
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            {props.label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// ─── Parallel ─────────────────────────────────────────────────────────────────

export function ParallelEdge(props: EdgeProps) {
  const [path] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });
  return (
    <BaseEdge
      path={path}
      {...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
      style={{ stroke: "#06b6d4", strokeWidth: 1.5, opacity: 0.75 }}
    />
  );
}
