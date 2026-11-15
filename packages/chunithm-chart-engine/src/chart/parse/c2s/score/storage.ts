import { LAYOUT, STORES, type StoreSpec } from "./tables";

export class Vec<T> {
  items: T[] = [];
  cap = 0;
}

export interface NoteRecord {
  view: DataView;
  vectors: Record<string, Vec<DataView>>;
}

export function growth(cap: number, need: number, max: number): number {
  if (cap > max - (cap >>> 1)) return need;
  const geometric = cap + (cap >>> 1);
  return geometric < need ? need : geometric;
}

export function push<T>(
  vec: Vec<T>,
  item: T,
  max: number,
  onReallocate?: (vec: Vec<T>) => void,
): void {
  if (vec.items.length === vec.cap) {
    vec.cap = growth(vec.cap, vec.items.length + 1, max);
    onReallocate?.(vec);
  }
  vec.items.push(item);
}

export const blob = (size: number): DataView => new DataView(new ArrayBuffer(size));

export const cloneView = (v: DataView): DataView =>
  new DataView(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));

export const subView = (v: DataView, offset: number, size: number): DataView =>
  new DataView(v.buffer, v.byteOffset + offset, size);

export function applyStores(
  view: DataView,
  stores: readonly StoreSpec[],
  extra: Record<string, number> = {},
): void {
  for (const s of stores) {
    const value = s.from ? extra[s.from] : s.value;
    if (value === undefined) throw new Error(`构造参数 ${s.from} 缺失`);
    if (s.size === 1) view.setUint8(s.offset, value);
    else if (s.size === 4) view.setUint32(s.offset, value >>> 0, true);
    else throw new Error("不支持的字段宽度");
  }
}

export function newNote(): NoteRecord {
  const view = blob(LAYOUT.note.size);
  applyStores(view, STORES.noteConstructor);
  const vectors: Record<string, Vec<DataView>> = {};
  for (const o of Object.keys(LAYOUT.note.vectors)) vectors[o] = new Vec();
  return { view, vectors };
}

export function copyNote(n: NoteRecord): NoteRecord {
  const vectors: Record<string, Vec<DataView>> = {};
  for (const [o, v] of Object.entries(n.vectors)) {
    const c = new Vec<DataView>();
    c.items = v.items.map(cloneView);
    c.cap = v.items.length;
    vectors[o] = c;
  }
  return { view: cloneView(n.view), vectors };
}
