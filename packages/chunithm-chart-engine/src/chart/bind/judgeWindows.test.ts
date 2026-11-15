import { describe, expect, it } from "vitest";
import {
  exactScaledGap,
  extendedProduct,
  extendedScaledGap,
  scaledGap,
  tightenJudgeWindows,
  type BindRow,
} from "./judgeWindows";
const REC = 0x164;
function note(
  type: number,
  measure: number,
  offset: number,
  time: number,
  lane: number,
  widthIdx: number,
) {
  const v = new DataView(new ArrayBuffer(REC));
  v.setFloat32(0, measure, true);
  v.setFloat32(4, offset, true);
  v.setFloat32(8, time, true);
  v.setInt32(0x10, type, true);
  v.setInt32(0x28, lane, true);
  v.setInt32(0x2c, widthIdx, true);
  return v;
}
const width = (idx: number) => idx; // test table: index == width
const row: BindRow = {
  enable: true,
  unify: false,
  earlyLimit: 3,
  earlyFloor: 0.1,
  lateFloor: 0.1,
  lateLimit: 3,
};
const rows = [row, row, row, row];
const flags = (v: DataView, at: number) => [...new Uint8Array(v.buffer, at, 16)];
describe("tightenJudgeWindows", () => {
  it("leaves isolated notes untouched", () => {
    const a = note(0, 0, 0, 0, 0, 4);
    tightenJudgeWindows([a], rows, width);
    expect(new Uint8Array(a.buffer, 0xa4, 0x144 - 0xa4).every((b) => b === 0)).toBe(true);
  });
  it("tightens the late side of the earlier note and the early side of the later note on overlapping lanes", () => {
    const a = note(0, 0, 0, 1000, 0, 4);
    const b = note(0, 0, 0.25, 1016.6667, 2, 4);
    tightenJudgeWindows([a, b], rows, width);
    expect(flags(a, 0xb4).slice(0, 6)).toEqual([0, 0, 1, 1, 0, 0]);
    expect(flags(b, 0xa4).slice(0, 6)).toEqual([0, 0, 1, 1, 0, 0]);
    expect(flags(a, 0xa4).every((x) => x === 0)).toBe(true);
    const half = Math.fround(Math.fround(Math.fround(1016.6667 * 0.06) - 1000 * 0.06) * 0.5);
    expect(a.getFloat32(0x104 + 4 * 2, true)).toBeCloseTo(half, 5);
    expect(b.getFloat32(0xc4 + 4 * 3, true)).toBeCloseTo(half, 5);
  });
  it("keeps the floor when half the gap is below it", () => {
    const a = note(0, 0, 0, 1000, 0, 4);
    const b = note(0, 0, 0.25, 1016.6667, 0, 4);
    tightenJudgeWindows([a, b], [{ ...row, lateFloor: 2 }, row, row, row], width);
    expect(a.getFloat32(0x104, true)).toBe(2);
  });
  it("spreads the tightest window across all lanes when unify is set", () => {
    const u = { ...row, unify: true };
    const a = note(0, 0, 0, 1000, 0, 4);
    const b = note(0, 0, 0.25, 1016.6667, 2, 4);
    tightenJudgeWindows([a, b], [u, u, u, u], width);
    expect(flags(a, 0xb4).every((x) => x === 1)).toBe(true);
    expect(flags(b, 0xa4).every((x) => x === 1)).toBe(true);
  });
  it("does not pair notes at the same beat position", () => {
    const a = note(0, 0, 0, 1000, 0, 4);
    const b = note(0, 0, 0, 1000, 0, 4);
    tightenJudgeWindows([a, b], rows, width);
    expect(new Uint8Array(a.buffer, 0xa4, 32).every((x) => x === 0)).toBe(true);
  });
  it("does not pair notes on disjoint lanes", () => {
    const a = note(0, 0, 0, 1000, 0, 4);
    const b = note(0, 0, 0.25, 1016.6667, 8, 4);
    tightenJudgeWindows([a, b], rows, width);
    expect(flags(a, 0xb4).every((x) => x === 0)).toBe(true);
  });
  it("ignores note types whose row is disabled", () => {
    const off = [{ ...row, enable: false }, row, row, row];
    const a = note(0, 0, 0, 1000, 0, 4);
    const b = note(0, 0, 0.25, 1016.6667, 0, 4);
    tightenJudgeWindows([a, b], off, width);
    expect(new Uint8Array(a.buffer, 0xa4, 32).every((x) => x === 0)).toBe(true);
  });
  it("selects the EX row for EX HOLD/SLIDE via the canonical +0x8c flag", () => {
    const exOff = [row, { ...row, enable: false }, row, row];
    const a = note(1, 0, 0, 1000, 0, 4);
    const b = note(1, 0, 0.25, 1016.6667, 0, 4);
    a.setUint8(0x8c, 1);
    b.setUint8(0x8c, 1);
    tightenJudgeWindows([a, b], exOff, width);
    expect(flags(a, 0xb4).every((x) => x === 0)).toBe(true);
  });
  it("routes a pair whose double difference is inexact to the extended path", () => {
    // Half an f32 ulp of the gap away from the double result: rounding the double would round up.
    const scaled = Math.fround(Math.fround(100) * Math.fround(0.06));
    const ti = 0.05555550381541252;
    expect(exactScaledGap(scaled, ti)).toBeNull();
    const extended = extendedScaledGap(scaled, extendedProduct(ti));
    expect(Math.fround(scaled - ti * Math.fround(0.06))).not.toBe(extended);
    expect(scaledGap(scaled, ti)).toBe(extended);
    const a = note(0, 0, 0, ti, 0, 4);
    const b = note(0, 0, 0.25, 100, 0, 4);
    tightenJudgeWindows(
      [a, b],
      [{ ...row, lateLimit: 100, earlyLimit: 100 }, row, row, row],
      width,
    );
    expect(a.getFloat32(0x104, true)).toBe(Math.fround(extended * 0.5));
  });
});
describe("exactScaledGap", () => {
  it("agrees bit-for-bit with the extended path on 200k seeded pairs", () => {
    let seed = 0x5eed1234;
    const random = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const f32 = new Float32Array(1);
    const u32 = new Uint32Array(f32.buffer);
    const scale = Math.fround(0.06);
    let exact = 0;
    let inexact = 0;
    let mismatches = 0;
    let misrouted = 0;
    for (let n = 0; n < 200000; n++) {
      const kind = n % 4;
      let ti: number;
      let tj: number;
      if (kind === 0) {
        ti = Math.fround(random() * 600000);
        tj = Math.fround(ti + random() * 2000);
      } else if (kind === 1) {
        ti = Math.fround(2 ** (random() * 60 - 20) * (random() < 0.1 ? -1 : 1));
        tj = Math.fround(ti + 2 ** (random() * 60 - 20));
      } else if (kind === 2) {
        f32[0] = Math.fround(random() * 600000);
        u32[0] += Math.floor(random() * 9) - 4;
        ti = f32[0];
        u32[0] += Math.floor(random() * 5);
        tj = f32[0];
      } else {
        u32[0] = Math.floor(random() * 0x7f000000);
        ti = f32[0];
        u32[0] = Math.floor(random() * 0x7f000000);
        tj = f32[0];
      }
      if (!Number.isFinite(ti) || !Number.isFinite(tj)) continue;
      const scaled = Math.fround(tj * scale);
      const fast = exactScaledGap(scaled, ti);
      const extended = extendedScaledGap(scaled, extendedProduct(ti));
      if (fast === null) {
        inexact++;
        if (!Object.is(scaledGap(scaled, ti), extended)) misrouted++;
      } else {
        exact++;
        if (!Object.is(fast, extended)) mismatches++;
      }
    }
    expect({ mismatches, misrouted }).toEqual({ mismatches: 0, misrouted: 0 });
    expect(exact).toBeGreaterThan(100000);
    expect(inexact).toBeGreaterThan(1000);
  });
});
