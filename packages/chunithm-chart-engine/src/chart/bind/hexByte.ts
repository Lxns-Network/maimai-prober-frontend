const UNDEFINED = 0x2d;
const NIBBLES = new Int8Array(128).fill(-1);
for (let n = 0; n < 16; n++) {
  NIBBLES[n.toString(16).charCodeAt(0)] = n;
  NIBBLES[n.toString(16).toUpperCase().charCodeAt(0)] = n;
}

/** Byte of a canonical hex string at `at`; an undefined (`--`) byte is zero. */
export function hexByte(hex: string, at: number): number {
  const a = hex.charCodeAt(at);
  const b = hex.charCodeAt(at + 1);
  if (a === UNDEFINED && b === UNDEFINED) return 0;
  const high = a < 128 ? NIBBLES[a] : -1;
  const low = b < 128 ? NIBBLES[b] : -1;
  if (high < 0 || low < 0) throw new RangeError(`Invalid canonical hex at ${at}`);
  return (high << 4) | low;
}
