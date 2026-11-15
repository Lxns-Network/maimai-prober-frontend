import type { MotionBehavior, NodeBehavior } from "./runtime";
export { decodeStageUvAnimation } from "./model/uvAnimation";
import { nullNode, rootNode } from "./nodes/basic";
import { instancedModelNode, modelNode } from "./nodes/model";
import {
  ambientLightNode,
  fogLightNode,
  hemisphereLightNode,
  lightGroupNode,
  lightMaskNode,
  parallelLightNode,
  pointLightNode,
  rimLightNode,
} from "./nodes/lights";
import { color2Node } from "./nodes/filters";
import { bloomNode } from "./nodes/bloom";
import { bloom2Node } from "./nodes/bloom2";
import { mlaaNode } from "./nodes/mlaa";
import { fxaa3Node } from "./nodes/fxaa3";
import { dofNode } from "./nodes/dof";
import { particleNode } from "./nodes/particle";
import { screenParticleNode, starParticleNode } from "./nodes/starParticle";
import { fillNode, primitiveNode } from "./nodes/primitive";
import { multiPrimitiveNode, primitive3dNode } from "./nodes/primitive3d";
import { solidNode } from "./nodes/solid";
import { windNode } from "./nodes/wind";
import { reflectionNode } from "./nodes/reflection";
import { shadowNode } from "./nodes/shadow";
import { ribbonNode } from "./nodes/ribbon";
import { ribbon102Node } from "./nodes/ribbon102";
import { timeRateNode } from "./nodes/timeRate";
import { stageCameraNode } from "./view";
import { matrixMotion } from "./motions/matrix";
import { materialMotion } from "./motions/material";
import { texturePatternMotion } from "./motions/texturePattern";
import { uvSetMotion } from "./motions/uvSet";
import { uvScrollMotion } from "./motions/uvScroll";
import { textureChangeMotion } from "./motions/textureChange";
import { materialInterlockedMotion } from "./motions/materialInterlocked";
import { essenceSetMotion } from "./motions/essenceSet";
import { sendParamMotion } from "./motions/sendParam";
import { collisionMotion } from "./motions/collision";
import { changeStateMotion } from "./motions/changeState";
import { timeRateMotion } from "./motions/timeRate";
import { coordinateMotion, multiCoordinateMotion } from "./motions/coordinate";
import { goalMotion } from "./motions/goal";
import { eraseMotion, separateEraseMotion } from "./motions/erase";
import {
  fanPlacementMotion,
  linearPlacementMotion,
  tablePlacementMotion,
} from "./motions/placement";
import { turnCameraMotion } from "./motions/turnCamera";
import {
  cameraMotionSetMotion,
  motionSetMotion,
  ordinalMotionSetMotion,
} from "./motions/motionSet";

const MOTIONS: readonly MotionBehavior[] = [
  matrixMotion,
  materialMotion,
  texturePatternMotion,
  uvSetMotion,
  uvScrollMotion,
  textureChangeMotion,
  materialInterlockedMotion,
  essenceSetMotion,
  sendParamMotion,
  collisionMotion,
  changeStateMotion,
  timeRateMotion,
  coordinateMotion,
  multiCoordinateMotion,
  goalMotion,
  eraseMotion,
  separateEraseMotion,
  linearPlacementMotion,
  fanPlacementMotion,
  tablePlacementMotion,
  turnCameraMotion,
  motionSetMotion,
  cameraMotionSetMotion,
  ordinalMotionSetMotion,
];
const NODES: readonly NodeBehavior[] = [
  rootNode,
  nullNode,
  modelNode,
  instancedModelNode,
  ambientLightNode,
  parallelLightNode,
  rimLightNode,
  pointLightNode,
  hemisphereLightNode,
  lightGroupNode,
  lightMaskNode,
  color2Node,
  bloomNode,
  bloom2Node,
  mlaaNode,
  fxaa3Node,
  dofNode,
  particleNode,
  starParticleNode,
  screenParticleNode,
  primitiveNode,
  primitive3dNode,
  multiPrimitiveNode,
  solidNode,
  windNode,
  timeRateNode,
  fillNode,
  fogLightNode,
  reflectionNode,
  shadowNode,
  ribbon102Node,
  ribbonNode,
  stageCameraNode,
];

export const motionBehaviors: ReadonlyMap<number, MotionBehavior> = new Map(
  MOTIONS.map((m) => [m.type, m]),
);
export const nodeBehaviors: ReadonlyMap<number, NodeBehavior> = new Map(
  NODES.map((n) => [n.type, n]),
);

export function registeredMotionTypes(): number[] {
  return [...motionBehaviors.keys()].sort((a, b) => a - b);
}

export function registeredNodeTypes(): number[] {
  return [...nodeBehaviors.keys()].sort((a, b) => a - b);
}
