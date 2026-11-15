const f = Math.fround;
const EX_FLAG = 0x8c;
const DIRECTION = 0x88;
const NO_DIRECTION = 8;

/** Integer tick of the note start: floor of `(group + offset / 4) · resolution` in single precision. */
function quantize(rec: DataView, resolution: number): number {
  const x = f(f(f(rec.getFloat32(4, true) * 0.25) + rec.getFloat32(0, true)) * resolution);
  const negative = x < 0 || Object.is(x, -0);
  const big = negative ? -8388608 : 8388608;
  const t = Math.abs(x) < 8388608 ? big : negative ? -0 : 0;
  let r = f(f(x + t) - t);
  if (!(f(r - x) <= 0)) r = f(r - 1);
  const v = f(r + 0.5);
  return Number.isNaN(v) || v >= 2147483648 || v < -2147483648 ? -2147483648 : Math.trunc(v);
}

const isExHoldOrSlide = (type: number, rec: DataView) =>
  (type === 1 || type === 13 || type === 2) && rec.getUint8(EX_FLAG) !== 0;

/**
 * Marks taps, holds and slides as EX when every lane they cover holds an EX note starting on the
 * same tick, and gives them the direction of the EX note on their first lane. Writes in place.
 */
export function promoteExNotes(
  records: readonly DataView[],
  resolution: number,
  realWidth: (idx: number) => number,
): void {
  const res = f(resolution >>> 0);
  const directions = new Map<number, number>();
  for (const rec of records) {
    const type = rec.getInt32(0x10, true);
    if (type !== 4 && !isExHoldOrSlide(type, rec)) continue;
    const lane = rec.getInt32(0x28, true);
    const last = (lane + realWidth(rec.getInt32(0x2c, true)) - 1) | 0;
    const direction = rec.getInt32(DIRECTION, true);
    const tick = quantize(rec, res);
    for (let l = lane; l <= last; l++) {
      const key = ((tick << 4) + l) | 0;
      if (!directions.has(key)) directions.set(key, direction);
    }
  }
  if (directions.size === 0) return;
  for (const rec of records) {
    const type = rec.getInt32(0x10, true);
    if (type !== 0 && type !== 1 && type !== 13 && type !== 2) continue;
    if (type !== 0 && rec.getUint8(EX_FLAG) !== 0) continue;
    const first = ((quantize(rec, res) << 4) + rec.getInt32(0x28, true)) | 0;
    const last = (first + realWidth(rec.getInt32(0x2c, true)) - 1) | 0;
    if (first > last) continue;
    let direction = NO_DIRECTION;
    let covered = true;
    for (let key = first; key <= last; key++) {
      const value = directions.get(key);
      if (value === undefined) {
        covered = false;
        break;
      }
      if (direction === NO_DIRECTION) direction = value;
    }
    if (!covered || direction === NO_DIRECTION) continue;
    rec.setInt32(DIRECTION, direction, true);
    if (type === 0) rec.setInt32(0x10, 4, true);
    else rec.setUint8(EX_FLAG, 1);
  }
}
