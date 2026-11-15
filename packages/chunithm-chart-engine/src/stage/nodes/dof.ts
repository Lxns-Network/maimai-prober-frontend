import {
  applyMotions,
  computeWorld,
  NODE_VISIBLE,
  type NodeBehavior,
  type StageNode,
} from "../runtime";
import { createKeyTrack, evaluateKeyTrack, type KeyTrack, type TrackKey } from "./keyTrack";

export const DOF_TYPE = 6001208;
const PREVIEW_PASS = 20;
const PREVIEW_DIVISOR = 4;
const KEY_WORDS = 7;
const DEFAULTS = [1000, 50, 0, 50, 0, 10000];

/** Depth-of-field settings at one scene frame, in native parameter order. */
export interface StageDof {
  readonly pass: number;
  readonly autofocus: boolean;
  readonly focusNoBlur: boolean;
  /** The intermediate targets divide each source dimension by this value. */
  readonly divisor: number;
  readonly values: Float32Array;
}

interface DofTracks {
  sampledAge: number;
  readonly pass: number;
  readonly autofocus: boolean;
  readonly focusNoBlur: boolean;
  readonly divisor: number;
  readonly tracks: readonly KeyTrack[];
}

export type DofState =
  | { readonly enabled: false }
  | ({ readonly enabled: true } & DofTracks)
  | { readonly unsupported: string };

/** Decodes the filter's settings and six independently animated float parameters. */
export function readDof(node: StageNode): DofState {
  const g = node.scene.graph;
  const at = node.record!.settings;
  if (at === null) return { unsupported: "depth-of-field filter without settings" };
  if (g.u32(at + 4) === 0) return { enabled: false };
  const pass = g.u32(at + 8);
  if (pass !== PREVIEW_PASS) return { unsupported: `depth-of-field filter pass ${pass}` };
  const resolution = g.i32(at + 24);
  if (resolution + 1 !== PREVIEW_DIVISOR)
    return { unsupported: `depth-of-field filter resolution ${resolution}` };
  const count = g.i32(at + 28);
  const table = g.pointer(at + 32);
  if (count < 0 || (count > 0 && table === null))
    return { unsupported: "depth-of-field filter without a valid key table" };
  const keys: TrackKey[][] = Array.from({ length: 6 }, () => []);
  for (let k = 0; k < count; k++) {
    const key = table! + k * KEY_WORDS * 4;
    const duration = g.f32(key);
    for (let i = 0; i < keys.length; i++)
      keys[i].push({ duration, values: Float32Array.of(g.f32(key + 4 + i * 4), 0, 0, 0) });
  }
  const loop = g.u32(at + 12) !== 0;
  return {
    sampledAge: 0,
    enabled: true,
    pass,
    autofocus: g.u32(at + 16) !== 0,
    focusNoBlur: g.u32(at + 20) !== 0,
    divisor: resolution + 1,
    tracks: keys.map((track, i) =>
      createKeyTrack(
        track.length ? track : [{ duration: 0, values: Float32Array.of(DEFAULTS[i], 0, 0, 0) }],
        loop,
      ),
    ),
  };
}

/** Evaluates all six source tracks at the node's current age. */
export function evaluateDof(state: DofTracks, age: number): StageDof {
  const scratch = new Float32Array(4);
  return {
    pass: state.pass,
    autofocus: state.autofocus,
    focusNoBlur: state.focusNoBlur,
    divisor: state.divisor,
    values: Float32Array.from(state.tracks, (track) => evaluateKeyTrack(track, age, scratch)[0]),
  };
}

export const dofNode: NodeBehavior = {
  type: DOF_TYPE,
  construct(node) {
    node.flags |= NODE_VISIBLE;
    const state = readDof(node);
    if ("unsupported" in state) node.scene.missing.add(`node ${DOF_TYPE}: ${state.unsupported}`);
    node.extension = state;
  },
  update(node) {
    computeWorld(node);
    applyMotions(node);
    const state = node.extension as DofState;
    if (!("unsupported" in state) && state.enabled) state.sampledAge = node.controller?.age ?? 0;
  },
};

export function nodeDof(node: StageNode): StageDof | null {
  const state = node.extension as DofState;
  if ("unsupported" in state || !state.enabled) return null;
  return evaluateDof(state, state.sampledAge);
}
