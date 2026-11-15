import table from "./tables/position.json";
import { floorFiniteFloat32, fround, type FloorConstants } from "./float32";

const C = table.constants;
const L = table.layout;
const floorConstants: FloorConstants = {
  floorMagic: C.floorMagic,
  one: C.one,
  signMask: table.signMask,
};
const rowStride = -table.rowStep;

function finite(x: number): number {
  if (!Number.isFinite(x)) throw new RangeError("时间计算的输入超出支持范围（非有限值）");
  return x;
}

function uint32(x: number): number {
  if (!Number.isInteger(x) || x < 0 || x > 0xffffffff)
    throw new RangeError("参数必须是 uint32 整数");
  return x;
}

function toFloat32(x: number): number {
  uint32(x);
  return fround((x | 0) + table.u32Conversion[x >>> 31]);
}

const floor = (x: number) => floorFiniteFloat32(finite(x), floorConstants);

export function writePosition(
  output: DataView,
  measure: number,
  tick: number,
  resolution: number,
): void {
  uint32(measure);
  uint32(tick);
  uint32(resolution);
  if (resolution === 0) return;
  output.setUint32(L.position8, table.constructorZeroStore, true);
  let x = fround(fround(toFloat32(tick) / toFloat32(resolution)) + toFloat32(measure));
  x = fround(fround(x * C.beatScale) * C.tickScale);
  x = fround(x + C.half);
  const rounded = fround(floor(x) * C.tickUnit);
  const field0 = floor(fround(rounded * C.quarter));
  output.setFloat32(L.position0, field0, true);
  output.setFloat32(L.position4, fround(rounded - fround(field0 * C.beatScale)), true);
}

export function lookupPositionTime(query: DataView, records: DataView): number {
  if (records.byteLength % rowStride) throw new TypeError("BPM 记录跨度必须是整条记录的倍数");
  if (!records.byteLength) return 0;
  const position = fround(
    fround(finite(query.getFloat32(L.query0, true)) * C.beatScale) +
      finite(query.getFloat32(L.query4, true)),
  );
  const bound = fround(position + C.lookupTolerance);
  for (let end = records.byteLength; end > 0; end -= rowStride) {
    const read = (offset: number) => finite(records.getFloat32(end + offset, true));
    const at = fround(fround(read(L.rowFromEnd0) * C.beatScale) + read(L.rowFromEnd4));
    if (at > bound) continue;
    let delta = fround(fround(fround(position - at) * C.tickScale) + C.half);
    delta = fround(floor(delta) * C.tickUnit);
    const major = fround(floor(fround(delta * C.quarter)) * C.beatScale);
    delta = fround(fround(delta - major) + major);
    delta = fround(delta * C.minuteMs);
    const divisor = read(L.rowFromEnd16);
    if (divisor === 0) throw new RangeError("BPM 为 0，无法换算时间");
    return finite(fround(fround(delta / divisor) + read(L.rowFromEnd8)));
  }
  return 0;
}
