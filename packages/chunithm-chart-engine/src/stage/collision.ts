import type { CollisionElement } from "./elements";
import type { StageNode, StageScene } from "./runtime";

interface CollisionQuery {
  evaluate(node: StageNode): void;
}

interface CollisionState {
  readonly shapes: CollisionElement[];
  pending: { readonly query: CollisionQuery; readonly node: StageNode }[];
}

const KEY = "collision";
const f = Math.fround;

/** Shares the collision registry and callback queue of synchronized scene files. */
export function bindStageCollisions(scenes: readonly StageScene[]): void {
  const shared: CollisionState = { shapes: [], pending: [] };
  for (const scene of scenes) {
    if (scene.classState.has(KEY)) throw new Error("Stage collision: scenes were already updated");
    scene.classState.set(KEY, shared);
  }
}

function sphereDistance(a: Float32Array, b: Float32Array): number {
  const x = f(b[0] - a[0]);
  const y = f(b[1] - a[1]);
  const z = f(b[2] - a[2]);
  return f(Math.sqrt(f(f(f(y * y) + f(x * x)) + f(z * z))));
}

function planeDistance(point: Float32Array, plane: Float32Array): number {
  let nx = plane[4];
  let ny = plane[5];
  let nz = plane[6];
  const squared = f(f(f(nx * nx) + f(ny * ny)) + f(nz * nz));
  if (Math.abs(squared) >= f(0.0000001) && Math.abs(f(squared - 1)) >= f(0.0000001)) {
    const inverse = f(1 / f(Math.sqrt(squared)));
    nx = f(nx * inverse);
    ny = f(ny * inverse);
    nz = f(nz * inverse);
  }
  return Math.abs(
    f(
      f(f(f(point[0] - plane[0]) * nx) + f(f(point[1] - plane[1]) * ny)) +
        f(f(point[2] - plane[2]) * nz),
    ),
  );
}

function planesDistance(a: Float32Array, b: Float32Array): number {
  const dot = f(f(f(a[5] * b[5]) + f(a[4] * b[4])) + f(a[6] * b[6]));
  return Math.abs(f(Math.abs(dot) - 1)) < f(0.0000001) ? planeDistance(b, a) : 0;
}

function state(scene: StageScene): CollisionState {
  let collision = scene.classState.get(KEY) as CollisionState | undefined;
  if (!collision) {
    collision = { shapes: [], pending: [] };
    scene.classState.set(KEY, collision);
  }
  return collision;
}

/** Registers an element for collision queries in its scene. */
export function registerCollisionShape(scene: StageScene, element: CollisionElement): void {
  state(scene).shapes.push(element);
}

/** Removes a previously registered collision element. */
export function unregisterCollisionShape(scene: StageScene, element: CollisionElement): void {
  if (!element.registered) return;
  const shapes = state(scene).shapes;
  const index = shapes.indexOf(element);
  if (index < 0) throw new Error("Stage collision: registered shape is missing");
  shapes.splice(index, 1);
  element.registered = false;
}

/** Enqueues a query for the next callback phase. */
export function enqueueCollisionQuery(
  scene: StageScene,
  query: CollisionQuery,
  node: StageNode,
): void {
  state(scene).pending.push({ query, node });
}

/** Cancels a motion's pending callbacks before that motion is destroyed. */
export function cancelCollisionQueries(scene: StageScene, query: CollisionQuery): void {
  const collision = scene.classState.get(KEY) as CollisionState | undefined;
  if (collision) collision.pending = collision.pending.filter((entry) => entry.query !== query);
}

/** Runs queued collision callbacks in the executable's last-in-first-out order. */
export function runCollisionQueries(scene: StageScene): void {
  const collision = scene.classState.get(KEY) as CollisionState | undefined;
  if (!collision) return;
  while (collision.pending.length) {
    const { query, node } = collision.pending.pop()!;
    query.evaluate(node);
  }
}

/** Tests a sphere or plane against registered spheres and planes in the requested groups. */
export function collisionHit(scene: StageScene, element: CollisionElement, mask: number): boolean {
  if ((element.hitMask & mask) !== 0) return true;
  const a = element.world!;
  for (const other of state(scene).shapes) {
    if (other === element || !(other.group & mask)) continue;
    const b = other.world!;
    const hit =
      element.kind === 1
        ? other.kind === 3 && b[4] >= planeDistance(b, a)
        : other.kind === 1
          ? a[4] >= planeDistance(a, b)
          : f(a[4] + b[4]) >= sphereDistance(a, b);
    if (hit) {
      other.hitMask |= element.group;
      return true;
    }
  }
  return false;
}

/** Returns the nearest supported shape distance, or -1 when no group matches. */
export function collisionDistance(
  scene: StageScene,
  element: CollisionElement,
  mask: number,
): number {
  const a = element.world!;
  let nearest = -1;
  for (const other of state(scene).shapes) {
    if (other === element || !(other.group & mask)) continue;
    const b = other.world!;
    const distance =
      element.kind === 1
        ? other.kind === 1
          ? planesDistance(a, b)
          : f(planeDistance(b, a) - b[4])
        : other.kind === 1
          ? f(planeDistance(a, b) - a[4])
          : f(sphereDistance(a, b) - f(a[4] + b[4]));
    if (nearest < 0 || nearest > distance) nearest = Math.max(distance, 0);
  }
  return nearest;
}

/** The side of the first matching plane, or zero when no plane matches. */
export function collisionPlaneSide(
  scene: StageScene,
  element: CollisionElement,
  mask: number,
): number {
  const point = element.world!;
  for (const other of state(scene).shapes) {
    if (other === element || !(other.group & mask) || other.kind !== 1) continue;
    const plane = other.world!;
    const x = f(point[0] - plane[0]);
    const y = f(point[1] - plane[1]);
    const z = f(point[2] - plane[2]);
    const dot = f(f(f(plane[5] * y) + f(plane[4] * x)) + f(plane[6] * z));
    return dot > 0 ? 1 : -1;
  }
  return 0;
}
