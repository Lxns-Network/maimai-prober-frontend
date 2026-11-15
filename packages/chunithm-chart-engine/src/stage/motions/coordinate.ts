import type { StageMotionRecord } from "../graph";
import type { StageCameraEnvironment } from "../view";
import {
  NODE_FIXED_WORLD,
  NODE_COORDINATE_TARGET,
  NODE_KILLED,
  sceneState,
  type MotionBehavior,
  type MotionInstance,
  type StageNode,
  type StageScene,
} from "../runtime";
import { setIdentity, translate } from "../../math/matrix";
import { findNodeById } from "./common";
import { sceneCamera } from "./turnCamera";

const ENTRY_BYTES = 20;
const PARENT = -4;
const CAMERA_EYE = -3;
const CAMERA_TARGET = -2;
const COORDINATE_CAMERA = "coordinate.camera";

/** Copies the incoming display pose and shares it before any synchronized scene has stepped. */
export function bindStageCoordinateCamera(
  scenes: readonly StageScene[],
  environment?: StageCameraEnvironment,
): void {
  for (const scene of scenes)
    if (scene.classState.has(COORDINATE_CAMERA) || scene.classState.has("turnCamera.camera"))
      throw new Error("Stage coordinate camera: scenes were already initialized");
  if (!scenes.length) return;
  const camera = coordinateCamera(scenes[0]);
  const facing = sceneCamera(scenes[0]);
  if (environment) {
    camera.eye.set(environment.eye);
    camera.target.set(environment.target);
    facing.eye.set(environment.eye);
    facing.at.set(environment.target);
    facing.up.set(environment.up);
    facing.roll = environment.rollCode;
    facing.fovCode = environment.fovCode;
    facing.parallel = false;
  }
  for (let i = 1; i < scenes.length; i++) {
    scenes[i].classState.set(COORDINATE_CAMERA, camera);
    scenes[i].classState.set("turnCamera.camera", facing);
  }
}

/** The published display position, kept separately from the camera's component matrices. */
export function coordinateCamera(scene: StageScene): {
  eye: Float32Array;
  target: Float32Array;
} {
  return sceneState(scene, COORDINATE_CAMERA, () => ({
    eye: Float32Array.of(0, 0, 200),
    target: new Float32Array(3),
  }));
}

function fail(message: string): never {
  throw new RangeError(`Stage coordinate: ${message}`);
}

function bindCoordinate(node: StageNode, target: StageNode | null): void {
  node.coordinateParent = target;
  if (!target) return;
  node.flags &= ~NODE_FIXED_WORLD;
  target.flags |= NODE_COORDINATE_TARGET;
}

function keepTranslation(m: Float32Array): void {
  const x = m[12];
  const y = m[13];
  const z = m[14];
  m.fill(0);
  m[0] = m[5] = m[10] = m[15] = 1;
  m[12] = x;
  m[13] = y;
  m[14] = z;
}

function freezeWorld(node: StageNode): void {
  node.flags |= NODE_FIXED_WORLD;
  if (node.fixedWorld) node.fixedWorld.set(node.world);
  else node.fixedWorld = Float32Array.from(node.world);
}

class CoordinateMotion implements MotionInstance {
  readonly behavior = coordinateMotion;
  readonly entry: number;
  finished = false;

  constructor(
    scene: StageScene,
    node: StageNode,
    readonly record: StageMotionRecord,
  ) {
    const g = scene.graph;
    if (record.data === null) fail("motion without data");
    const count = g.i32(record.data);
    let index = 0;
    if (node.count >>> 0 > 1 && count > node.ordinal) index = node.ordinal;
    if (count <= index) fail("no entry for the instance");
    this.entry = g.target(record.data + 4) + index * ENTRY_BYTES;
    const kind = g.i32(this.entry);
    if (kind !== 0 && kind !== CAMERA_EYE && kind !== CAMERA_TARGET) fail(`target kind ${kind}`);
    if (kind === CAMERA_EYE || kind === CAMERA_TARGET) coordinateCamera(scene);
  }

  update(node: StageNode, scratch: Float32Array): boolean {
    if (this.finished) return false;
    const g = node.scene.graph;
    const kind = g.i32(this.entry);
    if (kind === CAMERA_EYE || kind === CAMERA_TARGET) {
      const camera = coordinateCamera(node.scene);
      const vector = kind === CAMERA_EYE ? camera.eye : camera.target;
      freezeWorld(node);
      setIdentity(node.world);
      node.world[12] = vector[0];
      node.world[13] = vector[1];
      node.world[14] = vector[2];
      translate(scratch, vector[0], vector[1], vector[2]);
      return true;
    }
    const target = findNodeById(node.scene, g.i32(this.entry + 4));
    if (!target || !node.record) return false;
    bindCoordinate(node, target);
    const world = node.world;
    world.set(target.world);
    let produced = false;
    if (g.i32(this.entry + 8) === 1) {
      for (let i = 0; i < 12; i++) scratch[i] = world[i];
      produced = true;
      keepTranslation(world);
    }
    node.coordinateMode = 0;
    node.translationOnly = 0;
    this.finished = true;
    return produced;
  }
}

export const coordinateMotion: MotionBehavior = {
  type: 250,
  create: (scene, node, record) => new CoordinateMotion(scene, node, record),
};

/** Whether the node's class has no joint matrices of its own. */
function jointless(node: StageNode): boolean {
  const scene = node.scene;
  if (scene.options.genericNodes) return true;
  const type = node.record?.type;
  return type === 2 || type === 3;
}

class MultiCoordinateMotion implements MotionInstance {
  readonly behavior = multiCoordinateMotion;
  readonly data: number;
  target: StageNode | null = null;
  joint = 0;

  constructor(
    scene: StageScene,
    node: StageNode,
    readonly record: StageMotionRecord,
  ) {
    const g = scene.graph;
    if (record.data === null) fail("motion without data");
    this.data = record.data;
    const kind = g.i32(this.data + 8);
    const mode = g.i32(this.data + 16);
    if (mode < 0 || mode > 2) fail(`multi-coordinate joint mode ${mode}`);
    if (kind === CAMERA_EYE || kind === CAMERA_TARGET) coordinateCamera(scene);
    this.select(node);
  }

  select(node: StageNode): void {
    if (this.target) return;
    const g = node.scene.graph;
    const kind = g.i32(this.data + 8);
    if (kind > PARENT && kind < 0) return;
    const target = kind === PARENT ? node.parent : findNodeById(node.scene, kind);
    this.target = target;
    bindCoordinate(node, target);
    if (!target) return;
    const named = (site: number): number => {
      const name = g.pointer(site);
      return name === null || jointless(target)
        ? -1
        : (node.scene.options.nodes.get(target.record!.type)?.jointIndex?.(target, name) ?? -1);
    };
    switch (g.i32(this.data + 16)) {
      case 0:
        this.joint = (node.spawnIndex + g.i32(this.data + 20)) | 0;
        break;
      case 1:
        this.joint = (node.spawnIndex + named(this.data + 24)) | 0;
        break;
      case 2: {
        if (node.spawnIndex > g.i32(this.data)) {
          this.joint = -1;
          break;
        }
        const entry = g.target(this.data + 4) + node.spawnIndex * 12;
        this.joint = g.i32(entry) === 0 ? g.i32(entry + 4) : named(entry + 8);
        break;
      }
    }
  }

  update(node: StageNode): boolean {
    const g = node.scene.graph;
    const kind = g.i32(this.data + 8);
    if (kind > PARENT && kind < 0) {
      freezeWorld(node);
      if (kind === CAMERA_EYE || kind === CAMERA_TARGET) {
        const camera = coordinateCamera(node.scene);
        const vector = kind === CAMERA_EYE ? camera.eye : camera.target;
        setIdentity(node.world);
        node.world.set(vector, 12);
      }
      return false;
    }
    this.select(node);
    const target = this.target;
    if (!target) return false;
    node.world.set(target.world);
    let resolved = false;
    if (this.joint >= 0 && !jointless(target)) {
      const joint = node.scene.options.nodes.get(target.record!.type)?.joint;
      if (!joint) fail(`joint matrix of node type ${target.record?.type}`);
      resolved = joint(target, node.world, this.joint, -1);
    }
    if (g.i32(this.data + 12) === 1) keepTranslation(node.world);
    if (g.u32(this.data + 28) !== 0 && !resolved) node.flags |= NODE_KILLED;
    return false;
  }
}

export const multiCoordinateMotion: MotionBehavior = {
  type: 6002002,
  create: (scene, node, record) => new MultiCoordinateMotion(scene, node, record),
};
