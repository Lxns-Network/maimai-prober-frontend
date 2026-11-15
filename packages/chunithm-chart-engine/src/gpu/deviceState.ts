/**
 * Fixed-function device state for the note draws.
 *
 * A material's state is a list of `[renderState, value]` pairs the packer compiled from the
 * reference's own conversion. The list is checked once, when the renderer is built; a draw then only
 * issues the GL calls for the entries that differ from what the context already holds.
 *
 * Only solid-fill, stencil-free, scissor-free states are supported. A list outside that range is
 * rejected at build time rather than drawn with a state the renderer cannot reproduce.
 */

import type { UniformLocations } from "./uniforms";

/** One packed state: the reference's render-state number and its value. */
export type PackedStateCommand = readonly [state: number, value: number];

/** Uniform names the depth bias and alpha test travel through. */
export const DEVICE_UNIFORMS = Object.freeze([
  "uDepthBias",
  "uAlphaTestEnabled",
  "uAlphaFunc",
  "uAlphaRef",
] as const);

const STATE_COUNT = 256;
const DEPTH_TEST = 7;
const FILL = 8;
const DEPTH_WRITE = 14;
const ALPHA_TEST = 15;
const SRC_BLEND = 19;
const DST_BLEND = 20;
const CULL = 22;
const DEPTH_FUNC = 23;
const ALPHA_REF = 24;
const ALPHA_FUNC = 25;
const BLEND = 27;
const STENCIL = 52;
const COLOR_MASK = 168;
const SCISSOR = 174;
const BLEND_OP = 171;
const SLOPE_BIAS = 175;
const MULTISAMPLE = 181;
const BLEND_COLOR = 193;
const DEPTH_BIAS = 195;
const SEPARATE_ALPHA = 206;
const SRC_BLEND_ALPHA = 207;
const DST_BLEND_ALPHA = 208;
const BLEND_OP_ALPHA = 209;
const SOLID = 3;
const SIGN_BIT = 0x80000000;

/** States every list must set; a missing one would leave the context's previous value in force. */
const REQUIRED = Object.freeze([
  DEPTH_TEST,
  FILL,
  DEPTH_WRITE,
  ALPHA_TEST,
  SRC_BLEND,
  DST_BLEND,
  CULL,
  DEPTH_FUNC,
  ALPHA_REF,
  ALPHA_FUNC,
  BLEND,
  STENCIL,
  COLOR_MASK,
  SCISSOR,
  BLEND_OP,
  SLOPE_BIAS,
  BLEND_COLOR,
  DEPTH_BIAS,
  SEPARATE_ALPHA,
  SRC_BLEND_ALPHA,
  DST_BLEND_ALPHA,
  BLEND_OP_ALPHA,
]);

/** Stencil parameters, inert while stencil is off, so they are accepted and never applied. */
const STENCIL_PARAMETERS = Object.freeze([53, 54, 55, 56, 57, 58, 59]);

/** The states `apply` compares against the context. */
const TRACKED = Object.freeze([
  DEPTH_TEST,
  DEPTH_WRITE,
  DEPTH_FUNC,
  BLEND,
  SRC_BLEND,
  DST_BLEND,
  SEPARATE_ALPHA,
  SRC_BLEND_ALPHA,
  DST_BLEND_ALPHA,
  BLEND_OP,
  BLEND_OP_ALPHA,
  BLEND_COLOR,
  CULL,
  COLOR_MASK,
]);

/** A material's state after checking: the value of every state, indexed by its number. */
export interface DeviceStateSet {
  readonly values: Float64Array;
}

const mirrorStates = new WeakMap<DeviceStateSet, DeviceStateSet>();

/** Applies the native mirror command after a material's cull state. */
export function mirrorDeviceState(base: DeviceStateSet): DeviceStateSet {
  let result = mirrorStates.get(base);
  if (!result) {
    const values = Float64Array.from(base.values);
    if (values[CULL] !== 1) values[CULL] = 3;
    result = Object.freeze({ values });
    mirrorStates.set(base, result);
  }
  return result;
}

/** Sets with equal values are one object, so applying one after another costs a single comparison. */
const interned = new Map<string, DeviceStateSet>();

const inRange = (value: number, low: number, high: number): boolean =>
  value >= low && value <= high;

/**
 * Checks one material's command list and keeps the last value of each state. Lists that resolve to
 * the same values return the same set.
 *
 * @throws RangeError when a state is unknown, out of range, missing, or outside the supported modes.
 */
export function compileDeviceState(
  commands: readonly PackedStateCommand[],
  label: string,
): DeviceStateSet {
  const known = new Set<number>([...REQUIRED, ...STENCIL_PARAMETERS, MULTISAMPLE]);
  const values = new Float64Array(STATE_COUNT).fill(Number.NaN);
  for (const [state, value] of commands) {
    if (!Number.isInteger(state) || !known.has(state))
      throw new RangeError(`${label}: render state ${state} is not supported`);
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
      throw new RangeError(`${label}: render state ${state} has invalid value ${value}`);
    values[state] = value;
  }
  for (const state of REQUIRED)
    if (Number.isNaN(values[state]))
      throw new RangeError(`${label}: render state ${state} is missing`);

  for (const state of [DEPTH_TEST, DEPTH_WRITE, ALPHA_TEST, BLEND, SEPARATE_ALPHA])
    if (values[state] !== 0 && values[state] !== 1)
      throw new RangeError(`${label}: render state ${state} must be 0 or 1`);
  if (values[FILL] !== SOLID) throw new RangeError(`${label}: only solid fill is supported`);
  if (values[STENCIL] !== 0) throw new RangeError(`${label}: stencil is not supported`);
  if (values[SCISSOR] !== 0) throw new RangeError(`${label}: scissor is not supported`);
  if (values[SLOPE_BIAS] % SIGN_BIT !== 0)
    throw new RangeError(`${label}: slope depth bias is not supported`);
  if (!Number.isNaN(values[MULTISAMPLE]) && values[MULTISAMPLE] !== 0)
    throw new RangeError(`${label}: multisample coverage is not supported`);
  if (!inRange(values[DEPTH_FUNC], 1, 8) || !inRange(values[ALPHA_FUNC], 1, 8))
    throw new RangeError(`${label}: comparison function out of range`);
  for (const state of [SRC_BLEND, DST_BLEND, SRC_BLEND_ALPHA, DST_BLEND_ALPHA])
    if (!inRange(values[state], 1, 11)) throw new RangeError(`${label}: blend factor out of range`);
  for (const state of [BLEND_OP, BLEND_OP_ALPHA])
    if (!inRange(values[state], 1, 5))
      throw new RangeError(`${label}: blend operation out of range`);
  if (!inRange(values[CULL], 1, 3)) throw new RangeError(`${label}: cull mode out of range`);
  if (!inRange(values[COLOR_MASK], 0, 15))
    throw new RangeError(`${label}: colour mask out of range`);
  if (!inRange(values[ALPHA_REF], 0, 255))
    throw new RangeError(`${label}: alpha reference out of range`);
  const key = Array.prototype.join.call(values, ",");
  let shared = interned.get(key);
  if (!shared) interned.set(key, (shared = Object.freeze({ values })));
  return shared;
}

const biasView = new DataView(new ArrayBuffer(4));

/**
 * Checks that a program exposes the uniforms its state uses.
 *
 * A uniform the compiler dropped resolves to null and would make a non-default bias or alpha test
 * silently do nothing.
 *
 * @throws RangeError when a needed uniform is absent or the bias is not finite.
 */
export function assertDeviceUniforms(
  set: DeviceStateSet,
  locations: UniformLocations,
  label: string,
): void {
  const present = (name: string) => (locations.get(name) ?? null) !== null;
  biasView.setUint32(0, set.values[DEPTH_BIAS], true);
  const bias = biasView.getFloat32(0, true);
  if (!Number.isFinite(bias)) throw new RangeError(`${label}: depth bias is not finite`);
  if (bias !== 0 && !present("uDepthBias"))
    throw new RangeError(`${label}: the shader has no depth bias uniform`);
  if (
    set.values[ALPHA_TEST] !== 0 &&
    !(present("uAlphaTestEnabled") && present("uAlphaFunc") && present("uAlphaRef"))
  )
    throw new RangeError(`${label}: the shader has no alpha test uniforms`);
}

/** GL entry points the state needs; structural, so a fake context can stand in. */
export interface DeviceStateTarget {
  readonly DEPTH_TEST: number;
  readonly BLEND: number;
  readonly CULL_FACE: number;
  readonly CCW: number;
  readonly BACK: number;
  readonly FRONT: number;
  readonly NEVER: number;
  readonly LESS: number;
  readonly EQUAL: number;
  readonly LEQUAL: number;
  readonly GREATER: number;
  readonly NOTEQUAL: number;
  readonly GEQUAL: number;
  readonly ALWAYS: number;
  readonly ZERO: number;
  readonly ONE: number;
  readonly SRC_COLOR: number;
  readonly ONE_MINUS_SRC_COLOR: number;
  readonly SRC_ALPHA: number;
  readonly ONE_MINUS_SRC_ALPHA: number;
  readonly DST_ALPHA: number;
  readonly ONE_MINUS_DST_ALPHA: number;
  readonly DST_COLOR: number;
  readonly ONE_MINUS_DST_COLOR: number;
  readonly SRC_ALPHA_SATURATE: number;
  readonly FUNC_ADD: number;
  readonly FUNC_SUBTRACT: number;
  readonly FUNC_REVERSE_SUBTRACT: number;
  readonly MIN: number;
  readonly MAX: number;
  enable(capability: number): void;
  disable(capability: number): void;
  depthMask(flag: boolean): void;
  depthFunc(func: number): void;
  blendFuncSeparate(srcRgb: number, dstRgb: number, srcAlpha: number, dstAlpha: number): void;
  blendEquationSeparate(modeRgb: number, modeAlpha: number): void;
  blendColor(red: number, green: number, blue: number, alpha: number): void;
  frontFace(mode: number): void;
  cullFace(mode: number): void;
  colorMask(red: boolean, green: boolean, blue: boolean, alpha: boolean): void;
  uniform1f(location: WebGLUniformLocation | null, value: number): void;
  uniform1i(location: WebGLUniformLocation | null, value: number): void;
}

export interface DeviceState {
  /**
   * Forgets what the context holds, so the next `apply` sets everything. Trackers on the same
   * context also forget, since whatever touched the context may have touched their state too.
   */
  invalidate(): void;
  /** Brings the context and `program`'s device uniforms to `set`, issuing only what differs. */
  apply(set: DeviceStateSet, program: WebGLProgram, locations: UniformLocations): void;
}

/** The tracker that last applied to each context; a tracker only trusts its record while it is that one. */
const owners = new WeakMap<object, object>();

export function createDeviceState(gl: DeviceStateTarget): DeviceState {
  const comparisons = [
    gl.NEVER,
    gl.LESS,
    gl.EQUAL,
    gl.LEQUAL,
    gl.GREATER,
    gl.NOTEQUAL,
    gl.GEQUAL,
    gl.ALWAYS,
  ];
  const factors = [
    gl.ZERO,
    gl.ONE,
    gl.SRC_COLOR,
    gl.ONE_MINUS_SRC_COLOR,
    gl.SRC_ALPHA,
    gl.ONE_MINUS_SRC_ALPHA,
    gl.DST_ALPHA,
    gl.ONE_MINUS_DST_ALPHA,
    gl.DST_COLOR,
    gl.ONE_MINUS_DST_COLOR,
    gl.SRC_ALPHA_SATURATE,
  ];
  const equations = [gl.FUNC_ADD, gl.FUNC_SUBTRACT, gl.FUNC_REVERSE_SUBTRACT, gl.MIN, gl.MAX];
  const current = new Float64Array(STATE_COUNT).fill(Number.NaN);
  /** Per program: the depth-bias bits, alpha test flag, function and reference it was last given. */
  const uniformCache = new Map<WebGLProgram, Float64Array>();
  const bits = new DataView(new ArrayBuffer(4));
  const token = {};
  let lastSet: DeviceStateSet | null = null;
  let lastProgram: WebGLProgram | null = null;
  const toggle = (capability: number, enabled: number) =>
    enabled !== 0 ? gl.enable(capability) : gl.disable(capability);

  return {
    invalidate() {
      current.fill(Number.NaN);
      uniformCache.clear();
      lastSet = null;
      lastProgram = null;
      owners.delete(gl);
    },
    apply(set, program, locations) {
      if (owners.get(gl) !== token) {
        owners.set(gl, token);
        current.fill(Number.NaN);
        lastSet = null;
      } else if (set === lastSet && program === lastProgram) return;
      lastSet = set;
      lastProgram = program;
      const v = set.values;
      const c = current;
      if (v[DEPTH_TEST] !== c[DEPTH_TEST]) toggle(gl.DEPTH_TEST, v[DEPTH_TEST]);
      if (v[DEPTH_WRITE] !== c[DEPTH_WRITE]) gl.depthMask(v[DEPTH_WRITE] !== 0);
      if (v[DEPTH_FUNC] !== c[DEPTH_FUNC]) gl.depthFunc(comparisons[v[DEPTH_FUNC] - 1]);
      if (v[BLEND] !== c[BLEND]) toggle(gl.BLEND, v[BLEND]);
      if (
        v[SRC_BLEND] !== c[SRC_BLEND] ||
        v[DST_BLEND] !== c[DST_BLEND] ||
        v[SEPARATE_ALPHA] !== c[SEPARATE_ALPHA] ||
        v[SRC_BLEND_ALPHA] !== c[SRC_BLEND_ALPHA] ||
        v[DST_BLEND_ALPHA] !== c[DST_BLEND_ALPHA]
      ) {
        const separate = v[SEPARATE_ALPHA] !== 0;
        gl.blendFuncSeparate(
          factors[v[SRC_BLEND] - 1],
          factors[v[DST_BLEND] - 1],
          factors[(separate ? v[SRC_BLEND_ALPHA] : v[SRC_BLEND]) - 1],
          factors[(separate ? v[DST_BLEND_ALPHA] : v[DST_BLEND]) - 1],
        );
      }
      if (
        v[BLEND_OP] !== c[BLEND_OP] ||
        v[SEPARATE_ALPHA] !== c[SEPARATE_ALPHA] ||
        v[BLEND_OP_ALPHA] !== c[BLEND_OP_ALPHA]
      )
        gl.blendEquationSeparate(
          equations[v[BLEND_OP] - 1],
          equations[(v[SEPARATE_ALPHA] !== 0 ? v[BLEND_OP_ALPHA] : v[BLEND_OP]) - 1],
        );
      if (v[BLEND_COLOR] !== c[BLEND_COLOR]) {
        const colour = v[BLEND_COLOR];
        gl.blendColor(
          ((colour >>> 16) & 255) / 255,
          ((colour >>> 8) & 255) / 255,
          (colour & 255) / 255,
          (colour >>> 24) / 255,
        );
      }
      if (v[CULL] !== c[CULL]) {
        toggle(gl.CULL_FACE, v[CULL] === 1 ? 0 : 1);
        gl.frontFace(gl.CCW);
        // The reference's viewport has its origin at the top left and WebGL's at the bottom left, so
        // the same clip-space winding reads reversed in window space.
        if (v[CULL] !== 1) gl.cullFace(v[CULL] === 2 ? gl.BACK : gl.FRONT);
      }
      if (v[COLOR_MASK] !== c[COLOR_MASK]) {
        const mask = v[COLOR_MASK];
        gl.colorMask((mask & 1) !== 0, (mask & 2) !== 0, (mask & 4) !== 0, (mask & 8) !== 0);
      }
      for (let i = 0; i < TRACKED.length; i++) {
        const state = TRACKED[i];
        c[state] = v[state];
      }

      let cached = uniformCache.get(program);
      if (!cached) uniformCache.set(program, (cached = new Float64Array(4).fill(Number.NaN)));
      if (cached[0] !== v[DEPTH_BIAS]) {
        bits.setUint32(0, v[DEPTH_BIAS], true);
        gl.uniform1f(locations.get("uDepthBias") ?? null, bits.getFloat32(0, true));
        cached[0] = v[DEPTH_BIAS];
      }
      if (cached[1] !== v[ALPHA_TEST]) {
        gl.uniform1i(locations.get("uAlphaTestEnabled") ?? null, v[ALPHA_TEST]);
        cached[1] = v[ALPHA_TEST];
      }
      if (cached[2] !== v[ALPHA_FUNC]) {
        gl.uniform1i(locations.get("uAlphaFunc") ?? null, v[ALPHA_FUNC]);
        cached[2] = v[ALPHA_FUNC];
      }
      if (cached[3] !== v[ALPHA_REF]) {
        gl.uniform1f(locations.get("uAlphaRef") ?? null, v[ALPHA_REF] / 255);
        cached[3] = v[ALPHA_REF];
      }
    },
  };
}
