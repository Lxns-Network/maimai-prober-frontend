import { LANE_COUNT } from "@lxns-network/chunithm-chart-engine/chart/play/input";
import type { Hold } from "./controls";

/** World width of one ground lane; the field is centred on the world origin. */
const LANE_WIDTH = 4;
/** Fraction of the canvas, from its top, in which a touch holds the AIR sensor instead of a lane. */
const AIR_ZONE = 2 / 3;

/**
 * What a touch holds at (`x`, `y`), each a fraction of the canvas from its top left: the AIR sensor
 * above the lower third, and below it the lane under the touch on the field plane `viewProjection`
 * (row-major, for column vectors) draws. Touches beside the field hold its outer lanes.
 */
export function touchHold(viewProjection: ArrayLike<number>, x: number, y: number): Hold {
  if (y < AIR_ZONE) return { lanes: 0, air: true };
  const m = viewProjection;
  const nx = x * 2 - 1;
  const ny = 1 - y * 2;
  // The field point (wx, 0, wz) projecting to (nx, ny) solves two linear equations in wx and wz.
  const a = m[0] - nx * m[12];
  const b = m[2] - nx * m[14];
  const c = nx * m[15] - m[3];
  const d = m[4] - ny * m[12];
  const e = m[6] - ny * m[14];
  const g = ny * m[15] - m[7];
  const wx = (c * e - b * g) / (a * e - b * d);
  const lane = Math.floor(wx / LANE_WIDTH + LANE_COUNT / 2);
  return { lanes: 1 << Math.min(LANE_COUNT - 1, Math.max(0, lane)), air: false };
}
