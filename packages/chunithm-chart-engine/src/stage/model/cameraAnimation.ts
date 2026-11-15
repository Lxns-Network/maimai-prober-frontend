import { readCurve, sampleCurve } from "./animation";
import { readCvuPools } from "./cvu";
import type { Vec3 } from "../camera/math";

const f = Math.fround;
const RADIANS_TO_ANGLE_CODE = 10430.3779296875;

export interface StageCameraSample {
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly fovCode: number;
}

export interface StageCameraAnimation {
  readonly lastFrame: number;
  sample(frame: number, matrix: Float32Array): StageCameraSample;
}

const decoded = new WeakMap<Uint8Array, StageCameraAnimation>();

/** Samples camera track zero, transforming positions and directions by the supplied component. */
export function stageCameraAnimation(bytes: Uint8Array): StageCameraAnimation {
  const cached = decoded.get(bytes);
  if (cached) return cached;
  const pools = readCvuPools(bytes, true);
  const chunk = pools.chunks.get(7);
  if (!chunk || chunk.length < 4) throw new RangeError("Stage camera: no camera track table");
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  const version = pools.chunks.get(10)!;
  const packed =
    new DataView(version.buffer, version.byteOffset, version.byteLength).getUint32(0, true) ===
    0x132b5a6;
  const stride = packed ? 104 : 164;
  const count = view.getUint32(0, true);
  if (count === 0 || chunk.length !== 4 + count * stride)
    throw new RangeError("Stage camera: camera track table length");
  const base = 4;
  const flagOffset = packed ? 60 : 120;
  const valueOffset = packed ? 64 : 124;
  const flags = view.getUint16(base + flagOffset, true);
  const curves = Array.from({ length: 10 }, (_, i) => {
    const mask = i < 3 ? 0x200 : i < 6 ? 0x400 : i < 9 ? 0x800 : 0x1000;
    if (!(flags & mask)) return null;
    const at = base + i * (packed ? 6 : 12);
    const kind = packed ? view.getInt16(at, true) : view.getInt32(at, true);
    const start = packed ? view.getUint16(at + 2, true) : view.getUint32(at + 4, true);
    const length = packed ? view.getUint16(at + 4, true) : view.getUint32(at + 8, true);
    if (!length) throw new RangeError("Stage camera: animated curve without keys");
    return readCurve(pools, kind, start, length);
  });
  const values = Array.from({ length: 10 }, (_, i) =>
    view.getFloat32(base + valueOffset + i * 4, true),
  );
  if (!values.every(Number.isFinite)) throw new RangeError("Stage camera: nonfinite camera value");
  const animation: StageCameraAnimation = {
    lastFrame: Math.max(pools.frameCount - 1, 0),
    sample(frame, matrix) {
      const sampled = values.map((value, i) => (curves[i] ? sampleCurve(curves[i], frame) : value));
      const vector = (start: number, position: boolean): Vec3 =>
        [0, 1, 2].map((row) => {
          const value = f(
            f(f(matrix[row] * sampled[start]) + f(matrix[4 + row] * sampled[start + 1])) +
              f(matrix[8 + row] * sampled[start + 2]),
          );
          return position ? f(value + matrix[12 + row]) : value;
        }) as Vec3;
      return {
        eye: vector(0, true),
        target: vector(6, true),
        up: vector(3, false),
        fovCode: Math.trunc(f(sampled[9] * RADIANS_TO_ANGLE_CODE)),
      };
    },
  };
  decoded.set(bytes, animation);
  return animation;
}
