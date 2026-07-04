"use client";
import { useState, useRef, useCallback, useEffect } from "react";

interface Options {
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  /** Which edge of the panel is being dragged — right edge for left panels, left edge for right panels */
  direction: "right" | "left";
}

interface Result {
  width: number;
  handleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
  };
}

export function useResizable({ defaultWidth, minWidth = 100, maxWidth = 800, direction }: Options): Result {
  const [width, setWidth] = useState(defaultWidth);
  const state = useRef({ dragging: false, startX: 0, startWidth: defaultWidth });

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!state.current.dragging) return;
      const delta = e.clientX - state.current.startX;
      const next = direction === "right"
        ? state.current.startWidth + delta
        : state.current.startWidth - delta;
      setWidth(Math.min(maxWidth, Math.max(minWidth, next)));
    },
    [direction, minWidth, maxWidth],
  );

  const onMouseUp = useCallback(() => {
    state.current.dragging = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    state.current.dragging = true;
    state.current.startX = e.clientX;
    state.current.startWidth = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width]);

  return { width, handleProps: { onMouseDown } };
}
