import {
  applyMotions,
  computeWorld,
  NODE_VISIBLE,
  type NodeBehavior,
  type StageNode,
} from "../runtime";

export const FXAA3_TYPE = 6001212;

/** The edge-smoothing filter's parameters. */
export interface StageFxaa3 {
  readonly pass: number;
  readonly repeat: boolean;
}

type Fxaa3State =
  | { readonly enabled: false }
  | { readonly enabled: true; readonly fxaa3: StageFxaa3 }
  | { readonly unsupported: string };

/** Decodes the filter's settings block, including its second smoothing pass. */
export function readFxaa3(node: StageNode): Fxaa3State {
  const g = node.scene.graph;
  const at = node.record!.settings;
  if (at === null) return { unsupported: "edge-smoothing filter without settings" };
  if (g.u32(at + 4) === 0) return { enabled: false };
  return { enabled: true, fxaa3: { pass: g.u32(at + 8), repeat: g.u32(at + 12) !== 0 } };
}

/** The edge-smoothing filter node: a world matrix and motion lists, and its parameters from its settings block. */
export const fxaa3Node: NodeBehavior = {
  type: FXAA3_TYPE,
  construct(node) {
    node.flags |= NODE_VISIBLE;
    const state = readFxaa3(node);
    if ("unsupported" in state) node.scene.missing.add(`node ${FXAA3_TYPE}: ${state.unsupported}`);
    node.extension = state;
  },
  update(node) {
    computeWorld(node);
    applyMotions(node);
  },
};

/** The parameters of a live edge-smoothing node, or null when it is switched off or listed in the scene's missing set. */
export function nodeFxaa3(node: StageNode): StageFxaa3 | null {
  const state = node.extension as Fxaa3State;
  return "unsupported" in state || !state.enabled ? null : state.fxaa3;
}
