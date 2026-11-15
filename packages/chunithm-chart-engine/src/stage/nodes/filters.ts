import {
  applyMotions,
  computeWorld,
  liveNodes,
  NODE_VISIBLE,
  type NodeBehavior,
  type StageNode,
  type StageScene,
} from "../runtime";
import { BLOOM_TYPE, nodeBloom, stageBloomIdentity, type StageBloom } from "./bloom";
import { BLOOM2_TYPE, nodeBloom2, type StageBloom2 } from "./bloom2";
import { FXAA3_TYPE, nodeFxaa3, type StageFxaa3 } from "./fxaa3";
import { MLAA_TYPE, nodeMlaa, type StageMlaa } from "./mlaa";
import { DOF_TYPE, nodeDof, type StageDof } from "./dof";
import { createKeyTrack, evaluateKeyTrack, type KeyTrack, type TrackKey } from "./keyTrack";

const f = Math.fround;
const COLOR2_TYPE = 6001205;
const COLOR2_PASS = 20;
const BLOOM_PASS = 20;

/** The colour-grading filter's shader inputs: colour and saturation, then brightness - 0.5, contrast, gamma and power. */
export interface StageColor2 {
  readonly enabled: boolean;
  readonly colorSaturation: Float32Array;
  readonly brightnessContrastGammaPower: Float32Array;
}

/** A colour-grading filter's key tables: the colour track and the five scalar tracks. */
export interface Color2Tracks {
  sampledAge: number;
  readonly enabled: boolean;
  readonly color: KeyTrack;
  readonly scalars: readonly KeyTrack[];
}

export type Color2State = Color2Tracks | { readonly unsupported: string };

const COLOR_SCALE = f(0.0039215689);
const KEY_WORDS = 7;

/** Decodes the filter's settings block into its key tracks. */
export function readColor2(node: StageNode): Color2State {
  const g = node.scene.graph;
  const at = node.record!.settings;
  if (at === null) return { unsupported: "colour filter without settings" };
  const enabled = g.u32(at + 4) !== 0;
  const pass = g.u32(at + 8);
  if (pass !== COLOR2_PASS) return { unsupported: `colour filter pass ${pass}` };
  const loop = g.u32(at + 12) !== 0;
  const count = g.i32(at + 16);
  const table = g.pointer(at + 20);
  if (count < 1 || table === null) return { unsupported: "colour filter without keys" };
  const colorKeys: TrackKey[] = [];
  const scalarKeys: TrackKey[][] = [[], [], [], [], []];
  for (let k = 0; k < count; k++) {
    const key = table + k * KEY_WORDS * 4;
    const duration = g.f32(key);
    const packed = g.u32(key + 4);
    colorKeys.push({
      duration,
      values: Float32Array.of(
        f((packed & 255) * COLOR_SCALE),
        f(((packed >>> 8) & 255) * COLOR_SCALE),
        f(((packed >>> 16) & 255) * COLOR_SCALE),
        f((packed >>> 24) * COLOR_SCALE),
      ),
    });
    for (let s = 0; s < 5; s++)
      scalarKeys[s].push({ duration, values: Float32Array.of(g.f32(key + 8 + s * 4), 0, 0, 0) });
  }
  return {
    sampledAge: 0,
    enabled,
    color: createKeyTrack(colorKeys, loop),
    scalars: scalarKeys.map((keys) => createKeyTrack(keys, loop)),
  };
}

/** The colour grade the tracks give at `age` stage frames. */
export function evaluateColor2(tracks: Color2Tracks, age: number): StageColor2 {
  const color = evaluateKeyTrack(tracks.color, age, new Float32Array(4));
  const scalar = new Float32Array(4);
  const value = (index: number) => evaluateKeyTrack(tracks.scalars[index], age, scalar)[0];
  const saturation = value(0);
  const brightness = value(1);
  const contrast = value(2);
  const gamma = value(3);
  const power = value(4);
  return {
    enabled: tracks.enabled,
    colorSaturation: Float32Array.of(color[0], color[1], color[2], saturation),
    brightnessContrastGammaPower: Float32Array.of(f(brightness - 0.5), contrast, gamma, power),
  };
}

/** The colour-grading filter node: a world matrix and motion lists, and its parameters from its key table. */
export const color2Node: NodeBehavior = {
  type: COLOR2_TYPE,
  construct(node) {
    node.flags |= NODE_VISIBLE;
    const state = readColor2(node);
    if ("unsupported" in state) node.scene.missing.add(`node ${COLOR2_TYPE}: ${state.unsupported}`);
    node.extension = state;
  },
  update(node) {
    computeWorld(node);
    applyMotions(node);
    const state = node.extension as Color2State;
    if (!("unsupported" in state)) state.sampledAge = node.controller?.age ?? 0;
  },
};

/**
 * The colour-grading filter a scene file applies at the scene's current time, or null when it has
 * none or its parameters use a form listed in the scene's missing set.
 *
 * @throws RangeError when the file has more than one.
 */
export function stageColor2(scene: StageScene): StageColor2 | null {
  let found: StageColor2 | null = null;
  for (const node of liveNodes(scene)) {
    if (node.record?.type !== COLOR2_TYPE) continue;
    const state = node.extension as Color2State;
    if ("unsupported" in state) continue;
    if (found) throw new RangeError("Stage filter: second colour filter");
    found = evaluateColor2(state, state.sampledAge);
  }
  return found;
}

/** One post filter of a scene file; filters apply in ascending pass order, and in node order within a pass. */
export type StagePostFilter =
  | { readonly kind: "color2"; readonly pass: number; readonly color2: StageColor2 }
  | { readonly kind: "bloom"; readonly pass: number; readonly bloom: StageBloom }
  | { readonly kind: "bloom2"; readonly pass: number; readonly bloom2: StageBloom2 }
  | { readonly kind: "mlaa"; readonly pass: number; readonly mlaa: StageMlaa }
  | { readonly kind: "fxaa3"; readonly pass: number; readonly fxaa3: StageFxaa3 }
  | { readonly kind: "dof"; readonly pass: number; readonly dof: StageDof };

/**
 * The post filters a scene file applies, in application order; filters that are switched off or
 * whose parameters use a form listed in the scene's missing set are left out.
 *
 * @throws RangeError when the file has more than one colour-grading filter.
 */
export function stagePostFilters(scene: StageScene): StagePostFilter[] {
  const out: StagePostFilter[] = [];
  let colour = false;
  const blooms = new Set<object>();
  for (const node of liveNodes(scene)) {
    const type = node.record?.type;
    if (type === COLOR2_TYPE) {
      const state = node.extension as Color2State;
      if ("unsupported" in state) continue;
      if (colour) throw new RangeError("Stage filter: second colour filter");
      colour = true;
      if (state.enabled)
        out.push({
          kind: "color2",
          pass: COLOR2_PASS,
          color2: evaluateColor2(state, state.sampledAge),
        });
    } else if (type === BLOOM_TYPE) {
      const identity = stageBloomIdentity(node);
      if (blooms.has(identity)) continue;
      blooms.add(identity);
      const bloom = nodeBloom(node);
      if (bloom) out.push({ kind: "bloom", pass: BLOOM_PASS, bloom });
    } else if (type === BLOOM2_TYPE) {
      const bloom2 = nodeBloom2(node);
      if (bloom2) out.push({ kind: "bloom2", pass: bloom2.pass, bloom2 });
    } else if (type === MLAA_TYPE) {
      const mlaa = nodeMlaa(node);
      if (mlaa) out.push({ kind: "mlaa", pass: mlaa.pass, mlaa });
    } else if (type === FXAA3_TYPE) {
      const fxaa3 = nodeFxaa3(node);
      if (fxaa3) out.push({ kind: "fxaa3", pass: fxaa3.pass, fxaa3 });
    } else if (type === DOF_TYPE) {
      const dof = nodeDof(node);
      if (dof) out.push({ kind: "dof", pass: dof.pass, dof });
    }
  }
  return out
    .map((filter, index) => ({ filter, index }))
    .sort((a, b) => a.filter.pass - b.filter.pass || a.index - b.index)
    .map(({ filter }) => filter);
}
