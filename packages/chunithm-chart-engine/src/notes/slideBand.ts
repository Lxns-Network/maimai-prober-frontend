/**
 * SLIDE band geometry: the segments of a slide, and the three vertex layers built from them.
 *
 * A slide is a chain of joints; consecutive pairs form segments, and a joint carrying a flag closes
 * one chain and opens the next. Each segment is clipped into the visible depth window and split into
 * up to two pieces when it crosses a bound, then emitted as quads whose winding depends on whether it
 * runs toward or away from the camera and whether it widens or narrows.
 *
 * The three layers are the body (widths from the elements), the centre line and the pulse layer. The
 * lane coordinates go through extended-precision multiply/subtract before being rounded, which is
 * what the reference does and what keeps a vertex in the same bit.
 */

import {
  BAND_COLOURS,
  createHoldBand,
  HOLD_VERTEX_BYTES,
  type StripPrecision,
  type ZeroDepthState,
} from "./holdBand";
import { depthAt } from "./space";
import { exact, mul, precisionBits, round, sub, toF32, type ExactValue } from "./stripFloat";
import type { NoteTimelineScore } from "./timing";

/** Joint input for one layer: whether it is drawn, and how many vertices it had before. */
export interface StripJointInput {
  enabled: boolean;
  priorCount: number;
}

/** Result for one layer: either left untouched, or cleared and replaced. */
export type StripJointResult =
  | { untouched: true }
  | { untouched?: false; cleared: true; count: number; scalar: number | null };

/** Depth carried across frames for the pulse layer's reference depth and the centre line's half width. */
export interface SlideStatics {
  zeroDepth: ZeroDepthState;
  centreHalf: ZeroDepthState;
}

/** One joint of the chain: its width, lane position and chain-break flag. */
export interface SlideElement {
  width: number;
  lane: number;
  flag: number;
}

export interface SlideBandInput {
  /** 0 draws the body in the normal colour, 1 pulses it, 2 uses the secondary colour. */
  mode: number;
  /** Pulse phase. */
  phase: number;
  /** Per-joint depth operand. */
  depthArgs: readonly number[];
  /** Per-joint time operand. */
  times: readonly number[];
  /** Per-joint lane and width. */
  elements: readonly SlideElement[];
  /** Layer enables and prior counts, one per layer. */
  joints: readonly [StripJointInput, StripJointInput, StripJointInput];
  /** Note-state view the depth model reads. */
  manager: DataView;
  /** Bound score whose scroll rows the depth model reads. */
  score: NoteTimelineScore;
  /** Depth carried in from the previous frame. */
  statics: SlideStatics;
  /** Precision for the lane coordinates and the pulse scalar. */
  x87: StripPrecision;
}

export interface SlideBandResult {
  /** True when the input has no segments; the caller keeps whatever was drawn before. */
  early: boolean;
  statics: SlideStatics;
  joints: readonly StripJointResult[];
  /** Vertices written, per layer. */
  counts: readonly [number, number, number];
  /** Vertices in one segment's body (two quads), for buffer sizing. */
  vertices: number;
}

const table = Object.freeze({
  f32: Object.freeze({
    eps: 9.999999974752427e-7,
    minSpan: 9.999999747378752e-6,
    one: 1,
    near: -600,
    far: 50,
    phaseScale: 0.05000000074505806,
    widthBias: 8,
    laneOffset: 8,
    laneScale: 4,
    half: 0.5,
    inner: 0.699999988079071,
    widthEps: 1.1920928955078125e-7,
    twoPi: 6.2831854820251465,
  }),
  imm: Object.freeze({
    segmentVStart: 1,
    segmentVEnd: 0,
    uOne: 1,
    uInner: 0.15000000596046448,
    uInnerFar: 0.8500000238418579,
    clipNear: -600,
    clipFar: 50,
  }),
  joint2Colour: 0x20ffffff,
  centreHalfInit: 9,
});

/** Vertex orders per quad count: flat body, wider, narrower, each in both travel directions. */
const ORDERS = Object.freeze({
  flatUp: [0, 2, 3, 0, 3, 1],
  flatDown: [0, 3, 2, 0, 1, 3],
  widerUp: [4, 6, 7, 5, 4, 7, 0, 2, 4, 2, 6, 4, 5, 7, 3, 1, 5, 3],
  narrowerUp: [4, 6, 7, 5, 4, 7, 0, 2, 6, 4, 0, 6, 5, 7, 1, 7, 3, 1],
  widerDown: [6, 4, 7, 4, 5, 7, 2, 0, 4, 6, 2, 4, 7, 5, 3, 5, 1, 3],
  narrowerDown: [6, 4, 7, 4, 5, 7, 2, 0, 6, 0, 4, 6, 7, 5, 1, 3, 7, 1],
} as const);

const scratch = new DataView(new ArrayBuffer(8));
const bitsOf = (value: number): number => {
  scratch.setFloat32(0, value, true);
  return scratch.getUint32(0, true);
};
const fromBits = (bits: number): number => {
  scratch.setUint32(0, bits >>> 0, true);
  return scratch.getFloat32(0, true);
};

export function createSlideBand() {
  const f = Math.fround;
  const T = table.f32;
  const I = table.imm;
  const F = {
    eps: f(T.eps),
    minSpan: f(T.minSpan),
    one: f(T.one),
    near: f(T.near),
    far: f(T.far),
    phaseScale: f(T.phaseScale),
    widthBias: f(T.widthBias),
    laneOffset: f(T.laneOffset),
    laneScale: f(T.laneScale),
    half: f(T.half),
    inner: f(T.inner),
    widthEps: f(T.widthEps),
    twoPi: f(T.twoPi),
  };
  const hold = createHoldBand();
  const laneOffsetExact = exact(F.laneOffset);
  const laneScaleExact = exact(F.laneScale);
  const halfExact = exact(F.half);

  const laneX87 = (x: number, precision: number): ExactValue =>
    round(mul(round(sub(exact(x), laneOffsetExact), precision), laneScaleExact), precision);

  /** Lane coordinate of a lane-unit position, evaluated in extended precision then rounded. */
  const laneX = (x: number, x87: StripPrecision): number => {
    const P = precisionBits(x87);
    return toF32(laneX87(x, P));
  };

  /** Half width of a lane-width value: the width is biased, converted, halved and rounded. */
  const halfWidth = (w: number, x87: StripPrecision): number => {
    const P = precisionBits(x87);
    return toF32(round(mul(laneX87(f(w + F.widthBias), P), halfExact), P));
  };

  const clamp01 = (x: number): number => (x > F.one ? F.one : x > 0 ? x : 0);
  /** Absolute value that keeps a negative zero's sign irrelevant, matching the reference's compare. */
  const abs = (x: number): number => (0 > x ? -x : x);
  const span = (a: number, b: number): number => abs(f(a - b));

  /** One segment's mutable state. */
  interface Segment {
    tiny: number;
    visible: number;
    f4: number;
    f8: number;
    zS: number;
    zE: number;
    xS: number;
    xE: number;
    wS: number;
    wE: number;
    hS: number;
    hE: number;
    start: number;
    end: number;
    vS: number;
    vE: number;
  }

  /**
   * Writes the three layers into `output` at `vertexOffset` and returns how many vertices each
   * layer used. Layers are laid out consecutively in body, centre, pulse order.
   */
  function writeSlideBand(
    output: DataView,
    vertexOffset: number,
    input: SlideBandInput,
  ): SlideBandResult {
    const { mode, manager, score, statics } = input;
    if (!Number.isInteger(vertexOffset) || vertexOffset < 0)
      throw new RangeError("A whole vertex offset is required");
    if ((output.byteLength - vertexOffset) % HOLD_VERTEX_BYTES !== 0)
      throw new RangeError("Vertex buffer must hold whole 24-byte records");

    const depth = (x: number) => depthAt(manager, x, 1, 1, score.scroll);
    const layerState = input.joints.map((joint) => ({ ...joint }));
    const n = input.depthArgs.length;
    const nextStatics: SlideStatics = {
      zeroDepth: statics.zeroDepth,
      centreHalf: statics.centreHalf,
    };

    const early = (): SlideBandResult => ({
      early: true,
      statics: nextStatics,
      joints: layerState.map((joint) =>
        joint.enabled
          ? ({ cleared: true, count: 0, scalar: null } as const)
          : ({ untouched: true } as const),
      ),
      counts: [0, 0, 0],
      vertices: 0,
    });
    // A chain needs at least two joints, and the three columns must agree on their length.
    if (n === 0 || n !== input.elements.length || n !== input.times.length) return early();

    if (!nextStatics.zeroDepth.initialized)
      nextStatics.zeroDepth = { initialized: true, bits: bitsOf(depth(0)) };
    const S = fromBits(nextStatics.zeroDepth.bits);

    const segments: Segment[] = [];
    const segment = (): Segment => ({
      tiny: 0,
      visible: 0,
      f4: 0,
      f8: 0,
      zS: 0,
      zE: 0,
      xS: 0,
      xE: 0,
      wS: 0,
      wE: 0,
      hS: 0,
      hE: 0,
      start: 0,
      end: 0,
      vS: 0,
      vE: 0,
    });
    const segCount = n - 1;
    for (let i = 0; i < segCount; i++) segments.push(segment());

    let firstTiny = segCount;
    let chainStart = 0;
    for (let i = 0; i < segCount; i++) {
      const s = segments[i];
      s.f4 = input.times[i];
      s.f8 = input.times[i + 1];
      if (F.eps > s.f4 && s.f8 > -F.eps) {
        s.tiny = 1;
        if (firstTiny === segCount) firstTiny = i;
      } else s.tiny = 0;
      s.zS = depth(input.depthArgs[i]);
      s.zE = depth(input.depthArgs[i + 1]);
      s.visible = 1;
      s.xS = i === 0 ? laneX(input.elements[i].lane, input.x87) : segments[i - 1].xE;
      s.xE = laneX(input.elements[i + 1].lane, input.x87);
      s.wS = input.elements[i].width;
      s.wE = input.elements[i + 1].width;
      s.start = i === 0 || input.elements[i].flag !== 0 ? 1 : 0;
      s.end = i === segCount - 1 || input.elements[i + 1].flag !== 0 ? 1 : 0;
      s.vS = I.segmentVStart;
      s.vE = I.segmentVEnd;
      if (s.end) {
        // The chain's V runs from its own first time to its last, so each segment's share depends on
        // the whole chain rather than on its own span.
        const total = Math.max(span(s.f8, segments[chainStart].f4), F.minSpan);
        const inv = f(F.one / total);
        let acc = 0;
        let q = f(inv * 0);
        for (let k = chainStart; k <= i; k++) {
          segments[k].vS = clamp01(q);
          acc = f(acc + span(segments[k].f4, segments[k].f8));
          q = f(inv * acc);
          segments[k].vE = clamp01(q);
        }
        chainStart = i + 1;
      }
    }

    // A segment starting at zero time is degenerate: the reference splits it at the depth where the
    // zero-time end sits, so the substituted depth is drawn as its own piece.
    if (firstTiny < segCount) {
      const s = segments[firstTiny];
      let d = span(s.f8, s.f4);
      if (F.eps > abs(d)) d = F.eps;
      const t = clamp01(f(abs(s.f4) / d));
      const tail = { ...s };
      segments.splice(firstTiny + 1, 0, tail);
      const omt = f(F.one - t);
      const txE = f(t * s.xE);
      s.f8 = 0;
      s.zE = S;
      s.xE = f(f(s.xS * omt) + txE);
      s.end = 0;
      s.f4 = 0;
      s.wE = f(f(s.wS * omt) + f(t * s.wE));
      s.vE = f(f(s.vS * omt) + f(t * s.vE));
      tail.zS = S;
      tail.xS = s.xE;
      tail.wS = s.wE;
      tail.start = 0;
      tail.vS = s.vE;
    }

    for (const s of segments) {
      // A pulsed band hides segments that start before time zero; the depth bounds hide the rest.
      if (
        (mode === 1 && F.eps > s.f8) ||
        (F.near > s.zS && F.near > s.zE) ||
        (s.zS > F.far && s.zE > F.far)
      )
        s.visible = 0;
    }

    for (const s of segments) {
      if (!s.visible) continue;
      const o = { ...s };
      const d = span(o.zS, o.zE);
      if (!(d >= F.eps)) continue;
      // Each bound moves its own end along the segment, carrying x, width and V with it.
      const lerpS = (t: number): void => {
        const m = f(F.one - t);
        s.xS = f(f(o.xS * m) + f(t * o.xE));
        s.wS = f(f(o.wS * m) + f(t * o.wE));
        s.vS = f(f(o.vS * m) + f(t * o.vE));
      };
      const lerpE = (t: number): void => {
        const m = f(F.one - t);
        s.xE = f(f(o.xE * m) + f(t * o.xS));
        s.wE = f(f(o.wE * m) + f(t * o.wS));
        s.vE = f(f(o.vE * m) + f(t * o.vS));
      };
      if (o.zS > F.far) {
        lerpS(clamp01(f(f(o.zS - F.far) / d)));
        s.zS = I.clipFar;
      }
      if (o.zE > F.far) {
        lerpE(clamp01(f(f(o.zE - F.far) / d)));
        s.zE = I.clipFar;
      }
      if (F.near > o.zS) {
        lerpS(clamp01(f(f(F.near - o.zS) / d)));
        s.zS = I.clipNear;
      }
      if (F.near > o.zE) {
        lerpE(clamp01(f(f(F.near - o.zE) / d)));
        s.zE = I.clipNear;
      }
    }

    const frac = f(f(input.phase * F.phaseScale) % 1);
    const colour = hold.colourFor(mode);
    let scalar = F.one;
    const pulsed = mode === 1;
    if (pulsed) scalar = hold.pulseAt(f(frac * F.twoPi), input.x87);
    // Clipping changes widths. Both body and pulse use the same final segment widths.
    if (input.joints[0].enabled || (input.joints[2].enabled && pulsed))
      for (const s of segments) {
        if (!s.visible) continue;
        s.hS = halfWidth(s.wS, input.x87);
        s.hE = s.wE === s.wS ? s.hS : halfWidth(s.wE, input.x87);
      }

    /** Write cursor: layers are laid out consecutively from the caller's offset. */
    let at = vertexOffset;

    /** Appends the vertices named by `order`. */
    const writeOrder = (
      centre: number,
      vertices: readonly number[][],
      order: readonly number[],
      colour: number,
    ): number => {
      for (const k of order) {
        const v = vertices[k];
        output.setFloat32(centre, v[0], true);
        output.setFloat32(centre + 4, 0, true);
        output.setFloat32(centre + 8, v[1], true);
        output.setUint32(centre + 12, colour, true);
        output.setFloat32(centre + 16, v[2], true);
        output.setFloat32(centre + 20, v[3], true);
        centre += HOLD_VERTEX_BYTES;
      }
      return centre;
    };

    const results: StripJointResult[] = [];
    const counts: [number, number, number] = [0, 0, 0];

    // Layer 1: the body, whose quads carry the element widths.
    if (input.joints[0].enabled) {
      let count = 0;
      for (const s of segments) {
        if (!s.visible) continue;
        const { hS, hE } = s;
        const iS = f(hS * F.inner);
        const iE = f(hE * F.inner);
        const v: number[][] = [
          [f(s.xS - hS), s.zS, 0, s.vS],
          [f(s.xS + hS), s.zS, I.uOne, s.vS],
          [f(s.xE - hE), s.zE, 0, s.vE],
          [f(s.xE + hE), s.zE, I.uOne, s.vE],
          [f(s.xS - iS), s.zS, I.uInner, s.vS],
          [f(s.xS + iS), s.zS, I.uInnerFar, s.vS],
          [f(s.xE - iE), s.zE, I.uInner, s.vE],
          [f(s.xE + iE), s.zE, I.uInnerFar, s.vE],
        ];
        const dw = abs(f(s.wS - s.wE));
        const up = s.zE > s.zS;
        const wider = s.wE > s.wS;
        // A negligible width change emits one quad; otherwise two, with the inner pair first.
        const order =
          F.widthEps > dw
            ? up
              ? ORDERS.flatUp
              : ORDERS.flatDown
            : up
              ? wider
                ? ORDERS.widerUp
                : ORDERS.narrowerUp
              : wider
                ? ORDERS.widerDown
                : ORDERS.narrowerDown;
        count += order.length;
        at = writeOrder(at, v, order, colour);
      }
      counts[0] = count;
      results.push({ cleared: true, count, scalar: scalar });
    } else {
      counts[0] = input.joints[0].priorCount;
      results.push({ untouched: true });
    }

    // Layer 2: the centre line, whose half width comes from the carried state.
    if (input.joints[1].enabled) {
      if (!nextStatics.centreHalf.initialized) {
        const P = precisionBits(input.x87);
        nextStatics.centreHalf = {
          initialized: true,
          // `centreHalfInit` is a plain value; reading it as a bit pattern would give a denormal.
          bits: bitsOf(toF32(round(mul(laneX87(table.centreHalfInit, P), halfExact), P))),
        };
      }
      const c = fromBits(nextStatics.centreHalf.bits);
      let count = 0;
      for (const s of segments) {
        if (!s.visible) continue;
        const v: number[][] = [
          [f(s.xS - c), s.zS, 0, s.vS],
          [f(s.xS + c), s.zS, I.uOne, s.vS],
          [f(s.xE - c), s.zE, 0, s.vE],
          [f(s.xE + c), s.zE, I.uOne, s.vE],
        ];
        const order = s.zE > s.zS ? ORDERS.flatUp : ORDERS.flatDown;
        count += 6;
        at = writeOrder(at, v, order, BAND_COLOURS.normal);
      }
      counts[1] = count;
      results.push({ cleared: true, count, scalar: null });
    } else {
      counts[1] = input.joints[1].priorCount;
      results.push({ untouched: true });
    }

    // Layer 3: the pulse layer, only drawn when the body is pulsing.
    if (input.joints[2].enabled) {
      let count = 0;
      if (pulsed) {
        for (const s of segments) {
          if (!s.visible) continue;
          const { hS, hE } = s;
          const v: number[][] = [
            [f(s.xS - hS), s.zS, 0, s.vS],
            [f(s.xS + hS), s.zS, I.uOne, s.vS],
            [f(s.xE - hE), s.zE, 0, s.vE],
            [f(hE + s.xE), s.zE, I.uOne, s.vE],
          ];
          const order = s.zE > s.zS ? ORDERS.flatUp : ORDERS.flatDown;
          count += 6;
          at = writeOrder(at, v, order, table.joint2Colour);
        }
      }
      counts[2] = count;
      results.push({ cleared: true, count, scalar: null });
    } else {
      counts[2] = input.joints[2].priorCount;
      results.push({ untouched: true });
    }

    return {
      early: false,
      statics: nextStatics,
      joints: results,
      counts,
      vertices: counts[0] + counts[1] + counts[2],
    };
  }

  return Object.freeze({ writeSlideBand, internals: { laneX, halfWidth } });
}
