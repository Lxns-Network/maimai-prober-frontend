export const LANE_COUNT = 16;
export const AIR_BEAM_COUNT = 6;

/** Bits 2n and 2n+1 hold lane n's front and rear contacts. AIR beams run from low to high. */
export interface SurfaceSample {
  touch: number;
  beams: number;
  /** Beams held continuously since connection, excluded from `beams`. */
  blockedBeams?: number;
}

/** A press or release of ground lanes or AIR before it is placed on the chart clock. */
export interface ControlChange {
  lanes: number;
  air: boolean;
  down: boolean;
}

export function laneRows(touch: number): [number, number] {
  let front = 0;
  let rear = 0;
  for (let lane = 0; lane < LANE_COUNT; lane++) {
    front |= ((touch >>> (2 * lane)) & 1) << lane;
    rear |= ((touch >>> (2 * lane + 1)) & 1) << lane;
  }
  return [front, rear];
}
