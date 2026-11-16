/**
 * Ground-linked AIR band geometry: three vertex layers built from a chain of points.
 *
 * Each point carries a width, a lane position and a height; consecutive points form segments that
 * are clipped into the visible depth window and emitted as quads. The three layers are the body,
 * the ground ring and the edge strips. Lane, height and width arithmetic keeps its
 * extended-precision intermediates before rounding to float32, which keeps every vertex bit-exact.
 */

import { HOLD_VERTEX_BYTES, type StripPrecision, type ZeroDepthState } from "./holdBand";
import { depthAt } from "./space";
import { exact, mul, precisionBits, round, sub, toF32, type ExactValue } from "./stripFloat";
import type { NoteTimelineScore } from "./timing";

export interface AirPoint {
  width: number;
  lane: number;
  height: number;
  flag: number;
}

export interface AirGeneratorState {
  /** Resource index of each layer; a negative index disables the layer's segments. */
  i10: number;
  i1c: number;
  i28: number;
  vMin: number;
  vMax: number;
  /** Non-zero adds a leading point-sized segment ahead of the chain. */
  head: number;
}

export interface AirStatics {
  zeroDepth: ZeroDepthState;
}

export interface AirLayerInput {
  enabled: boolean;
}

export interface AirBandInput {
  mode: number;
  depthArgs: readonly number[];
  times: readonly number[];
  narrow: number;
  generator: AirGeneratorState;
  elements: readonly AirPoint[];
  joints: readonly [AirLayerInput, AirLayerInput, AirLayerInput];
  manager: DataView;
  score: NoteTimelineScore;
  statics: AirStatics;
  x87: StripPrecision;
}

export type AirLayerResult =
  | { untouched: true }
  | { untouched?: false; cleared: true; count: number };

export interface AirBandResult {
  early: boolean;
  statics: AirStatics;
  joints: readonly [AirLayerResult, AirLayerResult, AirLayerResult];
}

const scratch = new DataView(new ArrayBuffer(8));
const fromBits = (bits: number): number => {
  scratch.setUint32(0, bits >>> 0, true);
  return scratch.getFloat32(0, true);
};
const bitsOf = (value: number): number => {
  scratch.setFloat32(0, value, true);
  return scratch.getUint32(0, true);
};

const T = Object.freeze({
  eps: fromBits(897988541),
  negEps: fromBits(3045472189),
  minSpan: fromBits(925353388),
  one: fromBits(1065353216),
  half: fromBits(1056964608),
  uScale: fromBits(1067869798),
  near: fromBits(3289776128),
  far: fromBits(1112014848),
  widthBias: fromBits(1090519040),
  laneOffset: fromBits(1090519040),
  laneScale: fromBits(1082130432),
  heightOffset: fromBits(1065353216),
  heightScale: fromBits(1081683738),
  body: fromBits(1061158912),
  ringHeightMax: fromBits(1098460955),
  ringSlope: fromBits(1032028240),
  ringSpan: fromBits(1036831952),
  ringBase: fromBits(1059481190),
  edgeHalf: fromBits(1073406280),
  edgeHalfNarrow: fromBits(1065017672),
  ringScaleLow: fromBits(1061158912),
  ringScaleHigh: fromBits(1059481190),
  clipFar: fromBits(1112014848),
  clipNear: fromBits(3289776128),
});
const BASE_COLOUR = 0xffffffff;
const RING_COLOUR = 1090519039;
const ALPHA: Readonly<Record<number, readonly [number, number]>> = Object.freeze({
  0: [27, 255],
  1: [80, 255],
  2: [3, 128],
});
const NARROW = 1;

interface Segment {
  tiny: number;
  visible: number;
  f10: number;
  f1c: number;
  f28: number;
  t0: number;
  t1: number;
  zS: number;
  zE: number;
  xS: number;
  xE: number;
  yS: number;
  yE: number;
  wS: number;
  wE: number;
  start: number;
  end: number;
  vS: number;
  vE: number;
  u0S: number;
  u1S: number;
  u0E: number;
  u1E: number;
}

const f = Math.fround;
const abs = (x: number): number => (0 > x ? -x : x);
const maxss = (a: number, b: number): number => (a > b ? a : b);
const clamp01 = (x: number): number => (x > T.one ? T.one : maxss(x, 0));
const setAlpha = (colour: number, k: number): number =>
  ((colour & 0x00ffffff) | ((k >= 0xff ? 0xff : k <= 0 ? 0 : k & 0xff) << 24)) >>> 0;
const finite = (x: number, where: string): number => {
  if (Number.isNaN(x)) throw new RangeError(`NaN at ${where}: FPU NaN bits are not modelled`);
  return x;
};

const blank = (): Segment => ({
  tiny: 0,
  visible: 0,
  f10: 0,
  f1c: 0,
  f28: 0,
  t0: 0,
  t1: 0,
  zS: 0,
  zE: 0,
  xS: 0,
  xE: 0,
  yS: 0,
  yE: 0,
  wS: 0,
  wE: 0,
  start: 0,
  end: 0,
  vS: 0,
  vE: 0,
  u0S: 0,
  u1S: 0,
  u0E: 0,
  u1E: 0,
});

const MEMO_LIMIT = 1 << 16;
const ORDER_FORWARD = [0, 2, 3, 0, 3, 1] as const;
const ORDER_REVERSE = [0, 3, 2, 0, 1, 3] as const;
const ORDER_EDGE = [0, 2, 3, 0, 3, 1, 0, 3, 2, 0, 1, 3] as const;

const reset = (s: Segment): Segment => {
  s.tiny = s.visible = s.f10 = s.f1c = s.f28 = s.t0 = s.t1 = s.zS = s.zE = 0;
  s.xS = s.xE = s.yS = s.yE = s.wS = s.wE = s.start = s.end = s.vS = s.vE = 0;
  s.u0S = s.u1S = s.u0E = s.u1E = 0;
  return s;
};

const copySegment = (d: Segment, s: Segment): void => {
  d.tiny = s.tiny;
  d.visible = s.visible;
  d.f10 = s.f10;
  d.f1c = s.f1c;
  d.f28 = s.f28;
  d.t0 = s.t0;
  d.t1 = s.t1;
  d.zS = s.zS;
  d.zE = s.zE;
  d.xS = s.xS;
  d.xE = s.xE;
  d.yS = s.yS;
  d.yE = s.yE;
  d.wS = s.wS;
  d.wE = s.wE;
  d.start = s.start;
  d.end = s.end;
  d.vS = s.vS;
  d.vE = s.vE;
  d.u0S = s.u0S;
  d.u1S = s.u1S;
  d.u0E = s.u0E;
  d.u1E = s.u1E;
};

const lerpStart = (s: Segment, o: Segment, t: number): void => {
  const m = f(T.one - t);
  s.xS = f(f(t * o.xE) + f(m * o.xS));
  s.wS = f(f(t * o.wE) + f(m * o.wS));
  s.vS = f(f(t * o.vE) + f(m * o.vS));
  s.yS = f(f(t * o.yE) + f(m * o.yS));
  s.u0S = f(f(t * o.u0E) + f(m * o.u0S));
  s.u1S = f(f(t * o.u1E) + f(m * o.u1S));
};

const lerpEnd = (s: Segment, o: Segment, t: number): void => {
  const m = f(T.one - t);
  s.xE = f(f(t * o.xS) + f(m * o.xE));
  s.wE = f(f(t * o.wS) + f(m * o.wE));
  s.vE = f(f(t * o.vS) + f(m * o.vE));
  s.yE = f(f(t * o.yS) + f(m * o.yE));
  s.u0E = f(f(t * o.u0S) + f(m * o.u0E));
  s.u1E = f(f(t * o.u1S) + f(m * o.u1E));
};

export function createAirBand() {
  const laneOffset = exact(T.laneOffset);
  const laneScale = exact(T.laneScale);
  const halfExact = exact(T.half);
  const heightOffset = exact(T.heightOffset);
  const heightScale = exact(T.heightScale);

  const laneMemo: Record<StripPrecision, Map<number, number>> = {
    single: new Map(),
    extended: new Map(),
  };
  const heightMemo: Record<StripPrecision, Map<number, number>> = {
    single: new Map(),
    extended: new Map(),
  };
  const widthMemo: Record<StripPrecision, Map<number, Map<number, number>>> = {
    single: new Map(),
    extended: new Map(),
  };
  let widthMemoSize = 0;

  const laneX = (x: number, x87: StripPrecision): number => {
    const P = precisionBits(x87);
    const memo = laneMemo[x87];
    let r = memo.get(x);
    if (r === undefined) {
      r = toF32(round(mul(round(sub(exact(x), laneOffset), P), laneScale), P));
      if (memo.size >= MEMO_LIMIT) memo.clear();
      memo.set(x, r);
    }
    return r;
  };
  const height = (h: number, x87: StripPrecision): number => {
    const P = precisionBits(x87);
    const memo = heightMemo[x87];
    let r = memo.get(h);
    if (r === undefined) {
      r = toF32(round(mul(round(sub(exact(h), heightOffset), P), heightScale), P));
      if (memo.size >= MEMO_LIMIT) memo.clear();
      memo.set(h, r);
    }
    return r;
  };
  const halfWidth = (w: number, k: number, x87: StripPrecision): number => {
    const P = precisionBits(x87);
    const memo = widthMemo[x87];
    let byK = memo.get(w);
    let r = byK?.get(k);
    if (r === undefined) {
      const lx = round(mul(round(sub(exact(f(w + T.widthBias)), laneOffset), P), laneScale), P);
      const half: ExactValue = round(mul(lx, halfExact), P);
      r = toF32(round(mul(half, exact(k)), P));
      if (widthMemoSize >= MEMO_LIMIT) {
        widthMemo.single.clear();
        widthMemo.extended.clear();
        widthMemoSize = 0;
        byK = undefined;
      }
      if (!byK) {
        byK = new Map();
        memo.set(w, byK);
      }
      byK.set(k, r);
      widthMemoSize++;
    }
    return r;
  };
  const uCoord = (lane: number, w: number, lane0: number, sign: number): number => {
    const hw = f(w * T.half);
    const e = sign < 0 ? f(lane - hw) : f(hw + lane);
    return f(f(f(e - lane0) * T.uScale) + T.half);
  };
  const ringScale = (y: number): number => {
    if (!(0 < y || Number.isNaN(y))) return T.ringScaleLow;
    if (!(T.ringHeightMax > y)) return T.ringScaleHigh;
    return f(f(f(T.one - f(y * T.ringSlope)) * T.ringSpan) + T.ringBase);
  };

  const pool: Segment[] = [];
  const segAt = (i: number): Segment => pool[i] ?? (pool[i] = blank());
  const segs: Segment[] = [];
  const clipOrigin = blank();
  const layerEnd = [0, 0, 0];
  const counts = [0, 0, 0];

  let capacity = 0;
  let vx = new Float64Array(0);
  let vy = new Float64Array(0);
  let vz = new Float64Array(0);
  let vu = new Float64Array(0);
  let vv = new Float64Array(0);
  let vc = new Uint32Array(0);
  let reverse = new Uint8Array(0);
  const grow = (vertices: number): void => {
    if (vertices <= capacity) return;
    let next = Math.max(64, capacity);
    while (next < vertices) next *= 2;
    const f64 = (a: Float64Array): Float64Array<ArrayBuffer> => {
      const b = new Float64Array(next);
      b.set(a);
      return b;
    };
    vx = f64(vx);
    vy = f64(vy);
    vz = f64(vz);
    vu = f64(vu);
    vv = f64(vv);
    const colours = new Uint32Array(next);
    colours.set(vc);
    vc = colours;
    const flags = new Uint8Array(next);
    flags.set(reverse);
    reverse = flags;
    capacity = next;
  };
  let used = 0;
  const put = (x: number, y: number, z: number, c: number, u: number, v: number): void => {
    finite(x, "x");
    finite(y, "y");
    finite(z, "z");
    finite(u, "u");
    vx[used] = x;
    vy[used] = y;
    vz[used] = z;
    vc[used] = c;
    vu[used] = u;
    vv[used] = v;
    used++;
  };

  /**
   * Writes each enabled layer's vertices consecutively into `output` from vertex `vertexOffset`
   * and reports the vertex count per layer.
   */
  function writeAirBand(
    output: DataView,
    vertexOffset: number,
    input: AirBandInput,
  ): AirBandResult {
    const {
      mode,
      depthArgs,
      times,
      narrow,
      generator: g,
      elements,
      joints,
      manager,
      score,
      x87,
    } = input;
    if (!Number.isInteger(vertexOffset) || vertexOffset < 0)
      throw new RangeError("A whole vertex offset is required");
    const n = depthArgs.length;
    if (n === 0 || n !== elements.length || n !== times.length)
      return {
        early: true,
        statics: input.statics,
        joints: joints.map((joint) =>
          joint.enabled ? { cleared: true, count: 0 } : { untouched: true },
        ) as unknown as AirBandResult["joints"],
      };
    const depth = (x: number) => depthAt(manager, x, 1, 1, score.scroll);
    let zeroDepth = input.statics.zeroDepth;
    if (!zeroDepth.initialized) zeroDepth = { initialized: true, bits: bitsOf(depth(0)) };
    const S = fromBits(zeroDepth.bits);
    const nseg = g.head ? n : n - 1;
    const lane0 = elements[0].lane;
    segs.length = 0;
    for (let i = 0; i < nseg; i++) segs.push(reset(segAt(i)));
    let idx = 0;
    let firstTiny = -1;
    let chainStart = 0;
    if (g.head) {
      const s = segs[0];
      const e = elements[0];
      s.t0 = s.t1 = times[0];
      s.tiny = 0;
      s.zS = s.zE = depth(depthArgs[0]);
      s.visible = 1;
      s.f10 = 0;
      s.f28 = g.i28 !== -1 ? 1 : 0;
      s.xS = s.xE = laneX(e.lane, x87);
      s.yS = 0;
      s.yE = height(e.height, x87);
      s.wS = s.wE = e.width;
      s.start = s.end = 1;
      s.vS = g.vMin;
      s.vE = g.vMax;
      s.u0S = s.u0E = uCoord(e.lane, e.width, lane0, -1);
      s.u1S = s.u1E = uCoord(e.lane, e.width, lane0, 1);
      idx = 1;
    }
    const vMin = g.vMin;
    const vMax = g.vMax;
    if (n !== 1) {
      for (let i = 0; i < n - 1; i++, idx++) {
        const s = segs[idx];
        const a = elements[i];
        const b = elements[i + 1];
        s.t0 = times[i];
        s.t1 = times[i + 1];
        if (T.eps > s.t0 && s.t1 > T.negEps) {
          s.tiny = 1;
          if (firstTiny === -1) firstTiny = idx;
        } else s.tiny = 0;
        s.zS = depth(depthArgs[i]);
        s.zE = depth(depthArgs[i + 1]);
        s.visible = 1;
        s.f10 = g.i10 !== -1 ? 1 : 0;
        s.f1c = g.i1c !== -1 ? 1 : 0;
        s.f28 = g.i28 !== -1 ? 1 : 0;
        s.xS = laneX(a.lane, x87);
        s.xE = laneX(b.lane, x87);
        s.yS = height(a.height, x87);
        s.yE = height(b.height, x87);
        s.wS = a.width;
        s.wE = b.width;
        s.start = idx === 0 || a.flag !== 0 ? 1 : 0;
        s.end = idx === nseg - 1 || b.flag !== 0 ? 1 : 0;
        s.vS = vMin;
        s.vE = vMax;
        s.u0S = uCoord(a.lane, a.width, lane0, -1);
        s.u1S = uCoord(a.lane, a.width, lane0, 1);
        s.u0E = uCoord(b.lane, b.width, lane0, -1);
        s.u1E = uCoord(b.lane, b.width, lane0, 1);
        if (s.end) {
          const total = maxss(abs(f(s.t1 - segs[chainStart].t0)), T.minSpan);
          if (!(chainStart > idx)) {
            const inv = f(T.one / total);
            let acc = 0;
            let q = f(inv * 0);
            for (let k = chainStart; k <= idx; k++) {
              const sk = segs[k];
              sk.vS = q > vMax ? vMax : maxss(q, vMin);
              acc = f(acc + abs(f(sk.t0 - sk.t1)));
              q = f(inv * acc);
              sk.vE = q > vMax ? vMax : maxss(q, vMin);
            }
          }
          chainStart = idx + 1;
        }
      }
      if (firstTiny >= 0) {
        const s = segs[firstTiny];
        let d = abs(f(s.t1 - s.t0));
        if (T.eps > abs(d)) d = T.eps;
        const t = clamp01(f(abs(s.t0) / d));
        const b = segAt(nseg);
        copySegment(b, s);
        segs.splice(firstTiny + 1, 0, b);
        const m = f(T.one - t);
        s.t1 = 0;
        s.zE = S;
        s.end = 0;
        s.t0 = 0;
        s.xE = f(f(s.xS * m) + f(t * s.xE));
        s.yE = f(f(s.yS * m) + f(t * s.yE));
        s.wE = f(f(s.wS * m) + f(t * s.wE));
        s.vE = f(f(s.vS * m) + f(t * s.vE));
        s.u0E = f(f(s.u0S * m) + f(t * s.u0E));
        s.u1E = f(f(s.u1S * m) + f(t * s.u1E));
        b.zS = S;
        b.xS = s.xE;
        b.yS = s.yE;
        b.wS = s.wE;
        b.start = 0;
        b.vS = s.vE;
        b.u0S = s.u0E;
        b.u1S = s.u1E;
      }
    }
    const count = segs.length;
    for (let i = 0; i < count; i++) {
      const s = segs[i];
      if ((T.near > s.zS && T.near > s.zE) || (s.zS > T.far && s.zE > T.far)) s.visible = 0;
    }
    const o = clipOrigin;
    for (let i = 0; i < count; i++) {
      const s = segs[i];
      if (!s.visible) continue;
      const d = abs(f(s.zS - s.zE));
      if (!(d >= T.eps)) continue;
      copySegment(o, s);
      if (o.zS > T.far) {
        lerpStart(s, o, clamp01(f(f(o.zS - T.far) / d)));
        s.zS = T.clipFar;
      }
      if (o.zE > T.far) {
        lerpEnd(s, o, clamp01(f(f(o.zE - T.far) / d)));
        s.zE = T.clipFar;
      }
      if (T.near > o.zS) {
        lerpStart(s, o, clamp01(f(f(T.near - o.zS) / d)));
        s.zS = T.clipNear;
      }
      if (T.near > o.zE) {
        lerpEnd(s, o, clamp01(f(f(T.near - o.zE) / d)));
        s.zE = T.clipNear;
      }
    }
    let colourA = BASE_COLOUR;
    let colourB = BASE_COLOUR;
    const alpha = ALPHA[mode];
    if (alpha) {
      colourA = setAlpha(BASE_COLOUR, alpha[0]);
      colourB = setAlpha(BASE_COLOUR, alpha[1]);
    }
    grow(count * 12);
    used = 0;

    if (joints[0].enabled) {
      for (let i = 0; i < count; i++) {
        const s = segs[i];
        if (!s.visible || !s.f10) continue;
        const hS = halfWidth(s.wS, T.body, x87);
        const hE = halfWidth(s.wE, T.body, x87);
        reverse[used >> 2] = s.zE > s.zS ? 0 : 1;
        put(f(s.xS - hS), s.yS, s.zS, colourA, s.u0S, s.vS);
        put(f(hS + s.xS), s.yS, s.zS, colourA, s.u1S, s.vS);
        put(f(s.xE - hE), s.yE, s.zE, colourA, s.u0E, s.vE);
        put(f(hE + s.xE), s.yE, s.zE, colourA, s.u1E, s.vE);
      }
    }
    layerEnd[0] = used;
    if (joints[1].enabled) {
      for (let i = 0; i < count; i++) {
        const s = segs[i];
        if (!s.visible || !s.f1c) continue;
        const hS = halfWidth(s.wS, ringScale(s.yS), x87);
        const hE = halfWidth(s.wE, ringScale(s.yE), x87);
        reverse[used >> 2] = s.zE > s.zS ? 0 : 1;
        put(f(s.xS - hS), 0, s.zS, RING_COLOUR, s.u0S, s.vS);
        put(f(hS + s.xS), 0, s.zS, RING_COLOUR, s.u1S, s.vS);
        put(f(s.xE - hE), 0, s.zE, RING_COLOUR, s.u0E, s.vE);
        put(f(hE + s.xE), 0, s.zE, RING_COLOUR, s.u1E, s.vE);
      }
    }
    layerEnd[1] = used;
    if (joints[2].enabled) {
      const c = narrow === NARROW ? T.edgeHalfNarrow : T.edgeHalf;
      for (let i = 0; i < count; i++) {
        const s = segs[i];
        if (!s.visible || !s.f28) continue;
        put(f(s.xS - c), s.yS, s.zS, colourB, 0, s.vS);
        put(f(c + s.xS), s.yS, s.zS, colourB, T.one, s.vS);
        put(f(s.xE - c), s.yE, s.zE, colourB, 0, s.vE);
        put(f(s.xE + c), s.yE, s.zE, colourB, T.one, s.vE);
      }
    }
    layerEnd[2] = used;
    counts[0] = (layerEnd[0] >> 2) * 6;
    counts[1] = ((layerEnd[1] - layerEnd[0]) >> 2) * 6;
    counts[2] = ((layerEnd[2] - layerEnd[1]) >> 2) * 12;
    const total = counts[0] + counts[1] + counts[2];
    if (output.byteLength < (vertexOffset + total) * HOLD_VERTEX_BYTES)
      throw new RangeError("Vertex buffer is too small for the AIR band");
    let at = vertexOffset * HOLD_VERTEX_BYTES;
    for (let layer = 0; layer < 3; layer++) {
      const first = layer === 0 ? 0 : layerEnd[layer - 1];
      for (let quad = first; quad < layerEnd[layer]; quad += 4) {
        const order = layer === 2 ? ORDER_EDGE : reverse[quad >> 2] ? ORDER_REVERSE : ORDER_FORWARD;
        for (let k = 0; k < order.length; k++) {
          const p = quad + order[k];
          output.setFloat32(at, vx[p], true);
          output.setFloat32(at + 4, vy[p], true);
          output.setFloat32(at + 8, vz[p], true);
          output.setUint32(at + 12, vc[p], true);
          output.setFloat32(at + 16, vu[p], true);
          output.setFloat32(at + 20, vv[p], true);
          at += HOLD_VERTEX_BYTES;
        }
      }
    }
    return {
      early: false,
      statics: { zeroDepth },
      joints: joints.map((joint, i) =>
        joint.enabled ? { cleared: true, count: counts[i] } : { untouched: true },
      ) as unknown as AirBandResult["joints"],
    };
  }
  return { writeAirBand };
}
