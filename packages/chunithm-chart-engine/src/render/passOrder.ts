/**
 * Render passes of the chart frame, in the order the frame runs them, and the ordering of the draws
 * submitted to each pass.
 *
 * Inside a pass the draws are ordered by the pass's mode: depth ascending or descending, or key
 * ascending or descending with depth as the tie-break. Draws that compare equal keep their arrival
 * order, so a pass with identical sort keys replays the order its producers submitted.
 */

export type PassSortMode =
  /** Depth descending. */
  | 2
  /** Depth ascending. */
  | 3
  /** Key descending. */
  | 4
  /** Key ascending. */
  | 5
  /** Key ascending, then depth descending. */
  | 6
  /** Key ascending, then depth ascending. */
  | 7;

export interface RenderPass {
  readonly passIndex: number;
  readonly sortMode: PassSortMode;
}

export const RENDER_PASSES: readonly RenderPass[] = Object.freeze([
  { passIndex: 4, sortMode: 5 },
  { passIndex: 8, sortMode: 3 },
  { passIndex: 12, sortMode: 3 },
  { passIndex: 16, sortMode: 6 },
  { passIndex: 24, sortMode: 5 },
]);

/** The first pass that may read the depth snapshot. */
export const DEPTH_SNAPSHOT_FIRST_PASS = 16;

export function renderPass(passIndex: number): RenderPass | undefined {
  return RENDER_PASSES.find((pass) => pass.passIndex === passIndex);
}

export interface OrderedDraw {
  readonly key: number;
  readonly depth: number;
}

/** Returns a new array in draw order; `entries` is not changed. */
export function orderPass<T extends OrderedDraw>(entries: readonly T[], mode: PassSortMode): T[] {
  return [...entries].sort((x, y) => {
    let order: number;
    if (mode === 2) order = y.depth - x.depth;
    else if (mode === 3) order = x.depth - y.depth;
    else {
      order = mode === 4 ? y.key - x.key : x.key - y.key;
      if (order === 0 && mode >= 6) order = mode === 6 ? y.depth - x.depth : x.depth - y.depth;
    }
    return order;
  });
}
