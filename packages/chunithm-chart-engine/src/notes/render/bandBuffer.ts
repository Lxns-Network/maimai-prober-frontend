/**
 * Fixed-capacity vertex storage for the HOLD and SLIDE bands.
 *
 * Bands are written per record per frame into a shared vertex buffer, then drawn per profile. Like
 * the instance buffer the capacity is decided once, because a band that overflowed mid-frame would
 * otherwise need a reallocation inside the frame.
 */

import { HOLD_VERTEX_BYTES } from "../holdBand";

export interface BandBuffer {
  /** Vertex capacity, fixed at construction. */
  readonly capacity: number;
  /** Vertices currently written. */
  count(): number;
  /** Resets the write cursor; the storage is reused. */
  reset(): void;
  /** Byte view the band writers fill. */
  bytes(): DataView;
  /** Advances the cursor by `vertices`, returning the offset they were written at. */
  commit(vertices: number): number;
  /** Offset the next vertex will be written at. */
  offset(): number;
}

export function createBandBuffer(capacity: number): BandBuffer {
  if (!Number.isInteger(capacity) || capacity <= 0)
    throw new RangeError(`Band vertex capacity must be a positive integer, got ${capacity}`);
  const view = new DataView(new ArrayBuffer(capacity * HOLD_VERTEX_BYTES));
  let count = 0;

  return {
    capacity,
    count: () => count,
    reset() {
      count = 0;
    },
    bytes: () => view,
    offset: () => count,
    commit(vertices) {
      if (!Number.isInteger(vertices) || vertices < 0)
        throw new RangeError(`A vertex count must be a non-negative integer, got ${vertices}`);
      const at = count;
      if (count + vertices > capacity)
        throw new RangeError(
          `Band buffer would hold ${count + vertices} vertices, capacity ${capacity}`,
        );
      count += vertices;
      return at;
    },
  };
}
