import table from "./tables/sort.json";
import { fround } from "./float32";

const P = table.parameters;
const C = table.constants;
const L = table.fields;

export const BPM_SORT_STRIDE: number = P.stride;

export interface SortRange {
  first?: number;
  last?: number;
  ideal?: number;
}

function positionLess(left: DataView, right: DataView): boolean {
  const a = fround(
    fround(left.getFloat32(L.position0, true) * C.positionMultiplier) +
      left.getFloat32(L.position4, true),
  );
  const b = fround(
    fround(right.getFloat32(L.position0, true) * C.positionMultiplier) +
      right.getFloat32(L.position4, true),
  );
  return b > fround(a + C.comparisonTolerance);
}

export function sortPositionRecords(
  records: DataView,
  stride: number,
  range: SortRange = {},
): void {
  const S = stride;
  if (records.byteLength % S || records.byteLength > 0x7fffffff)
    throw new TypeError("排序记录跨度必须是步长的倍数且不超过有符号 32 位");
  const count = records.byteLength / S;
  const first = range.first ?? 0;
  const last = range.last ?? count;
  const ideal = range.ideal ?? last - first;
  if (
    !Number.isInteger(first) ||
    !Number.isInteger(last) ||
    first < 0 ||
    last < first ||
    last > count
  )
    throw new RangeError("排序区间非法");
  if (!Number.isInteger(ideal) || ideal < -0x80000000 || ideal > 0x7fffffff)
    throw new RangeError("排序深度必须是有符号 32 位整数");
  for (let i = first; i < last; ++i) {
    if (
      !Number.isFinite(records.getFloat32(i * S + L.position0, true)) ||
      !Number.isFinite(records.getFloat32(i * S + L.position4, true))
    )
      throw new RangeError("排序键包含非有限值");
  }
  const bytes = new Uint8Array(records.buffer, records.byteOffset, records.byteLength);
  const view = (i: number) => new DataView(records.buffer, records.byteOffset + i * S, S);
  const snapshot = (i: number) => bytes.slice(i * S, (i + 1) * S);
  const put = (i: number, value: Uint8Array) => bytes.set(value, i * S);
  const copy = (to: number, from: number) => bytes.copyWithin(to * S, from * S, (from + 1) * S);
  function swap(a: number, b: number): void {
    const value = snapshot(a);
    copy(a, b);
    put(b, value);
  }
  function cmp(a: number | Uint8Array, b: number | Uint8Array): boolean {
    const left = typeof a === "number" ? view(a) : new DataView(a.buffer, a.byteOffset, S);
    const right = typeof b === "number" ? view(b) : new DataView(b.buffer, b.byteOffset, S);
    return positionLess(left, right);
  }

  function median3(a: number, b: number, c: number): void {
    if (cmp(b, a)) swap(b, a);
    if (cmp(c, b)) {
      swap(c, b);
      if (cmp(b, a)) swap(b, a);
    }
  }

  function pivot(lo: number, mid: number, hi: number): void {
    if (hi - lo > P.pivotLastIndexLimit) {
      const step = (hi - lo + 1) >> P.pivotStepShift;
      median3(lo, lo + step, lo + step * 2);
      median3(mid - step, mid, mid + step);
      median3(hi - step * 2, hi - step, hi);
      median3(lo + step, mid, hi - step);
    } else median3(lo, mid, hi);
  }

  function partition(lo: number, hi: number): [number, number] {
    const mid = lo + ((hi - lo) >> P.depthHalfShift);
    pivot(lo, mid, hi - 1);
    let pfirst = mid;
    let plast = mid + 1;
    while (lo < pfirst && !cmp(pfirst - 1, pfirst) && !cmp(pfirst, pfirst - 1)) --pfirst;
    while (plast < hi && !cmp(plast, pfirst) && !cmp(pfirst, plast)) ++plast;
    let gfirst = plast;
    let glast = pfirst;
    for (;;) {
      for (; gfirst < hi; ++gfirst) {
        if (cmp(pfirst, gfirst)) continue;
        if (cmp(gfirst, pfirst)) break;
        if (plast++ !== gfirst) swap(plast - 1, gfirst);
      }
      for (; lo < glast; --glast) {
        if (cmp(glast - 1, pfirst)) continue;
        if (cmp(pfirst, glast - 1)) break;
        if (--pfirst !== glast - 1) swap(pfirst, glast - 1);
      }
      if (glast === lo && gfirst === hi) return [pfirst, plast];
      if (glast === lo) {
        if (plast !== gfirst) swap(pfirst, plast);
        ++plast;
        swap(pfirst++, gfirst++);
      } else if (gfirst === hi) {
        if (--glast !== --pfirst) swap(glast, pfirst);
        swap(pfirst, --plast);
      } else swap(gfirst++, --glast);
    }
  }

  function moveBackward(lo: number, hi: number, end: number): void {
    while (lo !== hi) copy(--end, --hi);
  }

  function insertion(lo: number, hi: number): void {
    for (let at = lo + 1; at < hi; ++at) {
      const value = snapshot(at);
      if (cmp(value, lo)) {
        moveBackward(lo, at, at + 1);
        put(lo, value);
      } else {
        let hole = at;
        let prev = at - 1;
        while (cmp(value, prev)) {
          copy(hole, prev);
          hole = prev--;
        }
        put(hole, value);
      }
    }
  }

  function pushHeap(lo: number, hole: number, top: number, value: Uint8Array): void {
    for (
      let parent = Math.trunc((hole - 1) / (1 << P.heapParentShift));
      top < hole && cmp(lo + parent, value);
      parent = Math.trunc((hole - 1) / (1 << P.heapParentShift))
    ) {
      copy(lo + hole, lo + parent);
      hole = parent;
    }
    put(lo + hole, value);
  }

  function descend(lo: number, hole: number, size: number, value: Uint8Array): void {
    const top = hole;
    const lastParent = Math.trunc((size - 1) / (1 << P.heapParentShift));
    while (hole < lastParent) {
      let child = hole * 2 + 2;
      if (cmp(lo + child, lo + child - 1)) --child;
      copy(lo + hole, lo + child);
      hole = child;
    }
    if (hole === lastParent && (size & P.heapParityMask) === 0) {
      copy(lo + hole, lo + size - 1);
      hole = size - 1;
    }
    pushHeap(lo, hole, top, value);
  }

  function makeHeap(lo: number, hi: number): void {
    const size = hi - lo;
    if (size < P.minimumSortCount) return;
    for (let at = size >> P.heapParentShift; at > 0; ) {
      --at;
      descend(lo, at, size, snapshot(lo + at));
    }
  }

  function sortHeap(lo: number, hi: number): void {
    while (hi - lo >= P.minimumSortCount) {
      --hi;
      const value = snapshot(hi);
      copy(hi, lo);
      descend(lo, 0, hi - lo, value);
    }
  }

  function sort(lo: number, hi: number, depth: number): void {
    while (hi - lo > P.insertionLimit) {
      if (depth <= 0) {
        makeHeap(lo, hi);
        sortHeap(lo, hi);
        return;
      }
      const [a, b] = partition(lo, hi);
      const half = depth >> P.depthHalfShift;
      depth = half + (half >> P.depthQuarterShift);
      if (a - lo < hi - b) {
        sort(lo, a, depth);
        lo = b;
      } else {
        sort(b, hi, depth);
        hi = a;
      }
    }
    if (hi - lo >= P.minimumSortCount) insertion(lo, hi);
  }

  sort(first, last, ideal);
}
