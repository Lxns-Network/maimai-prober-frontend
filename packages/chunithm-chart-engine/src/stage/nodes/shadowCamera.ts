import { sceneLookAt, multiply, type Mat4, type Vec3 } from "../camera/math";
import type { StageCameraLook } from "../view";
import {
  shadowCullProjection,
  shadowFrustumPoints,
  shadowInitialPose,
  shadowLspsmCamera,
  shadowTextureMatrix,
  shadowUniformCamera,
} from "./shadowMath";
import { shadowCascadeCount, type StageShadowSettings } from "./shadowSettings";

const ENV = { fpcw: 0x37f, mxcsr: 0x1f80 };

export interface StageShadowCamera {
  readonly view: Mat4;
  readonly projection: Mat4;
  readonly viewProjection: Mat4;
  /** Shadow-scene camera property projection multiplied by its current view. */
  readonly cullViewProjection: Mat4;
  /** Buffer source-camera projection used to sort the selected caster queue. */
  readonly sortProjection: Mat4;
  readonly textureMatrix: Mat4;
}

interface CascadeState {
  radius: number;
  pose: { position: Vec3; target: Vec3; up: Vec3 } | null;
  view: Mat4 | null;
}

/** The source-backed camera calculations for one persistent directional-shadow light. */
export function createStageShadowCameras() {
  const cascades: CascadeState[] = [];
  const updateCascade = (
    index: number,
    settings: StageShadowSettings,
    source: StageCameraLook,
    direction: Vec3,
    casters: readonly (readonly [number, number, number, number])[],
  ): StageShadowCamera => {
    const state = (cascades[index] ??= { radius: 0, pose: null, view: null });
    const near = settings.cascadeDepths[index];
    const far = settings.cascadeDepths[index + 1];
    let view: Mat4;
    let projection: Mat4;
    let cullProjection: Mat4;
    let sortProjection: Mat4;
    if (index === 0 && settings.type === 1) {
      const points = shadowFrustumPoints(
        source.view,
        source.fovDegrees,
        source.aspect,
        near,
        far,
        direction,
        settings.length,
      );
      const pose = shadowInitialPose(
        points,
        casters,
        source.position,
        source.target,
        source.up,
        direction,
        settings.length,
      );
      const changed =
        !state.pose ||
        (["position", "target", "up"] as const).some((key) =>
          pose[key].some((value, axis) => value !== state.pose![key][axis]),
        );
      const initialView =
        changed || !state.view ? sceneLookAt(pose.position, pose.target, pose.up, ENV) : state.view;
      const initialProjection = shadowCullProjection(...pose.ortho);
      const warped = shadowLspsmCamera(
        points,
        casters,
        initialView,
        source.position,
        source.target,
        direction,
        pose.up,
        1,
        1,
      );
      view = warped?.view ?? initialView;
      projection = warped?.projection ?? initialProjection;
      cullProjection = initialProjection;
      sortProjection = source.projection;
      state.pose = pose;
      state.view = view;
    } else {
      const uniform = shadowUniformCamera(
        source.view,
        source.projection,
        source.parallel,
        near,
        far,
        direction,
        settings.length,
        settings.width,
        settings.height,
        state.radius,
      );
      state.radius = uniform.radius;
      view = uniform.view;
      projection = uniform.projection;
      cullProjection = uniform.cullProjection;
      sortProjection = uniform.sourceProjection;
    }
    return {
      view,
      projection,
      viewProjection: multiply(projection, view, ENV),
      cullViewProjection: multiply(cullProjection, view, ENV),
      sortProjection,
      textureMatrix: shadowTextureMatrix(view, projection),
    };
  };
  return {
    resize(count: number) {
      cascades.length = count;
    },
    updateCascade,
    update(
      settings: StageShadowSettings,
      source: StageCameraLook,
      direction: Vec3,
      casters: readonly (readonly [number, number, number, number])[],
    ): StageShadowCamera[] {
      const count = shadowCascadeCount(settings.cascadeCount);
      cascades.length = count;
      return Array.from({ length: count }, (_, index) =>
        updateCascade(index, settings, source, direction, casters),
      );
    },
  };
}
