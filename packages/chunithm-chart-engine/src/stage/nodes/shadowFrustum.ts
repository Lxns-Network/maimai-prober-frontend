import { invert } from "../camera/inverse";
import type { Mat4, Vec3 } from "../camera/math";

const f = Math.fround;
const CORNERS: readonly Vec3[] = [
  [1, 1, 0],
  [1, -1, 0],
  [-1, 1, 0],
  [-1, -1, 0],
  [1, 1, 1],
  [1, -1, 1],
  [-1, 1, 1],
  [-1, -1, 1],
];
const FACES = [
  [0, 1, 2],
  [0, 1, 4],
  [0, 2, 4],
  [7, 6, 5],
  [7, 6, 3],
  [7, 5, 3],
] as const;

/** Builds the six inward-facing planes of a native scene's clip-space frustum. */
export function shadowFrustumPlanes(viewProjection: Mat4): number[][] {
  const inverse = invert(viewProjection);
  const center = [0, 0, 0];
  const points = CORNERS.map(([x, y, z]) => {
    const transform = (row: number) =>
      f(
        f(f(f(inverse[row + 1] * y) + f(inverse[row] * x)) + f(inverse[row + 2] * z)) +
          inverse[row + 3],
      );
    const reciprocal = f(1 / transform(12));
    return [0, 4, 8].map((row, axis) => {
      const value = f(transform(row) * reciprocal);
      const finite = Number.isFinite(value) ? value : 0;
      center[axis] = f(center[axis] + finite);
      return finite;
    });
  });
  for (let axis = 0; axis < 3; axis++) center[axis] = f(center[axis] * 0.125);
  return FACES.map(([first, second, third]) => {
    const a = points[first];
    let b = points[second];
    let c = points[third];
    const normal = () => {
      const bx = f(b[0] - a[0]);
      const by = f(b[1] - a[1]);
      const bz = f(b[2] - a[2]);
      const cx = f(c[0] - a[0]);
      const cy = f(c[1] - a[1]);
      const cz = f(c[2] - a[2]);
      return [f(f(cz * by) - f(cy * bz)), f(f(cx * bz) - f(cz * bx)), f(f(cy * bx) - f(cx * by))];
    };
    let n = normal();
    const side = f(
      f(f(f(center[1] - a[1]) * n[1]) + f(f(center[0] - a[0]) * n[0])) +
        f(f(center[2] - a[2]) * n[2]),
    );
    if (side < 0) {
      [b, c] = [c, b];
      n = normal();
    }
    const length = f(Math.sqrt(f(f(f(n[0] * n[0]) + f(n[1] * n[1])) + f(n[2] * n[2]))));
    const inv = f(1 / length);
    n = n.map((value) => f(value * inv));
    return [n[0], n[1], n[2], -f(f(f(n[1] * a[1]) + f(n[0] * a[0])) + f(n[2] * a[2]))];
  });
}
