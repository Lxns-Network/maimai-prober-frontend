/**
 * Per-draw uniform upload.
 *
 * The packed shaders declare their colour and UV values as *fragment-stage* uniforms, so they cannot
 * become instance attributes — routing them through a varying would change interpolation against the
 * reference, which passes them per draw. They are therefore uploaded once per model program, per
 * frame, from the model entry's own `uniforms` block, exactly as the reference does.
 *
 * Values are written as the type the shader declares: the pack records a `type` beside each value,
 * and uploading a vec3 through `uniform4fv` would leave the fourth component at whatever the previous
 * draw left there.
 */

/** One uniform as the pack records it. */
export interface PackedUniform {
  readonly type: string;
  readonly value: number | readonly number[] | boolean;
}

/** For a single vec4 owned by the renderer. Slots are reused, so compare their values. */
export function createVec4Setter(gl: WebGL2RenderingContext) {
  const values = new Map<WebGLUniformLocation, Float64Array>();
  return (location: WebGLUniformLocation | null, value: Float32List | readonly number[]) => {
    if (location === null) return;
    const cached = values.get(location);
    if (cached) {
      if (
        cached[0] === value[0] &&
        cached[1] === value[1] &&
        cached[2] === value[2] &&
        cached[3] === value[3]
      )
        return;
      cached.set(value);
    } else values.set(location, Float64Array.from(value));
    gl.uniform4fv(location, value);
  };
}

/** GL entry points the upload needs; structural, so a fake context can stand in. */
export interface UniformTarget {
  readonly FLOAT: number;
  readonly INT: number;
  readonly BOOL: number;
  getUniformLocation(program: WebGLProgram, name: string): WebGLUniformLocation | null;
  uniform1f(location: WebGLUniformLocation | null, value: number): void;
  uniform1i(location: WebGLUniformLocation | null, value: number): void;
  uniform2fv(location: WebGLUniformLocation | null, value: Float32Array): void;
  uniform3fv(location: WebGLUniformLocation | null, value: Float32Array): void;
  uniform4fv(location: WebGLUniformLocation | null, value: Float32Array): void;
  uniformMatrix4fv(
    location: WebGLUniformLocation | null,
    transpose: boolean,
    value: Float32Array,
  ): void;
}

/** Scratch buffers, so a uniform upload allocates nothing per draw. */
export interface UniformScratch {
  readonly f32: Float32Array;
  /** Views over the first two, three and four floats of `f32`. */
  readonly vectors: readonly [Float32Array, Float32Array, Float32Array];
}

export function createUniformScratch(): UniformScratch {
  // The widest packed value is a vec4 and the largest matrix upload is 16 floats.
  const f32 = new Float32Array(16);
  return { f32, vectors: [f32.subarray(0, 2), f32.subarray(0, 3), f32.subarray(0, 4)] };
}

/** Locations already resolved for one program, so the frame path does not call getUniformLocation. */
export type UniformLocations = ReadonlyMap<string, WebGLUniformLocation | null>;

/**
 * Resolves every name a model entry's uniform block declares.
 *
 * Doing this at build time matters for the frame budget: `getUniformLocation` is a synchronous
 * driver query, and calling it per draw would put one in every frame.
 */
export function resolveUniforms(
  gl: UniformTarget,
  program: WebGLProgram,
  uniforms: Readonly<Record<string, PackedUniform>>,
  extra: readonly string[] = [],
): UniformLocations {
  const locations = new Map<string, WebGLUniformLocation | null>();
  for (const name of Object.keys(uniforms))
    locations.set(name, gl.getUniformLocation(program, name));
  for (const name of extra)
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
  return locations;
}

/** The packed block last applied to each program, so a repeat of it is not uploaded again. */
export type AppliedUniforms = Map<WebGLProgram, unknown>;

/**
 * Uploads one model entry's uniform block.
 *
 * A uniform the shader optimized away resolves to null and the call is a no-op on every GL
 * implementation, so an unused packed value costs nothing rather than throwing.
 */
export function applyPackedUniforms(
  gl: UniformTarget,
  locations: UniformLocations,
  uniforms: Readonly<Record<string, PackedUniform>>,
  scratch: UniformScratch,
): void {
  for (const name of Object.keys(uniforms)) {
    const location = locations.get(name);
    if (location === undefined || location === null) continue;
    upload(gl, location, uniforms[name], scratch);
  }
}

/** Applies `uniforms` to `program` unless the program already holds exactly that block. */
export function applyProgramUniforms(
  gl: UniformTarget,
  applied: AppliedUniforms,
  program: WebGLProgram,
  locations: UniformLocations,
  uniforms: Readonly<Record<string, PackedUniform>>,
  scratch: UniformScratch,
): void {
  if (applied.get(program) === uniforms) return;
  applied.set(program, uniforms);
  applyPackedUniforms(gl, locations, uniforms, scratch);
}

/** Uploads one value according to the type the pack recorded for it. */
function upload(
  gl: UniformTarget,
  location: WebGLUniformLocation,
  uniform: PackedUniform,
  scratch: UniformScratch,
): void {
  const { type, value } = uniform;
  if (type === "float") {
    gl.uniform1f(location, asNumber(value));
    return;
  }
  if (type === "int" || type === "bool") {
    gl.uniform1i(location, type === "bool" ? (value ? 1 : 0) : asNumber(value));
    return;
  }
  const components = componentsOf(type);
  if (components === null) throw new RangeError(`Unpacked uniform type ${type} has no upload path`);
  const list = value as readonly number[];
  if (!Array.isArray(list) || list.length !== components)
    throw new RangeError(`A ${type} uniform needs ${components} values, got ${list?.length}`);
  const view = scratch.f32;
  for (let i = 0; i < components; i++) view[i] = list[i];
  const slice = scratch.vectors[components - 2];
  if (components === 2) gl.uniform2fv(location, slice);
  else if (components === 3) gl.uniform3fv(location, slice);
  else gl.uniform4fv(location, slice);
}

const asNumber = (value: number | readonly number[] | boolean): number => {
  if (typeof value !== "number")
    throw new RangeError(`A scalar uniform needs a number, got ${typeof value}`);
  return value;
};

/** Component count for a vector type, or null when the type is not uploaded as a vector. */
export function componentsOf(type: string): number | null {
  if (type === "vec2") return 2;
  if (type === "vec3") return 3;
  if (type === "vec4") return 4;
  return null;
}

/**
 * Binds a material's textures to consecutive units and points its samplers at them.
 *
 * The samplers are named for the slot (`uTexture0`, `uTexture1`), so slot 0 binds the material's
 * first image and points `uTexture0` at unit 0.
 *
 * A material's images are identified by name, because the pack's unit list says only *which slot* an
 * image feeds and every material binds slot 0. A slot with a name binds from `byName`; a slot
 * without one binds whatever image the caller assigned that unit in `textures`.
 *
 * A sampler uniform is pointed at its slot once per program; the value never changes.
 *
 * A slot samples through `samplers[slot]` when it is given, and through its texture's own parameters
 * otherwise; no slot keeps a sampler an earlier draw left bound.
 *
 * @throws RangeError when a named slot has no `byName` map or its image is absent from it, or when
 * an unnamed slot's unit is absent from `textures`. A named slot never falls back to the unit map:
 * every material shares the unit numbers, so that would draw another material's image.
 */
const samplerLocations = new WeakMap<
  WebGLProgram,
  { locations: (WebGLUniformLocation | null)[]; pointed: boolean[] }
>();

export function applyPackedTextures(
  gl: Pick<UniformTarget, "getUniformLocation" | "uniform1i"> & {
    activeTexture(unit: number): void;
    bindTexture(target: number, texture: WebGLTexture | null): void;
    bindSampler(unit: number, sampler: WebGLSampler | null): void;
    readonly TEXTURE_2D: number;
    readonly TEXTURE0: number;
  },
  program: WebGLProgram,
  units: readonly number[],
  textures: ReadonlyMap<number, WebGLTexture>,
  names: readonly (string | null)[] = [],
  byName?: ReadonlyMap<string, WebGLTexture>,
  samplers: readonly (WebGLSampler | null)[] = [],
): void {
  for (const [slot, unit] of units.entries()) {
    const name = names[slot] ?? null;
    const texture = name !== null ? byName?.get(name) : textures.get(unit);
    if (!texture)
      throw new RangeError(
        name !== null
          ? `Material samples image ${name}, which was not uploaded`
          : `Model entry declares texture unit ${unit}, which was not uploaded`,
      );
    gl.activeTexture(gl.TEXTURE0 + slot);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.bindSampler(slot, samplers[slot] ?? null);
    let record = samplerLocations.get(program);
    if (!record) samplerLocations.set(program, (record = { locations: [], pointed: [] }));
    if (record.locations[slot] === undefined)
      record.locations[slot] = gl.getUniformLocation(program, `uTexture${slot}`);
    const location = record.locations[slot];
    if (location !== null && !record.pointed[slot]) {
      gl.uniform1i(location, slot);
      record.pointed[slot] = true;
    }
  }
}
