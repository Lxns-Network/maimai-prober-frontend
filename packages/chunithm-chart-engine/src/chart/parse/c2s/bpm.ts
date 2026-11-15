import table from "./tables/bpm.json";
import { readFloatBits, readInteger, type CommandRecord } from "./commands";
import { floorFiniteFloat32, fround, type FloorConstants } from "./float32";
import { BPM_SORT_STRIDE, sortPositionRecords } from "./introsort";
import { writePosition } from "./position";

const A = table.accumulate;
const AC = A.constants;
const AF = A.fields;
const accumulateFloor: FloorConstants = {
  floorMagic: AC.floorMagic,
  one: AC.one,
  signMask: A.signMask,
};
const initialRecord = Uint8Array.from(table.initialRecord);
if (initialRecord.byteLength !== table.recordBytes)
  throw new Error("BPM 记录初始值长度与记录大小不符");

export interface BpmPassResult {
  skipped: boolean;
  nextSequence: number;
  records: Uint8Array;
}

function uint32(x: number): void {
  if (!Number.isInteger(x) || x < 0 || x > 0xffffffff)
    throw new RangeError("参数必须是 uint32 整数");
}

function finite(x: number): number {
  if (!Number.isFinite(x)) throw new RangeError("BPM 计算的输入超出支持范围（非有限值）");
  return x;
}

export function produceBpmRecord(
  records: Uint8Array[],
  record: CommandRecord,
  sequence: number,
  resolution: number,
): boolean {
  if (!table.acceptedIds.includes(record.id)) return false;
  uint32(sequence);
  uint32(resolution);
  const raw = initialRecord.slice();
  const view = new DataView(raw.buffer);
  writePosition(
    view,
    readInteger(record, table.columns.position0) >>> 0,
    readInteger(record, table.columns.position1) >>> 0,
    resolution,
  );
  view.setUint32(table.sequenceOffset, sequence, true);
  view.setUint32(table.bpmOffset, readFloatBits(record, table.columns.bpm), true);
  records.push(raw);
  return true;
}

export function accumulateBpmTimes(records: DataView): void {
  if (!records.byteLength || records.byteLength % A.stride)
    throw new TypeError("BPM 记录必须非空且为整条记录");
  const floor = (x: number) => floorFiniteFloat32(finite(x), accumulateFloor);
  let previous0 = 0;
  let previous4 = 0;
  let elapsed = 0;
  let bpm = finite(records.getFloat32(AF.bpm16, true));
  for (let offset = 0; offset < records.byteLength; offset += A.stride) {
    const p0 = finite(records.getFloat32(offset + AF.position0, true));
    const p4 = finite(records.getFloat32(offset + AF.position4, true));
    const previous = fround(fround(previous0 * AC.beatScale) + previous4);
    const position = fround(fround(p0 * AC.beatScale) + p4);
    let delta = fround(fround(fround(position - previous) * AC.tickScale) + AC.half);
    delta = fround(floor(delta) * AC.tickUnit);
    const major = fround(floor(fround(delta * AC.quarter)) * AC.beatScale);
    delta = fround(major + fround(delta - major));
    if (bpm === 0) throw new RangeError("BPM 为 0，无法累计时间");
    elapsed = finite(fround(fround(fround(delta * AC.minuteMs) / bpm) + elapsed));
    records.setFloat32(offset + AF.time8, elapsed, true);
    previous0 = p0;
    previous4 = p4;
    bpm = finite(records.getFloat32(offset + AF.bpm16, true));
  }
}

export function prepareBpm(
  owner: DataView,
  records: readonly CommandRecord[],
  nextSequence: number,
  mode: number,
): BpmPassResult {
  uint32(nextSequence);
  uint32(mode);
  if (mode === table.pass.skipMode)
    return { skipped: true, nextSequence, records: new Uint8Array() };
  const rows: Uint8Array[] = [];
  const resolution = owner.getUint32(table.pass.resolutionOffset, true);
  for (const record of records) {
    if (record.id !== table.pass.commandId) continue;
    if (!produceBpmRecord(rows, record, nextSequence, resolution))
      throw new Error("BPM 命令分派不一致");
    nextSequence = (nextSequence + 1) >>> 0;
  }
  const out = new Uint8Array(rows.length * table.recordBytes);
  rows.forEach((row, i) => out.set(row, i * table.recordBytes));
  if (out.byteLength) {
    const view = new DataView(out.buffer);
    sortPositionRecords(view, BPM_SORT_STRIDE);
    accumulateBpmTimes(view);
  }
  return { skipped: false, nextSequence, records: out };
}
