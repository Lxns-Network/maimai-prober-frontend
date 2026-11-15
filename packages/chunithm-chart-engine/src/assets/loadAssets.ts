import { packSlice, readPack, retainPackEntries, type Pack } from "./packFormat";
import {
  chooseTextureTarget,
  readDeviceSignals,
  type TextureChoice,
  type TextureTarget,
} from "./textureFormat";
import { uploadKtx2 } from "./gpuUpload";
import { compilePrograms } from "./shaderCompile";

export interface ChunithmAssets {
  /** The pack the textures and programs were read from. */
  pack: Pack;
  textures: Map<string, { texture: WebGLTexture; width: number; height: number }>;
  programs: Map<string, WebGLProgram>;
  choice: TextureChoice;
  gpuBytes: number;
  ensureTextures(ids: ReadonlySet<string>): void;
  dispose(): void;
}

const FALLBACK: Record<TextureTarget, TextureTarget[]> = {
  bc: ["bc", "rgba8"],
  astc: ["astc", "etc2", "rgba8"],
  etc2: ["etc2", "rgba8"],
  rgba8: ["rgba8"],
};

const COMPRESSED = ["bc", "astc", "etc2"] as const;

/** Fetches and reads a pack. */
export async function fetchPack(
  packUrl: string,
  fetcher: typeof fetch = fetch,
  engine = "chunithm",
): Promise<Pack> {
  const response = await fetcher(packUrl);
  if (!response.ok) throw new Error(`Asset pack ${packUrl} returned ${response.status}`);
  return readPack(await response.arrayBuffer(), engine);
}

export async function loadChunithmAssets(
  gl: WebGL2RenderingContext,
  packUrl: string,
  options: {
    fetch?: typeof fetch;
    /** The pack, already read by the caller; nothing is fetched then. */
    pack?: Promise<Pack>;
    override?: string | null;
    engine?: string;
    schedule?: (cb: () => void) => void;
    /** Compile the pack's shaders into `programs`; a caller that builds its own programs turns this off. */
    compilePrograms?: boolean;
    /** Selects the complete texture set needed by this consumer. Omitted to upload the whole pack. */
    textureIds?: (pack: Pack) => ReadonlySet<string>;
  } = {},
): Promise<ChunithmAssets> {
  let pack = await (options.pack ?? fetchPack(packUrl, options.fetch ?? fetch, options.engine));
  const choice = chooseTextureTarget(readDeviceSignals(gl), options.override ?? null);
  const split = pack.entries.get("textures/manifest");
  let texturePack = pack;
  if (split) {
    const tiers = split.meta.tiers as Partial<Record<TextureTarget, string>> | undefined;
    const file = tiers?.[choice.target];
    if (typeof file !== "string" || !file)
      throw new RangeError(`Texture pack has no ${choice.target} tier`);
    texturePack = await fetchPack(
      new URL(file, packUrl).href,
      options.fetch ?? fetch,
      options.engine,
    );
  }
  const ids = new Set<string>();
  const selectedIds = options.textureIds?.(pack);
  const shaderSources: { name: string; vertex: string; fragment: string }[] = [];
  for (const [name, entry] of texturePack.entries)
    if (entry.kind === "texture") {
      const id = name.split("/")[1];
      if (!selectedIds || selectedIds.has(id)) ids.add(id);
    }
  for (const id of selectedIds ?? [])
    if (!ids.has(id)) throw new Error(`Required texture ${id} is missing from the pack`);
  for (const [name, entry] of pack.entries) {
    if (entry.kind === "shader" && options.compilePrograms !== false) {
      const text = new TextDecoder().decode(packSlice(pack, name));
      const split = text.indexOf("\0");
      shaderSources.push({
        name: name.slice("shader/".length),
        vertex: text.slice(0, split),
        fragment: text.slice(split + 1),
      });
    }
  }
  const textures = new Map<string, { texture: WebGLTexture; width: number; height: number }>();
  let gpuBytes = 0;
  let programs = new Map<string, WebGLProgram>();
  const ensureTextures = (wanted: ReadonlySet<string>) => {
    for (const id of wanted) {
      if (textures.has(id)) continue;
      const variant = FALLBACK[choice.target].find((t) =>
        texturePack.entries.has(`tex/${id}/${t}`),
      );
      if (!variant) throw new Error(`Texture ${id} has no variant usable as ${choice.target}`);
      const entry = texturePack.entries.get(`tex/${id}/${variant}`)!;
      // A texture packed only as RGBA8 is uploaded at full size on every device.
      const rgba8Only = split
        ? entry.meta.rgba8Only === true
        : !COMPRESSED.some((t) => texturePack.entries.has(`tex/${id}/${t}`));
      const effective: TextureChoice = rgba8Only
        ? { target: "rgba8", dropTopMip: false, compare: choice.compare }
        : variant === choice.target
          ? choice
          : {
              target: variant,
              dropTopMip: variant === "rgba8" && !choice.compare,
              compare: choice.compare,
            };
      const uploaded = uploadKtx2(gl, packSlice(texturePack, entry.name), effective);
      textures.set(id, {
        texture: uploaded.texture,
        width: uploaded.width,
        height: uploaded.height,
      });
      gpuBytes += uploaded.gpuBytes;
    }
  };
  try {
    ensureTextures(ids);
    programs =
      options.compilePrograms === false
        ? new Map<string, WebGLProgram>()
        : await compilePrograms(gl, shaderSources, options.schedule);
  } catch (error) {
    for (const { texture } of textures.values()) gl.deleteTexture(texture);
    throw error;
  }
  if (!split) pack = retainPackEntries(pack, (entry) => entry.kind !== "texture");
  return {
    pack,
    textures,
    programs,
    choice,
    get gpuBytes() {
      return gpuBytes;
    },
    ensureTextures,
    dispose() {
      for (const t of textures.values()) gl.deleteTexture(t.texture);
      for (const p of programs.values()) gl.deleteProgram(p);
      textures.clear();
      programs.clear();
    },
  };
}
