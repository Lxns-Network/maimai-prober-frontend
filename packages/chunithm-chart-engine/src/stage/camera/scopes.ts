import type { StageNode, StageScene } from "../runtime";
import { stageCameraNodeView, type StageCameraEnvironment, type StageCameraView } from "../view";
import { stageReflectionContext } from "../nodes/reflection";
import { FAR_MINIMUM_GAP, multiply } from "./math";

export interface StageDrawCamera extends StageCameraView {
  readonly environment: StageCameraEnvironment;
}

/**
 * Resolves depth-first draw publication and optionally publishes named reflection-scene cameras.
 * Named seeds use full depth; a shortened traversal must receive its own publication map.
 */
export function stageCameraScopes(
  scene: StageScene,
  incoming: StageDrawCamera,
  farScale = 1,
  published?: Map<string, StageDrawCamera>,
): ReadonlyMap<StageNode, StageDrawCamera> {
  const cameras = new Map<StageNode, StageDrawCamera>();
  const scaledCameras = new Map<StageDrawCamera, StageDrawCamera>();
  const scaleDepth = (camera: StageDrawCamera): StageDrawCamera => {
    if (farScale === 1) return camera;
    const scaled = scaledCameras.get(camera);
    if (scaled) return scaled;
    const f = Math.fround;
    const { near, far } = camera.environment;
    const farClip = Math.max(f(far * farScale), f(near + FAR_MINIMUM_GAP));
    const projection = camera.projection.slice();
    if (projection[15] === 1) {
      const depth = f(1 / f(farClip - near));
      projection[10] = -depth;
      projection[11] = f(1 - f(depth * farClip));
    } else {
      const depth = f(1 / f(near - farClip));
      projection[10] = f(depth * farClip);
      projection[11] = f(f(near * farClip) * depth);
    }
    const value = {
      ...camera,
      projection,
      viewProjection: multiply(projection, camera.view, { fpcw: 0x37f, mxcsr: 0x1f80 }),
    };
    scaledCameras.set(camera, value);
    scaledCameras.set(value, value);
    return value;
  };
  let current = scaleDepth(incoming);
  const sceneCameras = new Map<string, StageDrawCamera>();
  const visit = (node: StageNode) => {
    if (node.flags & 0x25) return;
    const previousCamera = current;
    const reflection = stageReflectionContext(node);
    if (reflection !== null) {
      current =
        sceneCameras.get(reflection) ??
        scaleDepth(
          published?.get(reflection) ?? published?.get(scene.options.targetScene ?? "") ?? incoming,
        );
    }
    const previous = current;
    const record = node.record;
    const visible = (node.flags & 0xc00400) === 0 && (node.flags & 0x80000) !== 0;
    const camera = visible && record?.type === 6000001 && (record.flags & 0x80000000) === 0;
    if (camera) {
      current = stageCameraNodeView(
        node,
        current.environment.aspect,
        current.environment.offsetX,
        current.environment.offsetY,
        current.environment.rollCode,
        farScale,
        current.environment,
      );
      scaledCameras.set(current, current);
    }
    cameras.set(node, current);
    for (const child of node.children) visit(child);
    if (camera && (node.flags & 0x400c00) === 0) {
      if (scene.graph.u32(record.settings! + 4) !== 0) current = previous;
    }
    if (reflection !== null) {
      sceneCameras.set(reflection, current);
      published?.set(reflection, current);
      current = previousCamera;
    }
  };
  visit(scene.root);
  return cameras;
}
