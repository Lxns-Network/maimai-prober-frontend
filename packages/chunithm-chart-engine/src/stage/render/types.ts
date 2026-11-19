import type { StageCameraViewport } from "../view";
import type { StageDrawCamera } from "../camera/scopes";
import type { StageScene, StageNode } from "../runtime";
import type { StageLighting } from "../nodes/lights";
import type { StageWind } from "../nodes/wind";
import type { EffectDrawContext } from "../../effects/render";
import type { FrameFieldEffects } from "../../render/frameTypes";
import type { StageReflection } from "../nodes/reflection";
import type { StageShadowLight } from "../nodes/shadow";
import type { StageShadowCamera } from "../nodes/shadowCamera";
import type { StageShadowFrame } from "./stageShadowFrame";
import type { StageReflectionFrame } from "./stageReflectionFrame";

/** Row-major target-scene camera matrices (translation in the fourth column). */
export interface StageFrameCamera {
  readonly viewport?: StageCameraViewport;
  readonly view: ArrayLike<number>;
  readonly projection: ArrayLike<number>;
  readonly viewProjection: ArrayLike<number>;
  readonly cullViewProjection?: ArrayLike<number>;
  readonly position: ArrayLike<number>;
}

export interface StageFrame {
  readonly scene: StageScene;
  readonly role: "base" | "field";
  readonly camera: StageFrameCamera;
  /** Instance-manager source camera, independent of a shadow or reflection render camera. */
  readonly instanceCamera?: StageFrameCamera;
  /** Named manager cameras before shadow/reflection draw-camera transforms. */
  readonly instanceCameras?: ReadonlyMap<string, StageFrameCamera>;
  /** Traversal membership and display cameras for CPU geometry; queued draws use the target-scene camera. */
  readonly cameraScopes?: ReadonlyMap<StageNode, StageDrawCamera>;
  readonly lighting: StageLighting;
  /** Shared wind publication and its independent graphics clock, in 60 Hz frame units. */
  readonly wind?: { readonly state: StageWind; readonly graphicsClock: number };
  /** Holds back the front 2D pass: `StageDrawStats.finish` draws it later, after the post filters. */
  readonly deferFront?: boolean;
  /** The capture-filter environment writes opaque model alpha before fixed-function testing. */
  readonly captureAlpha?: boolean;
  /** Captures the current scene's depth before its translucent effect passes. */
  readonly snapshotDepth?: () => NonNullable<EffectDrawContext["depth"]>;
  readonly fieldEffects?: FrameFieldEffects;
  readonly mirror?: StageReflection;
  readonly shadowPass?: StageShadowLight;
  readonly shadows?: readonly StageShadowFrame[];
  readonly reflections?: readonly StageReflectionFrame[];
  readonly rimMasks?: ReadonlyMap<string, WebGLTexture>;
}

export interface StageDrawStats {
  draws: number;
  /** Draws the held-back front 2D pass into the bound target and returns its draw count. */
  finish?: () => number;
  /** Shapes left out, with the reason. */
  readonly skipped: Map<string, string>;
}

export interface StageShadowQueue {
  readonly skipped: Map<string, string>;
  readonly casterSpheres: readonly (readonly [number, number, number, number])[];
  /** Draws the selected queue with the final camera into the currently bound target. */
  draw(camera: StageFrameCamera): StageDrawStats;
}

export interface StageRenderer {
  draw(frame: StageFrame): StageDrawStats;
  prepareShadow(frame: StageFrame, camera: StageShadowCamera): StageShadowQueue;
  dispose(): void;
}
