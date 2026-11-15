import { nthElement, type ColorElement } from "../elements";
import { liveNodes, type StageNode } from "../runtime";
import { stageCameraNodeView } from "../view";
import { cameraDebugGeometry } from "../camera/debugGeometry";
import { createEffectRenderer, type EffectPrimitivePacket } from "../../effects/render";
import { plainMaterial } from "../../effects/eval/draw";
import { depthPrimitiveEffectState } from "../../effects/renderState";
import { primitivePass } from "../../effects/passes";
import type { StageFrame } from "./types";
import { stageEffectFrame } from "./stageEffectFrame";
import { withStageViewport } from "./stageViewport";
import { lookAt } from "../camera/math";

const FLAGS = 0x2fe000;
const COLOR_SCALE = Math.fround(1 / 255);

export function createStageCameraDebug(gl: WebGL2RenderingContext) {
  let renderer: ReturnType<typeof createEffectRenderer> | null = null;
  return {
    prepare(
      frame: StageFrame,
      viewport: { width: number; height: number },
      sceneNodes: readonly StageNode[] = liveNodes(frame.scene),
    ) {
      const packets: EffectPrimitivePacket[] = [];
      const nodes: StageNode[] = [];
      const material = plainMaterial(FLAGS, 0, 0, 4, 0);
      for (const node of sceneNodes) {
        if (node.record?.type !== 6000001 || !(node.record.flags & 0x80000000)) continue;
        if ((node.flags & 0xc00425) !== 0 || (node.flags & 0x80000) === 0) continue;
        const camera = frame.cameraScopes?.get(node);
        if (frame.cameraScopes && !camera) continue;
        if (!camera) throw new RangeError("Stage camera debug requires the incoming camera scope");
        const own = stageCameraNodeView(
          node,
          camera.environment.aspect,
          camera.environment.offsetX,
          camera.environment.offsetY,
          camera.environment.rollCode,
          1,
          camera.environment,
        );
        const color = nthElement<ColorElement>(node, 101, 0)?.color ?? 0xffffffff;
        const effectFrame = stageEffectFrame(frame.camera, viewport, frame);
        const debugView = lookAt(own.position, own.target, own.environment.up, {
          fpcw: 0x37f,
          mxcsr: 0x1f80,
        });
        for (const draw of cameraDebugGeometry(debugView, own.environment, color, 0xffffffff)) {
          const count = draw.positions.length / 3;
          const tint = [16, 8, 0, 24].map((shift) =>
            Math.fround(((draw.color >>> shift) & 255) * COLOR_SCALE),
          );
          packets.push({
            kind: "simple",
            topology: "lines",
            layout: 4,
            resourceId: 0,
            frame: effectFrame,
            mesh: {
              attributes: {
                aPosition: { size: 3, values: draw.positions },
                aColor: { size: 4, values: Array.from({ length: count }, () => tint).flat() },
                aTexCoord: { size: 2, values: new Float32Array(count * 2) },
              },
              indices: draw.indices,
            },
            worldMatrix: Float32Array.from(
              { length: 16 },
              (_, i) => draw.world[(i % 4) * 4 + Math.floor(i / 4)],
            ),
            bindings: [],
            material,
            state: depthPrimitiveEffectState(FLAGS),
            order: {
              pass: {
                passIndex: primitivePass(material.featureWord96, material.featureWord100, 0x8500),
              },
              key: 0x8500,
              sortPosition: draw.world.subarray(12, 15),
              sortDistanceOffset: 0,
            },
          });
          nodes.push(node);
        }
      }
      if (!packets.length) return [];
      renderer ??= createEffectRenderer(gl, { texture: () => null });
      return renderer.prepare(packets, packets[0].frame!).map((entry, index) => ({
        node: nodes[index],
        pass: entry.pass,
        key: entry.key,
        depth: entry.depth,
        draw: () =>
          withStageViewport(
            gl,
            frame.camera.viewport,
            frame.scene.options.viewport,
            () => entry.draw().draws,
          ),
      }));
    },
    dispose: () => renderer?.dispose(),
  };
}
