export interface DrawGroupElement {
  key: number;
}

/** 将有符号 16 位的层级与组内序号编码为 32 位无符号排序键。 */
export function drawGroupKey(layer: number, order: number): number {
  return (((layer + 32768) << 16) | ((order + 32768) & 0xffff)) >>> 0;
}

/** 原地非稳定排序；同键元素的最终相对顺序取决于完整输入序列。 */
export function sortDrawGroup<T extends DrawGroupElement>(items: T[]): void {
  const swap = (a: number, b: number) => {
    const value = items[a];
    items[a] = items[b];
    items[b] = value;
  };
  const sortThree = (a: number, b: number, c: number) => {
    if (items[b].key < items[a].key) swap(a, b);
    if (items[c].key < items[b].key) swap(b, c);
    if (items[b].key < items[a].key) swap(a, b);
  };
  const heapSort = (first: number, count: number) => {
    const adjust = (hole: number, length: number, value: T) => {
      const top = hole;
      let child = hole * 2 + 2;
      while (child < length) {
        if (items[first + child].key < items[first + child - 1].key) child--;
        items[first + hole] = items[first + child];
        hole = child;
        child = hole * 2 + 2;
      }
      if (child === length) {
        items[first + hole] = items[first + child - 1];
        hole = child - 1;
      }
      let parent = Math.floor((hole - 1) / 2);
      while (hole > top && items[first + parent].key < value.key) {
        items[first + hole] = items[first + parent];
        hole = parent;
        parent = Math.floor((hole - 1) / 2);
      }
      items[first + hole] = value;
    };
    for (let parent = Math.floor(count / 2) - 1; parent >= 0; parent--) {
      adjust(parent, count, items[first + parent]);
    }
    while (count > 1) {
      const value = items[first + --count];
      items[first + count] = items[first];
      adjust(0, count, value);
    }
  };
  const sort = (first: number, end: number, ideal: number): void => {
    while (end - first >= 32) {
      if (ideal <= 0) {
        heapSort(first, end - first);
        return;
      }
      const last = end - 1;
      const middle = first + Math.floor((last - first) / 2);
      if (last - first > 64) {
        const step = Math.floor((last - first) / 8);
        sortThree(first, first + step, first + 2 * step);
        sortThree(middle - step, middle, middle + step);
        sortThree(last - 2 * step, last - step, last);
        sortThree(first + step, middle, last - step);
      } else {
        sortThree(first, middle, last);
      }
      swap(middle, last);
      const pivot = items[last].key;
      let i = first - 1;
      let j = last;
      let p = first - 1;
      let q = last;
      for (;;) {
        do i++;
        while (items[i].key < pivot && i !== last);
        do j--;
        while (pivot < items[j].key && j !== first);
        if (i >= j) break;
        swap(i, j);
        if (items[i].key === pivot) swap(++p, i);
        if (items[j].key === pivot) swap(--q, j);
      }
      swap(i, last);
      let leftEnd = i - 1;
      let rightStart = i + 1;
      for (let k = first; k < p; k++) swap(k, leftEnd--);
      for (let k = last - 1; k > q; k--) swap(k, rightStart++);
      const halfIdeal = Math.floor(ideal / 2);
      ideal = halfIdeal + Math.floor(halfIdeal / 2);
      const leftSize = leftEnd + 1 - first;
      const rightSize = end - rightStart;
      if (leftSize < rightSize) {
        sort(first, leftEnd + 1, leftSize);
        first = rightStart;
      } else {
        sort(rightStart, end, rightSize);
        end = leftEnd + 1;
      }
    }
    for (let i = first + 1; i < end; i++) {
      for (let j = i; j > first && items[j].key < items[j - 1].key; j--) swap(j, j - 1);
    }
  };
  sort(0, items.length, items.length);
}
