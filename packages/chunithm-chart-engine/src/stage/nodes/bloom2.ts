import {
  applyMotions,
  computeWorld,
  NODE_VISIBLE,
  type NodeBehavior,
  type StageNode,
} from "../runtime";
import { createKeyTrack, evaluateKeyTrack, type KeyTrack, type TrackKey } from "./keyTrack";
import type { StageBloomStar } from "./bloom";

export const BLOOM2_TYPE = 6001213;
const KEY_WORDS = 30;

/** The tone-mapping bloom filter's parameters. */
export interface StageBloom2 {
  readonly pass: number;
  /** 0 none, 1 exposure only, 2 Reinhard, 3 filmic, 4 shoulder/toe filmic. */
  readonly toneMode: number;
  readonly blueShift: boolean;
  readonly starCount: number;
  readonly stars?: readonly StageBloomStar[];
  readonly starRotation: number;
  readonly starLength: number;
  readonly starRetinaRatio: number;
  readonly starRange: number;
  readonly starIntensity: number;
  readonly starOffset: number;
  readonly starShift: Float32Array;
  readonly bloomRetinaRatio: number;
  readonly bloomRange: number;
  readonly bloomLevelRange: number;
  readonly bloomIntensity: number;
  readonly bloomOffset: number;
  readonly bloomShift: Float32Array;
  readonly toneRetinaRatio: number;
  readonly toneRetinaSpeed: number;
  readonly toneMiddleGray: number;
  readonly shoulderStrength: number;
  readonly linearStrength: number;
  readonly linearAngle: number;
  readonly toeStrength: number;
  readonly toeNumerator: number;
  readonly toeDenominator: number;
  readonly whitePoint: number;
}

type Bloom2State =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly bloom: StageBloom2;
      readonly tracks: readonly KeyTrack[];
      sampledAge: number;
    }
  | { readonly unsupported: string };

const SCALAR_WORDS = [
  1, 2, 3, 4, 9, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 10, 11, 12, 13, 14, 15,
];
type Bloom2Constants = Pick<StageBloom2, "pass" | "toneMode" | "blueShift" | "starCount" | "stars">;

/** Decodes the bloom and tone-curve tracks; `bloom` is their initial value. */
export function readBloom2(node: StageNode): Bloom2State {
  const g = node.scene.graph;
  const at = node.record!.settings;
  if (at === null) return { unsupported: "bloom filter without settings" };
  if (g.u32(at + 4) === 0) return { enabled: false };
  const toneMode = g.i32(at + 20);
  if (toneMode < 0 || toneMode > 4) return { unsupported: `bloom filter tone mode ${toneMode}` };
  const starCount = g.i32(at + 16);
  let stars: StageBloomStar[] | undefined;
  if (starCount < 0) {
    const count = g.i32(at + 36);
    const table = count > 0 ? g.pointer(at + 40) : null;
    if (count < 0 || (count > 0 && table === null))
      return { unsupported: "bloom filter without a valid star table" };
    stars = Array.from({ length: count }, (_, i) => ({
      rotation: g.f32(table! + i * 12),
      length: g.f32(table! + i * 12 + 4),
      twoPass: g.u32(table! + i * 12 + 8) !== 0,
    }));
  }
  const count = g.i32(at + 28);
  const keys = count > 0 ? g.pointer(at + 32) : null;
  if (keys === null) return { unsupported: "bloom filter without key table" };
  const trackKeys: TrackKey[][] = Array.from({ length: 23 }, () => []);
  for (let k = 0; k < count; k++) {
    const key = keys + k * KEY_WORDS * 4;
    const duration = g.f32(key);
    const value = (word: number) => g.f32(key + word * 4);
    for (let i = 0; i < SCALAR_WORDS.length; i++)
      trackKeys[i].push({ duration, values: Float32Array.of(value(SCALAR_WORDS[i]), 0, 0, 0) });
    trackKeys[21].push({ duration, values: Float32Array.of(value(5), value(6), value(7), 0) });
    trackKeys[22].push({ duration, values: Float32Array.of(value(16), value(17), value(18), 0) });
  }
  const tracks = trackKeys.map((track) => createKeyTrack(track, g.u32(at + 12) !== 0));
  const initial: Bloom2Constants = {
    pass: g.u32(at + 8),
    toneMode,
    blueShift: g.u32(at + 24) !== 0,
    starCount,
    stars,
  };
  return {
    enabled: true,
    bloom: evaluateBloom2({ bloom: initial, tracks }, 0),
    tracks,
    sampledAge: 0,
  };
}

/** Evaluates bloom extraction and tone mapping at the node's age in stage frames. */
export function evaluateBloom2(
  state: { readonly bloom: Bloom2Constants; readonly tracks: readonly KeyTrack[] },
  age: number,
): StageBloom2 {
  const scratch = new Float32Array(4);
  const value = (i: number) => evaluateKeyTrack(state.tracks[i], age, scratch)[0];
  return {
    pass: state.bloom.pass,
    toneMode: state.bloom.toneMode,
    blueShift: state.bloom.blueShift,
    starCount: state.bloom.starCount,
    stars: state.bloom.stars,
    starRotation: value(15),
    starLength: value(16),
    starRetinaRatio: value(17),
    starRange: value(18),
    starIntensity: value(19),
    starOffset: value(20),
    starShift: evaluateKeyTrack(state.tracks[22], age, new Float32Array(4)).slice(0, 3),
    bloomRetinaRatio: value(0),
    bloomRange: value(1),
    bloomLevelRange: value(2),
    bloomIntensity: value(3),
    bloomOffset: value(4),
    bloomShift: evaluateKeyTrack(state.tracks[21], age, new Float32Array(4)).slice(0, 3),
    toneRetinaRatio: value(5),
    toneRetinaSpeed: value(6),
    toneMiddleGray: value(7),
    shoulderStrength: value(8),
    linearStrength: value(9),
    linearAngle: value(10),
    toeStrength: value(11),
    toeNumerator: value(12),
    toeDenominator: value(13),
    whitePoint: value(14),
  };
}

/** The tone-mapping bloom filter node: a world matrix and motion lists, and its parameters from its key table. */
export const bloom2Node: NodeBehavior = {
  type: BLOOM2_TYPE,
  construct(node) {
    node.flags |= NODE_VISIBLE;
    const state = readBloom2(node);
    if ("unsupported" in state) node.scene.missing.add(`node ${BLOOM2_TYPE}: ${state.unsupported}`);
    node.extension = state;
  },
  update(node) {
    computeWorld(node);
    applyMotions(node);
    const state = node.extension as Bloom2State;
    if (!("unsupported" in state) && state.enabled) state.sampledAge = node.controller?.age ?? 0;
  },
};

/** The parameters of a live tone-mapping bloom node, or null when it is switched off or listed in the scene's missing set. */
export function nodeBloom2(node: StageNode): StageBloom2 | null {
  const state = node.extension as Bloom2State;
  return "unsupported" in state || !state.enabled
    ? null
    : state.tracks[0].total === 0
      ? state.bloom
      : evaluateBloom2(state, state.sampledAge);
}
