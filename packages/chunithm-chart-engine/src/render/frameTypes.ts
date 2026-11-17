import type { FloatEnv, Vec3 } from "../stage/camera/math";
import type { StageCameraEnvironment } from "../stage/view";

export interface FramePresentation {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
  /** Advances whenever something outside the caller's own state may have touched the context. */
  readonly executionSequence: number;
  markResourcesUnknown(): void;
  markExternalBindingsUnknown(): void;
}

export interface FrameDepth {
  readonly texture: WebGLTexture;
  readonly sampler: WebGLSampler;
}

export interface FrameDrawContext {
  /** The depth snapshot once one has been taken this frame; null before that. */
  readonly depth: FrameDepth | null;
}

export interface FrameDraw {
  readonly pass: number;
  readonly key: number;
  readonly depth: number;
  /** Opt-in for passes from 16 on: the host copies the default framebuffer's depth first. */
  readonly requiresDepthSnapshot?: boolean;
  /**
   * The renderer the draw belongs to. Consecutive draws of one source share an execution sequence;
   * any other draw, or the depth snapshot, between them advances it.
   */
  readonly source?: object;
  draw(context: FrameDrawContext): { draws: number };
}

export interface FrameCamera {
  readonly stageEnvironment?: StageCameraEnvironment;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly cameraA: number[];
  readonly cameraB: number[];
  readonly viewProjection: Float32Array;
}

export interface FrameCameraEvaluation {
  readonly stageEnvironment?: StageCameraEnvironment;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly view: ArrayLike<number>;
  readonly projection: ArrayLike<number>;
  readonly viewProjection: ArrayLike<number>;
  readonly eye: Vec3;
  readonly up: Vec3;
}

export interface FrameEnvironment {
  readonly fpcw: number;
  readonly mxcsr: number;
}

export interface FrameExternalFrame {
  readonly entries: readonly FrameDraw[];
  readonly notes: number;
}

export type FrameExternalRenderer = (input: {
  seconds: number;
  speedRow: number;
  speedMultiplier?: number;
  playbackRate?: number;
  playbackEpoch?: number;
  camera: FrameCamera;
  environment: FloatEnv;
}) => FrameExternalFrame;

export type FrameBackgroundRenderer = (
  seconds: number,
  presentation: FramePresentation,
  resetHistory: boolean,
) => boolean;

/** What the page and its overlays need from the frame: the camera, the presentation, and the hooks. */
export interface FrameSurface {
  readonly speedOptions: readonly { readonly value: string; readonly label: string }[];
  readCamera(): FrameCamera;
  readEffectCamera(): { position: Vec3; up: Vec3 };
  withPresentation<T>(action: (presentation: FramePresentation) => T): T;
  setBackgroundRenderer(renderer: FrameBackgroundRenderer | null): void;
  setExternalNoteRenderer(renderer: FrameExternalRenderer | null): void;
}

export interface FrameRender {
  readonly draws: number;
  readonly notes: number;
  /** Whether the background renderer drew this frame. */
  readonly backgroundDrawn: boolean;
}

export interface FrameHost extends FrameSurface {
  /** Invalidates temporal background effects after a seek or scrub, including a seek to the same time. */
  resetBackgroundHistory(): void;
  /** Uses music time for the background and, when supplied, chart time for notes and effects. Chart time may be negative before the first note. */
  render(
    seconds: number,
    speedRow: number,
    chartSeconds?: number,
    speedMultiplier?: number,
    playbackRate?: number,
  ): FrameRender;
  /** Draws owned by the page for the current frame, placed before the external draws. */
  setScenery(
    scenery:
      | ((
          camera: FrameCamera,
          seconds: number,
          speedRow: number,
          speedMultiplier: number,
        ) => readonly FrameDraw[])
      | null,
  ): void;
  dispose(): void;
}

export interface FrameHostOptions {
  readonly canvas: HTMLCanvasElement;
  readonly environment: FrameEnvironment;
  readonly speedOptions: readonly { readonly value: string; readonly label: string }[];
  /** The play camera for a canvas size; the page caches it per size. */
  evaluateCamera(width: number, height: number): FrameCameraEvaluation;
}
