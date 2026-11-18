import { throwIfAborted } from "@lxns-network/chunithm-chart-engine/assets/abort";
import {
  createSortDepthCamera,
  type SortDepthCamera,
} from "@lxns-network/chunithm-chart-engine/render/sortDepth";
import type { FrameSurface } from "@lxns-network/chunithm-chart-engine/render/frameTypes";
import {
  fetchPack,
  loadChunithmAssets,
} from "@lxns-network/chunithm-chart-engine/assets/loadAssets";
import type { Pack } from "@lxns-network/chunithm-chart-engine/assets/packFormat";
import { ACTIVE_AFTER } from "@lxns-network/chunithm-chart-engine/chart/lifecycle/emissions";
import {
  STEPS_PER_SECOND,
  stepForSeconds,
} from "@lxns-network/chunithm-chart-engine/loop/audioClock";
import {
  NOTE_CAMERA,
  cameraViewProjection,
} from "@lxns-network/chunithm-chart-engine/notes/camera";
import {
  createNoteLayer,
  type NoteLayerLive,
} from "@lxns-network/chunithm-chart-engine/notes/noteLayer";
import { buildRecordPlans } from "@lxns-network/chunithm-chart-engine/notes/recordPlans";
import type { FieldPackData } from "@lxns-network/chunithm-chart-engine/field/fieldPack";
import { createEffectSlot, type EffectHost } from "./effects";

import {
  loadChart,
  openChartSession,
  type ChartSession,
  type LoadChartOptions,
  type LoadedChart,
} from "@lxns-network/chunithm-chart-engine/chart/worker/loadChart";

const PACK_FILE = "chunithm.bin";

/** Steps retained in the note layer's current visibility block. */
const VISIBILITY_BLOCK_STEPS = 240;

export interface ChartInput extends Omit<
  LoadChartOptions,
  "signal" | "createWorker" | "includeScore" | "speedRow"
> {
  bytes: Uint8Array;
}

/** Starts the Worker computation of a chart at one display speed row. */
function bakeChart(chart: ChartInput, speedRow: number, signal: AbortSignal): Promise<LoadedChart> {
  return loadChart(chart.bytes, {
    ...chart,
    includeScore: true,
    speedRow,
    timeoutMs: chart.timeoutMs ?? 180_000,
    signal,
  });
}

/** Opens a Worker session that computes speed rows of the chart from one parse and binding. */
export function openPageChartSession(chart: ChartInput): ChartSession {
  return openChartSession(chart.bytes, {
    ...chart,
    includeMirror: true,
    timeoutMs: chart.timeoutMs ?? 180_000,
  });
}

/** Fetches and reads the note pack next to the other engine assets. */
export function readNotePack(base: string, signal: AbortSignal): Promise<Pack> {
  return fetchPack(new URL(PACK_FILE, base).href, (request) => fetch(request, { signal }));
}

export interface NoteHost {
  /** The computed chart the layers currently draw. */
  readonly chart: LoadedChart;
  readonly score: LoadedChart["score"];
  /** Timeline of the currently selected difficulty. */
  readonly timeline: LoadedChart["timeline"];
  /** Effect instances and random-stream starts of the same computation as the timeline. */
  readonly effects: LoadedChart["effects"];
  /** The note pack textures by id, for the field drawn over the same pack. */
  readonly textures: ReadonlyMap<string, { readonly texture: WebGLTexture }>;
  /** View-projection the notes were last drawn with: row-major, for column vectors. */
  readonly viewProjection: Float32Array;
  showRecorded(): () => void;
  selectMirror(mirror: boolean): void;
  replaceChart(chart: LoadedChart, mirror: boolean): void;
  /** Keeps notes drawable this many steps past their automatic run, for a player's late results. */
  setLiveSlack(steps: number): void;
  dispose(): void;
}

/**
 * Attaches the chart's note layer to the frame host. Parsing and baking run in a dedicated Worker;
 * the note host owns uploaded assets until disposal.
 */
export async function createNoteHost(input: {
  canvas: HTMLCanvasElement;
  scene: FrameSurface;
  speedRow: number;
  chart: ChartInput;
  /** Computation of `speedRow` the page already started for the same chart. */
  first?: Promise<LoadedChart>;
  /** Hands over the note pack the page already read; called once, the page keeping no reference. */
  takePack?: () => Promise<Pack>;
  /** Field textures share the note pack and must survive every display-option change. */
  field?: FieldPackData;
  /** Session that computes the chart's speed rows; the page keeps ownership. */
  session?: ChartSession;
  /** Effect host drawing the chart's effects in the same passes; owned by the note host. */
  effects?: Promise<EffectHost>;
  /** Current depth offset for the result-text effect. */
  judgePositionOffset(): number;
  /** Current automatic-CRITICAL display option row. */
  criticalDisplayRow(): number;
  base: string;
  signal: AbortSignal;
  /** Called when effect resources become ready, so the page can draw again. */
  onChange?: () => void;
  /** Note states a player produces for a computed chart, read in place of its timeline's. */
  live?: (chart: LoadedChart) => NoteLayerLive;
  /** Result effects drawn in place of the chart's own, while the page has any. */
  liveEffects?: () => LoadedChart["effects"] | null;
}): Promise<NoteHost> {
  const {
    canvas,
    scene,
    signal,
    judgePositionOffset,
    criticalDisplayRow,
    chart,
    speedRow: initialSpeedRow,
    first: initialChart,
    takePack,
    field,
    session,
    effects: pendingEffects,
    base,
    onChange,
  } = input;
  const bake = (speedRow: number, bakeSignal: AbortSignal) =>
    session ? session.compute(speedRow, bakeSignal) : bakeChart(chart, speedRow, bakeSignal);
  const effectSlot = pendingEffects ? createEffectSlot(pendingEffects, onChange) : null;
  let first: LoadedChart;
  let gl: WebGL2RenderingContext | null;
  try {
    throwIfAborted(signal);
    first = await (initialChart ?? bake(initialSpeedRow, signal));
    throwIfAborted(signal);
    gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
    if (!gl) throw new Error("The scene's WebGL context is not available");
  } catch (error) {
    effectSlot?.dispose();
    throw error;
  }

  const textureOverride =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("texture");
  let recordPlans: ReturnType<typeof buildRecordPlans> | undefined;
  let mirroredPlans: ReturnType<typeof buildRecordPlans> | undefined;
  const assets = await loadChunithmAssets(gl, new URL(PACK_FILE, base).href, {
    compilePrograms: false,
    fetch: (request, init) => fetch(request, { ...init, signal }),
    pack: takePack?.(),
    override: textureOverride,
    textureIds: field
      ? (pack) => {
          const ids = new Set<string>([field.wall.meta.textureId]);
          for (const model of field.statics)
            for (const mesh of model.meshes)
              for (const texture of mesh.textures) ids.add(texture.id);
          for (const divider of [...field.dividers.models, field.barline])
            for (const id of divider.byColor) ids.add(id);
          recordPlans = buildRecordPlans(pack, first.score);
          if (first.mirrored) {
            mirroredPlans = buildRecordPlans(pack, first.mirrored.score);
            recordPlans = {
              ...recordPlans,
              requiredModels: new Set([
                ...recordPlans.requiredModels,
                ...mirroredPlans.requiredModels,
              ]),
            };
          }
          const { requiredModels } = recordPlans;
          for (const name of requiredModels) {
            const materials = pack.entries.get(name)!.meta.materials as {
              textureNames?: (string | null)[];
            }[];
            for (const material of materials)
              for (const id of material.textureNames ?? []) if (id !== null) ids.add(id);
          }
          for (const [name, entry] of pack.entries)
            if (name.startsWith("note/band/")) ids.add(entry.meta.texture as string);
          return ids;
        }
      : undefined,
  }).catch((error) => {
    effectSlot?.dispose();
    if (!signal.aborted) scene.withPresentation((device) => device.markResourcesUnknown());
    throw error;
  });
  let layer: ReturnType<typeof createNoteLayer> | undefined;
  let mirroredLayer: ReturnType<typeof createNoteLayer> | undefined;
  let layoutMirror = chart.mirror;
  let mirror = layoutMirror;
  let renderer: ReturnType<typeof createNoteLayer>["renderer"] | undefined;
  let registered = false;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    if (registered) scene.setExternalNoteRenderer(null);
    try {
      effectSlot?.dispose();
      mirroredLayer?.dispose();
      layer?.dispose();
      renderer?.dispose();
      assets.dispose();
    } finally {
      if (!signal.aborted) scene.withPresentation((device) => device.markResourcesUnknown());
    }
  };
  try {
    throwIfAborted(signal);
    const texturesByName = new Map<string, WebGLTexture>();
    for (const [name, { texture }] of assets.textures) texturesByName.set(name, texture);

    const viewProjection = cameraViewProjection(NOTE_CAMERA, canvas.width, canvas.height);
    let live = input.live?.(first);
    let liveSlack = 0;
    const layerOptions = {
      gl,
      strictResources: true,
      pack: assets.pack,
      speedRow: initialSpeedRow,
      visibilityBlockSteps: VISIBILITY_BLOCK_STEPS,
      viewProjection,
      texturesByName,
    };
    const initialOptions = {
      ...layerOptions,
      score: first.score,
      timeline: first.timeline,
      motion: first.motion,
      lifetimes: first.lifetimes,
      livePlayback: first.livePlayback,
      live,
      liveSlack,
    };
    layer = createNoteLayer({ ...initialOptions, recordPlans });
    renderer = layer.renderer;
    layer.detachRenderer();
    if (first.mirrored)
      mirroredLayer = createNoteLayer({
        ...initialOptions,
        score: first.mirrored.score,
        recordPlans: mirroredPlans,
        renderer: layer.renderer,
      });
    let speedRow = initialSpeedRow;
    let speedMultiplier = 1;

    const bandSortInputs = new Map<string, { position: number[]; offset: number }>();
    let drawEpoch: (() => number) | undefined;
    scene.withPresentation((device) => {
      if (typeof device.executionSequence === "number") drawEpoch = () => device.executionSequence;
      device.markResourcesUnknown();
    });
    scene.setExternalNoteRenderer(
      ({
        seconds,
        speedRow: selectedSpeedRow,
        speedMultiplier: selectedMultiplier = 1,
        playbackRate,
        playbackEpoch,
        camera,
        environment,
      }) => {
        throwIfAborted(signal);
        if (disposed) throw new Error("Note host is disposed");
        if (gl.isContextLost()) throw new Error("WebGL 上下文已丢失");
        const selectedLayer = mirror === layoutMirror ? layer! : mirroredLayer!;
        if (selectedSpeedRow !== speedRow || selectedMultiplier !== speedMultiplier) {
          layer!.setSpeed(selectedSpeedRow, selectedMultiplier);
          mirroredLayer?.setSpeed(selectedSpeedRow, selectedMultiplier);
          speedMultiplier = selectedMultiplier;
          speedRow = selectedSpeedRow;
        }
        viewProjection.set(camera.viewProjection);
        selectedLayer.setViewProjection(viewProjection);
        const step = Math.max(stepForSeconds(seconds), ACTIVE_AFTER);
        const inactiveLayer = selectedLayer === layer ? mirroredLayer : layer;
        inactiveLayer?.advance(step);
        // Notes on screen when the chart starts are built hidden at its first step; the steps before
        // they first show draw as that step, so a page paused at the start shows them.
        let sortCamera: SortDepthCamera | null = null;
        const sorter = (): SortDepthCamera =>
          (sortCamera ??= createSortDepthCamera(camera.cameraA, camera.cameraB, environment));
        const frame = selectedLayer.prepare(
          step,
          {
            cameraPosition: scene.readEffectCamera().position,
            gpuEpoch: drawEpoch,
            modelDepth: (sortJoint, sortDistanceOffset) =>
              sorter().model(sortJoint, sortDistanceOffset),
            bandDepth(profile) {
              let inputs = bandSortInputs.get(profile);
              if (!inputs) {
                const meta = assets.pack.entries.get(profile)?.meta;
                const position = meta?.sortPosition;
                const offset = meta?.sortDistanceOffset;
                if (!Array.isArray(position) || position.length !== 3 || typeof offset !== "number")
                  throw new RangeError(
                    `Band ${profile} has no primitive sort inputs; rebuild the note pack`,
                  );
                inputs = { position, offset };
                bandSortInputs.set(profile, inputs);
              }
              return sorter().primitive(inputs.position, inputs.offset);
            },
          },
          Math.max(seconds * STEPS_PER_SECOND, ACTIVE_AFTER),
        );
        const effects = effectSlot?.frame({
          seconds,
          speedRow,
          camera,
          environment,
          effects:
            input.liveEffects?.() ??
            (mirror === layoutMirror ? first.effects : first.mirrored!.effects),
          playbackRate,
          playbackEpoch,
          judgePositionOffset: judgePositionOffset(),
          criticalDisplayRow: criticalDisplayRow(),
        });
        const notes = frame.entries.map((entry) => {
          const pass =
            entry.pass === 0
              ? 8
              : entry.pass === 1
                ? 12
                : entry.pass === 2
                  ? 16
                  : entry.pass === 3
                    ? entry.key < 0x8000
                      ? 4
                      : 24
                    : null;
          if (pass === null) throw new RangeError(`Unsupported note pass ${entry.pass}`);
          return { ...entry, pass };
        });
        return {
          notes: frame.notes,
          entries: effects ? [...notes, ...effects] : notes,
        };
      },
    );
    registered = true;
    signal.addEventListener("abort", dispose, { once: true });
    throwIfAborted(signal);
    /** Rebuilds both layouts' layers for a computed chart, with the note states they read. */
    const rebuild = (
      next: LoadedChart,
      nextMirror: boolean,
      nextLive: NoteLayerLive | undefined,
    ) => {
      const plans = buildRecordPlans(assets.pack, next.score);
      const alternate = next.mirrored
        ? buildRecordPlans(assets.pack, next.mirrored.score)
        : undefined;
      const models = new Set([...plans.requiredModels, ...(alternate?.requiredModels ?? [])]);
      const ids = new Set<string>();
      for (const name of models) {
        const materials = assets.pack.entries.get(name)!.meta.materials as {
          textureNames?: (string | null)[];
        }[];
        for (const material of materials)
          for (const id of material.textureNames ?? []) if (id !== null) ids.add(id);
      }
      let nextLayer: ReturnType<typeof createNoteLayer> | undefined;
      let nextAlternate: ReturnType<typeof createNoteLayer> | undefined;
      try {
        assets.ensureTextures(ids);
        for (const [name, { texture }] of assets.textures) texturesByName.set(name, texture);
        renderer!.ensureModels(models);
        const options = {
          ...layerOptions,
          timeline: next.timeline,
          score: next.score,
          motion: next.motion,
          lifetimes: next.lifetimes,
          livePlayback: next.livePlayback,
          live: nextLive,
          liveSlack,
          speedRow,
          renderer,
        };
        nextLayer = createNoteLayer({ ...options, recordPlans: plans });
        if (next.mirrored)
          nextAlternate = createNoteLayer({
            ...options,
            score: next.mirrored.score,
            recordPlans: alternate,
          });
        nextLayer.setSpeed(speedRow, speedMultiplier);
        nextAlternate?.setSpeed(speedRow, speedMultiplier);
      } catch (error) {
        nextAlternate?.dispose();
        nextLayer?.dispose();
        throw error;
      } finally {
        scene.withPresentation((device) => device.markResourcesUnknown());
      }
      mirroredLayer?.dispose();
      layer!.dispose();
      layer = nextLayer;
      mirroredLayer = nextAlternate;
      first = next;
      layoutMirror = nextMirror;
      live = nextLive;
    };
    return {
      get chart() {
        return first;
      },
      get score() {
        return first.score;
      },
      get timeline() {
        return first.timeline;
      },
      get effects() {
        return first.effects;
      },
      textures: assets.textures,
      viewProjection,
      replaceChart(next, nextMirror) {
        rebuild(next, nextMirror, input.live?.(next));
      },
      showRecorded() {
        const previous = live;
        rebuild(first, layoutMirror, undefined);
        return () => rebuild(first, layoutMirror, previous);
      },
      setLiveSlack(value) {
        if (value === liveSlack) return;
        liveSlack = value;
        rebuild(first, layoutMirror, live);
      },
      selectMirror(value) {
        if (value !== layoutMirror && !mirroredLayer)
          throw new Error("Mirrored note layout is unavailable");
        mirror = value;
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
