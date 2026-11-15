import {
  applyMotions,
  computeWorld,
  NODE_VISIBLE,
  sceneState,
  type NodeBehavior,
  type StageNode,
  type StageScene,
} from "../runtime";
import { createKeyTrack, evaluateKeyTrack, type KeyTrack, type TrackKey } from "./keyTrack";

export const BLOOM_TYPE = 6001203;
const BLOOM_PASS = 20;
const KEY_WORDS = 17;

const bits = new Float32Array(1);
const u32 = new Uint32Array(bits.buffer);
function floatOf(word: number): number {
  u32[0] = word;
  return bits[0];
}

/** The bloom filter's parameters: glow range, intensity and falloff, and the star streaks' count, rotation, reach and falloff. */
export interface StageBloom {
  readonly glow: boolean;
  readonly range: number;
  readonly intensity: number;
  readonly attenuation: number;
  readonly shift: Float32Array;
  readonly starCount: number;
  readonly starRotation: number;
  readonly starRange: number;
  readonly starIntensity: number;
  readonly starLength: number;
  readonly starAttenuation: number;
  readonly starShift: Float32Array;
  /** Authored streaks used when `starCount` is negative. */
  readonly stars?: readonly StageBloomStar[];
}

export interface StageBloomStar {
  readonly rotation: number;
  readonly length: number;
  readonly twoPass: boolean;
}

type BloomState =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly bloom: StageBloom;
      readonly tracks: readonly KeyTrack[];
      sampledAge: number;
    }
  | { readonly unsupported: string };

interface BloomEntry {
  owners: number;
  state: BloomState;
}

type OwnedBloomState = BloomState & { entry?: BloomEntry };
const BLOOMS = "filters.bloom";

function blooms(scene: StageScene): Map<string, BloomEntry> {
  return sceneState(scene, BLOOMS, () => new Map());
}

function bloomKey(node: StageNode): string {
  const graph = node.scene.graph;
  return JSON.stringify([
    node.scene.options.targetScene ?? "",
    graph.text(graph.target(node.record!.settings!)),
  ]);
}

/** Shares named Bloom objects within each target scene before synchronized playback starts. */
export function bindStageBlooms(scenes: readonly StageScene[]): void {
  for (const scene of scenes)
    if (scene.classState.has(BLOOMS))
      throw new Error("Stage bloom: scenes were already initialized");
  if (!scenes.length) return;
  const shared = blooms(scenes[0]);
  for (let i = 1; i < scenes.length; i++) scenes[i].classState.set(BLOOMS, shared);
}

/** Identity of the named filter, independent of how many live nodes publish its parameters. */
export function stageBloomIdentity(node: StageNode): object {
  return (node.extension as OwnedBloomState).entry ?? node;
}

const DEFAULTS = {
  range: 1,
  intensity: 1,
  attenuation: 1,
  starRotation: 45,
  starRange: 1,
  starIntensity: 1,
  starLength: floatOf(1068828616),
  starAttenuation: 1,
};

const SCALAR_WORDS = [1, 2, 7, 8, 9, 10, 11, 12];

/** Decodes the filter's scalar and RGB-shift tracks; `bloom` is their initial value. */
export function readBloom(node: StageNode): BloomState {
  const g = node.scene.graph;
  const at = node.record!.settings;
  if (at === null) return { unsupported: "bloom filter without settings" };
  const pass = g.u32(at + 8);
  if (pass !== BLOOM_PASS) return { unsupported: `bloom filter pass ${pass}` };
  if (g.u32(at + 4) === 0) return { enabled: false };
  const glow = g.u32(at + 16) !== 0;
  const starCount = g.i32(at + 20);
  let stars: StageBloomStar[] | undefined;
  if (starCount < 0) {
    const count = g.i32(at + 32);
    const table = count > 0 ? g.pointer(at + 36) : null;
    if (count < 0 || (count > 0 && table === null))
      return { unsupported: "bloom filter without a valid star table" };
    stars = Array.from({ length: count }, (_, i) => ({
      rotation: g.f32(table! + i * 12),
      length: g.f32(table! + i * 12 + 4),
      twoPass: g.u32(table! + i * 12 + 8) !== 0,
    }));
  }
  const count = g.i32(at + 24);
  const table = count > 0 ? g.pointer(at + 28) : null;
  if (count < 0 || (count > 0 && table === null))
    return { unsupported: "bloom filter without a valid key table" };
  const keys: TrackKey[][] = Array.from({ length: 10 }, () => []);
  for (let k = 0; k < count; k++) {
    const key = table! + k * KEY_WORDS * 4;
    const duration = g.f32(key);
    const value = (word: number) => g.f32(key + word * 4);
    for (let i = 0; i < SCALAR_WORDS.length; i++)
      keys[i].push({ duration, values: Float32Array.of(value(SCALAR_WORDS[i]), 0, 0, 0) });
    keys[8].push({ duration, values: Float32Array.of(value(3), value(4), value(5), 0) });
    keys[9].push({ duration, values: Float32Array.of(value(13), value(14), value(15), 0) });
  }
  const loop = g.u32(at + 12) !== 0;
  const defaults = Object.values(DEFAULTS);
  const tracks = keys.map((track, i) =>
    createKeyTrack(
      track.length ? track : [{ duration: 0, values: Float32Array.of(defaults[i] ?? 0, 0, 0, 0) }],
      loop,
    ),
  );
  const state = { glow, starCount, stars, tracks };
  return {
    sampledAge: 0,
    enabled: true,
    bloom: evaluateBloom(state, 0),
    tracks,
  };
}

/** Evaluates the filter at its controller age, in stage frames. */
export function evaluateBloom(
  state: Pick<StageBloom, "glow" | "starCount" | "stars"> & {
    readonly tracks: readonly KeyTrack[];
  },
  age: number,
): StageBloom {
  const scratch = new Float32Array(4);
  const value = (i: number) => evaluateKeyTrack(state.tracks[i], age, scratch)[0];
  return {
    glow: state.glow,
    starCount: state.starCount,
    stars: state.stars,
    range: value(0),
    intensity: value(1),
    attenuation: value(2),
    starRotation: value(3),
    starRange: value(4),
    starIntensity: value(5),
    starLength: value(6),
    starAttenuation: value(7),
    shift: evaluateKeyTrack(state.tracks[8], age, new Float32Array(4)).slice(0, 3),
    starShift: evaluateKeyTrack(state.tracks[9], age, new Float32Array(4)).slice(0, 3),
  };
}

/** The bloom filter node: a world matrix and motion lists, and its parameters from its key table. */
export const bloomNode: NodeBehavior = {
  type: BLOOM_TYPE,
  construct(node) {
    node.flags |= NODE_VISIBLE;
    const state = readBloom(node);
    if ("unsupported" in state) node.scene.missing.add(`node ${BLOOM_TYPE}: ${state.unsupported}`);
    node.extension = state;
    if (!("unsupported" in state)) {
      const registry = blooms(node.scene);
      const key = bloomKey(node);
      let entry = registry.get(key);
      if (!entry) {
        entry = { owners: 0, state };
        registry.set(key, entry);
      }
      entry.owners++;
      (state as OwnedBloomState).entry = entry;
      entry.state = state;
    }
  },
  update(node) {
    computeWorld(node);
    applyMotions(node);
    const state = node.extension as OwnedBloomState;
    if (!("unsupported" in state) && state.enabled) state.sampledAge = node.controller?.age ?? 0;
    if (state.entry) state.entry.state = state;
  },
  dispose(node) {
    const entry = (node.extension as OwnedBloomState).entry;
    if (entry && --entry.owners === 0) blooms(node.scene).delete(bloomKey(node));
  },
};

/** The parameters of a live bloom filter node, or null when it is switched off or listed in the scene's missing set. */
export function nodeBloom(node: StageNode): StageBloom | null {
  const own = node.extension as OwnedBloomState;
  const state = own.entry?.state ?? own;
  return "unsupported" in state || !state.enabled
    ? null
    : state.tracks[0].total === 0
      ? state.bloom
      : evaluateBloom({ ...state.bloom, tracks: state.tracks }, state.sampledAge);
}
