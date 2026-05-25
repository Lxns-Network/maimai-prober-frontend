import { useState } from "react";
import classes from "./DebugOverlay.module.css";

const FPS_SAMPLE_INTERVAL_MS = 250;
const FPS_GRAPH_WIDTH = 240;
const FPS_GRAPH_HEIGHT = 48;

export interface CanvasDebugInfo {
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
  canvasDpr: number;
  deviceDpr: number;
  clockSource: "audio" | "raf";
  fps: number;
  fpsHistory: number[];
}

interface FpsGraphPoint {
  x: number;
  y: number;
}

function getFpsGraphMax(fpsHistory: number[]): number {
  return Math.max(60, ...fpsHistory);
}

function getAverageFps(fpsHistory: number[]): number | null {
  if (fpsHistory.length === 0) return null;
  return fpsHistory.reduce((sum, fps) => sum + fps, 0) / fpsHistory.length;
}

function getFpsGraphY(fps: number, maxFps: number): number {
  return FPS_GRAPH_HEIGHT - (Math.min(fps, maxFps) / maxFps) * FPS_GRAPH_HEIGHT;
}

function getFpsGraphPoint(
  fpsHistory: number[],
  index: number,
  maxFps: number = getFpsGraphMax(fpsHistory),
): FpsGraphPoint | null {
  if (fpsHistory.length === 0) return null;
  const lastIndex = Math.max(1, fpsHistory.length - 1);
  const fps = fpsHistory[index];
  if (fps === undefined) return null;
  return {
    x: (index / lastIndex) * FPS_GRAPH_WIDTH,
    y: getFpsGraphY(fps, maxFps),
  };
}

function getFpsGraphPoints(fpsHistory: number[]): string {
  if (fpsHistory.length === 0) return "";
  const maxFps = getFpsGraphMax(fpsHistory);
  return fpsHistory
    .map((_fps, index) => {
      const point = getFpsGraphPoint(fpsHistory, index, maxFps);
      return point ? `${point.x.toFixed(1)},${point.y.toFixed(1)}` : "";
    })
    .filter(Boolean)
    .join(" ");
}

export function DebugOverlay({ debugInfo }: { debugInfo: CanvasDebugInfo | null }) {
  const [expanded, setExpanded] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!debugInfo) return null;

  const fpsHistory = debugInfo.fpsHistory;
  const averageFps = getAverageFps(fpsHistory);
  const fpsGraphMax = getFpsGraphMax(fpsHistory);
  const averageFpsY = averageFps !== null ? getFpsGraphY(averageFps, fpsGraphMax) : null;

  const hoveredFps =
    hoverIndex !== null && fpsHistory[hoverIndex] !== undefined
      ? fpsHistory[hoverIndex]
      : null;
  const hoveredFpsPoint =
    hoverIndex !== null && hoveredFps !== null
      ? getFpsGraphPoint(fpsHistory, hoverIndex, fpsGraphMax)
      : null;
  const hoveredFpsAge =
    hoverIndex !== null
      ? ((fpsHistory.length - 1 - hoverIndex) * FPS_SAMPLE_INTERVAL_MS) / 1000
      : null;

  const fpsGraphLabel =
    hoveredFps !== null
      ? `${hoveredFps} fps / ${hoveredFpsAge?.toFixed(1)}s ago`
      : averageFps !== null
        ? `avg ${averageFps.toFixed(1)} / now ${debugInfo.fps || "-"}`
        : debugInfo.fps
          ? `${debugInfo.fps} fps`
          : "-";

  return (
    <div className={classes.debugInfo}>
      <button
        type="button"
        className={classes.debugSummary}
        onClick={() => setExpanded((e) => !e)}
      >
        <span>
          {((debugInfo.backingWidth * debugInfo.backingHeight) / 1_000_000).toFixed(2)}MP
        </span>
        <span>DPR {debugInfo.canvasDpr.toFixed(2)}</span>
        <span>{debugInfo.clockSource}</span>
      </button>
      {expanded && (
        <div className={classes.debugPanel}>
          <div className={classes.debugTitle}>DEV Render Debug</div>
          <div className={classes.debugGrid}>
            <span>Canvas</span>
            <span>
              {debugInfo.backingWidth} x {debugInfo.backingHeight} (
              {((debugInfo.backingWidth * debugInfo.backingHeight) / 1_000_000).toFixed(2)}MP)
            </span>
            <span>CSS</span>
            <span>
              {debugInfo.cssWidth} x {debugInfo.cssHeight}
            </span>
            <span>DPR</span>
            <span>
              canvas {debugInfo.canvasDpr.toFixed(2)} / device {debugInfo.deviceDpr.toFixed(2)}
            </span>
            <span>Clock</span>
            <span>{debugInfo.clockSource}</span>
          </div>
          <div className={classes.debugGraphHeader}>
            <span>FPS History</span>
            <span>{fpsGraphLabel}</span>
          </div>
          <svg
            className={classes.debugGraph}
            viewBox={`0 0 ${FPS_GRAPH_WIDTH} ${FPS_GRAPH_HEIGHT}`}
            aria-hidden="true"
            onPointerMove={(event) => {
              if (fpsHistory.length === 0) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
              const ratio = rect.width > 0 ? x / rect.width : 0;
              setHoverIndex(Math.round(ratio * (fpsHistory.length - 1)));
            }}
            onPointerLeave={() => setHoverIndex(null)}
          >
            <line
              x1="0"
              y1={FPS_GRAPH_HEIGHT / 2}
              x2={FPS_GRAPH_WIDTH}
              y2={FPS_GRAPH_HEIGHT / 2}
            />
            {averageFpsY !== null && (
              <line
                className={classes.debugGraphAverage}
                x1="0"
                y1={averageFpsY}
                x2={FPS_GRAPH_WIDTH}
                y2={averageFpsY}
              />
            )}
            <polyline points={getFpsGraphPoints(fpsHistory)} />
            {hoveredFpsPoint && (
              <>
                <line
                  className={classes.debugGraphCursor}
                  x1={hoveredFpsPoint.x}
                  y1="0"
                  x2={hoveredFpsPoint.x}
                  y2={FPS_GRAPH_HEIGHT}
                />
                <circle
                  className={classes.debugGraphPoint}
                  cx={hoveredFpsPoint.x}
                  cy={hoveredFpsPoint.y}
                  r="3"
                />
              </>
            )}
          </svg>
        </div>
      )}
    </div>
  );
}
