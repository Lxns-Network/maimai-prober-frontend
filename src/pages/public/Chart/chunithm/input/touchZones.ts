import { AIR_BEAM_COUNT, LANE_COUNT } from "@lxns-network/chunithm-chart-engine/chart/play/input";
import { NO_HOLD, type createControls } from "./controls";

export const GROUND_HEIGHT = { min: 8, default: 17, max: 45 } as const;
export const AIR_TOP = 0.04;
const AIR_TRAVEL = 25 / 255;
const LANE_WIDTH = 4;

type TouchPosition =
  | { lane: number; x: number; laneWidth: number }
  | { beam: number; height: number };

export const groundBoundary = (percent: number) => 1 - percent / 100;

/** Projects a horizontal slice of the field plane in both directions. X is a canvas fraction. */
export function groundRow(m: ArrayLike<number>, y: number) {
  const ny = 1 - 2 * y;
  const depth = m[6] - ny * m[14];
  const z0 = (ny * m[15] - m[7]) / depth;
  const dz = (ny * m[12] - m[4]) / depth;
  const sx = m[0] + m[2] * dz;
  const x0 = m[3] + m[2] * z0;
  const sw = m[12] + m[14] * dz;
  const w0 = m[15] + m[14] * z0;
  return {
    xAt(lane: number) {
      const wx = (lane - LANE_COUNT / 2) * LANE_WIDTH;
      return ((sx * wx + x0) / (sw * wx + w0) + 1) / 2;
    },
    laneAt(x: number) {
      const nx = 2 * x - 1;
      const wx = (nx * w0 - x0) / (sx - nx * sw);
      return Math.min(LANE_COUNT - 1, Math.max(0, Math.floor(wx / LANE_WIDTH + LANE_COUNT / 2)));
    },
  };
}

/** Canvas fractions are measured from the top left. The AIR height is measured from the slider up. */
export function touchPosition(
  m: ArrayLike<number>,
  x: number,
  y: number,
  groundPercent: number,
): TouchPosition | null {
  if (x < 0 || x > 1 || y < AIR_TOP || y > 1) return null;
  const boundary = groundBoundary(groundPercent);
  if (y < boundary) {
    const height = (boundary - y) / (boundary - AIR_TOP);
    return { height, beam: Math.min(AIR_BEAM_COUNT - 1, Math.floor(height * AIR_BEAM_COUNT)) };
  }
  const row = groundRow(m, y);
  const lane = row.laneAt(x);
  return { lane, x, laneWidth: row.xAt(lane + 1) - row.xAt(lane) };
}

type Finger =
  | { lane: number; x: number; originX: number; stroke: number }
  | { beam: number; height: number };

export function createTouchGestures(held: ReturnType<typeof createControls>) {
  const fingers = new Map<number, Finger | null>();
  let nextStroke = 0;
  return {
    start(id: number) {
      fingers.set(id, null);
    },
    move(id: number, point: TouchPosition | null) {
      const previous = fingers.get(id);
      if (previous === undefined) return [];
      if (!point) {
        fingers.set(id, null);
        return held.hold(id, NO_HOLD);
      }
      if ("beam" in point) {
        const last = previous && "beam" in previous ? previous : null;
        const moved =
          !!last && last.beam !== point.beam && Math.abs(point.height - last.height) >= AIR_TRAVEL;
        if (!last || moved) fingers.set(id, point);
        return held.hold(id, { lanes: 0, air: true }, undefined, moved);
      }
      const { x, lane, laneWidth } = point;
      if (!previous || !("lane" in previous)) {
        const stroke = ++nextStroke;
        fingers.set(id, { lane, x, originX: x, stroke });
        return held.hold(
          id,
          { lanes: 1 << lane, air: false },
          stroke,
          !!previous && previous.height >= AIR_TRAVEL,
        );
      }
      if ((x - previous.x) * (previous.x - previous.originX) < 0) previous.originX = previous.x;
      const changes = held.hold(id, { lanes: 1 << lane, air: false }, previous.stroke);
      if (Math.abs(x - previous.originX) >= laneWidth / 2) {
        const lo = Math.min(lane, previous.lane);
        const hi = Math.max(lane, previous.lane);
        changes.push({ flick: (2 << hi) - (1 << lo), stroke: previous.stroke });
        previous.originX = x;
      }
      previous.lane = lane;
      previous.x = x;
      return changes;
    },
    end(id: number) {
      fingers.delete(id);
      return held.hold(id, NO_HOLD);
    },
    clear() {
      fingers.clear();
    },
  };
}
