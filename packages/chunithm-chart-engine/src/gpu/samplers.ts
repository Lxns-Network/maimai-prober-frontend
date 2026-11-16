/**
 * Sampler objects for packed images.
 *
 * The pack records, for every sampled image of a band or a material slot, the sampler state it is
 * read with. A draw binds a sampler object built from that state, so how an image is filtered and
 * wrapped follows its own record rather than whatever parameters its texture object carries.
 */

/** The sampler state fields a pack records for one sampled image, each an integer. */
const SAMPLER_FIELDS = [
  "addressU",
  "addressV",
  "minFilter",
  "magFilter",
  "mipFilter",
  "maxMipLevel",
  "maxAnisotropy",
] as const;

type SamplerState = Record<(typeof SAMPLER_FIELDS)[number], number>;

/** The GL sampler parameters one recorded sampler state selects. */
export interface SamplerParameters {
  readonly wrapS: number;
  readonly wrapT: number;
  readonly min: number;
  readonly mag: number;
  readonly anisotropy: number | null;
}

/**
 * Translates a recorded sampler state: address modes 1–3 are repeat, mirrored repeat and clamp;
 * filters 1 and 2 are point and linear; mip filter 0 samples only the top level. `owner` names the
 * image's user in error messages.
 *
 * @throws RangeError when the state is absent or incomplete, filters anisotropically, starts below
 *   the top mip level, or names an address mode or filter outside those.
 */
export function samplerParameters(
  gl: WebGL2RenderingContext,
  recorded: unknown,
  owner: string,
): SamplerParameters {
  return samplerParametersFor(gl, recorded, owner, false);
}

/** Stage materials may also use anisotropic minification. */
export function stageSamplerParameters(
  gl: WebGL2RenderingContext,
  recorded: unknown,
  owner: string,
): SamplerParameters {
  return samplerParametersFor(gl, recorded, owner, true);
}

/** Retains sampler state per backing image while processing material binds in draw order. */
export function createStageSamplerState() {
  const states = new Map<
    string,
    { state: SamplerState & { lodBias: number }; parameters: SamplerParameters; lodBias: number }
  >();
  return {
    synchronize(
      gl: WebGL2RenderingContext,
      image: string,
      recorded: Omit<SamplerState, "magFilter"> & {
        readonly magFilter: number | null;
        readonly lodBias: number;
      },
      owner: string,
    ): void {
      const previous = states.get(image);
      const magFilter = recorded.magFilter ?? previous?.state.magFilter ?? 2;
      if (previous) {
        const old = previous.state;
        if (
          old.addressU === recorded.addressU &&
          old.addressV === recorded.addressV &&
          old.minFilter === recorded.minFilter &&
          old.magFilter === magFilter &&
          old.mipFilter === recorded.mipFilter &&
          old.maxMipLevel === recorded.maxMipLevel &&
          old.maxAnisotropy === recorded.maxAnisotropy &&
          old.lodBias === recorded.lodBias
        )
          return;
      }
      const state = { ...recorded, magFilter };
      const parameters = stageSamplerParameters(gl, state, owner);
      states.set(image, { state, parameters, lodBias: state.lodBias });
    },
    current(
      _gl: WebGL2RenderingContext,
      image: string,
      owner: string,
    ): { readonly parameters: SamplerParameters; readonly lodBias: number } {
      const state = states.get(image);
      if (!state) throw new Error(`${owner} has no synchronized sampler state`);
      return state;
    },
    clear() {
      states.clear();
    },
  };
}

function samplerParametersFor(
  gl: WebGL2RenderingContext,
  recorded: unknown,
  owner: string,
  allowAnisotropy: boolean,
): SamplerParameters {
  const state = recorded as Partial<SamplerState> | null | undefined;
  if (
    typeof state !== "object" ||
    state === null ||
    SAMPLER_FIELDS.some((field) => !Number.isInteger(state[field]))
  )
    throw new RangeError(`${owner} records no sampler state; rebuild the pack`);
  const { addressU, addressV, minFilter, magFilter, mipFilter, maxMipLevel, maxAnisotropy } =
    state as SamplerState;
  if (!allowAnisotropy && (minFilter === 3 || maxAnisotropy !== 1))
    throw new RangeError(
      `${owner} samples anisotropically, which the note renderer does not support`,
    );
  if (minFilter === 3 && maxAnisotropy < 1)
    throw new RangeError(`${owner} records invalid anisotropy ${maxAnisotropy}`);
  if (maxMipLevel !== 0)
    throw new RangeError(
      `${owner} samples from mip level ${maxMipLevel}; uploaded images start at level 0`,
    );
  const address = (mode: number): number => {
    const wrap = [gl.REPEAT, gl.MIRRORED_REPEAT, gl.CLAMP_TO_EDGE][mode - 1];
    if (wrap === undefined)
      throw new RangeError(
        `${owner} samples with address mode ${mode}, which has no GL equivalent`,
      );
    return wrap;
  };
  if (
    !(minFilter === 1 || minFilter === 2 || (allowAnisotropy && minFilter === 3)) ||
    ![1, 2].includes(magFilter) ||
    ![0, 1, 2].includes(mipFilter)
  )
    throw new RangeError(
      `${owner} samples with filters ${minFilter}/${magFilter}/${mipFilter}, which have no GL equivalent`,
    );
  const glMinFilter = minFilter === 3 ? 2 : minFilter;
  return {
    wrapS: address(addressU),
    wrapT: address(addressV),
    min:
      mipFilter === 0
        ? [gl.NEAREST, gl.LINEAR][glMinFilter - 1]
        : [
            [gl.NEAREST_MIPMAP_NEAREST, gl.NEAREST_MIPMAP_LINEAR],
            [gl.LINEAR_MIPMAP_NEAREST, gl.LINEAR_MIPMAP_LINEAR],
          ][glMinFilter - 1][mipFilter - 1],
    mag: magFilter === 1 ? gl.NEAREST : gl.LINEAR,
    anisotropy: minFilter === 3 ? maxAnisotropy : null,
  };
}

/** Sampler objects shared between immutable parameter sets; `dispose` deletes every one created. */
export interface SamplerCache {
  samplerFor(parameters: SamplerParameters, owner?: string): WebGLSampler;
  dispose(): void;
}

export function createSamplerCache(gl: WebGL2RenderingContext): SamplerCache {
  const samplers = new Map<string, WebGLSampler>();
  let resolved = new WeakMap<SamplerParameters, WebGLSampler>();
  let anisotropy: EXT_texture_filter_anisotropic | null | undefined;
  return {
    samplerFor(parameters, owner = "Sampler") {
      const cached = resolved.get(parameters);
      if (cached) return cached;
      const key = `${parameters.wrapS},${parameters.wrapT},${parameters.min},${parameters.mag},${parameters.anisotropy}`;
      const known = samplers.get(key);
      if (known) {
        resolved.set(parameters, known);
        return known;
      }
      if (parameters.anisotropy !== null) {
        if (anisotropy === undefined)
          anisotropy = gl.getExtension("EXT_texture_filter_anisotropic");
        if (!anisotropy) throw new Error(`${owner} samples anisotropically without the extension`);
        if (parameters.anisotropy > gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT))
          throw new RangeError(`${owner} exceeds the device anisotropy limit`);
      }
      const sampler = gl.createSampler();
      if (!sampler) throw new Error("A sampler object is required for note drawing");
      samplers.set(key, sampler);
      resolved.set(parameters, sampler);
      gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, parameters.wrapS);
      gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, parameters.wrapT);
      gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, parameters.min);
      gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, parameters.mag);
      if (parameters.anisotropy !== null && anisotropy)
        gl.samplerParameterf(sampler, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, parameters.anisotropy);
      return sampler;
    },
    dispose() {
      for (const sampler of samplers.values()) gl.deleteSampler(sampler);
      samplers.clear();
      resolved = new WeakMap();
    },
  };
}

/**
 * One sampler per sampled slot, from the states a material records for its `count` slots.
 *
 * @throws RangeError when the material records no state for each slot, or one the renderer cannot
 *   reproduce.
 */
export function slotSamplers(
  gl: WebGL2RenderingContext,
  cache: SamplerCache,
  recorded: unknown,
  count: number,
  owner: string,
): WebGLSampler[] {
  if (count === 0) return [];
  if (!Array.isArray(recorded) || recorded.length !== count)
    throw new RangeError(
      `${owner} records no sampler state for its ${count} sampled slot${count === 1 ? "" : "s"}; rebuild the pack`,
    );
  return recorded.map((state, slot) =>
    cache.samplerFor(samplerParameters(gl, state, `${owner} slot ${slot}`)),
  );
}
