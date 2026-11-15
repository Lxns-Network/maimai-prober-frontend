import { inverseAffine } from "../../math/matrix";
import type { StageCameraEnvironment } from "../view";

const f = Math.fround;
const OUTLINE = [
  [5, -10],
  [-5, -10],
  [-2, 0],
  [-5, 0],
  [-5, 20],
  [5, 20],
  [5, 15],
  [6.5, 18.5],
  [10, 20],
  [13.5, 18.5],
  [15, 15],
  [13.5, 11.5],
  [10, 10],
  [6.5, 11.5],
  [5, 15],
  [5, 5],
  [6.5, 8.5],
  [10, 10],
  [13.5, 8.5],
  [15, 5],
  [13.5, 1.5],
  [10, 0],
  [6.5, 1.5],
  [5, 5],
  [5, 0],
  [2, 0],
  [5, -10],
];

export interface CameraDebugDraw {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly world: Float32Array;
  /** Packed ARGB colour before conversion into the vertex stream. */
  readonly color: number;
}

/** Native camera-body outlines and near/far frustum lines, without publishing a draw camera. */
export function cameraDebugGeometry(
  view: ArrayLike<number>,
  camera: Pick<StageCameraEnvironment, "fovCode" | "aspect" | "near" | "far">,
  color: number,
  lineColor: number,
): readonly CameraDebugDraw[] {
  const world = new Float32Array(16);
  inverseAffine(
    Float32Array.from({ length: 16 }, (_, i) => view[(i % 4) * 4 + Math.floor(i / 4)]),
    world,
  );
  const draws: CameraDebugDraw[] = [];
  const add = (points: readonly (readonly number[])[], tint: number) => {
    const indices: number[] = [];
    for (let i = 0; i < points.length - 1; i++) indices.push(i, i + 1);
    draws.push({
      positions: Float32Array.from(points.flat()),
      indices: Uint32Array.from(indices),
      world,
      color: tint >>> 0,
    });
  };
  const sides = [3, -3].map((x) => OUTLINE.map(([y, z]) => [x, y, z]));
  for (const side of sides) add(side, color);
  for (let i = 0; i < OUTLINE.length - 2; i++) add([sides[0][i], sides[1][i]], lineColor);
  const radians = f(f(Math.trunc(camera.fovCode / 2)) * 0.0000958738019107841);
  const tangent = f(Math.tan(radians));
  const inverseAspect = f(1 / camera.aspect);
  const planes = [camera.near, camera.far].map((distance, index) => {
    const height = f(tangent * distance),
      width = f(height * inverseAspect);
    const z = index === 0 ? -distance : f(1 - distance);
    return [
      [height, -width, z],
      [height, width, z],
      [-height, width, z],
      [-height, -width, z],
      [height, -width, z],
    ];
  });
  for (const plane of planes) add(plane, color);
  for (let i = 0; i < 4; i++) add([planes[0][i], planes[1][i]], lineColor);
  return draws;
}
