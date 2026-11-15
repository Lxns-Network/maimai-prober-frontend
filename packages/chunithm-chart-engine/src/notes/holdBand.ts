/**
 * HOLD band geometry: the six vertices of one clipped quad per record.
 *
 * The band is bounded by two depths along the note's own axis; each is clamped into the visible
 * window and turned into a V coordinate. Colour and the pulse scalar depend on the band's mode, and
 * the triangle winding flips with the travel direction so both stay front facing.
 *
 * Every arithmetic step keeps the reference's rounding, and the pulse scalar may be evaluated in
 * extended precision; that is what makes the output bit-identical rather than merely close.
 */

import { depthAt } from "./space";
import type { NoteTimelineScore } from "./timing";

/** Bytes per vertex: x, y, z as float32, colour as u32, u and v as float32. */
export const HOLD_VERTEX_BYTES = 24;
/** Vertices in one band quad. */
export const HOLD_BAND_VERTICES = 6;

/** Precision the pulse scalar is evaluated at. */
export type StripPrecision = "single" | "extended";

/** Depth carried across frames so a band whose ends do not move keeps a stable reference depth. */
export type ZeroDepthState = { initialized: false } | { initialized: true; bits: number };

export interface HoldBandInput {
  /** 24-byte parameter block: mode at 0, then five float32 operands at 4, 8, 12, 16 and 20. */
  args: DataView;
  /** Lane-centre operand. */
  lane: number;
  /** Lane-width operand. */
  width: number;
  /** Note-state view the depth model reads. */
  manager: DataView;
  /** Bound score whose scroll rows the depth model reads. */
  score: NoteTimelineScore;
  /** Depth carried in from the previous frame. */
  zeroDepth: ZeroDepthState;
  /** Precision for the pulse scalar. */
  x87: StripPrecision;
}

export type HoldBandResult =
  | { cleared: true; zeroDepth: { initialized: true; bits: number }; vertices: 0; scalar: 0 }
  | {
      cleared: false;
      zeroDepth: { initialized: true; bits: number };
      vertices: number;
      /** Pulse scalar for the band material, already rounded to float32. */
      scalar: number;
    };

/** Band colours, shared with the slide band so the literals exist in one place. */
export const BAND_COLOURS = Object.freeze({ normal: 0xffffffff, mode2: 0xff666666 });

const table = Object.freeze({
  f32: Object.freeze({
    eps: 9.999999974752427e-7,
    negEps: -9.999999974752427e-7,
    near: -600,
    far: 50,
    half: 0.5,
    one: 1,
    phaseScale: 0.05000000074505806,
    twoPi: 6.2831854820251465,
    pulseScale: 0.25,
    pulseBias: 1.5,
    laneOffset: 8,
    laneScale: 4,
  }),
  f64: Object.freeze({
    pi: 3.141592653589793,
    invTwoPi: 0.15915494309189535,
    eighth: 0.125,
    q375: 0.375,
    twoPi: 6.283185307179586,
    s7: 2.7557319223985893e-6,
    s5: 1.984126984126984e-4,
    s3: 8.333333333333333e-3,
    s1: 0.16666666666666666,
    one: 1,
    quarter: 0.25,
    c8: 2.48015873015873e-5,
    c6: 1.388888888888889e-3,
    c4: 0.041666666666666664,
    half: 0.5,
    q625: 0.625,
    q75: 0.75,
  }),
  colours: BAND_COLOURS,
});

const scratch = new DataView(new ArrayBuffer(8));
const bitsOf = (value: number): number => {
  scratch.setFloat32(0, value, true);
  return scratch.getUint32(0, true);
};
const fromBits = (bits: number): number => {
  scratch.setUint32(0, bits >>> 0, true);
  return scratch.getFloat32(0, true);
};

export function createHoldBand() {
  const f = Math.fround;
  const T = table.f32;
  const D = table.f64;
  const F = {
    eps: f(T.eps),
    negEps: f(T.negEps),
    near: f(T.near),
    far: f(T.far),
    half: f(T.half),
    one: f(T.one),
    phaseScale: f(T.phaseScale),
    twoPi: f(T.twoPi),
    pulseScale: f(T.pulseScale),
    pulseBias: f(T.pulseBias),
    laneOffset: f(T.laneOffset),
    laneScale: f(T.laneScale),
  };

  /** Lane coordinate of a lane-unit position. */
  const laneX = (x: number): number => f(f(x - F.laneOffset) * F.laneScale);

  /**
   * The band's own sine: a degree-7 polynomial on a quadrant-reduced argument, with the polynomial
   * coefficients kept in double precision and only the input and result rounded to single. The
   * platform sine differs in the last bits, which would show up as a colour shift.
   */
  function sine(xf: number): { value: number; f64: boolean } {
    let x = xf;
    if (0 > x) x = D.pi - x;
    const t = x * D.invTwoPi + D.eighth;
    let i = Math.trunc(t);
    if (!(Math.abs(t) < 2147483648)) i = -2147483648;
    const r = t - i - D.eighth;
    const sinPoly = (y: number): number => {
      const z = y * y;
      return ((((z * D.s7 - D.s5) * z + D.s3) * z - D.s1) * z + D.one) * y;
    };
    const cosPoly = (z: number): number =>
      (((z * D.c8 - D.c6) * z + D.c4) * z - D.half) * z + D.one;
    if (D.q375 > r) {
      if (D.eighth > r) return { value: f(sinPoly(r * D.twoPi)), f64: false };
      const y = (r - D.quarter) * D.twoPi;
      return { value: f(cosPoly(y * y)), f64: false };
    }
    if (D.q625 > r) return { value: -sinPoly((r - D.half) * D.twoPi), f64: true };
    const y = (r - D.q75) * D.twoPi;
    return { value: -cosPoly(y * y), f64: true };
  }

  /** Rounds an extended-precision sum to float32, using the discarded low bits as a tie-break. */
  function roundExtendedThenF32(hi: number, lo: number): number {
    if (hi < 1 || hi >= 2) throw new RangeError("pulse sum outside [1,2)");
    const e = lo * 2 ** 63;
    let n = Math.floor(e);
    const d = e - n;
    if (d > 0.5 || (d === 0.5 && n % 2 !== 0)) n += 1;
    const lo64 = n * 2 ** -63;
    const r = f(hi);
    if (lo64 !== 0 && Math.abs(hi - r) === 2 ** -24)
      return lo64 > 0 ? f(hi + 2 ** -24) : f(hi - 2 ** -24);
    return r;
  }

  function pulse(s: { value: number; f64: boolean }, x87: StripPrecision): number {
    if (x87 === "single") return f(f(s.value * F.pulseScale) + F.pulseBias);
    if (x87 !== "extended") throw new TypeError("x87 precision must be single or extended");
    const q = s.value * F.pulseScale;
    const hi = F.pulseBias + q;
    const lo = q - (hi - F.pulseBias);
    return roundExtendedThenF32(hi, lo);
  }

  /**
   * Writes the band into `output` at `vertexOffset` and returns its vertex count, or zero when the
   * band lies outside the visible window and must be cleared.
   */
  function writeHoldBand(
    output: DataView,
    vertexOffset: number,
    input: HoldBandInput,
  ): HoldBandResult {
    const { args, manager, score } = input;
    if (!Number.isInteger(vertexOffset) || vertexOffset < 0)
      throw new RangeError("A whole vertex offset is required");
    if ((output.byteLength - vertexOffset) % HOLD_VERTEX_BYTES !== 0)
      throw new RangeError("Vertex buffer must hold whole 24-byte records");

    const depth = (x: number) => depthAt(manager, x, 1, 1, score.scroll);
    const mode = args.getInt32(0, true);
    const p4 = args.getFloat32(4, true);
    const p8 = args.getFloat32(8, true);
    const pC = args.getFloat32(12, true);
    const p10 = args.getFloat32(16, true);
    const p14 = args.getFloat32(20, true);

    const tiny = F.eps > f(p8 * p10);
    const zA = depth(p4);
    const zB = depth(pC);
    const staticState = input.zeroDepth.initialized
      ? input.zeroDepth
      : { initialized: true as const, bits: bitsOf(depth(0)) };
    const S = fromBits(staticState.bits);

    // A degenerate span substitutes the carried reference depth for the head end.
    let a = zA;
    const b = zB;
    if (tiny && f(b - S) > F.negEps) a = S;

    const clear = {
      cleared: true as const,
      zeroDepth: staticState,
      vertices: 0 as const,
      scalar: 0 as const,
    };
    if (F.near > a && F.near > b) return clear;
    if (a > F.far && b > F.far) return clear;
    const forward = b > a;
    // The span uses the adjusted head end, not the raw depth.
    const d = Math.abs(f(a - b));
    if (F.eps > Math.abs(d)) return clear;

    const half = f(input.width * F.half);
    const xL = laneX(f(input.lane - half));
    const xR = laneX(f(half + input.lane));

    let aC = zA > F.far ? F.far : Math.max(zA, F.near);
    const bC = zB > F.far ? F.far : Math.max(zB, F.near);
    const inv = f(F.one / d);
    let uA = f(F.one - f(inv * Math.abs(f(zA - aC))));
    const uB = f(inv * Math.abs(f(bC - zB)));
    if (tiny) {
      const g = f(zB - S);
      if (F.negEps < g || Number.isNaN(g) || mode === 1) {
        aC = S;
        const den = f(p10 - p8);
        if (!(den < F.eps || Number.isNaN(den))) uA = f(p10 / den);
      }
    }

    let colour = table.colours.normal >>> 0;
    let scalar = F.one;
    if (mode === 2) colour = table.colours.mode2 >>> 0;
    if (mode === 1) {
      const phase = f(p14 * F.phaseScale);
      const frac = f(phase % 1);
      scalar = pulse(sine(f(frac * F.twoPi)), input.x87);
    }

    const A = [xL, 0, aC, 0, uA] as const;
    const B = [xR, 0, aC, F.one, uA] as const;
    const C = [xL, 0, bC, 0, uB] as const;
    const Dd = [xR, 0, bC, F.one, uB] as const;
    // The two triangles must share their diagonal, so the winding flips with the travel direction.
    const order = forward ? [A, C, Dd, A, Dd, B] : [A, Dd, C, A, B, Dd];

    let at = vertexOffset;
    for (const vertex of order) {
      const [x, y, z, u, v] = vertex;
      output.setFloat32(at, x, true);
      output.setFloat32(at + 4, y, true);
      output.setFloat32(at + 8, z, true);
      output.setUint32(at + 12, colour, true);
      output.setFloat32(at + 16, u, true);
      output.setFloat32(at + 20, v, true);
      at += HOLD_VERTEX_BYTES;
    }
    return { cleared: false, zeroDepth: staticState, vertices: HOLD_BAND_VERTICES, scalar };
  }

  /** Pulse scalar for a phase already reduced into [0, 1). */
  const pulseAt = (arg: number, x87: StripPrecision): number => pulse(sine(arg), x87);

  return Object.freeze({
    writeHoldBand,
    pulseAt,
    colourFor: (mode: number): number =>
      mode === 2 ? BAND_COLOURS.mode2 >>> 0 : BAND_COLOURS.normal >>> 0,
    internals: { pulse, sine, laneX },
  });
}
