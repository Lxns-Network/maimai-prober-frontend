const scratch = new DataView(new ArrayBuffer(4));

export const fround = Math.fround;

export function floatToBits(value: number): number {
  scratch.setFloat32(0, value, true);
  return scratch.getUint32(0, true);
}

export function bitsToFloat(bits: number): number {
  scratch.setUint32(0, bits >>> 0, true);
  return scratch.getFloat32(0, true);
}

export interface FloorConstants {
  floorMagic: number;
  one: number;
  signMask: number;
}

export function floorFloat32(x: number, c: FloorConstants): number {
  const sign = floatToBits(x) & c.signMask;
  const bias = bitsToFloat((Math.abs(x) < c.floorMagic ? floatToBits(c.floorMagic) : 0) | sign);
  let r = fround(fround(x + bias) - bias);
  if (!(fround(r - x) <= bitsToFloat(sign))) r = fround(r - c.one);
  return r;
}

export function floorFiniteFloat32(x: number, c: FloorConstants): number {
  if (!Number.isFinite(x)) throw new RangeError("向下取整的输入超出支持范围（非有限值）");
  return floorFloat32(x, c);
}

export function truncateToInt32(x: number): number {
  if (!(x > -2147483649 && x < 2147483648)) return -2147483648;
  return Math.trunc(x) | 0;
}
