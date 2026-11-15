export interface EffectMotion {
  readonly offset: number;
  readonly type: number;
  readonly ordinal: number;
  readonly start: number;
  readonly end: number;
  readonly data: number | null;
}

export interface EffectState {
  readonly offset: number;
  readonly id: number;
  readonly flags: number;
  readonly coordinateMode: number;
  readonly previousState: number;
  readonly nextState: number;
  readonly motions: readonly EffectMotion[];
}

export interface EffectElement {
  readonly offset: number;
  readonly type: number;
  readonly data: number | null;
}

export interface EffectNode {
  readonly offset: number;
  readonly parent: number | null;
  readonly type: number;
  readonly id: number;
  readonly flags: number;
  readonly defaultState: number;
  readonly controller: number;
  readonly settings: number | null;
  readonly elements: readonly EffectElement[];
  readonly states: readonly EffectState[];
  readonly children: readonly number[];
}

export interface EffectChunk {
  readonly tag: string;
  readonly offset: number;
  readonly payload: number;
  readonly end: number;
}

/** An effect resource: its node graph, and its retained bytes addressed by original offsets. */
export interface EffectResource {
  readonly id: number;
  readonly layerIndex: number;
  /** Size of the original resource the offsets address. */
  readonly bytes: number;
  readonly nodes: readonly EffectNode[];
  readonly roots: readonly number[];
  readonly chunks: readonly EffectChunk[];
  u32(offset: number): number;
  i32(offset: number): number;
  f32(offset: number): number;
  /** The relocated target of the pointer stored at `offset`; null for a zero pointer when allowed. */
  pointer(offset: number, nullable?: boolean): number | null;
  read(offset: number, size: number): Uint8Array;
}

interface ContainerIndex {
  source: { id: number; bytes: number; layerIndex: number };
  graph: { nodes: EffectNode[]; roots: number[]; chunks: EffectChunk[]; relocationCount: number };
  spans: { offset: number; length: number; payload: number }[];
  pointers: [number, number][];
}

const MAGIC = "CHUAFB01";

/**
 * Reads a runtime effect container: an 8-byte magic, a u32 index length, a JSON index of the node
 * graph, the retained spans and the relocated pointers, then the spans' bytes back to back.
 */
export function readEffectResource(bytes: Uint8Array): EffectResource {
  const backing = new Uint8Array(bytes);
  const view = new DataView(backing.buffer);
  if (backing.length < 12 || new TextDecoder().decode(backing.subarray(0, 8)) !== MAGIC)
    throw new TypeError("Not a runtime effect container");
  const length = view.getUint32(8, true);
  if (length > backing.length - 12) throw new RangeError("Effect container index out of range");
  const index = JSON.parse(
    new TextDecoder().decode(backing.subarray(12, 12 + length)),
  ) as ContainerIndex;
  const size = index.source.bytes;
  const base = 12 + length;
  let cursor = 0;
  let lastEnd = 0;
  for (const span of index.spans) {
    if (
      span.offset < lastEnd ||
      span.length <= 0 ||
      span.offset + span.length > size ||
      span.payload !== cursor
    )
      throw new RangeError("Effect container spans overlap or leave gaps");
    cursor += span.length;
    lastEnd = span.offset + span.length;
  }
  if (base + cursor !== backing.length) throw new RangeError("Effect container payload length");
  const pointers = new Map(index.pointers);
  if (pointers.size !== index.graph.relocationCount)
    throw new RangeError("Effect container relocation count");
  const spans = index.spans;
  const prefix = spans[0];
  const locate = (offset: number, count: number): number => {
    if (offset < 0 || count < 0 || offset > size - count)
      throw new RangeError(`Effect offset ${offset} outside the resource`);
    if (prefix && prefix.offset === 0 && offset + count <= prefix.length) return base + offset;
    let low = 0;
    let high = spans.length - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const span = spans[mid];
      if (offset < span.offset) high = mid - 1;
      else if (offset >= span.offset + span.length) low = mid + 1;
      else {
        if (count > span.offset + span.length - offset) break;
        return base + span.payload + offset - span.offset;
      }
    }
    throw new RangeError(`Effect offset ${offset} is not retained`);
  };
  const u32 = (offset: number) => view.getUint32(locate(offset, 4), true);
  return {
    id: index.source.id,
    layerIndex: index.source.layerIndex,
    bytes: size,
    nodes: index.graph.nodes,
    roots: index.graph.roots,
    chunks: index.graph.chunks,
    u32,
    i32: (offset) => view.getInt32(locate(offset, 4), true),
    f32: (offset) => view.getFloat32(locate(offset, 4), true),
    pointer(offset, nullable = false) {
      const raw = u32(offset);
      if (nullable && raw === 0 && !pointers.has(offset)) return null;
      const target = pointers.get(offset);
      if (target === undefined)
        throw new RangeError(`Effect pointer at ${offset} is not relocated`);
      return target;
    },
    read(offset, count) {
      const at = locate(offset, count);
      return backing.slice(at, at + count);
    },
  };
}
