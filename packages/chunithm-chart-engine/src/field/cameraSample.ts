import type { Vec3 } from "../stage/camera/math";
import type { PlayCameraResource, PlayCameraState } from "../scene/camera";

const CAMERA_NODE_TYPE = 0x5b8d81;
const PAYLOAD_SIGNATURE = 0x77ed9bb9;
const MATRIX_MOTION = 100;
const POSITION_ELEMENT = 1;
const TARGET_ELEMENT = 2;
const SETTINGS_WORDS = 0x17;
const NO_MOTION_PARENT = -1;

const scratch = new DataView(new ArrayBuffer(4));
const bitsToFloat = (bits: number): number => {
  scratch.setUint32(0, bits >>> 0, true);
  return scratch.getFloat32(0, true);
};

function tag(bytes: Uint8Array, o: number): string {
  return String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
}

/**
 * Reads the play camera node with the given id from a scene animation file. Only constant camera
 * states are supported: each state has one constant position motion and one constant target motion,
 * with no clips and no reference nodes.
 *
 * @throws {Error} when the file does not have that structure or uses an unsupported motion.
 */
export function readCameraSample(bytes: Uint8Array, nodeId: number): PlayCameraResource {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (o: number) => dv.getUint32(o, true);
  const i32 = (o: number) => dv.getInt32(o, true);
  let nodeChunk: number | null = null;
  let clipChunk: number | null = null;
  const walk = (o: number, end: number) => {
    while (o < end) {
      const t = tag(bytes, o);
      const size = u32(o + 4);
      const header = u32(o + 8);
      if (header < 32 || o + header + size > end) throw new Error(`区块 ${t}（${o}）越界`);
      if (t === "AFNC") nodeChunk ??= o;
      if (t === "AFRC") clipChunk ??= o;
      if (t === "FILS" || t === "FILE") walk(o + header, o + header + size);
      o += header + size;
    }
  };
  walk(0, bytes.length);
  if (nodeChunk === null) throw new Error("缺少节点区块");
  const base: number = nodeChunk;
  const payload = base + u32(base + 8);
  if (u32(payload) !== PAYLOAD_SIGNATURE) throw new Error("未知的节点区块内容");
  if (clipChunk !== null) {
    const clips = (clipChunk as number) + u32((clipChunk as number) + 8);
    if (u32(clips) === PAYLOAD_SIGNATURE && u32(clips + 8) !== 0)
      throw new Error("相机含动画剪辑，暂不支持");
  }
  const ptr = (o: number) => {
    const v = u32(o);
    return v === 0 ? null : base + v;
  };
  const nodes: number[] = [];
  const pending: number[] = [];
  const roots = ptr(payload + 4);
  if (roots === null) throw new Error("缺少根节点");
  for (let i = 0; i < u32(payload + 0xc); i++) pending.push(roots + 0x60 * i);
  while (pending.length) {
    const n = pending.shift() as number;
    nodes.push(n);
    for (const off of [0x50, 0x54]) {
      const c = ptr(n + off);
      if (c !== null) pending.push(c);
    }
  }
  const node = nodes.find((n) => u32(n) === CAMERA_NODE_TYPE && i32(n + 4) === nodeId);
  if (node === undefined) throw new Error(`找不到相机节点 ${nodeId}`);
  const settingsAt = ptr(node + 0x5c);
  if (settingsAt === null) throw new Error("相机节点缺少设置");
  const settings = Array.from({ length: SETTINGS_WORDS }, (_, k) => u32(settingsAt + 4 * k));
  const states: PlayCameraState[] = [];
  const stateTable = ptr(node + 0x40);
  for (let i = 0; i < u32(node + 0x44); i++) {
    if (stateTable === null) throw new Error("缺少状态表");
    const st = stateTable + 0x20 * i;
    const id = i32(st);
    const local: Partial<Record<number, Vec3>> = {};
    let motion = ptr(st + 0x14);
    for (let k = 0; k < u32(st + 0x18); k++) {
      if (motion === null) throw new Error("动作链短于其计数");
      if (u32(motion) !== MATRIX_MOTION || i32(motion + 0x1c) !== NO_MOTION_PARENT)
        throw new Error(`状态 ${id}：不支持的动作`);
      const header = ptr(motion + 0x24);
      if (header === null) throw new Error(`状态 ${id}：动作缺少数据`);
      const element = u32(header);
      const record = ptr(header + 8);
      if (
        u32(header + 4) !== 1 ||
        record === null ||
        (element !== POSITION_ELEMENT && element !== TARGET_ELEMENT) ||
        local[element]
      )
        throw new Error(`状态 ${id}：不支持的动作布局`);
      const constant =
        [0, 4, 8, 0xc, 0x10, 0x14, 0x18].every((o) => u32(record + o) === 0) &&
        u32(record + 0x1c) === 0xbf800000 &&
        u32(record + 0x20) === 1;
      if (!constant) throw new Error(`状态 ${id}：动作不是恒定平移`);
      local[element] = [0x34, 0x38, 0x3c].map((o) => bitsToFloat(u32(record + o))) as Vec3;
      motion = ptr(motion + 0x20);
    }
    const position = local[POSITION_ELEMENT];
    const target = local[TARGET_ELEMENT];
    if (!position || !target) throw new Error(`状态 ${id}：缺少位置或注视点动作`);
    states.push({ id, position, target });
  }
  return { settings, states };
}
