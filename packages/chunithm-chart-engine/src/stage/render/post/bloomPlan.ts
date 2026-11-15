import type { StageBloom } from "../../nodes/bloom";

const f = Math.fround;

export type BloomShader =
  | "reduceDeComp"
  | "reduce"
  | "shiftRgb"
  | "shiftMax"
  | "blur"
  | "starLong"
  | "starShort"
  | "starSingle"
  | "combine";

export type BloomImage = number | "scene";

export interface BloomDraw {
  readonly kind: "draw";
  readonly shader: BloomShader;
  readonly target: BloomImage;
  readonly inputs: readonly BloomImage[];
  readonly blend: "replace" | "max" | "add";
  /** Nine vec4 parameters. */
  readonly params: Float32Array;
  readonly argument: Float32Array;
}

export interface BloomClear {
  readonly kind: "clear";
  readonly target: number;
}

export type BloomStep = BloomDraw | BloomClear;

const TARGET_SHIFTS = [2, 2, 2, 2, 4, 4] as const;
const BLUR_TAPS = 5;
const STAR_TAPS = 7;
const MIN_SIGMA = f(0.0099999998);
const TWO_PI = f(6.2831855);
const DEGREES = f(0.017453292);
const CHANNEL_LIMIT = 65535;

/** Sizes of the six intermediate targets for a scene of the given size. */
export function bloomTargetSizes(
  width: number,
  height: number,
): { width: number; height: number }[] {
  return TARGET_SHIFTS.map((shift) => ({ width: width >> shift, height: height >> shift }));
}

const SINE = [
  0.000002755731922398589, 0.0001984126984126984, 0.008333333333333333, 0.1666666666666667,
];
const COSINE = [0.0000248015873015873, 0.001388888888888889, 0.04166666666666666, 0.5];

function sinePolynomial(x: number): number {
  const s = x * x;
  return ((((s * SINE[0] - SINE[1]) * s + SINE[2]) * s - SINE[3]) * s + 1) * x;
}

function cosinePolynomial(x: number): number {
  const s = x * x;
  return (((s * COSINE[0] - COSINE[1]) * s + COSINE[2]) * s - COSINE[3]) * s + 1;
}

function quadrant(value: number): number {
  const turns = value * 0.1591549430918953 + 0.125;
  return turns - Math.trunc(turns) - 0.125;
}

const TAU = 6.283185307179586;

/** The polynomial sine used for the streak directions. */
export function bloomSine(angle: number): number {
  const v = angle < 0 ? Math.PI - angle : angle;
  const q = quadrant(v);
  if (q >= 0.375) {
    if (q >= 0.625) return f(-cosinePolynomial((q - 0.75) * TAU));
    return f(-sinePolynomial((q - 0.5) * TAU));
  }
  if (q >= 0.125) return f(cosinePolynomial((q - 0.25) * TAU));
  return f(sinePolynomial(q * TAU));
}

/** The polynomial cosine used for the streak directions. */
export function bloomCosine(angle: number): number {
  const v = angle < 0 ? -angle : angle;
  const q = quadrant(v);
  if (q >= 0.375) {
    if (q >= 0.625) return f(sinePolynomial((q - 0.75) * TAU));
    return f(-cosinePolynomial((q - 0.5) * TAU));
  }
  if (q >= 0.125) return f(-sinePolynomial((q - 0.25) * TAU));
  return f(cosinePolynomial(q * TAU));
}

/** Gaussian weights for offsets 0..count-1 with the given falloff. */
export function bloomWeights(attenuation: number, count: number): Float32Array {
  const sigma = attenuation <= MIN_SIGMA ? MIN_SIGMA : f(attenuation);
  const scale = f(1 / f(f(sigma * -2) * sigma));
  const root = f(Math.sqrt(TWO_PI));
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const exponent = f(f(i * i) * scale);
    out[i] = f(f(Math.exp(exponent)) / f(root * sigma));
  }
  return out;
}

function parameters(): Float32Array {
  return new Float32Array(36);
}

function splat(params: Float32Array, row: number, value: number): void {
  params.fill(value, row * 4, row * 4 + 4);
}

function weightRows(params: Float32Array, weights: Float32Array): void {
  for (let i = 0; i < weights.length; i++) splat(params, i + 1, weights[i]);
}

function shiftParams(range: number, shift: Float32Array): Float32Array {
  const params = parameters();
  splat(params, 0, 1);
  splat(params, 1, f(-range));
  splat(params, 3, CHANNEL_LIMIT);
  params.set(shift, 16);
  params[19] = 1;
  return params;
}

function draw(
  shader: BloomShader,
  target: BloomImage,
  inputs: readonly BloomImage[],
  params: Float32Array = parameters(),
  blend: BloomDraw["blend"] = "replace",
  argument: Float32Array = new Float32Array(4),
): BloomDraw {
  return { kind: "draw", shader, target, inputs, blend, params, argument };
}

/** The fixed draw sequence of the bloom filter for the given parameters and scene size. */
export function buildBloomPlan(bloom: StageBloom, width: number, height: number): BloomStep[] {
  const sizes = bloomTargetSizes(width, height);
  const plan: BloomStep[] = [draw("reduceDeComp", 0, ["scene"]), draw("reduce", 5, [0])];
  const blurWeights = bloomWeights(bloom.attenuation, BLUR_TAPS);
  const blur = (target: number, input: number, vertical: boolean) => {
    const params = parameters();
    params[vertical ? 1 : 0] = 1;
    weightRows(params, blurWeights);
    return draw("blur", target, [input], params);
  };
  if (bloom.glow) {
    plan.push(draw("shiftRgb", 4, [5], shiftParams(f(bloom.range * 2), bloom.shift)));
    plan.push(blur(5, 4, false), blur(4, 5, true));
    plan.push(draw("shiftMax", 3, [0, 4], shiftParams(bloom.range, bloom.shift)));
    plan.push(blur(2, 3, false), blur(3, 2, true));
  } else plan.push({ kind: "clear", target: 4 }, { kind: "clear", target: 3 });
  plan.push({ kind: "clear", target: 1 });
  const stars = starDirections(bloom);
  if (stars.length > 0) {
    plan.push(draw("shiftRgb", 2, [0], shiftParams(bloom.starRange, bloom.starShift)));
    const starWeights = bloomWeights(bloom.starAttenuation, STAR_TAPS);
    for (const { argument, twoPass } of stars) {
      const params = parameters();
      params[0] = f(1 / sizes[0].width);
      params[1] = f(1 / sizes[0].height);
      weightRows(params, starWeights);
      if (twoPass) {
        plan.push(draw("starLong", 0, [2], params, "replace", argument));
        plan.push(draw("starShort", 1, [0], params, "max", argument));
      } else plan.push(draw("starSingle", 1, [2], params, "max", argument));
    }
  }
  const combine = parameters();
  combine[0] = bloom.intensity;
  combine[1] = bloom.starIntensity;
  plan.push(draw("combine", "scene", [1, 3], combine, "add"));
  return plan;
}

function starDirections(bloom: StageBloom): { argument: Float32Array; twoPass: boolean }[] {
  const count = bloom.starCount;
  const step = count > 0 ? Math.trunc(360 / count) : 0;
  const stars =
    count < 0
      ? bloom.stars!
      : Array.from({ length: count }, (_, i) => ({
          rotation: f(i * step),
          length: 1,
          twoPass: true,
        }));
  return stars.map((star) => {
    const radians = f(f(star.rotation + bloom.starRotation) * DEGREES);
    const length = f(star.length * bloom.starLength);
    const x = bloomSine(radians);
    const y = f(-bloomCosine(radians));
    return { argument: Float32Array.of(f(x * length), f(y * length), 0, 0), twoPass: star.twoPass };
  });
}
