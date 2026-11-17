import { createSortDepthCamera, type SortDepthCamera } from "../render/sortDepth";

export interface FieldFrame {
  readonly barPositions?: Float32Array;
  /** Camera view matrix as the scene stores it (row-major, the reference's cameraA). */
  readonly view: ArrayLike<number>;
  /** Camera projection matrix (the reference's cameraB). */
  readonly projection: ArrayLike<number>;
  /** View times projection in the reference order, as the scene stores it. */
  readonly viewProjection: ArrayLike<number>;
  readonly environment: { readonly fpcw: number; readonly mxcsr: number };
  /** The wall position selected for this frame (0..16). */
  readonly wallRawId: number;
  /** Whether the field mask is drawn: false when a stage is shown instead. */
  readonly maskShown: boolean;
  /** Selected field-divider option and the stage's line-color row. */
  readonly dividerRow: number;
  readonly dividerColor: number;
}

export function fieldFrameDepths(frame: FieldFrame): SortDepthCamera {
  return createSortDepthCamera(frame.view, frame.projection, frame.environment);
}

export function primitiveDepth(
  depths: SortDepthCamera,
  sortPosition: ArrayLike<number>,
  sortDistanceOffset: number,
): number {
  return depths.primitive(sortPosition, sortDistanceOffset);
}

export function modelDepth(
  depths: SortDepthCamera,
  world3x4: ArrayLike<number>,
  sortDistanceOffset: number,
): number {
  return depths.model(world3x4, sortDistanceOffset);
}
