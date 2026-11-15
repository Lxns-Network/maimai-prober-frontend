import type { EffectFrame } from "../../effects/render";
import { stageModelDepth } from "../order";
import type { StageShadowFrame } from "./stageShadowFrame";
import type { StageParticleFrame } from "./stageParticles";
import type { StageCameraViewport } from "../view";
import { stageViewportRegion } from "./stageViewport";

/** Captures one submission camera so later queue sorting cannot replace its shader or depth inputs. */
export function stageEffectFrame(
  camera: {
    readonly view: ArrayLike<number>;
    readonly projection: ArrayLike<number>;
    readonly viewProjection: ArrayLike<number>;
    readonly position?: ArrayLike<number>;
    readonly viewport?: StageCameraViewport;
  },
  viewport: { readonly width: number; readonly height: number },
  frame: Pick<StageParticleFrame, "scene" | "cameraScopes" | "mirror"> & {
    readonly shadow?: StageShadowFrame;
    readonly fog?: EffectFrame["fog"] | null;
  },
): EffectFrame {
  const joint = new Float32Array(16);
  const [x, y, width, height] = stageViewportRegion(
    frame.cameraScopes ? camera.viewport : undefined,
    frame.scene.options.viewport,
    viewport.width,
    viewport.height,
  );
  return {
    viewport: { width, height },
    depthUvTransform: [
      width / viewport.width,
      height / viewport.height,
      x / viewport.width,
      y / viewport.height,
    ],
    viewProjection: camera.viewProjection,
    projection: camera.projection,
    eyePosition: camera.position ?? [0, 0, 0],
    mirror: !!frame.mirror,
    fog: frame.fog ?? undefined,
    shadow: frame.shadow && {
      matrices: frame.shadow.cameras.map((camera) => camera.textureMatrix),
      textures: frame.shadow.textures,
      moments: frame.shadow.moments,
      color: frame.shadow.light.color,
      edgeHide: frame.shadow.light.settings.edgeHide,
      softness: frame.shadow.light.settings.softness,
    },
    depth: {
      primitive(position, offset) {
        joint[12] = position[0];
        joint[13] = position[1];
        joint[14] = position[2];
        return stageModelDepth(joint, camera.view, camera.projection, offset);
      },
      model(world, offset) {
        joint[12] = world[3];
        joint[13] = world[7];
        joint[14] = world[11];
        return stageModelDepth(joint, camera.view, camera.projection, offset);
      },
    },
  };
}
