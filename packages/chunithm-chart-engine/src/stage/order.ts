import type { StageNode } from "./runtime";

const f = Math.fround;
const ROOT_LAYER = 5;

/** The signed layer byte a node orders by: its record's layer, or its parent's when the record leaves it unset. */
export function stageNodeLayer(node: StageNode): number {
  if (!node.record) return ROOT_LAYER;
  const layer = node.record.layer;
  if (layer !== -1) return (layer << 24) >> 24;
  return node.parent ? stageNodeLayer(node.parent) : ROOT_LAYER;
}

/** The 16-bit order key of a node's draws: a 2D flag, the layer, and the biased priority byte. */
export function stageDrawKey(node: StageNode): number {
  let layer = stageNodeLayer(node);
  let key = 0;
  if (layer < 0) layer = ROOT_LAYER;
  if (layer !== 0) key |= 0x8000;
  key |= ((layer & 255) << 8) & 0x7f00;
  const priority = node.record ? node.record.priority : 0;
  return key | ((priority + 0x80) & 255);
}

/**
 * The sort depth of a draw at the translation of its joint: the joint position through the row-major
 * `view` (translation in its fourth column), offset in view depth, then through the third row of
 * the row-major `projection`.
 */
export function stageModelDepth(
  joint: ArrayLike<number>,
  view: ArrayLike<number>,
  projection: ArrayLike<number>,
  offset: number,
): number {
  const x = joint[12];
  const y = joint[13];
  const z = joint[14];
  const a = view;
  const b = projection;
  const q0 = f(f(f(f(a[1] * y) + f(a[0] * x)) + f(a[2] * z)) + a[3]);
  const q1 = f(f(f(f(a[5] * y) + f(a[4] * x)) + f(a[6] * z)) + a[7]);
  const q2 = f(f(f(f(a[9] * y) + f(a[8] * x)) + f(a[10] * z)) + a[11]);
  const q3 = f(f(f(f(a[13] * y) + f(a[12] * x)) + f(a[14] * z)) + a[15]);
  const depth = f(offset + q2);
  return f(f(f(f(b[9] * q1) + f(b[8] * q0)) + f(b[10] * depth)) + f(b[11] * q3));
}

/** One queued draw. */
export interface StageOrderEntry {
  readonly key: number;
  readonly depth: number;
}

export type StageSortMode = 3 | 5 | 6;

/** A pass's entries in draw order: stable, by depth (3), by key (5), or by key then far to near (6). */
export function sortStagePass<T extends StageOrderEntry>(
  entries: readonly T[],
  mode: StageSortMode,
): T[] {
  return entries.slice().sort((a, b) => {
    let compare = mode === 3 ? a.depth - b.depth : a.key - b.key;
    if (!compare && mode === 6) compare = b.depth - a.depth;
    return compare;
  });
}

/** The default passes in submission order: pass index, primitive type it takes, and sort mode. */
export const STAGE_PASSES: readonly { readonly index: number; readonly sort: StageSortMode }[] = [
  { index: 4, sort: 5 },
  { index: 8, sort: 3 },
  { index: 12, sort: 3 },
  { index: 16, sort: 6 },
  { index: 24, sort: 5 },
];

/** The default pass of a mesh from its runtime flags and order key; null when no default pass takes it. */
export function stageMeshPass(flags: number, userId: number, key: number): number | null {
  let type = flags & 0x20 ? 2 : flags & 0x40 ? 1 : 0;
  if (flags & 0x80) type = 3;
  if (flags & 0x2000) type = 4;
  if (userId !== 0) return null;
  if (type < 3) return [8, 12, 16][type];
  if (type === 3) return key < 0x8000 ? 4 : 24;
  return null;
}
