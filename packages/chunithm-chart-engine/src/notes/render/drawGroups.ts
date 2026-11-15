/**
 * Draw grouping and ordering for note instances.
 *
 * Legacy sorts each pass by a single u16 key plus a float depth, with the comparison chosen per pass:
 * an opaque pass draws far-to-near by depth, the trance pass draws by key descending and then depth
 * descending, and the 2D passes draw by key alone. The key packs the model layer into bits 8–14 and
 * the width priority into bits 0–7, so "key ascending" means a narrower note first inside a layer.
 *
 * Instancing has to reproduce that order, because instances that share a mesh and material but differ
 * in blend state overlap, and the result depends on which is submitted first. Grouping is therefore
 * the submission order, not a post-hoc sort: instances are bucketed by key and the buckets are emitted
 * in key order, with members ordered by depth as the pass requires. Equal keys keep arrival order,
 * which is the legacy object order.
 *
 * The ordering runs every frame, so it is written against caller-owned storage: `orderInstances`
 * sorts into a preallocated index array with a preallocated merge buffer and writes the group
 * boundaries into preallocated columns, allocating nothing.
 */

/** Sort behaviours the passes use, matching the reference's modes. */
export type PassSortMode =
  /** Depth ascending: far to near. */
  | "depthAscending"
  /** Depth descending: near to far. */
  | "depthDescending"
  /** Key ascending, then depth descending. */
  | "keyAscending"
  /** Key descending, then depth descending. */
  | "keyDescending";

/**
 * The u16 sort key: bit 15 of the order's initial key, the layer in bits 8–14 and the width
 * priority in bits 0–7.
 */
export function sortKey(initialKey: number, layer: number, widthPriority: number): number {
  if (!Number.isInteger(initialKey) || initialKey < 0 || initialKey > 0xffff)
    throw new RangeError(`An initial sort key is an integer in 0..0xffff, got ${initialKey}`);
  if (!Number.isInteger(layer) || layer < 0 || layer > 255)
    throw new RangeError(`A draw layer is an integer in 0..255, got ${layer}`);
  if (!Number.isInteger(widthPriority) || widthPriority < 0 || widthPriority > 255)
    throw new RangeError(`A width priority is an integer in 0..255, got ${widthPriority}`);
  return (initialKey & 0x8000) | ((layer << 8) & 0x7f00) | widthPriority;
}

/** One instance's ordering inputs. */
export interface GroupedInstance {
  /** The u16 sort key from {@link sortKey}. */
  key: number;
  /** Camera-space depth; the pass decides which way it orders. */
  depth: number;
}

/** A contiguous run of instances sharing one key, in draw order. */
export interface DrawGroup {
  /** The shared sort key. */
  key: number;
  /** Index into the instance order where this group's instances begin. */
  first: number;
  /** Number of instances in the group. */
  count: number;
}

/**
 * Caller-owned storage for one pass's ordering.
 *
 * Sized once from the instance capacity, because the frame path may not allocate: the ordering runs
 * per pass per frame and an allocation here would land inside a frame.
 */
export interface GroupOrderState {
  /** Instance indices in submission order, valid up to the count the ordering returned. */
  readonly order: Int32Array;
  /** Merge buffer the sort alternates with `order`; contents are not meaningful to callers. */
  readonly scratch: Int32Array;
  /** Index into `order` where each group begins. */
  readonly groupStarts: Int32Array;
  /** The key each group shares. */
  readonly groupKeys: Int32Array;
}

export function createGroupOrder(capacity: number): GroupOrderState {
  if (!Number.isInteger(capacity) || capacity <= 0)
    throw new RangeError(`Group order capacity must be a positive integer, got ${capacity}`);
  return {
    order: new Int32Array(capacity),
    scratch: new Int32Array(capacity),
    groupStarts: new Int32Array(capacity),
    groupKeys: new Int32Array(capacity),
  };
}

/** Whether a mode orders by key before depth at all. */
const ordersByKey = (mode: PassSortMode): boolean =>
  mode === "keyAscending" || mode === "keyDescending";

/**
 * Orders instances into groups for one pass, writing into `state`.
 *
 * Returns the group count; group `g` covers `order[groupStarts[g]]` .. `order[groupStarts[g+1]]`
 * (the last running to `count`), all sharing `groupKeys[g]`. Groups are runs of equal key in the
 * sorted order, which for a depth-only mode means the same key can open more than one group — the
 * grouping follows the submission order, not the key set.
 *
 * The sort is a bottom-up merge sort rather than `Array#sort`: it needs no comparator closure and no
 * temporary array, and because the comparison ends in an index tiebreak it is a total order, so the
 * result is stable by construction instead of by the engine's grace.
 */
export function orderInstances(
  keys: Int32Array,
  depths: Float64Array,
  count: number,
  mode: PassSortMode,
  state: GroupOrderState,
): number {
  if (count < 0 || count > state.order.length)
    throw new RangeError(`Ordering ${count} instances exceeds the ${state.order.length} slots`);
  if (keys.length < count || depths.length < count)
    throw new RangeError(`Ordering ${count} instances needs ${count} keys and depths`);

  const { order, scratch, groupStarts, groupKeys } = state;
  for (let i = 0; i < count; i++) order[i] = i;

  const byKey = ordersByKey(mode);
  const keyDescending = mode === "keyDescending";
  const depthDescending = mode !== "depthAscending";

  /** Negative when `a` must precede `b`; a total order, so the sort is stable on its own. */
  const before = (a: number, b: number): boolean => {
    if (byKey) {
      const ka = keys[a];
      const kb = keys[b];
      if (ka !== kb) return keyDescending ? ka > kb : ka < kb;
    }
    const da = depths[a];
    const db = depths[b];
    if (da !== db) return depthDescending ? da > db : da < db;
    // Equal on every compared field: arrival order decides, exactly as the reference's stable
    // comparison did.
    return a < b;
  };

  // Bottom-up merge sort, alternating between `order` and `scratch`. Each level is one linear pass,
  // so the run costs no allocation and no recursion.
  let source = order;
  let target = scratch;
  for (let width = 1; width < count; width *= 2) {
    for (let start = 0; start < count; start += width * 2) {
      const middle = Math.min(start + width, count);
      const end = Math.min(start + width * 2, count);
      let left = start;
      let right = middle;
      for (let at = start; at < end; at++) {
        if (left >= middle) target[at] = source[right++];
        else if (right >= end) target[at] = source[left++];
        else target[at] = before(source[right], source[left]) ? source[right++] : source[left++];
      }
    }
    const swap = source;
    source = target;
    target = swap;
  }
  // An odd number of levels leaves the result in the scratch buffer; move it back with a plain
  // element loop. `order.set(source.subarray(0, count))` would read better and costs nothing in a
  // timing run, but `subarray` allocates a small view object per call — the same defect that had to
  // be removed from the active set's insertion sort. Only heap sampling shows it.
  if (source !== order) for (let i = 0; i < count; i++) order[i] = source[i];

  let groups = 0;
  let at = 0;
  while (at < count) {
    const key = keys[order[at]];
    let end = at + 1;
    while (end < count && keys[order[end]] === key) end++;
    groupStarts[groups] = at;
    groupKeys[groups] = key;
    groups++;
    at = end;
  }
  return groups;
}

/**
 * Re-batches a sorted span so each mesh's instances are adjacent, when the mesh pattern repeats.
 *
 * A note model's parts are separate meshes, and the note layer emits one instance per (record, mesh)
 * — in record order. So a span of instances at one sort position reads `m0, m1, m2, m0, m1, m2, …`,
 * which no contiguous-run batching can merge: every mesh appears once per record and the draws end up
 * tracking the instance count.
 *
 * Every instance in `[from, to)` shares a sort position (the caller passes one group's span), so
 * reordering *within* it is not observable: the reference does the same, merging a whole
 * equal-`(key, depth, pass)` span by mesh rather than only runs whose meshes happen to be adjacent.
 * Where the span is not such a repeat — a different model, a different depth, or a ragged pattern —
 * the order is left exactly as the sort produced it.
 *
 * `meshOrder[i]` is the mesh's position inside its own model's mesh list, which is what makes a
 * record's parts a strictly increasing run and a record boundary detectable.
 */
export function rebatchByMesh(
  order: Int32Array,
  from: number,
  to: number,
  modelOf: (slot: number) => string,
  depthOf: (slot: number) => number,
  meshOrderOf: (slot: number) => number,
  target: Int32Array,
): { count: number; batched: boolean } {
  const span = to - from;
  if (span <= 1) {
    if (span === 1) target[0] = order[from];
    return { count: span, batched: false };
  }

  // The span is re-batched only as a whole, so it first has to be one model at one depth.
  const firstSlot = order[from];
  const model = modelOf(firstSlot);
  const depth = depthOf(firstSlot);
  for (let i = from; i < to; i++) {
    const slot = order[i];
    if (modelOf(slot) !== model || depthOf(slot) !== depth) {
      for (let k = from; k < to; k++) target[k - from] = order[k];
      return { count: span, batched: false };
    }
  }

  // Split into records: a record's meshes increase, so a value that does not increase starts one.
  // While doing so, check every record carries the same mesh list in the same order.
  let blockStart = from;
  let patternLength = 0;
  let blocks = 0;
  for (let i = from; i <= to; i++) {
    const endsBlock = i === to || (i > from && meshOrderOf(order[i]) <= meshOrderOf(order[i - 1]));
    if (!endsBlock) continue;
    const length = i - blockStart;
    if (blocks === 0) patternLength = length;
    else if (length !== patternLength) {
      for (let k = from; k < to; k++) target[k - from] = order[k];
      return { count: span, batched: false };
    }
    // The i-th block's j-th mesh must be the same mesh as the first block's j-th.
    if (blocks > 0)
      for (let j = 0; j < length; j++)
        if (meshOrderOf(order[blockStart + j]) !== meshOrderOf(order[from + j])) {
          for (let k = from; k < to; k++) target[k - from] = order[k];
          return { count: span, batched: false };
        }
    blocks++;
    blockStart = i;
  }
  // One block is already its own batching; nothing to gain and no order to change.
  if (blocks <= 1 || patternLength === 0) {
    for (let k = from; k < to; k++) target[k - from] = order[k];
    return { count: span, batched: false };
  }

  // Emit by mesh position: every block's first mesh, then every block's second, and so on. This is
  // the same set of draws in the same sort position, regrouped so each mesh is drawn once.
  let written = 0;
  for (let j = 0; j < patternLength; j++)
    for (let block = 0; block < blocks; block++)
      target[written++] = order[from + block * patternLength + j];
  return { count: written, batched: true };
}

/**
 * Materialises the ordering as group objects.
 *
 * Allocates, so it is for tests and offline probes rather than the frame path; the renderer calls
 * {@link orderInstances} and reads the group columns directly.
 */
export function buildGroups(
  instances: readonly GroupedInstance[],
  order: Int32Array,
  mode: PassSortMode,
): DrawGroup[] {
  if (order.length < instances.length)
    throw new RangeError(
      `Instance order buffer holds ${order.length} but ${instances.length} instances were given`,
    );
  const count = instances.length;
  const keys = new Int32Array(count);
  const depths = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    keys[i] = instances[i].key;
    depths[i] = instances[i].depth;
  }
  const state = createGroupOrder(Math.max(1, count));
  const groups = orderInstances(keys, depths, count, mode, state);
  // The caller owns `order`, so the sorted indices are copied across rather than the state's.
  for (let i = 0; i < count; i++) order[i] = state.order[i];
  const out: DrawGroup[] = [];
  for (let g = 0; g < groups; g++) {
    const first = state.groupStarts[g];
    const end = g + 1 < groups ? state.groupStarts[g + 1] : count;
    out.push({ key: state.groupKeys[g], first, count: end - first });
  }
  return out;
}

/** Layer stored in a sort key, for reporting. */
export const layerOf = (key: number): number => (key >> 8) & 0x7f;
/** Width priority stored in a sort key, for reporting. */
export const priorityOf = (key: number): number => key & 0xff;
