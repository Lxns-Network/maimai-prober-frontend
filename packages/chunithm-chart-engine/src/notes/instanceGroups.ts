/** A model drawn as an instanced group: its members are submitted in batches, nearest first. */
export interface InstanceGroup {
  /** Bounds centre (x, y, z) and radius, in a member's own space. */
  readonly sphere: readonly [number, number, number, number];
  /** Members per batch; a group with more members submits several batches in admission order. */
  readonly capacity: number;
}

const f = Math.fround;
const PROBE_STEP = new Float32Array(new Uint32Array([0x3f350bf3]).buffer)[0];

/**
 * Distance from the camera to a member's bounds, by which a batch orders its members.
 *
 * The bounds centre is carried through the member's twelve-float row-major placement, and so is a
 * probe one step along each axis from it; the radius is scaled by how far the probe moved. Every
 * step rounds to binary32, so equal inputs order identically.
 */
export function memberDistance(
  placement: ArrayLike<number>,
  group: InstanceGroup,
  camera: ArrayLike<number>,
): number {
  const [cx, cy, cz, radius] = group.sphere;
  const m = placement;
  const qx = f(cx + PROBE_STEP);
  const qy = f(cy + PROBE_STEP);
  const qz = f(cz + PROBE_STEP);
  const x = f(f(f(f(m[0] * cx) + f(m[1] * cy)) + f(m[2] * cz)) + m[3]);
  const y = f(f(f(f(m[4] * cx) + f(m[5] * cy)) + f(m[6] * cz)) + m[7]);
  const z = f(f(f(f(m[8] * cx) + f(m[9] * cy)) + f(m[10] * cz)) + m[11]);
  const px = f(f(f(f(m[0] * qx) + f(m[1] * qy)) + f(m[2] * qz)) + m[3]);
  const py = f(f(f(f(m[4] * qx) + f(m[5] * qy)) + f(m[6] * qz)) + m[7]);
  const pz = f(f(f(f(m[8] * qx) + f(m[9] * qy)) + f(m[10] * qz)) + m[11]);
  const sx = f(x - px);
  const sy = f(y - py);
  const sz = f(z - pz);
  const scale = f(Math.sqrt(f(f(f(sx * sx) + f(sy * sy)) + f(sz * sz))));
  const dx = f(x - camera[0]);
  const dy = f(y - camera[1]);
  const dz = f(z - camera[2]);
  return f(f(Math.sqrt(f(f(f(dx * dx) + f(dy * dy)) + f(dz * dz)))) - f(scale * radius));
}
