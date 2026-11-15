import type { StageModel, StageShape } from "../pack";
import { restPose, skinMeshWorld, stageShapeSkin } from "./skin";
import { skinBounds, skinWorldSphere } from "./skinBounds";

const f = Math.fround;
const EPSILON = 1.1920928955078125e-7;

/** Bootstrap MaxInstancingNum; admission is per native batch, before pass sorting. */
export const STAGE_INSTANCE_CAPACITY = 2048;

/** Published batch bounds, or the bound model's initial draw bounds. */
export interface StageInstanceBounds {
  readonly sphere: Float32Array;
  readonly center: Float32Array;
  readonly size: Float32Array;
  /** Initial bounds retain their mesh joint and their sphere has already passed through it. */
  readonly world?: Float32Array;
}

/** Initial batch draw bounds before its first nondegenerate instance publication. */
export function initialInstanceBounds(model: StageModel, shape: StageShape): StageInstanceBounds {
  const field = (name: string) =>
    new Float32Array(Uint32Array.from((shape.fields[name] as { words: number[] }).words).buffer);
  const worlds = restPose(model);
  const at = model.nodes.findIndex((node) => node.ref === shape.nodeRefs[0]);
  const skin = stageShapeSkin(model, shape);
  const world = skin ? skinMeshWorld(skin, worlds, worlds[at]) : worlds[at];
  const center = field("_boundingBoxCenter");
  const size = field("_boundingBoxSize");
  const bounds = skin && skinBounds(skin, worlds, world, center, size);
  return {
    center: bounds ? bounds.center : center,
    size: bounds ? bounds.size : size,
    sphere: skinWorldSphere(bounds ? bounds.sphere : field("_boundingSphere"), world),
    world,
  };
}

/** A source draw sphere and the model-space matrix that owns it. */
export interface StageInstanceDrawBounds {
  readonly sphere: ArrayLike<number>;
  readonly world: ArrayLike<number>;
}

/** The group sphere selected while registering an instance model's draws. */
export function instanceGroupSphere(draws: readonly StageInstanceDrawBounds[]): Float32Array {
  const result = new Float32Array(4);
  for (const { sphere, world } of draws) {
    const center = [0, 1, 2].map((axis) => {
      const row = axis * 4;
      return f(
        f(
          f(f(world[row] * sphere[0]) + f(world[row + 1] * sphere[1])) +
            f(world[row + 2] * sphere[2]),
        ) + world[row + 3],
      );
    });
    const transformed = [0, 1, 2].map((axis) => {
      const row = axis * 4;
      return f(
        f(f(f(f(world[row] + world[row + 1]) + world[row + 2]) * sphere[3]) + world[row + 3]),
      );
    });
    const radius = f(
      Math.sqrt(
        f(
          f(f(transformed[0] * transformed[0]) + f(transformed[1] * transformed[1])) +
            f(transformed[2] * transformed[2]),
        ),
      ),
    );
    if (radius > result[3]) result.set([...center, radius]);
  }
  return result;
}

/** The native per-instance culling sphere for a row-major world transform. */
export function instanceCullSphere(
  group: ArrayLike<number>,
  world: ArrayLike<number>,
  scale: number,
): Float32Array {
  const center = new Float32Array(3);
  const edge = new Float32Array(3);
  const corner = [0, 1, 2].map((axis) => f(group[axis] + 0.70721358));
  for (let axis = 0; axis < 3; axis++) {
    const row = axis * 4;
    center[axis] = f(
      f(f(f(world[row] * group[0]) + f(world[row + 1] * group[1])) + f(world[row + 2] * group[2])) +
        world[row + 3],
    );
    edge[axis] = f(
      f(
        f(f(world[row] * corner[0]) + f(world[row + 1] * corner[1])) +
          f(world[row + 2] * corner[2]),
      ) + world[row + 3],
    );
  }
  const delta = center.map((value, axis) => f(value - edge[axis]));
  const radius = f(
    f(
      f(Math.sqrt(f(f(f(delta[0] * delta[0]) + f(delta[1] * delta[1])) + f(delta[2] * delta[2])))) *
        group[3],
    ) * scale,
  );
  return Float32Array.of(...center, radius);
}

/** Tests the instance-culling sphere against the native frustum planes. */
export function instanceSphereVisible(
  sphere: ArrayLike<number>,
  planes: readonly (readonly number[])[],
): boolean {
  return (
    planes.length !== 0 &&
    planes.every(([a, b, c, d]) => {
      const dot = f(f(f(sphere[1] * b) + f(sphere[0] * a)) + f(sphere[2] * c));
      return f(f(sphere[3] + d) + dot) > -EPSILON;
    })
  );
}

/** Returns null when native retains the batch draw's previously published bounds. */
export function instanceBatchBounds(
  positions: readonly ArrayLike<number>[],
  groupRadius: number,
  scale: number,
): StageInstanceBounds | null {
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const position of positions)
    for (let axis = 0; axis < 3; axis++) {
      low[axis] = Math.min(low[axis], position[axis]);
      high[axis] = Math.max(high[axis], position[axis]);
    }
  const center = Float32Array.from(low, (value, axis) => f(f(f(high[axis] - value) * 0.5) + value));
  const half = Float32Array.from(high, (value, axis) => f(value - center[axis]));
  const diagonal = f(
    Math.sqrt(f(f(f(half[0] * half[0]) + f(half[1] * half[1])) + f(half[2] * half[2]))),
  );
  if (!(diagonal > EPSILON)) return null;
  const radius = f(f(groupRadius + diagonal) * scale);
  const inverse = f(1 / diagonal);
  const size = Float32Array.from(half, (value) => f(f(f(value * inverse) * 2) * radius));
  return { center, size, sphere: Float32Array.of(...center, radius) };
}
