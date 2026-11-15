/**
 * Fixed-capacity instance storage.
 *
 * The render loop must not allocate, so capacity is decided once at load time from the peak the
 * corpus census recorded and never grown. Exceeding it is a programming error rather than something
 * to handle at runtime: a silent reallocation would put a GC pause inside a frame.
 *
 * Each instance carries the 3×4 world transform and nothing else: the tint and the UV offset are
 * fragment-stage uniforms in every packed program, so they stay per draw.
 *
 * The transform is stored column-major. The shader reads the four slots as the matrix's four
 * *columns*, so the buffer has to carry a column for each of them; a row-major transform would put
 * the translation at indices 3/7/11, which those columns read as the second row of three columns
 * and the first of the fourth — a scrambled transform rather than a transposed one, and no
 * shader-side transpose can recover it.
 */

/** Floating-point words per instance: the twelve world-matrix floats. */
export const INSTANCE_FLOATS = 12;
/** Bytes per instance. */
export const INSTANCE_BYTES = INSTANCE_FLOATS * 4;

/**
 * Writes a row-major 3×4 affine into an instance slot, as the column-major run the shader reads.
 *
 * `composeWorldMatrix` returns row-major and the frame's instance data is row-major throughout, so
 * the conversion belongs here, at the one place the transform enters the buffer.
 */
export function writeInstanceWorld(
  floats: Float32Array,
  at: number,
  world: Float32Array | readonly number[],
): void {
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++) floats[at + 3 * col + row] = world[row * 4 + col];
}

export interface InstanceBuffer {
  /** Instance capacity, fixed at construction. */
  readonly capacity: number;
  /** Instances currently written. */
  count(): number;
  /** Resets the write cursor; the storage is reused. */
  reset(): void;
  /** Writes the world transform at the cursor, converted to the buffer's layout. */
  write(world: Float32Array): number;
  /** Raw storage, for the GPU upload. */
  floats(): Float32Array;
}

export function createInstanceBuffer(capacity: number): InstanceBuffer {
  if (!Number.isInteger(capacity) || capacity <= 0)
    throw new RangeError(`Instance capacity must be a positive integer, got ${capacity}`);
  const floats = new Float32Array(capacity * INSTANCE_FLOATS);
  let count = 0;

  return {
    capacity,
    count: () => count,
    reset() {
      count = 0;
    },
    write(world) {
      if (count >= capacity) throw new RangeError(`Instance buffer is full: capacity ${capacity}`);
      if (world.length !== 12)
        throw new RangeError(`A world transform is twelve floats, got ${world.length}`);
      writeInstanceWorld(floats, count * INSTANCE_FLOATS, world);
      return count++;
    },
    floats: () => floats,
  };
}
