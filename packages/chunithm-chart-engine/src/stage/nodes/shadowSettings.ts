import { nthElement, type ColorElement } from "../elements";
import type { StageNode } from "../runtime";

export const SHADOW_PARALLEL_TYPE = 6001114;

/** Native buffer allocation treats the requested count as unsigned and bounds it to 1-3. */
export function shadowCascadeCount(requested: number): number {
  return Math.min(Math.max(requested >>> 0, 1), 3);
}

/** The directional-shadow parameters read from the Stage node and its three colour elements. */
export interface StageShadowSettings {
  readonly drawIndex: number;
  readonly width: number;
  readonly height: number;
  readonly type: number;
  readonly softness: number;
  readonly edgeHide: boolean;
  readonly colorShadow: number;
  readonly cascadeCount: number;
  readonly cascadeDepths: readonly number[];
  readonly length: number;
  readonly bias: number;
  readonly slope: number;
  readonly alphaReference: number;
  readonly diffuse: number;
  readonly specular: number;
  readonly shadowColor: number;
}

/** Reads the serialized parameters; a negative draw index uses the enclosing scene's index. */
export function readShadowSettings(
  node: StageNode,
  inheritedDrawIndex: number,
): StageShadowSettings {
  const graph = node.scene.graph;
  const at = node.record!.settings;
  if (at === null) throw new RangeError("Stage shadow: no settings");
  const color = (index: number) => {
    const element = nthElement<ColorElement>(node, 101, index);
    if (!element) throw new RangeError(`Stage shadow: colour component ${index}`);
    return element.color;
  };
  const drawIndex = graph.i32(at + 8);
  return {
    drawIndex: drawIndex < 0 ? inheritedDrawIndex : drawIndex,
    width: graph.i32(at + 12),
    height: graph.i32(at + 16),
    type: graph.i32(at + 20),
    softness: graph.i32(at + 24),
    edgeHide: graph.u32(at + 28) !== 0,
    colorShadow: graph.i32(at + 32),
    cascadeCount: graph.i32(at + 36),
    cascadeDepths: [graph.f32(at + 40), graph.f32(at + 44), graph.f32(at + 48), graph.f32(at + 52)],
    length: graph.f32(at + 56),
    bias: graph.i32(at + 60),
    slope: graph.f32(at + 64),
    alphaReference: graph.i32(at + 68),
    diffuse: color(0),
    specular: color(1),
    shadowColor: color(2),
  };
}
