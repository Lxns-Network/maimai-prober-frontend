import {
  applyMotions,
  computeWorld,
  NODE_VISIBLE,
  type NodeBehavior,
  type StageNode,
} from "../runtime";
import { createKeyTrack, evaluateKeyTrack, type KeyTrack } from "./keyTrack";

export const MLAA_TYPE = 6001211;
const EDGE_COLOR = 1;

/** The edge run lengths the filter's search range option selects, in option order. */
export const MLAA_DISTANCES: readonly number[] = [9, 17, 33, 65, 129];

/** The morphological anti-aliasing filter's parameters at one moment. */
export interface StageMlaa {
  readonly pass: number;
  /** The widest edge run the filter follows, in pixels. */
  readonly distance: number;
  /** The luma difference that makes an edge. */
  readonly threshold: number;
}

interface MlaaTracks {
  sampledAge: number;
  readonly pass: number;
  readonly distance: number;
  readonly threshold: KeyTrack;
}

type MlaaState =
  | { readonly enabled: false }
  | ({ readonly enabled: true } & MlaaTracks)
  | { readonly unsupported: string };

/** Decodes the filter's settings block: edge mode, search range and the threshold key table. */
export function readMlaa(node: StageNode): MlaaState {
  const g = node.scene.graph;
  const at = node.record!.settings;
  if (at === null) return { unsupported: "anti-aliasing filter without settings" };
  if (g.u32(at + 4) === 0) return { enabled: false };
  const edgeMode = g.i32(at + 16);
  if (edgeMode !== EDGE_COLOR)
    return { unsupported: `anti-aliasing filter with edge mode ${edgeMode}` };
  const range = g.i32(at + 20);
  if (range < 0 || range >= MLAA_DISTANCES.length)
    return { unsupported: `anti-aliasing filter with search range ${range}` };
  const count = g.i32(at + 24);
  const table = g.pointer(at + 28);
  if (count < 1 || table === null) return { unsupported: "anti-aliasing filter without keys" };
  const keys = [];
  for (let k = 0; k < count; k++)
    keys.push({
      duration: g.f32(table + k * 8),
      values: Float32Array.of(g.f32(table + k * 8 + 4), 0, 0, 0),
    });
  return {
    sampledAge: 0,
    enabled: true,
    pass: g.u32(at + 8),
    distance: MLAA_DISTANCES[range],
    threshold: createKeyTrack(keys, g.u32(at + 12) !== 0),
  };
}

/** The anti-aliasing filter node: a world matrix and motion lists, and its parameters from its settings block. */
export const mlaaNode: NodeBehavior = {
  type: MLAA_TYPE,
  construct(node) {
    node.flags |= NODE_VISIBLE;
    const state = readMlaa(node);
    if ("unsupported" in state) node.scene.missing.add(`node ${MLAA_TYPE}: ${state.unsupported}`);
    node.extension = state;
  },
  update(node) {
    computeWorld(node);
    applyMotions(node);
    const state = node.extension as MlaaState;
    if (!("unsupported" in state) && state.enabled) state.sampledAge = node.controller?.age ?? 0;
  },
};

/** The parameters of a live anti-aliasing node at the node's current age, or null when it is switched off or listed in the scene's missing set. */
export function nodeMlaa(node: StageNode): StageMlaa | null {
  const state = node.extension as MlaaState;
  if ("unsupported" in state || !state.enabled) return null;
  const threshold = evaluateKeyTrack(state.threshold, state.sampledAge, new Float32Array(4))[0];
  return { pass: state.pass, distance: state.distance, threshold };
}
