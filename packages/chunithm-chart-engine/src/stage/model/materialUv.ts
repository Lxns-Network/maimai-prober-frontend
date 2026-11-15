import { sampleUvTrack, type UvAnimation } from "../../assets/uvAnimation";
import type { StageShape } from "../pack";

const UV_SLOTS = 14;
const FLOATS_PER_SLOT = 4;
const OTHER_SLOT = 5;
const channels = { UV0: 0, UV1: 1, Specular: 2, Normal: 3, Incandescence: 4, Others: 5 } as const;
const roles: Readonly<Record<string, number>> = {
  none: 0,
  base: 0,
  bump: 0,
  specular: 2,
  normal: 3,
  incandescence: 4,
  environment: 5,
  texture_lighting: 5,
  ex0: 6,
  ex1: 7,
  ex2: 8,
  ex3: 9,
  ex4: 10,
  ex5: 11,
  ex6: 12,
  ex7: 13,
};

/** A draw's source shape. Repeated shapes denote distinct native draw objects. */
export interface StageUvDraw {
  readonly shape: StageShape;
}

/** Ordered per-draw track indices and the parameter assigned to each track. */
export interface StageUvBinding {
  readonly parameters: readonly number[];
  readonly tracksByDraw: readonly (readonly number[])[];
}

/**
 * Binds UV tracks with nonempty material names to the supplied native draw order.
 * @throws RangeError when a material or texture identity is unavailable.
 */
export function bindStageMaterialUv(
  animation: UvAnimation,
  draws: readonly StageUvDraw[],
): StageUvBinding {
  const parameters: number[] = animation.tracks.map((track) => {
    if (!track.materialName || !track.textureName)
      throw new RangeError("Stage UV binding: empty track identity");
    if (!Object.prototype.hasOwnProperty.call(channels, track.channel))
      throw new RangeError("Stage UV binding: unsupported track channel");
    return channels[track.channel];
  });
  const names = draws.map(({ shape }) => {
    const name = shape.state._name;
    if (typeof name !== "string" || !name)
      throw new RangeError("Stage UV binding: missing material name");
    return name;
  });
  animation.tracks.forEach((track, index) => {
    if (track.channel !== "Others") return;
    const textureName = track.textureName.split("_dds").join("");
    draws.forEach(({ shape }, draw) => {
      if (names[draw] !== track.materialName) return;
      for (const binding of shape.textures) {
        const name = binding.texture._name;
        const role = binding.texture._textureType;
        if (typeof name !== "string" || !name || typeof role !== "string")
          throw new RangeError("Stage UV binding: missing texture identity");
        if (name !== textureName) continue;
        parameters[index] = Object.prototype.hasOwnProperty.call(roles, role)
          ? roles[role]
          : OTHER_SLOT;
        break;
      }
    });
  });
  return {
    parameters,
    tracksByDraw: names.map((name) =>
      animation.tracks.flatMap((track, index) => (name === track.materialName ? [index] : [])),
    ),
  };
}

/**
 * Native-like UV parameter cells for a fixed draw vector. Each write replaces one float4; the
 * caller supplies the model's actual bind/update ordering and owns this state across updates.
 */
export class StageMaterialUvState {
  readonly values: Float32Array[];
  readonly masks: Uint16Array;
  /** Node offset publication has enabled the draw's UV offset features. */
  offsetsPublished = false;
  private readonly sample = new Float32Array(4);

  constructor(draws: number) {
    if (!Number.isSafeInteger(draws) || draws < 0)
      throw new RangeError("Stage UV state: invalid draw count");
    this.values = Array.from({ length: draws }, () => new Float32Array(UV_SLOTS * FLOATS_PER_SLOT));
    this.masks = new Uint16Array(draws);
  }

  /** Publishes every node texture offset to every draw before material animation runs. */
  publishOffsets(offsets: ArrayLike<number>): void {
    if (offsets.length !== UV_SLOTS * 2)
      throw new RangeError("Stage UV state: invalid texture slot count");
    this.offsetsPublished = true;
    for (let draw = 0; draw < this.values.length; draw++) {
      const values = this.values[draw];
      for (let slot = 0; slot < UV_SLOTS; slot++) {
        const at = slot * FLOATS_PER_SLOT;
        values[at] = offsets[slot * 2];
        values[at + 1] = offsets[slot * 2 + 1];
        values[at + 2] = 1;
        values[at + 3] = 1;
      }
      this.masks[draw] = (1 << UV_SLOTS) - 1;
    }
  }

  /** Samples once per track, then applies matched tracks in resource order to each draw. */
  apply(animation: UvAnimation, binding: StageUvBinding, frame: number): void {
    if (
      binding.parameters.length !== animation.tracks.length ||
      binding.tracksByDraw.length !== this.values.length
    )
      throw new RangeError("Stage UV state: binding dimensions do not match");
    for (const slot of binding.parameters)
      if (!Number.isInteger(slot) || slot < 0 || slot >= UV_SLOTS)
        throw new RangeError("Stage UV state: invalid bound parameter");
    for (const tracks of binding.tracksByDraw)
      for (const index of tracks)
        if (!Number.isInteger(index) || index < 0 || index >= animation.tracks.length)
          throw new RangeError("Stage UV state: invalid bound track");
    const samples = new Float32Array(animation.tracks.length * FLOATS_PER_SLOT);
    animation.tracks.forEach((track, index) => {
      sampleUvTrack(track, frame, this.sample);
      samples.set(this.sample, index * FLOATS_PER_SLOT);
    });
    binding.tracksByDraw.forEach((tracks, draw) => {
      for (const index of tracks) {
        const slot = binding.parameters[index];
        const start = index * FLOATS_PER_SLOT;
        this.values[draw].set(
          samples.subarray(start, start + FLOATS_PER_SLOT),
          slot * FLOATS_PER_SLOT,
        );
        this.masks[draw] |= 1 << slot;
      }
    });
  }

  /** The explicitly written parameter, or null while the material retains its own value. */
  parameter(draw: number, slot: number): Float32Array | null {
    if (
      !Number.isInteger(draw) ||
      draw < 0 ||
      draw >= this.values.length ||
      !Number.isInteger(slot) ||
      slot < 0 ||
      slot >= UV_SLOTS
    )
      throw new RangeError("Stage UV state: invalid parameter");
    const start = slot * FLOATS_PER_SLOT;
    return this.masks[draw] & (1 << slot)
      ? this.values[draw].subarray(start, start + FLOATS_PER_SLOT)
      : null;
  }
}
