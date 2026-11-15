import type { StageBloom2 } from "../../nodes/bloom2";
import { bloomCosine, bloomSine } from "./bloomPlan";

const f = Math.fround;

export type Bloom2Shader =
  | "reduce"
  | "reduce16"
  | "lumExt"
  | "gaussW"
  | "gaussH"
  | "toneBright"
  | "starLong"
  | "starShort"
  | "starSingle"
  | "copy";

export type Bloom2Image =
  | { readonly kind: "scene" }
  | { readonly kind: "tone" }
  | { readonly kind: "none" }
  | { readonly kind: "star"; readonly index: number }
  | { readonly kind: "level"; readonly index: number }
  | { readonly kind: "result"; readonly index: number };

export interface Bloom2Draw {
  readonly shader: Bloom2Shader;
  readonly target:
    | { readonly kind: "level" | "result" | "star"; readonly index: number }
    | "output";
  readonly inputs: readonly Bloom2Image[];
  readonly blend: "replace" | "max" | "add";
  /** Nine vec4 parameters. */
  readonly params: Float32Array;
  readonly argument: Float32Array;
}

const MIN_SIZE = 4;

/** Sizes of the reduction levels for a scene of the given size, finest first. */
export function bloom2LevelSizes(
  width: number,
  height: number,
): { width: number; height: number }[] {
  const out: { width: number; height: number }[] = [];
  let w = width;
  let h = height;
  for (;;) {
    w = (w % 4 !== 0 ? 1 : 0) + Math.trunc(w / 4);
    h = (h % 4 !== 0 ? 1 : 0) + Math.trunc(h / 4);
    if (w <= MIN_SIZE) w = MIN_SIZE;
    if (h <= MIN_SIZE) h = MIN_SIZE;
    if (w <= MIN_SIZE && h <= MIN_SIZE) break;
    out.push({ width: w, height: h });
  }
  return out;
}

const level = (index: number): Bloom2Image => ({ kind: "level", index });
const result = (index: number): Bloom2Image => ({ kind: "result", index });

/** The luminance-extraction parameters of one bloom level. */
export function lumExtParams(bloom: StageBloom2, width: number): Float32Array {
  const params = new Float32Array(8);
  params[0] = bloom.bloomRange;
  params[1] = bloom.bloomOffset;
  params[2] = bloom.bloomIntensity;
  params[3] = bloom.bloomRetinaRatio;
  const scale = f(1 / width);
  for (let i = 0; i < 3; i++) params[4 + i] = f(bloom.bloomShift[i] * scale);
  params[7] = bloom.toneMiddleGray;
  return params;
}

/** The final composite's parameters: blend ratios, then the filmic curve coefficients. */
export function toneBrightParams(bloom: StageBloom2): Float32Array {
  return Float32Array.of(
    bloom.bloomIntensity,
    bloom.starIntensity,
    bloom.toneRetinaRatio,
    bloom.toneMiddleGray,
    bloom.shoulderStrength,
    bloom.linearStrength,
    bloom.linearAngle,
    bloom.toeStrength,
    bloom.toeNumerator,
    bloom.toeDenominator,
    bloom.whitePoint,
    0,
  );
}

/** Runs reduction, retina adaptation, stars, coarsest-to-finest bloom and the final composite, in that order. */
export function buildBloom2Plan(
  bloom: StageBloom2,
  width: number,
  height: number,
): { reduction: Bloom2Draw[]; stars: Bloom2Draw[]; bloom: Bloom2Draw[]; final: Bloom2Draw } {
  const sizes = bloom2LevelSizes(width, height);
  const none = new Float32Array(12);
  const noArgument = new Float32Array(4);
  const draw = (
    shader: Bloom2Shader,
    target: Bloom2Draw["target"],
    inputs: Bloom2Image[],
    params: Float32Array = none,
    argument: Float32Array = noArgument,
    blend: Bloom2Draw["blend"] = "replace",
  ): Bloom2Draw => ({ shader, target, inputs, params, argument, blend });
  const reduction: Bloom2Draw[] = [];
  sizes.forEach((size, index) => {
    if (index === 0) {
      reduction.push(draw("reduce", { kind: "level", index }, [{ kind: "scene" }]));
      return;
    }
    const previous = sizes[index - 1];
    const exact = size.width * 4 === previous.width && size.height * 4 === previous.height;
    reduction.push(
      draw(exact ? "reduce" : "reduce16", { kind: "level", index }, [level(index - 1)]),
    );
  });
  const levelParams = new Float32Array(12);
  levelParams.set(lumExtParams(bloom, width));
  const starDraws: Bloom2Draw[] = [];
  const directions = bloom2StarDirections(bloom);
  if (directions.length > 0 && sizes.length > 0) {
    const params = new Float32Array(12);
    params.set([bloom.starRange, bloom.starOffset, bloom.starIntensity, bloom.starRetinaRatio]);
    params[7] = bloom.toneMiddleGray;
    starDraws.push(
      draw(
        "lumExt",
        { kind: "star", index: 0 },
        [level(0), { kind: "tone" }, { kind: "none" }],
        params,
      ),
    );
    let longParams: Float32Array | undefined;
    let shortParams: Float32Array | undefined;
    let singleParams: Float32Array | undefined;
    for (const { argument, twoPass } of directions) {
      if (twoPass) {
        starDraws.push(
          draw(
            "starLong",
            { kind: "star", index: 1 },
            [{ kind: "star", index: 0 }],
            (longParams ??= bloom2StarParams(
              bloom.starShift,
              sizes[0].width,
              sizes[0].height,
              "starLong",
            )),
            argument,
          ),
        );
        starDraws.push(
          draw(
            "starShort",
            { kind: "star", index: 2 },
            [{ kind: "star", index: 1 }],
            (shortParams ??= bloom2StarParams(
              bloom.starShift,
              sizes[0].width,
              sizes[0].height,
              "starShort",
            )),
            argument,
            "max",
          ),
        );
      } else
        starDraws.push(
          draw(
            "starSingle",
            { kind: "star", index: 2 },
            [{ kind: "star", index: 0 }],
            (singleParams ??= bloom2StarParams(
              bloom.starShift,
              sizes[0].width,
              sizes[0].height,
              "starSingle",
            )),
            argument,
            "max",
          ),
        );
    }
  }
  const glow: Bloom2Draw[] = [];
  for (let i = sizes.length - 1; i >= 0; i--) {
    glow.push(
      draw(
        "lumExt",
        { kind: "result", index: i },
        [level(i), { kind: "tone" }, i === sizes.length - 1 ? { kind: "none" } : result(i + 1)],
        levelParams,
        Float32Array.of(f(i * bloom.bloomLevelRange), 0, 0, 0),
      ),
      draw("gaussW", { kind: "level", index: i }, [result(i)]),
      draw("gaussH", { kind: "result", index: i }, [level(i)]),
    );
  }
  if (starDraws.length > 0)
    // The tone shader ignores its star sampler; the native pyramid adds stars into result 0 first.
    glow.push(
      draw(
        "copy",
        { kind: "result", index: 0 },
        [{ kind: "star", index: 2 }],
        none,
        noArgument,
        "add",
      ),
    );
  const final = draw(
    "toneBright",
    "output",
    [
      { kind: "scene" },
      result(0),
      starDraws.length > 0 ? { kind: "star", index: 2 } : { kind: "none" },
      { kind: "tone" },
    ],
    toneBrightParams(bloom),
  );
  return { reduction, stars: starDraws, bloom: glow, final };
}

export function bloom2StarDirections(
  bloom: Pick<StageBloom2, "starCount" | "stars" | "starRotation" | "starLength">,
): { argument: Float32Array; twoPass: boolean }[] {
  const count = bloom.starCount;
  const step = count > 0 ? Math.trunc(360 / count) : 0;
  const stars =
    count < 0
      ? bloom.stars!
      : Array.from({ length: count }, (_, i) => ({ rotation: i * step, length: 1, twoPass: true }));
  return stars.map((star) => {
    const radians = f(f(star.rotation + bloom.starRotation) * f(0.017453292));
    const length = f(star.length * bloom.starLength);
    return {
      argument: Float32Array.of(
        f(bloomSine(radians) * length),
        f(-bloomCosine(radians) * length),
        0,
        0,
      ),
      twoPass: star.twoPass,
    };
  });
}

export function bloom2StarParams(
  shift: Float32Array,
  width: number,
  height: number,
  shader: "starLong" | "starShort" | "starSingle",
): Float32Array {
  const params = new Float32Array(36);
  params[0] = f(1 / width);
  params[1] = f(1 / height);
  const weights = new Float32Array(8);
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    weights[i] = f(f(Math.exp(f(f(i * i) * f(-0.08)))) / f(f(Math.sqrt(f(6.2831855))) * 2.5));
    sum = f(sum + weights[i]);
  }
  const correction = f(f(1 - sum) * 0.125);
  const root = f(Math.sqrt(f(f(3 * 3) * f(6.2831855))));
  for (let i = 0; i < 8; i++) {
    const weight = f(weights[i] + correction);
    if (shader === "starShort") {
      params.fill(weight, (i + 1) * 4, (i + 2) * 4);
      continue;
    }
    for (let channel = 0; channel < 3; channel++) {
      const delta = f(i - shift[channel]);
      const gaussian = f(f(Math.exp(f(f(delta * delta) * f(-0.055555556)))) * f(1 / root));
      params[(i + 1) * 4 + channel] = f(f(gaussian * (shader === "starLong" ? 6 : 3)) * weight);
    }
    params[(i + 1) * 4 + 3] = weight;
  }
  return params;
}
