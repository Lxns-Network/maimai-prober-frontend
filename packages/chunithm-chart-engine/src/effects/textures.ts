import { createAbortScope, throwIfAborted } from "../assets/abort";
/**
 * Effect textures: the published image levels of each effect resource, uploaded once.
 *
 * A texture is addressed by its resource id and its index inside that resource. Levels are
 * decoded without premultiplying or colour conversion and kept as an exact mip chain; how a draw
 * filters and wraps them comes from the sampler it binds, not from the texture. A texture may also
 * be published as compressed tiers, each a KTX2 file of the same chain, uploaded in place of its
 * images where the device decodes one.
 */

import { uploadKtx2 } from "../assets/gpuUpload";
import { parseKtx2 } from "../assets/ktx2";
import {
  chooseTextureTarget,
  readDeviceSignals,
  type DeviceSignals,
  type TextureTarget,
} from "../assets/textureFormat";

/** Textures with more texels than this are not uploaded as full-size images unless asked to. */
export const EFFECT_TEXTURE_AUTO_LIMIT = 1024 * 1024;

export interface EffectTextureSource {
  /** The texture of one resource slot, or null when none was loaded. */
  texture(resourceId: number, resourceIndex: number): WebGLTexture | null;
}

export interface EffectTextures extends EffectTextureSource {
  /** Slots whose images were reduced to fit {@link EFFECT_TEXTURE_AUTO_LIMIT}, as `id:index`. */
  readonly reduced: readonly string[];
  dispose(): void;
}

/** One decoded mip chain, base level first. */
export interface EffectTextureLevels {
  resourceId: number;
  resourceIndex: number;
  levels: readonly TexImageSource[];
}

export type EffectTextureTier = Exclude<TextureTarget, "rgba8">;

/** One texture as a compressed tier: a KTX2 file holding its whole mip chain. */
export interface EffectTextureKtx2 {
  resourceId: number;
  resourceIndex: number;
  tier: EffectTextureTier;
  ktx2: Uint8Array;
}

const key = (resourceId: number, resourceIndex: number): number =>
  resourceId * 0x10000 + resourceIndex;

function upload(gl: WebGL2RenderingContext, levels: readonly TexImageSource[]): WebGLTexture {
  const first = levels[0] as { width: number; height: number };
  const texture = gl.createTexture();
  if (!texture) throw new Error("An effect texture could not be allocated");
  try {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texStorage2D(gl.TEXTURE_2D, levels.length, gl.RGBA8, first.width, first.height);
    levels.forEach((level, index) =>
      gl.texSubImage2D(gl.TEXTURE_2D, index, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, level),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, levels.length - 1);
    return texture;
  } catch (error) {
    gl.deleteTexture(texture);
    throw error;
  }
}

/** Uploads decoded chains and compressed tiers. Each decoded chain must halve in size down to its last level. */
export function createEffectTextures(
  gl: WebGL2RenderingContext,
  chains: readonly (EffectTextureLevels | EffectTextureKtx2)[],
  reduced: readonly string[] = [],
): EffectTextures {
  const textures = new Map<number, WebGLTexture>();
  try {
    for (const chain of chains) {
      const { resourceId, resourceIndex } = chain;
      if (textures.has(key(resourceId, resourceIndex)))
        throw new RangeError(`Effect texture ${resourceId}:${resourceIndex} is listed twice`);
      if ("ktx2" in chain) {
        const uploaded = uploadKtx2(gl, chain.ktx2, {
          target: chain.tier,
          dropTopMip: false,
          compare: false,
        });
        textures.set(key(resourceId, resourceIndex), uploaded.texture);
        continue;
      }
      const { levels } = chain;
      if (levels.length === 0)
        throw new RangeError(`Effect texture ${resourceId}:${resourceIndex} has no levels`);
      const base = levels[0] as { width: number; height: number };
      levels.forEach((level, index) => {
        const { width, height } = level as { width: number; height: number };
        if (
          width !== Math.max(1, base.width >> index) ||
          height !== Math.max(1, base.height >> index)
        )
          throw new RangeError(
            `Effect texture ${resourceId}:${resourceIndex} level ${index} has unexpected dimensions`,
          );
      });
      textures.set(key(resourceId, resourceIndex), upload(gl, levels));
    }
  } catch (error) {
    for (const texture of textures.values()) gl.deleteTexture(texture);
    throw error;
  }
  return {
    reduced,
    texture: (resourceId, resourceIndex) => textures.get(key(resourceId, resourceIndex)) ?? null,
    dispose() {
      for (const texture of textures.values()) gl.deleteTexture(texture);
      textures.clear();
    },
  };
}

export interface EffectResourceList {
  schema: string;
  bundles?: Record<string, string>;
  effects: { id: number; textures?: { url: string }; runtimeGraph?: { url: string } }[];
}

interface TextureList {
  schema: string;
  textures: {
    resourceIndex: number;
    levels: { width: number; height: number; asset: { url: string } }[];
    tiers?: Partial<Record<EffectTextureTier, { url: string }>>;
    mobile?: {
      width: number;
      height: number;
      tiers: Partial<Record<EffectTextureTier, { url: string }>>;
    };
  }[];
}

/** The tiers each automatic target takes, in order; RGBA8 takes the images. */
const TARGET_TIERS: Record<TextureTarget, readonly EffectTextureTier[]> = {
  bc: ["bc"],
  astc: ["astc", "etc2"],
  etc2: ["etc2"],
  rgba8: [],
};

/** The tiers a texture over the size limit takes before its images, in order. */
const LARGE_TIERS: readonly EffectTextureTier[] = ["astc", "etc2", "bc"];

const decodes = (signals: DeviceSignals, tier: EffectTextureTier): boolean =>
  tier === "bc" ? signals.s3tc : signals[tier];

export interface LoadEffectTexturesOptions {
  /** Shared by serial difficulty loads on the same WebGL context; entries are reference-counted. */
  cache?: EffectTextureCache;
  signal: AbortSignal;
  /** The validated resource list already requested by the page. */
  manifest?: Promise<EffectResourceList>;
  /** Resources to load; every resource the manifest lists when omitted. */
  ids?: readonly number[];
  /** Uploads every texture's images as published, as a comparison against the reference needs. */
  full?: boolean;
  /** A tier to force, or `compare` for the images as published, read as the asset packs read it. */
  override?: string | null;
  fetch?: typeof fetch;
  /** Invalidates the frame host's cached GL bindings after each asynchronous upload. */
  onUpload?: () => void;
}

export type EffectTextureCache = Map<
  string,
  {
    texture: WebGLTexture;
    references: number;
    reduced: boolean;
    dispose(): void;
  }
>;

async function json<T>(fetcher: typeof fetch, url: URL, signal: AbortSignal): Promise<T> {
  const response = await fetcher(url, { signal, credentials: "omit" });
  if (!response.ok) throw new Error(`Effect texture list ${url.pathname} HTTP ${response.status}`);
  return (await response.json()) as T;
}

/** Fetches the shared graph and texture resource list once. */
export async function loadEffectResourceList(
  manifestUrl: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<EffectResourceList> {
  const manifest = await json<EffectResourceList>(fetcher, new URL(manifestUrl), signal);
  if (manifest.schema !== "web-autoplay-page-resources-v1" || !Array.isArray(manifest.effects))
    throw new RangeError("Unsupported effect resource manifest");
  return manifest;
}

/**
 * Loads the textures of the effect resources a manifest lists.
 *
 * Each texture takes the compressed tier the device decodes, chosen as the asset packs choose
 * theirs, and a texture over the size limit takes any decodable tier before its images. Otherwise
 * its images are decoded as published, except that over the limit, unless `full` or an explicit
 * override asks for them as published, a single-level image is decoded at the largest halving
 * that fits and a chain drops its leading levels.
 *
 * @throws RangeError when a manifest, image or tier is malformed or a size disagrees with the list.
 */
export async function loadEffectTextures(
  gl: WebGL2RenderingContext,
  manifestUrl: string,
  options: LoadEffectTexturesOptions,
): Promise<EffectTextures> {
  const fetcher = options.fetch ?? fetch;
  const { signal } = options;
  const signals = readDeviceSignals(gl);
  const choice = chooseTextureTarget(signals, options.override ?? null);
  const asPublished = options.full === true || choice.compare;
  const explicit = options.override === choice.target;
  const manifest = await (options.manifest ?? loadEffectResourceList(manifestUrl, signal, fetcher));
  throwIfAborted(signal);
  const wanted = options.ids ? new Set(options.ids) : null;
  const reduced: string[] = [];
  const controller = new AbortController();
  const scope = createAbortScope([signal, controller.signal]);
  const loadingSignal = scope.signal;
  try {
    const loaded = new Map<number, WebGLTexture>();
    const owners = new Set<{ dispose(): void }>();
    const lists = await Promise.all(
      manifest.effects
        .filter((effect) => effect.textures && (!wanted || wanted.has(effect.id)))
        .map(async (effect) => {
          const listUrl = new URL(effect.textures!.url, manifestUrl);
          const list = await json<TextureList>(fetcher, listUrl, loadingSignal);
          if (list.schema !== "web-autoplay-effect-png-v1" || !Array.isArray(list.textures))
            throw new RangeError(`Unsupported effect texture list for resource ${effect.id}`);
          return list.textures.map((texture) => ({ effect, listUrl, texture }));
        }),
    );
    const shared = new Map<
      string,
      { source: (typeof lists)[number][number]; slots: { id: number; index: number }[] }
    >();
    const slots = new Set<number>();
    for (const source of lists.flat()) {
      const { effect, listUrl, texture } = source;
      const slot = key(effect.id, texture.resourceIndex);
      if (slots.has(slot))
        throw new RangeError(
          `Effect texture ${effect.id}:${texture.resourceIndex} is listed twice`,
        );
      slots.add(slot);
      // Absolute URLs and complete mip descriptions identify identical immutable image data.
      // Sampler state belongs to the draw, so resources can share the uploaded texture.
      const identity = JSON.stringify([
        choice.target,
        asPublished,
        explicit,
        signals.mobile,
        texture.mobile && [
          texture.mobile.width,
          texture.mobile.height,
          LARGE_TIERS.map((tier) => {
            const file = texture.mobile?.tiers[tier];
            return file ? new URL(file.url, listUrl).href : null;
          }),
        ],
        texture.levels.map((level) => [
          level.width,
          level.height,
          new URL(level.asset.url, listUrl).href,
        ]),
        LARGE_TIERS.map((tier) => {
          const file = texture.tiers?.[tier];
          return file ? new URL(file.url, listUrl).href : null;
        }),
      ]);
      let group = shared.get(identity);
      if (!group) shared.set(identity, (group = { source, slots: [] }));
      group.slots.push({ id: effect.id, index: texture.resourceIndex });
    }
    const pending = [...shared.entries()];
    const load = async (
      { effect, listUrl, texture }: (typeof lists)[number][number],
      bitmaps: ImageBitmap[],
    ): Promise<EffectTextureLevels | EffectTextureKtx2> => {
      const { resourceIndex } = texture;
      const get = async (url: string) => {
        const response = await fetcher(new URL(url, listUrl), {
          signal: loadingSignal,
          credentials: "omit",
        });
        if (!response.ok)
          throw new Error(`Effect texture ${effect.id}:${resourceIndex} HTTP ${response.status}`);
        return response;
      };
      const base = texture.levels[0];
      const large = base.width * base.height > EFFECT_TEXTURE_AUTO_LIMIT;
      const published = (tier: EffectTextureTier) =>
        texture.tiers?.[tier] !== undefined && decodes(signals, tier);
      const tier = asPublished
        ? undefined
        : (TARGET_TIERS[choice.target].find(published) ??
          (large && !explicit ? LARGE_TIERS.find(published) : undefined));
      if (tier) {
        const mobile =
          signals.mobile && !explicit && texture.mobile?.tiers[tier] ? texture.mobile : null;
        if (
          mobile &&
          (!Number.isSafeInteger(mobile.width) ||
            !Number.isSafeInteger(mobile.height) ||
            mobile.width <= 0 ||
            mobile.height <= 0 ||
            mobile.width > base.width ||
            mobile.height > base.height ||
            Math.max(mobile.width, mobile.height) > 2048)
        )
          throw new RangeError(
            `Effect texture ${effect.id}:${resourceIndex} has invalid mobile dimensions`,
          );
        const ktx2 = new Uint8Array(
          await (await get(mobile?.tiers[tier]?.url ?? texture.tiers![tier]!.url)).arrayBuffer(),
        );
        const image = parseKtx2(ktx2);
        if (
          image.width !== (mobile?.width ?? base.width) ||
          image.height !== (mobile?.height ?? base.height) ||
          image.levels.length !== (mobile ? 1 : texture.levels.length)
        )
          throw new RangeError(
            `Effect texture ${effect.id}:${resourceIndex} ${tier} tier disagrees with its images`,
          );
        if (mobile) reduced.push(`${effect.id}:${resourceIndex}`);
        return { resourceId: effect.id, resourceIndex, tier, ktx2 };
      }
      let skip = 0;
      let shift = 0;
      if (!asPublished && !explicit && large) {
        reduced.push(`${effect.id}:${resourceIndex}`);
        if (texture.levels.length > 1)
          while (
            skip < texture.levels.length - 1 &&
            texture.levels[skip].width * texture.levels[skip].height > EFFECT_TEXTURE_AUTO_LIMIT
          )
            skip++;
        else
          while (
            Math.max(1, base.width >> shift) * Math.max(1, base.height >> shift) >
            EFFECT_TEXTURE_AUTO_LIMIT
          )
            shift++;
      }
      const decoded = await Promise.allSettled(
        texture.levels.slice(skip).map(async (level) => {
          const response = await get(level.asset.url);
          const width = Math.max(1, level.width >> shift);
          const height = Math.max(1, level.height >> shift);
          const bitmap = await createImageBitmap(await response.blob(), {
            imageOrientation: "none",
            premultiplyAlpha: "none",
            colorSpaceConversion: "none",
            ...(shift > 0
              ? {
                  resizeWidth: width,
                  resizeHeight: height,
                  resizeQuality: "high" as const,
                }
              : {}),
          });
          bitmaps.push(bitmap);
          if (bitmap.width !== width || bitmap.height !== height)
            throw new RangeError(
              `Effect texture ${effect.id}:${resourceIndex} has unexpected dimensions`,
            );
          return bitmap;
        }),
      );
      const levels = decoded.map((result) => {
        if (result.status === "rejected") throw result.reason;
        return result.value;
      });
      return { resourceId: effect.id, resourceIndex, levels };
    };
    let next = 0;
    const worker = async () => {
      while (next < pending.length) {
        const [identity, item] = pending[next++];
        const bitmaps: ImageBitmap[] = [];
        try {
          throwIfAborted(loadingSignal);
          const cached = options.cache?.get(identity);
          if (cached) {
            cached.references++;
            owners.add({
              dispose() {
                if (--cached.references === 0) {
                  cached.dispose();
                  options.cache!.delete(identity);
                }
              },
            });
            for (const slot of item.slots) {
              loaded.set(key(slot.id, slot.index), cached.texture);
              if (cached.reduced) reduced.push(`${slot.id}:${slot.index}`);
            }
            continue;
          }
          const chain = await load(item.source, bitmaps);
          throwIfAborted(loadingSignal);
          try {
            const owner = createEffectTextures(gl, [chain]);
            const texture = owner.texture(chain.resourceId, chain.resourceIndex)!;
            if (options.cache) {
              const entry = {
                texture,
                references: 1,
                reduced: reduced.includes(`${chain.resourceId}:${chain.resourceIndex}`),
                dispose: () => owner.dispose(),
              };
              options.cache.set(identity, entry);
              owners.add({
                dispose() {
                  if (--entry.references === 0) {
                    entry.dispose();
                    options.cache!.delete(identity);
                  }
                },
              });
            } else owners.add(owner);
            for (const slot of item.slots) loaded.set(key(slot.id, slot.index), texture);
            if (reduced.includes(`${chain.resourceId}:${chain.resourceIndex}`))
              for (const slot of item.slots.slice(1)) reduced.push(`${slot.id}:${slot.index}`);
          } finally {
            options.onUpload?.();
          }
        } catch (error) {
          controller.abort(error);
          throw error;
        } finally {
          for (const bitmap of bitmaps) bitmap.close();
        }
      }
    };
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(4, pending.length) }, worker),
    );
    const failed = results.find((result) => result.status === "rejected");
    if (failed || loadingSignal.aborted) {
      for (const owner of owners) owner.dispose();
      if (failed) throw failed.reason;
      throwIfAborted(loadingSignal);
    }
    return {
      reduced,
      texture: (resourceId, resourceIndex) => loaded.get(key(resourceId, resourceIndex)) ?? null,
      dispose() {
        for (const owner of owners) owner.dispose();
        owners.clear();
        loaded.clear();
      },
    };
  } catch (error) {
    controller.abort(error);
    throw error;
  } finally {
    scope.dispose();
  }
}
