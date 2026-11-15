import type { StageModel } from "../pack";
import {
  blendStageProviderPose,
  createStageModelProvider,
  updateStageModelProvider,
} from "./animation";
import { composeAffine, invertAffine, providerLocal, restPose, stageShapeSkin } from "./skin";

const f = Math.fround;
const epsilon = 1.1920928955078125e-7;
const bits = new DataView(new ArrayBuffer(4));

function encodeHalf(value: number): number {
  bits.setFloat32(0, value, true);
  const word = bits.getUint32(0, true);
  const sign = (word >>> 16) & 0x8000;
  const magnitude = word & 0x7fffffff;
  if (magnitude > 0x47ffefff) return sign | 0x7fff;
  if (magnitude >= 0x38800000)
    return sign | ((magnitude + ((magnitude >>> 13) & 1) - 0x37fff001) >>> 13);
  const shift = 113 - (magnitude >>> 23);
  const significand = shift > 31 ? 0 : ((magnitude & 0x7fffff) | 0x800000) >>> shift;
  return sign | ((significand + 0xfff + ((significand >>> 13) & 1)) >>> 13);
}

function decodeHalf(value: number): number {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >>> 10) & 0x1f;
  const fraction = value & 0x3ff;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 0x1f) return fraction ? NaN : sign * Infinity;
  return sign * (1024 + fraction) * 2 ** (exponent - 25);
}

/** Decodes the CPU joint's position, uniform scale and quaternion into affine rows. */
export function decodeInstanceMotion(
  records: Uint16Array,
  offset: number,
  out: Float32Array,
): void {
  const scale = decodeHalf(records[offset + 3]);
  const x = decodeHalf(records[offset + 4]);
  const y = decodeHalf(records[offset + 5]);
  const z = decodeHalf(records[offset + 6]);
  const w = decodeHalf(records[offset + 7]);
  const xx = f(f(x * 2) * x);
  const yy = f(f(y * 2) * y);
  const zz = f(f(z * 2) * z);
  const xy = f(f(x * 2) * y);
  const xz = f(f(x * 2) * z);
  const yz = f(f(y * 2) * z);
  const wx = f(f(w * 2) * x);
  const wy = f(f(w * 2) * y);
  const wz = f(f(w * 2) * z);
  out[0] = f(f(f(1 - yy) - zz) * scale);
  out[1] = f(f(xy - wz) * scale);
  out[2] = f(f(xz + wy) * scale);
  out[3] = decodeHalf(records[offset]);
  out[4] = f(f(wz + xy) * scale);
  out[5] = f(f(f(1 - xx) - zz) * scale);
  out[6] = f(f(yz - wx) * scale);
  out[7] = decodeHalf(records[offset + 1]);
  out[8] = f(f(xz - wy) * scale);
  out[9] = f(f(wx + yz) * scale);
  out[10] = f(f(f(1 - xx) - yy) * scale);
  out[11] = decodeHalf(records[offset + 2]);
}

/** Reads the discrete CPU joint frame from a retained instance motion clip. */
export function sampleInstanceMotion(
  motion: InstanceMotionSamples,
  bone: number,
  frame: number,
  out: Float32Array,
): void {
  const selected = Math.max(0, Math.min(Math.trunc(frame), motion.frames - 1));
  decodeInstanceMotion(motion.records, (selected * motion.bones + bone) * 8, out);
}

function instanceQuaternion(matrix: ArrayLike<number>): number[] {
  const [m00, m01, m02, , m10, m11, m12, , m20, m21, m22] = Array.from(matrix);
  const trace = f(f(m00 + m11) + m22);
  let x = 0;
  let y = 0;
  let z = 0;
  let w = 0;
  if (trace >= 0) {
    const root = f(Math.sqrt(f(trace + 1)));
    const factor = f(-0.5 / root);
    w = f(root * 0.5);
    x = f(f(m12 - m21) * factor);
    y = f(f(m20 - m02) * factor);
    z = f(f(m01 - m10) * factor);
  } else if (m00 >= m11 && m00 >= m22) {
    const root = f(Math.sqrt(f(f(f(m00 - m11) - m22) + 1)));
    const factor = f(0.5 / root);
    x = f(root * 0.5);
    y = f(f(m10 + m01) * factor);
    z = f(f(m20 + m02) * factor);
    w = -f(f(m12 - m21) * factor);
  } else if (m11 >= m22) {
    const root = f(Math.sqrt(f(f(f(m11 - m00) - m22) + 1)));
    const factor = f(0.5 / root);
    x = f(f(m10 + m01) * factor);
    y = f(root * 0.5);
    z = f(f(m21 + m12) * factor);
    w = -f(f(m20 - m02) * factor);
  } else {
    const root = f(Math.sqrt(f(f(m22 - f(m00 + m11)) + 1)));
    const factor = f(0.5 / root);
    x = f(f(m20 + m02) * factor);
    y = f(f(m21 + m12) * factor);
    z = f(root * 0.5);
    w = -f(f(m01 - m10) * factor);
  }
  return [x, y, z, w];
}

/** CPU joint transitions interpolate decoded rotations and translations, without retaining scale. */
export function blendInstanceMotion(
  current: Float32Array,
  previous: Float32Array,
  weight: number,
  out: Float32Array,
): void {
  const pose = (matrix: Float32Array) => ({
    position: [matrix[3], matrix[7], matrix[11]],
    quaternion: instanceQuaternion(matrix),
    scale: [1, 1, 1],
    active: true,
  });
  const blended = blendStageProviderPose(pose(previous), pose(current), weight);
  out.set(providerLocal(blended.position, blended.quaternion, blended.scale));
}

/** Writes one position/scale and quaternion pair as the native motion texture's half-float record. */
export function encodeInstanceMotion(
  matrix: ArrayLike<number>,
  out: Uint16Array,
  offset: number,
): void {
  out[offset] = encodeHalf(matrix[3]);
  out[offset + 1] = encodeHalf(matrix[7]);
  out[offset + 2] = encodeHalf(matrix[11]);
  let [x, y, z, w] = instanceQuaternion(matrix);
  const length = f(Math.sqrt(f(f(f(f(x * x) + f(y * y)) + f(z * z)) + f(w * w))));
  if (Math.abs(length) > epsilon) {
    const inverse = f(1 / length);
    x = f(inverse * x);
    y = f(inverse * y);
    z = f(inverse * z);
    w = f(inverse * w);
  }
  out[offset + 4] = encodeHalf(x);
  out[offset + 5] = encodeHalf(y);
  out[offset + 6] = encodeHalf(z);
  out[offset + 7] = encodeHalf(w);
  const [m00, m01, m02, , m10, m11, m12, , m20, m21, m22] = Array.from(matrix);
  const sx = f(f(m00 + m01) + m02);
  const sy = f(f(m10 + m11) + m12);
  const sz = f(f(m20 + m21) + m22);
  const magnitude = f(Math.sqrt(f(f(f(sx * sx) + f(sy * sy)) + f(sz * sz))));
  out[offset + 3] = encodeHalf(f(magnitude / f(Math.sqrt(3))));
}

/** Interleaved bone records sampled at integer animation frames, including the terminal frame. */
export interface InstanceMotionSamples {
  readonly frames: number;
  readonly bones: number;
  readonly records: Uint16Array;
}

/** Owner bones in first-seen draw order, with a per-draw index map into that union. */
export interface InstanceBoneLayout {
  readonly bones: readonly number[];
  readonly binds: readonly Float32Array[];
  readonly mappings: ReadonlyMap<StageModel["shapes"][number], readonly number[]>;
}

const ownerLayouts = new WeakMap<StageModel, InstanceBoneLayout>();
const identity = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0);

/** Reproduces the instance owner's ordered bone-name union and draw mappings. */
export function instanceBoneLayout(model: StageModel): InstanceBoneLayout {
  const cached = ownerLayouts.get(model);
  if (cached) return cached;
  const names = new Map<string, number>();
  const bones: number[] = [];
  const mappings = new Map<StageModel["shapes"][number], readonly number[]>();
  for (const shape of model.shapes) {
    const skin = stageShapeSkin(model, shape);
    if (!skin) continue;
    const mapping = skin.bones.map((bone) => {
      const name = model.nodes[bone].fields._name as string;
      let index = names.get(name);
      if (index === undefined) {
        index = bones.length;
        names.set(name, index);
        bones.push(bone);
      }
      return index;
    });
    mappings.set(shape, mapping);
  }
  const initial = restPose(model);
  const binds = bones.map((bone) => (bone < 0 ? identity : invertAffine(initial[bone])));
  const layout = { bones, binds, mappings };
  ownerLayouts.set(model, layout);
  return layout;
}

/** Builds texture records using the owner's initial provider inverses and source animation. */
export function buildInstanceMotionSamples(
  model: StageModel,
  animation: Uint8Array,
  layout: InstanceBoneLayout,
  frames: number,
  provider = createStageModelProvider(model),
): InstanceMotionSamples {
  const records = new Uint16Array(frames * layout.bones.length * 8);
  const matrix = new Float32Array(12);
  for (let frame = 0; frame < frames; frame++) {
    updateStageModelProvider(model, animation, frame, provider);
    const worlds = provider.pose.worlds;
    writeInstanceMotionFrame(
      layout.bones,
      layout.binds,
      worlds,
      records,
      frame * layout.bones.length * 8,
      matrix,
    );
  }
  return { frames, bones: layout.bones.length, records };
}

/** Encodes one instance frame from provider-world matrices and owner rest-pose inverses. */
export function writeInstanceMotionFrame(
  bones: readonly number[],
  ownerBinds: readonly Float32Array[],
  worlds: readonly Float32Array[],
  records: Uint16Array,
  offset: number,
  matrix = new Float32Array(12),
): void {
  for (let bone = 0; bone < bones.length; bone++) {
    composeAffine(bones[bone] < 0 ? identity : worlds[bones[bone]], ownerBinds[bone], matrix);
    encodeInstanceMotion(matrix, records, offset + bone * 8);
  }
}

/** Places clips in the native motion texture's two-row-per-bone layout. */
export function packInstanceMotion(clips: readonly InstanceMotionSamples[]): {
  readonly width: number;
  readonly height: number;
  readonly offsets: readonly number[];
  readonly pixels: Uint16Array;
} {
  if (!clips.length) throw new RangeError("Stage instance motion: no clips");
  const bones = clips[0].bones;
  const frames = clips.reduce((sum, clip) => sum + clip.frames, 0);
  const width = frames ? 2 ** Math.min(10, Math.floor(Math.log2(frames)) + 1) : 1;
  const height = 2 * bones * (Math.floor(frames / width) + 1);
  const pixels = new Uint16Array(width * height * 4);
  const offsets: number[] = [];
  let start = 0;
  for (const clip of clips) {
    if (clip.bones !== bones)
      throw new RangeError("Stage instance motion: inconsistent bone count");
    offsets.push(start);
    for (let frame = 0; frame < clip.frames; frame++) {
      const absolute = start + frame;
      const x = absolute % width;
      for (let bone = 0; bone < bones; bone++) {
        const y = 2 * (bone + Math.floor(absolute / width) * bones);
        const source = (frame * bones + bone) * 8;
        const target = (y * width + x) * 4;
        pixels.set(clip.records.subarray(source, source + 4), target);
        pixels.set(clip.records.subarray(source + 4, source + 8), target + width * 4);
      }
    }
    start += clip.frames;
  }
  return { width, height, offsets, pixels };
}
