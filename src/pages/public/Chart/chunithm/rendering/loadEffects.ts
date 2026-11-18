import { createAbortScope, throwIfAborted } from "@lxns-network/chunithm-chart-engine/assets/abort";
import { createPackedFetch } from "@lxns-network/chunithm-chart-engine/assets/packedFetch";
import type { FrameSurface } from "@lxns-network/chunithm-chart-engine/render/frameTypes";
import {
  loadEffectTextures,
  loadEffectResourceList,
  type EffectResourceList,
  type EffectTextureCache,
} from "@lxns-network/chunithm-chart-engine/effects/textures";
import type { LoadedChart } from "@lxns-network/chunithm-chart-engine/chart/worker/loadChart";
import {
  createEffectHost,
  loadEffectResources,
  effectResourceIds,
  type EffectHost,
} from "./effects";

/** Transfers loaded textures to the effect host, or releases them if either parallel load fails. */
async function loadEffectBundle(input: {
  canvas: HTMLCanvasElement;
  scene: FrameSurface;
  effectList: string;
  manifest?: Promise<EffectResourceList>;
  ids: readonly number[];
  signal: AbortSignal;
  textureOverride: string | null;
  textureCache: EffectTextureCache;
}) {
  const { canvas, scene, effectList, manifest, signal } = input;
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("The scene's WebGL context is not available");
  const ids = input.ids;
  const list = await (manifest ?? loadEffectResourceList(effectList, signal));
  throwIfAborted(signal);
  const loading = new AbortController();
  const scope = createAbortScope([signal, loading.signal]);
  const effectSignal = scope.signal;
  const fetcher = list.bundles ? createPackedFetch(effectList, list.bundles, effectSignal) : fetch;
  const resourceList = Promise.resolve(list);
  const cancelLoading = (error: unknown): never => {
    loading.abort(error);
    throw error;
  };
  const [effects, textures] = await Promise.allSettled([
    loadEffectResources(effectList, effectSignal, ids, resourceList, fetcher).catch(cancelLoading),
    loadEffectTextures(gl, effectList, {
      signal: effectSignal,
      manifest: resourceList,
      fetch: fetcher,
      ids,
      override: input.textureOverride,
      cache: input.textureCache,
      onUpload: () => scene.withPresentation((device) => device.markResourcesUnknown()),
    }).catch(cancelLoading),
  ]);
  try {
    if (effects.status === "rejected") throw effects.reason;
    if (textures.status === "rejected") throw textures.reason;
    throwIfAborted(effectSignal);
    return { resources: effects.value.resources, textures: textures.value };
  } catch (error) {
    if (textures.status === "fulfilled") textures.value.dispose();
    throw error;
  } finally {
    scope.dispose();
    if (!signal.aborted) scene.withPresentation((device) => device.markResourcesUnknown());
  }
}

/** Keeps effect resources across difficulties; only missing resource ids are loaded on replacement. */
export async function loadPreviewEffects(
  input: Omit<Parameters<typeof loadEffectBundle>[0], "ids" | "textureCache"> & {
    effects: LoadedChart["effects"];
  },
): Promise<EffectHost & { ensureEffects(effects: LoadedChart["effects"]): Promise<void> }> {
  const { effects, ...rest } = input;
  const resourceInput = { ...rest, textureCache: new Map() as EffectTextureCache };
  const ids = effectResourceIds(effects);
  const initial = await loadEffectBundle({ ...resourceInput, ids });
  const groups = [initial.textures];
  const resources = initial.resources;
  const loaded = new Set(ids);
  let disposed = false;
  const textures = {
    reduced: initial.textures.reduced,
    texture(id: number, index: number) {
      for (const group of groups) {
        const texture = group.texture(id, index);
        if (texture) return texture;
      }
      return null;
    },
    dispose() {
      disposed = true;
      for (const group of groups) group.dispose();
    },
  };
  let host: EffectHost | undefined;
  try {
    host = createEffectHost({
      gl: resourceInput.canvas.getContext("webgl2")!,
      scene: resourceInput.scene,
      resources,
      textures,
    });
    await host.prepareResources(ids);
    throwIfAborted(input.signal);
  } catch (error) {
    if (host) host.dispose();
    else textures.dispose();
    throw error;
  }
  let loading = Promise.resolve();
  return {
    ...host,
    ensureEffects(effects) {
      loading = loading.then(async () => {
        const ids = effectResourceIds(effects).filter((id) => !loaded.has(id));
        if (!ids.length) return;
        const next = await loadEffectBundle({ ...resourceInput, ids });
        if (disposed) {
          next.textures.dispose();
          throw new DOMException("Effect host was disposed", "AbortError");
        }
        for (const id of ids) {
          resources[id] = next.resources[id];
          loaded.add(id);
        }
        groups.push(next.textures);
        await host!.prepareResources(ids);
        throwIfAborted(input.signal);
      });
      return loading;
    },
  };
}
