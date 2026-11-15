const MAGIC = "CHSTGR01";
const AFNC_SIGNATURE = 0x77ed9bb9;
const STATE_BYTES = 0x20;

export interface StageMotionRecord {
  readonly offset: number;
  readonly type: number;
  readonly start: number;
  readonly startRange: number;
  readonly length: number;
  readonly lengthRange: number;
  readonly ordinal: number;
  readonly data: number | null;
}

export interface StageStateRecord {
  readonly offset: number;
  readonly index: number;
  readonly id: number;
  readonly flags: number;
  readonly carry: number;
  readonly from: number;
  readonly next: number;
  readonly motions: readonly StageMotionRecord[];
}

export interface StageElementRecord {
  readonly offset: number;
  readonly type: number;
}

export interface StageControllerRecord {
  readonly offset: number;
  readonly type: number;
  readonly parameters: number;
}

export interface StageNodeRecord {
  readonly offset: number;
  readonly index: number;
  readonly parent: StageNodeRecord | null;
  readonly children: readonly StageNodeRecord[];
  readonly type: number;
  readonly id: number;
  readonly flags: number;
  readonly coordinateMode: number;
  readonly translationOnly: number;
  readonly jointIndex: number;
  readonly jointName: number;
  readonly layer: number;
  readonly priority: number;
  readonly drawCoordinateMode: number;
  readonly defaultState: number;
  readonly controller: StageControllerRecord;
  readonly elements: readonly StageElementRecord[];
  readonly states: readonly StageStateRecord[];
  readonly before: readonly StageMotionRecord[] | null;
  readonly after: readonly StageMotionRecord[] | null;
  readonly settings: number | null;
}

/** A scene file's node graph, addressed by the file's own offsets. */
export interface StageGraph {
  readonly size: number;
  readonly nodes: readonly StageNodeRecord[];
  readonly root: StageNodeRecord;
  node(offset: number): StageNodeRecord;
  u32(offset: number): number;
  i32(offset: number): number;
  f32(offset: number): number;
  /** The relocated target of the pointer stored at `offset`; null for an empty pointer. */
  pointer(offset: number): number | null;
  /** Like `pointer`, for a pointer that must be set. */
  target(offset: number): number;
  /** The zero-terminated byte string at `offset`. */
  text(offset: number): string;
}

function fail(message: string): never {
  throw new RangeError(`Stage graph: ${message}`);
}

/** Reads a graph container: retained spans of a scene file at their original offsets, plus its relocations. */
export function readStageGraph(container: Uint8Array): StageGraph {
  const view = new DataView(container.buffer, container.byteOffset, container.byteLength);
  if (new TextDecoder().decode(container.subarray(0, 8)) !== MAGIC) fail("not a graph container");
  const size = view.getUint32(8, true);
  const spanCount = view.getUint32(12, true);
  const pointerCount = view.getUint32(16, true);
  const spans = new Uint32Array(spanCount * 3);
  let at = 24;
  let payload = 24 + spanCount * 8 + pointerCount * 8;
  for (let i = 0; i < spanCount; i++, at += 8) {
    spans[i * 3] = view.getUint32(at, true);
    spans[i * 3 + 1] = view.getUint32(at + 4, true);
    spans[i * 3 + 2] = payload;
    payload += spans[i * 3 + 1];
  }
  if (payload !== container.length) fail("payload length");
  const pointers = new Map<number, number>();
  for (let i = 0; i < pointerCount; i++, at += 8)
    pointers.set(view.getUint32(at, true), view.getUint32(at + 4, true));
  const locate = (offset: number, count: number): number => {
    let low = 0;
    let high = spanCount - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const start = spans[mid * 3];
      if (offset < start) high = mid - 1;
      else if (offset >= start + spans[mid * 3 + 1]) low = mid + 1;
      else {
        if (offset + count > start + spans[mid * 3 + 1]) break;
        return spans[mid * 3 + 2] + offset - start;
      }
    }
    return fail(`offset ${offset} is not retained`);
  };
  const u32 = (offset: number) => view.getUint32(locate(offset, 4), true);
  const i32 = (offset: number) => view.getInt32(locate(offset, 4), true);
  const f32 = (offset: number) => view.getFloat32(locate(offset, 4), true);
  const pointer = (offset: number): number | null => {
    const target = pointers.get(offset);
    if (target !== undefined) return target;
    if (u32(offset) !== 0) fail(`unrelocated pointer at ${offset}`);
    return null;
  };
  const target = (offset: number): number => pointer(offset) ?? fail(`empty pointer at ${offset}`);

  const motion = (offset: number): StageMotionRecord => ({
    offset,
    type: u32(offset),
    start: f32(offset + 8),
    startRange: f32(offset + 12),
    length: f32(offset + 16),
    lengthRange: f32(offset + 20),
    ordinal: i32(offset + 0x1c),
    data: pointer(offset + 0x24),
  });
  const chain = (head: number | null, count: number): StageMotionRecord[] => {
    const out: StageMotionRecord[] = [];
    for (let at = head; out.length < count; at = pointer(at + 0x20)) {
      if (at === null) fail("motion list shorter than its count");
      out.push(motion(at));
    }
    return out;
  };
  const list = (site: number): StageMotionRecord[] | null => {
    const header = pointer(site);
    return header === null ? null : chain(pointer(header), u32(header + 4));
  };

  const afncPayload = (() => {
    for (let offset = 0; offset + 12 <= size; ) {
      const tag = String.fromCharCode(
        container[locate(offset, 4)],
        container[locate(offset, 4) + 1],
        container[locate(offset, 4) + 2],
        container[locate(offset, 4) + 3],
      );
      const header = u32(offset + 8);
      if (tag === "AFNC") return offset + header;
      offset =
        tag === "FILS" || tag === "FILE" ? offset + header : offset + header + u32(offset + 4);
    }
    return fail("no node chunk");
  })();
  if (u32(afncPayload) !== AFNC_SIGNATURE) fail("node chunk signature");
  if (u32(afncPayload + 0xc) !== 1) fail("expected one root node");

  const nodes: StageNodeRecord[] = [];
  const byOffset = new Map<number, StageNodeRecord>();
  const build = (offset: number, parent: StageNodeRecord | null): StageNodeRecord => {
    if (byOffset.has(offset)) fail("node alias");
    const stateCount = u32(offset + 0x44);
    const stateTable = pointer(offset + 0x40);
    const states: StageStateRecord[] = [];
    for (let i = 0; i < stateCount; i++) {
      const at = stateTable! + i * STATE_BYTES;
      states.push({
        offset: at,
        index: i,
        id: i32(at),
        flags: u32(at + 4),
        carry: u32(at + 8),
        from: i32(at + 0xc),
        next: i32(at + 0x10),
        motions: chain(pointer(at + 0x14), u32(at + 0x18)),
      });
    }
    const elements: StageElementRecord[] = [];
    for (let at = pointer(offset + 0x3c); at !== null; at = pointer(at + 0x10))
      elements.push({ offset: at, type: u32(at) });
    const controller = target(offset + 0x38);
    const children: StageNodeRecord[] = [];
    const record: StageNodeRecord = {
      offset,
      index: nodes.length,
      parent,
      children,
      type: u32(offset),
      id: i32(offset + 4),
      flags: u32(offset + 8),
      coordinateMode: i32(offset + 0x14),
      translationOnly: i32(offset + 0x18),
      jointIndex: i32(offset + 0x1c),
      jointName: i32(offset + 0x20),
      layer: i32(offset + 0x28),
      priority: i32(offset + 0x2c),
      drawCoordinateMode: i32(offset + 0x30),
      defaultState: i32(offset + 0x34),
      controller: { offset: controller, type: u32(controller), parameters: target(controller + 4) },
      elements,
      states,
      before: list(offset + 0x48),
      after: list(offset + 0x4c),
      settings: pointer(offset + 0x5c),
    };
    nodes.push(record);
    byOffset.set(offset, record);
    for (let child = pointer(offset + 0x50); child !== null; child = pointer(child + 0x54))
      children.push(build(child, record));
    return record;
  };
  const root = build(target(afncPayload + 4), null);
  return {
    size,
    nodes,
    root,
    node: (offset) => byOffset.get(offset) ?? fail(`no node at ${offset}`),
    u32,
    i32,
    f32,
    pointer,
    target,
    text(offset) {
      const codes: number[] = [];
      for (let at = offset; ; at++) {
        const code = view.getUint8(locate(at, 1));
        if (code === 0) break;
        codes.push(code);
      }
      return String.fromCharCode(...codes);
    },
  };
}
