import type { StageNode, StageScene } from "./runtime";
import { applyMotions, computeWorld, liveNodes, sceneState, type NodeBehavior } from "./runtime";
import { nthElement, type MatrixElement } from "./elements";
import { findNodeById } from "./motions/common";
import { coordinateCamera } from "./motions/coordinate";
import { sceneCamera } from "./motions/turnCamera";
import { CameraElement } from "./model/cameraElement";
import { stageReflectionContext } from "./nodes/reflection";
import { inverseAffine } from "../math/matrix";
import {
  ANGLE_CODE_TO_DEGREES,
  DEGREES_TO_ANGLE_CODE,
  DEGREES_TO_RADIANS,
  FAR_MINIMUM_GAP,
  lookAt,
  multiply,
  orthographic,
  perspective,
  sceneLookAt,
  upFromDirection,
  wrapDegrees,
  type FloatEnv,
  type Mat4,
  type Vec3,
} from "./camera/math";

const f = Math.fround;
const CAMERA_TYPE = 6000001;
const DEFAULT_FOV_CODE = 10922;
const DEFAULT_NEAR = 1;
const DEFAULT_FAR = 10000;
const ENV: FloatEnv = { fpcw: 0x37f, mxcsr: 0x1f80 };
const SCENE_CAMERAS = "camera.scene-publication";

interface SceneCameraPublication {
  display?: StageCameraEnvironment;
  readonly targets: Map<string, PublishedSceneCamera>;
}

interface PublishedSceneCamera extends StageCameraLook {
  readonly environment: StageCameraEnvironment;
  readonly displayBounds?: readonly [number, number];
}

function sceneCameraPublication(scene: StageScene): SceneCameraPublication {
  return sceneState(scene, SCENE_CAMERAS, () => ({ targets: new Map() }));
}

/** Shares target cameras and the incoming display state across synchronized files. */
export function bindStageSceneCameras(
  scenes: readonly StageScene[],
  environment: StageCameraEnvironment,
): void {
  const publication: SceneCameraPublication = { display: environment, targets: new Map() };
  for (const scene of scenes) scene.classState.set(SCENE_CAMERAS, publication);
}

interface StageCameraState {
  parameterFov: number;
  parameterNear: number;
  parameterFar: number;
  parameterAspect: number;
  parameterRoll: number;
  fovCode: number;
  near: number;
  far: number;
  aspect: number | null;
  roll: number;
}

interface CameraPose {
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly fovCode: number;
}

export interface StageCameraEnvironment extends CameraPose {
  readonly near: number;
  readonly far: number;
  readonly aspect: number;
  readonly rollCode: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Applies the retained-camera helper's component arithmetic, including its repeated X operand. */
function transformRetainedCamera(camera: CameraPose, matrix: Float32Array): CameraPose {
  const vector = (input: Vec3, position: boolean): Vec3 =>
    [0, 1, 2].map((row) => {
      const value = f(
        f(f(matrix[row] * input[0]) + f(matrix[row + 4] * input[0])) +
          f(matrix[row + 8] * input[2]),
      );
      return position ? f(value + matrix[row + 12]) : value;
    }) as Vec3;
  return {
    eye: vector(camera.eye, true),
    target: vector(camera.target, true),
    up: vector(camera.up, false),
    fovCode: camera.fovCode,
  };
}

const CAMERA_PARAMETERS = [
  "parameterFov",
  "parameterNear",
  "parameterFar",
  "parameterAspect",
  "parameterRoll",
] as const;

/** Receives a camera parameter before the camera publishes its view. */
export function setStageCameraParameter(node: StageNode, index: number, value: number): void {
  if (index >= CAMERA_PARAMETERS.length) throw new RangeError(`Stage camera: parameter ${index}`);
  (node.extension as StageCameraState)[CAMERA_PARAMETERS[index]] = value;
}

export interface StageCameraView {
  readonly viewport?: StageCameraViewport;
  /** Row-major view matrix (translation in m[3], m[7], m[11]). */
  readonly view: Mat4;
  readonly projection: Mat4;
  readonly viewProjection: Mat4;
  /** Scene-selection matrix when it differs from the matrix published to shaders. */
  readonly cullViewProjection?: Mat4;
  readonly position: Vec3;
}

export interface StageCameraViewport {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The screen camera's top-left display rectangle; projection bounds are initialized separately. */
export function stageCameraViewport(node: StageNode): StageCameraViewport | undefined {
  const g = node.scene.graph;
  const at = node.record!.settings!;
  if (g.u32(at + 44) === 0) return undefined;
  const left = f(g.f32(at + 48) + node.world[12]);
  const top = f(g.f32(at + 52) + node.world[13]);
  return {
    left: Math.trunc(left) >>> 0,
    top: Math.trunc(top) >>> 0,
    right: Math.trunc(f(g.f32(at + 56) + left)) >>> 0,
    bottom: Math.trunc(f(g.f32(at + 60) + top)) >>> 0,
  };
}

/** A camera view with the point it looks at. */
export interface StageCameraLook extends StageCameraView {
  readonly target: Vec3;
  readonly up: Vec3;
  readonly fovDegrees: number;
  readonly aspect: number;
  readonly parallel: boolean;
}

function translation(m: Float32Array): Vec3 {
  return [m[12], m[13], m[14]];
}

const IDENTITY = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

/** Rebuilds a matrix component from the world matrix of the node a camera setting references, when it references one. */
function rebuildComponent(node: StageNode, element: number, reference: number): void {
  const component = nthElement<MatrixElement>(node, 100, element);
  if (!component) throw new RangeError("Stage camera: missing matrix component");
  component.matrix.set(IDENTITY);
  const g = node.scene.graph;
  const at = node.record!.settings!;
  const id = g.i32(at + reference * 4);
  if (id < 0) return;
  const mode = g.i32(at + (reference + 1) * 4);
  const joint = g.i32(at + (reference + 2) * 4);
  const target = findNodeById(node.scene, id);
  if (!target) return;
  component.matrix.set(target.world);
  if (joint >= 0 && target.record && !node.scene.options.genericNodes)
    node.scene.options.nodes.get(target.record.type)?.joint?.(target, component.matrix, joint, -1);
  if (mode === 1) {
    const m = component.matrix;
    const [x, y, z] = [m[12], m[13], m[14]];
    m.set(IDENTITY);
    m[12] = x;
    m[13] = y;
    m[14] = z;
  }
}

/**
 * The camera node: a world matrix, then its eye and target components rebuilt each step (identity, or a referenced
 * node's world matrix) before its motion lists add to them; its view comes from `stageCameraView`.
 */
export const stageCameraNode: NodeBehavior = {
  type: CAMERA_TYPE,
  construct(node) {
    const g = node.scene.graph;
    const at = node.record!.settings!;
    node.extension = {
      parameterFov: g.f32(at + 12),
      parameterNear: g.f32(at + 16),
      parameterFar: g.f32(at + 20),
      parameterAspect: g.f32(at + 24),
      parameterRoll: g.f32(at),
      fovCode: DEFAULT_FOV_CODE,
      near: DEFAULT_NEAR,
      far: DEFAULT_FAR,
      aspect: null,
      roll: g.f32(at),
    } satisfies StageCameraState;
  },
  update(node) {
    computeWorld(node);
    if (node.record?.settings) {
      rebuildComponent(node, 1, 17);
      rebuildComponent(node, 2, 20);
    }
    applyMotions(node);
    const state = node.extension as StageCameraState;
    const g = node.scene.graph;
    const at = node.record!.settings!;
    const playback = nthElement<CameraElement>(node, 600, 0);
    const animation = playback?.animation();
    const sampled = animation
      ? animation.sample(playback!.frame, nthElement<MatrixElement>(node, 100, 1)!.matrix)
      : null;
    if (sampled) state.fovCode = sampled.fovCode;
    if (g.f32(at) >= 0) state.roll = state.parameterRoll;
    if (g.f32(at + 12) >= 0)
      state.fovCode = Math.trunc(f(wrapDegrees(state.parameterFov, ENV) * DEGREES_TO_ANGLE_CODE));
    if (g.f32(at + 16) >= 0) state.near = state.parameterNear;
    if (g.f32(at + 20) >= 0) state.far = state.parameterFar;
    const screen = g.u32(at + 44) !== 0;
    if (screen && g.u32(at + 64) !== 0) state.aspect = f(g.f32(at + 56) / g.f32(at + 60));
    else if (g.f32(at + 24) > 0) state.aspect = state.parameterAspect;
    const camera = coordinateCamera(node.scene);
    const world = node.world;
    for (const [ordinal, out] of [
      [1, camera.eye],
      [2, camera.target],
    ] as const) {
      const component = nthElement<MatrixElement>(node, 100, ordinal);
      if (!component) throw new RangeError("Stage camera: missing matrix component");
      for (let i = 0; i < 3; i++)
        out[i] = sampled
          ? f(
              f((ordinal === 1 ? sampled.eye : sampled.target)[i] + component.matrix[12 + i]) +
                world[12 + i],
            )
          : screen
            ? component.matrix[12 + i]
            : f(component.matrix[12 + i] + world[12 + i]);
    }
    if (!(node.record!.flags & 0x80000000)) {
      const facing = sceneCamera(node.scene);
      facing.eye.set(camera.eye);
      facing.at.set(camera.target);
      facing.up.set(
        sampled?.up ??
          upFromDirection(
            [camera.eye[0], camera.eye[1], camera.eye[2]],
            [camera.target[0], camera.target[1], camera.target[2]],
            [0, 1, 0],
            null,
            ENV,
          ),
      );
      facing.parallel = g.u32(at + 8) === 1;
      facing.fovCode = state.fovCode;
      if (g.f32(at) >= 0)
        facing.roll = Math.trunc(f(wrapDegrees(state.roll, ENV) * DEGREES_TO_ANGLE_CODE));
      let target = node.scene.options.targetScene ?? "";
      for (let parent = node.parent; parent; parent = parent.parent) {
        const reflection = stageReflectionContext(parent);
        if (reflection !== null) {
          target = reflection;
          break;
        }
      }
      const publication = sceneCameraPublication(node.scene);
      const viewport = node.scene.options.viewport;
      const incoming = publication.display;
      const aspect = incoming?.aspect ?? (viewport ? f(viewport[0] / viewport[1]) : f(16 / 9));
      const published =
        g.u32(at + 4) !== 0
          ? stageCameraNodeView(
              node,
              aspect,
              incoming?.offsetX ?? 0,
              incoming?.offsetY ?? 0,
              incoming?.rollCode ?? 0,
              1,
              incoming,
            )
          : cameraLook(
              {
                eye: Array.from(facing.eye) as Vec3,
                target: Array.from(facing.at) as Vec3,
                up: Array.from(facing.up) as Vec3,
                fovCode: state.fovCode,
                near: state.near,
                far: state.far,
                aspect: state.aspect ?? aspect,
                rollCode: facing.roll,
                offsetX: incoming?.offsetX ?? 0,
                offsetY: incoming?.offsetY ?? 0,
              },
              facing.parallel!,
              viewport,
              1,
              stageCameraViewport(node),
            );
      publication.display = published.environment;
      const projection = sceneProjection(published.environment, published.parallel, viewport, 1);
      const view = sceneLookAt(published.position, published.target, published.up, ENV);
      publication.targets.set(target, {
        ...published,
        view,
        projection,
        viewProjection: multiply(projection, view, ENV),
        displayBounds: viewport ? [viewport[0], viewport[1]] : undefined,
      });
    }
  },
};

/** The scene's first live camera that publishes a display view, excluding debug wireframes. */
export function cameraNode(scene: StageScene): StageNode | null {
  return (
    liveNodes(scene).find((n) => {
      if (n.record?.type !== CAMERA_TYPE || n.record.flags & 0x80000000) return false;
      for (let parent = n.parent; parent; parent = parent.parent)
        if (stageReflectionContext(parent) !== null) return false;
      return true;
    }) ?? null
  );
}

/**
 * A component's translation including the current world translation of the node its setting references. The
 * component itself only holds the reference as of the camera's own update, which in the first step precedes the
 * reference's first update.
 */
function referenced(node: StageNode, reference: number, own: Vec3): Vec3 {
  const g = node.scene.graph;
  const id = g.i32(node.record!.settings! + reference * 4);
  const target = id >= 0 ? findNodeById(node.scene, id) : null;
  return target
    ? [f(own[0] + target.world[12]), f(own[1] + target.world[13]), f(own[2] + target.world[14])]
    : own;
}

/**
 * Evaluates the draw camera without changing the incoming display environment. Retained cameras
 * require that environment; animated draw cameras resample against the node world matrix.
 */
export function stageCameraView(
  scene: StageScene,
  aspect: number,
  offsetX = 0,
  offsetY = 0,
  roll = 0,
  farScale = 1,
  environment?: StageCameraEnvironment,
): (StageCameraLook & { readonly environment: StageCameraEnvironment }) | null {
  const node = cameraNode(scene);
  if (!node || !node.record?.settings) return null;
  return stageCameraNodeView(node, aspect, offsetX, offsetY, roll, farScale, environment);
}

/** Last camera published to this target scene; independent of per-draw camera scopes. */
export function stageSceneCameraView(
  scene: StageScene,
  farScale = 1,
  target = scene.options.targetScene ?? "",
): (StageCameraLook & { readonly environment: StageCameraEnvironment }) | null {
  const published = (
    scene.classState.get(SCENE_CAMERAS) as SceneCameraPublication | undefined
  )?.targets.get(target);
  if (!published) return null;
  const viewport = scene.options.viewport;
  const resized =
    viewport?.[0] !== published.displayBounds?.[0] ||
    viewport?.[1] !== published.displayBounds?.[1];
  if (farScale === 1 && !resized) return published;
  const projection = sceneProjection(published.environment, published.parallel, viewport, farScale);
  return { ...published, projection, viewProjection: multiply(projection, published.view, ENV) };
}

/** Copies a perspective display pose into a scene camera, rebuilding its matrices independently. */
export function stageSceneCameraFromDisplay(
  display: StageCameraEnvironment,
  farScale = 1,
): StageCameraLook & { readonly environment: StageCameraEnvironment } {
  const environment: StageCameraEnvironment = {
    ...display,
    eye: [...display.eye],
    target: [...display.target],
    up: [...display.up],
  };
  const { eye, target, up, rollCode, fovCode, aspect } = environment;
  const effective =
    (rollCode | 0) === 0
      ? up
      : upFromDirection(eye, target, [f(up[0] * 0), up[1], f(up[2] * 0)], rollCode, ENV);
  const view = sceneLookAt(eye, target, effective, ENV);
  const projection = sceneProjection(environment, false, undefined, farScale);
  return {
    environment,
    view,
    projection,
    viewProjection: multiply(projection, view, ENV),
    position: eye,
    target,
    up: effective,
    fovDegrees: f(f(fovCode) * ANGLE_CODE_TO_DEGREES),
    aspect,
    parallel: false,
  };
}

/** Scene camera properties rebuild a centered parallel projection with offsets in the third column. */
function sceneProjection(
  camera: StageCameraEnvironment,
  parallel: boolean,
  viewport: readonly [number, number] | undefined,
  farScale: number,
): Mat4 {
  if (!parallel) return cameraProjection(camera, false, viewport, farScale);
  if (!viewport)
    throw new RangeError("Stage camera: parallel projection requires display dimensions");
  const near = camera.near;
  const far = Math.max(f(camera.far * farScale), f(near + FAR_MINIMUM_GAP));
  const x = f(viewport[0] * 0.5);
  const y = f(viewport[1] * 0.5);
  const projection = orthographic(-x, x, y, -y, near, far);
  projection[2] = camera.offsetX;
  projection[6] = camera.offsetY;
  projection[11] = -f(f(1 / f(far - near)) * near);
  return projection;
}

function cameraProjection(
  camera: StageCameraEnvironment,
  parallel: boolean,
  viewport: readonly [number, number] | undefined,
  farScale: number,
): Mat4 {
  const { near, far, fovCode, aspect, offsetX, offsetY } = camera;
  const farClip = Math.max(f(far * farScale), f(near + FAR_MINIMUM_GAP));
  if (parallel && !viewport)
    throw new RangeError("Stage camera: parallel projection requires display dimensions");
  const projection = parallel
    ? orthographic(0, viewport![0], 0, viewport![1], near, farClip)
    : perspective(
        f(f(f(fovCode) * ANGLE_CODE_TO_DEGREES) * DEGREES_TO_RADIANS),
        aspect,
        near,
        farClip,
        ENV,
      );
  if (parallel) {
    projection[3] = f(projection[3] + offsetX);
    projection[7] = f(projection[7] + offsetY);
  } else {
    projection[2] = offsetX;
    projection[6] = offsetY;
  }
  return projection;
}

function cameraLook(
  environment: StageCameraEnvironment,
  parallel: boolean,
  displayBounds: readonly [number, number] | undefined,
  farScale: number,
  viewport?: StageCameraViewport,
): StageCameraLook & { environment: StageCameraEnvironment } {
  const { eye, target, up, rollCode, fovCode, aspect } = environment;
  const effective =
    (rollCode | 0) === 0
      ? up
      : upFromDirection(eye, target, [f(up[0] * 0), up[1], f(up[2] * 0)], rollCode, ENV);
  const view = lookAt(eye, target, effective, ENV);
  const projection = cameraProjection(environment, parallel, displayBounds, farScale);
  return {
    environment,
    viewport,
    view,
    projection,
    viewProjection: multiply(projection, view, ENV),
    position: eye,
    target,
    up: effective,
    fovDegrees: f(f(fovCode) * ANGLE_CODE_TO_DEGREES),
    aspect,
    parallel,
  };
}

/** Evaluates one camera node, including cameras nested below another camera. */
export function stageCameraNodeView(
  node: StageNode,
  aspect: number,
  offsetX = 0,
  offsetY = 0,
  roll = 0,
  farScale = 1,
  environment?: StageCameraEnvironment,
): StageCameraLook & { readonly environment: StageCameraEnvironment } {
  const scene = node.scene;
  const g = scene.graph;
  const at = node.record!.settings!;
  const word = (i: number) => g.u32(at + i * 4);
  const value = (i: number) => g.f32(at + i * 4);
  const retained = word(1) !== 0 && (node.record!.flags & 0x80000000) === 0;
  if (retained && !environment)
    throw new RangeError("Stage camera: retained camera requires the incoming display environment");
  const projectionKind = word(2);
  if (projectionKind > 1) throw new RangeError(`Stage camera: projection mode ${projectionKind}`);
  const vector = (element: number): Vec3 => {
    const component = nthElement<MatrixElement>(node, 100, element);
    if (!component) throw new RangeError("Stage camera: missing matrix component");
    return translation(component.matrix);
  };
  const world = node.world;
  const moved = (v: Vec3): Vec3 =>
    word(11) !== 0
      ? v
      : [f(f(v[0]) + f(world[12])), f(f(v[1]) + f(world[13])), f(f(v[2]) + f(world[14]))];
  const state = node.extension as StageCameraState;
  const playback = nthElement<CameraElement>(node, 600, 0);
  const animation = playback?.animation();
  const sample = animation?.sample(playback!.frame, world);
  let position = sample?.eye ?? moved(vector(1));
  let target = sample?.target ?? moved(vector(2));
  if (!sample && position.every((v, i) => v === target[i])) {
    position = moved(referenced(node, 17, vector(1)));
    target = moved(referenced(node, 20, vector(2)));
  }
  let up = sample?.up ?? upFromDirection(position, target, [0, 1, 0], null, ENV);
  const cameraRoll = state.roll;
  let rollCode =
    value(0) >= 0 ? Math.trunc(f(wrapDegrees(cameraRoll, ENV) * DEGREES_TO_ANGLE_CODE)) : roll;
  let fovCode = sample?.fovCode ?? state.fovCode;
  let { near, far } = state;
  let cameraAspect = state.aspect ?? aspect;
  if (retained) {
    let initial: CameraPose;
    if (animation) initial = animation.sample(0, world);
    else {
      const inverse = new Float32Array(16);
      inverseAffine(world, inverse);
      const local = transformRetainedCamera({ eye: position, target, up, fovCode }, inverse);
      initial = transformRetainedCamera(local, world);
    }
    const delta = (current: Vec3, original: Vec3, incoming: Vec3): Vec3 =>
      current.map((value, i) => f(f(value - original[i]) + incoming[i])) as Vec3;
    position = delta(position, initial.eye, environment!.eye);
    target = delta(target, initial.target, environment!.target);
    up = delta(up, initial.up, environment!.up);
    fovCode = (fovCode + environment!.fovCode - initial.fovCode) | 0;
    near = environment!.near;
    far = environment!.far;
    cameraAspect = environment!.aspect;
    rollCode = environment!.rollCode;
    offsetX = environment!.offsetX;
    offsetY = environment!.offsetY;
  }
  if ((projectionKind === 0 && (fovCode === 0 || near <= 0)) || far <= near)
    throw new RangeError("Stage camera: field of view or depth range");
  const published: StageCameraEnvironment = {
    eye: position,
    target,
    up,
    fovCode,
    near,
    far,
    aspect: cameraAspect,
    rollCode,
    offsetX,
    offsetY,
  };
  return cameraLook(
    published,
    projectionKind === 1,
    scene.options.viewport,
    farScale,
    stageCameraViewport(node),
  );
}
