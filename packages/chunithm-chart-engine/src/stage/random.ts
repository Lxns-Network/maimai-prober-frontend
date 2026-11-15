const f = Math.fround;
const UNIT = f(4.6566129e-10);
const BYTE_UNIT = f(0.0039215689);

/** The 256-entry permutation that the seeded value selection indexes. */
export const SEEDED_TABLE = Uint8Array.from([
  6, 128, 80, 27, 174, 56, 0, 132, 28, 150, 163, 182, 148, 23, 60, 73, 196, 53, 92, 160, 50, 91,
  112, 185, 78, 238, 147, 33, 219, 223, 124, 133, 10, 129, 119, 225, 218, 213, 215, 76, 2, 61, 105,
  211, 9, 101, 239, 127, 26, 116, 206, 170, 104, 79, 88, 86, 240, 237, 74, 151, 115, 4, 207, 44,
  146, 178, 126, 210, 35, 34, 172, 90, 183, 253, 252, 13, 103, 161, 110, 212, 43, 192, 15, 248, 5,
  135, 106, 169, 95, 46, 66, 49, 195, 177, 131, 190, 140, 221, 227, 217, 68, 226, 173, 159, 154, 14,
  77, 52, 38, 82, 245, 11, 137, 62, 220, 166, 214, 45, 130, 156, 71, 93, 242, 58, 158, 254, 141,
  100, 83, 21, 222, 108, 55, 181, 153, 16, 228, 18, 96, 201, 187, 189, 134, 144, 186, 57, 203, 29,
  114, 123, 193, 37, 244, 122, 251, 109, 236, 30, 229, 8, 117, 199, 145, 136, 209, 99, 247, 235, 22,
  164, 20, 224, 138, 87, 249, 198, 69, 118, 149, 155, 102, 188, 39, 75, 31, 143, 12, 165, 51, 42,
  67, 184, 7, 63, 113, 208, 204, 191, 233, 17, 205, 94, 3, 24, 142, 250, 36, 89, 125, 41, 81, 255,
  231, 241, 70, 64, 176, 84, 157, 167, 25, 139, 234, 65, 59, 200, 1, 168, 120, 216, 48, 72, 243, 98,
  54, 197, 111, 47, 179, 121, 246, 162, 202, 175, 152, 40, 180, 19, 230, 107, 85, 171, 194, 97, 232,
  32,
]);

/** `min` plus the table entry at the seed's low byte as a fraction of the span to `max`. */
export function seededValue(seed: number, min: number, max: number): number {
  return f(f(f(f(SEEDED_TABLE[seed & 0xff]) * BYTE_UNIT) * f(max - min)) + min);
}

/** Rounds toward negative infinity. */
export function floorF32(value: number): number {
  return f(Math.floor(value));
}

/** The scene random stream: a 64-bit xorshift state held as two words. */
export class StageRandom {
  low: number;
  high: number;
  draws = 0;

  constructor(low = 0, high = 0) {
    this.low = low >>> 0;
    this.high = high >>> 0;
  }

  private advance(): number {
    const lo = (this.low ^ ((-1400276635 << (this.low & 3)) >>> 0)) >>> 0;
    const hi = this.high >>> 0;
    const aLo = (lo ^ (lo << 1)) >>> 0;
    const aHi = (hi ^ ((hi << 1) | (lo >>> 31))) >>> 0;
    const bLo = (lo ^ ((lo >>> 1) | (hi << 31))) >>> 0;
    const bHi = (hi ^ (hi >>> 1)) >>> 0;
    this.low = (lo ^ (aLo << 2) ^ ((bLo >>> 2) | (bHi << 30))) >>> 0;
    this.high = (hi ^ ((aHi << 2) | (aLo >>> 30)) ^ (bHi >>> 2)) >>> 0;
    this.draws++;
    return this.low & 0x7fffffff;
  }

  /** An integer in [0, n]. */
  intBelow(n: number): number {
    return this.advance() % ((n >>> 0) + 1);
  }

  /** An integer in [low, high]. */
  intRange(low: number, high: number): number {
    return low === high ? low : low + this.intBelow(high - low);
  }

  /** A float from `a` toward `b`. */
  floatRange(a: number, b: number): number {
    const v = f(this.advance());
    return f(f(f(v * f(b - a)) * UNIT) + a);
  }

  snapshot(): [number, number, number] {
    return [this.low, this.high, this.draws];
  }

  restore(state: readonly [number, number, number]): void {
    [this.low, this.high, this.draws] = state;
  }
}
