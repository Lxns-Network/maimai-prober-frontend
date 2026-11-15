import type { StageLight } from "./lights";

const TYPE_ID: Record<StageLight["kind"], number> = {
  ambient: 0xeb7d358d,
  hemisphere: 0x06fe71c2,
  parallel: 0x03c73c1e,
  point: 0xd9b8a319,
  rim: 0x5eb5b73b,
  fog: 0x00a09e3e,
};

/** Sorts the supported same-priority lights as the native material provider does. */
export function sortStageLights(lights: StageLight[], initialBudget = lights.length): void {
  const less = (a: StageLight, b: StageLight) => TYPE_ID[a.kind] < TYPE_ID[b.kind];
  const swap = (a: number, b: number) => {
    [lights[a], lights[b]] = [lights[b], lights[a]];
  };
  const median = (first: number, middle: number, last: number) => {
    if (less(lights[middle], lights[first])) swap(middle, first);
    if (less(lights[last], lights[middle])) {
      swap(last, middle);
      if (less(lights[middle], lights[first])) swap(middle, first);
    }
  };
  const partition = (first: number, last: number): [number, number] => {
    const middle = first + Math.floor((last - first) / 2);
    if (last - first - 1 > 40) {
      const step = Math.floor((last - first) / 8);
      median(first, first + step, first + step * 2);
      median(middle - step, middle, middle + step);
      median(last - 1 - step * 2, last - 1 - step, last - 1);
      median(first + step, middle, last - 1 - step);
    } else median(first, middle, last - 1);

    let pivotFirst = middle;
    let pivotLast = middle + 1;
    while (
      first < pivotFirst &&
      !less(lights[pivotFirst - 1], lights[pivotFirst]) &&
      !less(lights[pivotFirst], lights[pivotFirst - 1])
    )
      pivotFirst--;
    while (
      pivotLast < last &&
      !less(lights[pivotLast], lights[pivotFirst]) &&
      !less(lights[pivotFirst], lights[pivotLast])
    )
      pivotLast++;
    let upper = pivotLast;
    let lower = pivotFirst;
    for (;;) {
      for (; upper < last; upper++) {
        if (less(lights[pivotFirst], lights[upper])) continue;
        if (less(lights[upper], lights[pivotFirst])) break;
        if (pivotLast !== upper) swap(pivotLast, upper);
        pivotLast++;
      }
      for (; first < lower; lower--) {
        const previous = lower - 1;
        if (less(lights[previous], lights[pivotFirst])) continue;
        if (less(lights[pivotFirst], lights[previous])) break;
        if (--pivotFirst !== previous) swap(pivotFirst, previous);
      }
      if (lower === first && upper === last) return [pivotFirst, pivotLast];
      if (lower === first) {
        if (pivotLast !== upper) swap(pivotFirst, pivotLast);
        pivotLast++;
        swap(pivotFirst++, upper++);
      } else if (upper === last) {
        if (--lower !== --pivotFirst) swap(lower, pivotFirst);
        swap(pivotFirst, --pivotLast);
      } else swap(upper++, --lower);
    }
  };
  sortLightEntries(lights, less, initialBudget, partition);
}

function sortLightHeap(
  lights: StageLight[],
  first: number,
  last: number,
  less: (a: StageLight, b: StageLight) => boolean,
): void {
  const adjust = (root: number, count: number, value: StageLight) => {
    const start = root;
    const bottom = Math.floor((count - 1) / 2);
    while (root < bottom) {
      const right = root * 2 + 2;
      const child = less(lights[first + right], lights[first + right - 1]) ? right - 1 : right;
      lights[first + root] = lights[first + child];
      root = child;
    }
    if (root === bottom && count % 2 === 0) {
      lights[first + root] = lights[first + count - 1];
      root = count - 1;
    }
    while (root > start) {
      const parent = Math.floor((root - 1) / 2);
      if (!less(lights[first + parent], value)) break;
      lights[first + root] = lights[first + parent];
      root = parent;
    }
    lights[first + root] = value;
  };
  const count = last - first;
  for (let root = Math.floor(count / 2) - 1; root >= 0; root--)
    adjust(root, count, lights[first + root]);
  for (let size = count; size > 1; ) {
    const value = lights[first + --size];
    lights[first + size] = lights[first];
    adjust(0, size, value);
  }
}

function sortLightEntries(
  lights: StageLight[],
  less: (a: StageLight, b: StageLight) => boolean,
  budget: number,
  partition: (first: number, last: number) => [number, number],
): void {
  const sort = (start: number, end: number, initialIdeal: number): void => {
    let first = start;
    let last = end;
    let ideal = initialIdeal;
    while (last - first > 32) {
      if (ideal <= 0) {
        sortLightHeap(lights, first, last, less);
        return;
      }
      const [low, high] = partition(first, last);
      ideal = Math.floor(ideal / 2) + Math.floor(ideal / 4);
      if (low - first < last - high) {
        sort(first, low, ideal);
        first = high;
      } else {
        sort(high, last, ideal);
        last = low;
      }
    }
    for (let i = first + 1; i < last; i++) {
      const value = lights[i];
      let at = i;
      while (at > first && less(value, lights[at - 1])) {
        lights[at] = lights[at - 1];
        at--;
      }
      lights[at] = value;
    }
  };
  sort(0, lights.length, budget);
}
