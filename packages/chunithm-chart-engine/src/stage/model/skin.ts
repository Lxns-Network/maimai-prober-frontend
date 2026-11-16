import type { StageModel, StageShape } from "../pack";
import { stageProviderNodes } from "./providers";

const f = Math.fround;
const BLEND_WEIGHTS = 1;
const SECOND_BLEND_WEIGHTS = 2;

const bitsView = new DataView(new ArrayBuffer(4));
const asFloat = (word: number) => (
  bitsView.setUint32(0, word >>> 0, true),
  bitsView.getFloat32(0, true)
);

function words(
  fields: StageModel["nodes"][number]["fields"],
  key: string,
  length: number,
): number[] {
  const value = fields[key] as { words?: number[] } | undefined;
  if (!value?.words || value.words.length !== length)
    throw new RangeError(`Stage model node: ${key}`);
  return value.words.map(asFloat);
}

function reference(fields: StageModel["nodes"][number]["fields"], key: string): number {
  const value = fields[key] as { ref?: number } | undefined;
  if (typeof value?.ref !== "number") throw new RangeError(`Stage model node: ${key}`);
  return value.ref;
}

/** Row-major 3x4 product `a × b`, rounding each product and pairwise sum. */
export function composeAffine(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  out: Float32Array,
): Float32Array {
  for (let row = 0; row < 12; row += 4)
    for (let col = 0; col < 4; col++)
      out[row + col] = f(
        f(f(a[row + 3] * (col === 3 ? 1 : 0)) + f(a[row + 2] * b[col + 8])) +
          f(f(a[row + 1] * b[col + 4]) + f(a[row] * b[col])),
      );
  return out;
}

/** The row-major 3x4 local matrix of a translation, unit-free quaternion and scale. */
export function providerLocal(
  t: readonly number[],
  q: readonly number[],
  s: readonly number[],
  out: Float32Array = new Float32Array(12),
): Float32Array {
  const xx = f(q[0] * q[0]),
    yy = f(q[1] * q[1]),
    zz = f(q[2] * q[2]);
  const yx = f(q[1] * q[0]),
    zy = f(q[2] * q[1]),
    xz = f(q[0] * q[2]);
  const wz = f(q[3] * q[2]),
    wx = f(q[3] * q[0]),
    wy = f(q[3] * q[1]);
  // Keep the native rounding at each product and sum without allocating intermediate arrays.
  out[0] = f(f(1 - f(f(zz + yy) * 2)) * s[0]);
  out[1] = f(f(f(yx - wz) * 2) * s[1]);
  out[2] = f(f(f(xz + wy) * 2) * s[2]);
  out[3] = t[0];
  out[4] = f(f(f(yx + wz) * 2) * s[0]);
  out[5] = f(f(1 - f(f(xx + zz) * 2)) * s[1]);
  out[6] = f(f(f(zy - wx) * 2) * s[2]);
  out[7] = t[1];
  out[8] = f(f(f(xz - wy) * 2) * s[0]);
  out[9] = f(f(f(zy + wx) * 2) * s[1]);
  out[10] = f(f(1 - f(f(yy + xx) * 2)) * s[2]);
  out[11] = t[2];
  return out;
}

/** Writes the inverse of a row-major 3x4 affine matrix into `out`; uses identity rotation near singularity. */
export function invertAffine(m: ArrayLike<number>, out = new Float32Array(12)): Float32Array {
  const a = m[0],
    b = m[1],
    c = m[2],
    tx = m[3];
  const d = m[4],
    e = m[5],
    h = m[6],
    ty = m[7];
  const g = m[8],
    j = m[9],
    k = m[10],
    tz = m[11];
  const determinant = f(
    f(f(f(f(a * e) * k) + f(f(b * h) * g)) + f(f(c * d) * j)) - f(f(a * h) * j),
  );
  const det = f(f(determinant - f(f(d * b) * k)) - f(f(c * e) * g));
  if (Math.abs(det) > 1.1920928955078125e-7) {
    const reciprocal = f(1 / det);
    out[0] = f(f(f(k * e) - f(j * h)) * reciprocal);
    out[1] = f(f(f(j * c) - f(k * b)) * reciprocal);
    out[2] = f(f(f(h * b) - f(e * c)) * reciprocal);
    out[4] = f(f(f(g * h) - f(k * d)) * reciprocal);
    out[5] = f(f(f(k * a) - f(g * c)) * reciprocal);
    out[6] = f(f(f(d * c) - f(h * a)) * reciprocal);
    out[8] = f(f(f(j * d) - f(g * e)) * reciprocal);
    out[9] = f(f(f(g * b) - f(j * a)) * reciprocal);
    out[10] = f(f(f(e * a) - f(d * b)) * reciprocal);
  } else {
    out.fill(0);
    out[0] = out[5] = out[10] = 1;
  }
  for (let row = 0; row < 12; row += 4)
    out[row + 3] = f(f(-f(out[row] * tx) - f(out[row + 1] * ty)) - f(out[row + 2] * tz));
  return out;
}

/**
 * The rest pose of a model's nodes: each node's local matrix from its translation, rotation and
 * scale under its parent's world, in node order.
 */
export function restPose(model: StageModel): Float32Array[] {
  const providers = stageProviderNodes(model);
  const byName = new Map(
    providers.map((index) => [model.nodes[index].fields._name as string, index]),
  );
  const byRef = new Map(model.nodes.map((node) => [node.ref, node]));
  const worlds: Float32Array[] = new Array(model.nodes.length);
  for (const index of providers) {
    const node = model.nodes[index];
    const local = providerLocal(
      words(node.fields, "_translation", 3),
      words(node.fields, "_quaternion", 4),
      words(node.fields, "_scale", 3),
    );
    const parentRef = reference(node.fields, "_parent");
    const parentNode = byRef.get(parentRef);
    const parent = parentRef === 0 ? -1 : (byName.get(parentNode?.fields._name as string) ?? -2);
    if (parent === -2 || (parent >= 0 && !worlds[parent]))
      throw new RangeError("Stage model node: parent order");
    worlds[index] = parent < 0 ? local : composeAffine(worlds[parent], local, new Float32Array(12));
  }
  model.nodes.forEach((node, index) => {
    worlds[index] = worlds[byName.get(node.fields._name as string)!];
  });
  return worlds;
}

/** How a skinned shape binds to its model's nodes. */
export interface StageShapeSkin {
  /** Node index of each bone, in blend index order. */
  readonly bones: readonly number[];
  /** Row-major 3x4 bind matrix of each bone. */
  readonly binds: readonly Float32Array[];
  /** Model node whose provider world adjusts the mesh joint, or null when not used. */
  readonly adjustment: number | null;
  /** Influences per vertex: two, or four with the second weight set. */
  readonly influences: 2 | 4;
}

/** Reads the ordered target names stored on a shape's joint provider. */
function stageShapeBoneNames(shape: StageShape): string[] | null {
  if (!shape.layout.some((element) => element.semantic === BLEND_WEIGHTS)) return null;
  const raw = (shape.fields._blendTargetName as { raw?: string } | undefined)?.raw;
  if (raw === undefined) throw new RangeError(`Stage skin ${shape.name}: no blend targets`);
  const bytes = Uint8Array.from(raw.match(/../g) ?? [], (h) => parseInt(h, 16));
  const view = new DataView(bytes.buffer);
  const count = view.getUint32(0, true);
  const out: string[] = [];
  let at = 4;
  for (let i = 0; i < count; i++) {
    const length = view.getUint16(at, true);
    at += 2;
    let end = at + length;
    while (end > at && bytes[end - 1] === 0) end--;
    out.push(String.fromCharCode(...bytes.subarray(at, end)));
    at += length;
  }
  return out;
}

/** The skin of a shape with blend weights, or null for a rigid shape. */
export function stageShapeSkin(model: StageModel, shape: StageShape): StageShapeSkin | null {
  const targetNames = stageShapeBoneNames(shape);
  if (targetNames === null) return null;
  const providers = stageProviderNodes(model);
  const byName = new Map<string, { node: number; provider: number; bindNode: number }>();
  const providerByName = new Map(
    providers.map((node, provider) => [
      model.nodes[node].fields._name as string,
      { node, provider },
    ]),
  );
  model.nodes.forEach((node, bindNode) => {
    const name = node.fields._fullName;
    if (typeof name !== "string" || byName.has(name))
      throw new RangeError(`Stage skin ${shape.name}: ambiguous node name`);
    byName.set(name, { ...providerByName.get(node.fields._name as string)!, bindNode });
  });
  const meshBind = words(shape.fields, "_meshBindMatrix", 12);
  const targets = targetNames.map((name) => {
    const found = byName.get(name);
    if (found === undefined) throw new RangeError(`Stage skin ${shape.name}: bone ${name}`);
    return found;
  });
  const bones = targets.map((target) => target.node);
  const binds = targets.map(({ bindNode }) =>
    composeAffine(
      words(model.nodes[bindNode].fields, "_mtxBind", 12),
      meshBind,
      new Float32Array(12),
    ),
  );
  let adjustment: number | null = null;
  if (bones.length >= 32) {
    let first = Infinity;
    for (const target of targets) first = Math.min(first, target.provider);
    adjustment = first === 0 || first >= 0xffffff ? null : providers[first];
  }
  return {
    bones,
    binds,
    adjustment,
    influences: shape.layout.some((e) => e.semantic === SECOND_BLEND_WEIGHTS) ? 4 : 2,
  };
}

/** The mesh joint used by a skinned draw before forming its palette. */
export function skinMeshWorld(
  skin: StageShapeSkin,
  worlds: readonly Float32Array[],
  meshWorld: Float32Array,
): Float32Array {
  return skin.adjustment !== null
    ? composeAffine(meshWorld, worlds[skin.adjustment], new Float32Array(12))
    : meshWorld;
}

/** Writes mesh-local rows `(inverse(meshWorld) × boneWorld) × bind`; optional work buffers must be distinct. */
export function skinPalette(
  skin: StageShapeSkin,
  worlds: readonly Float32Array[],
  meshWorld: Float32Array,
  out: Float32Array,
  inverseMesh = invertAffine(meshWorld),
  relative = new Float32Array(12),
  result = new Float32Array(12),
): void {
  for (let i = 0; i < skin.bones.length; i++) {
    const bone = skin.bones[i];
    composeAffine(inverseMesh, worlds[bone], relative);
    composeAffine(relative, skin.binds[i], result);
    out.set(result, i * 12);
  }
}
