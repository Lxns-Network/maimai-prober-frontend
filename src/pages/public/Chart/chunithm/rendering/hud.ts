import { throwIfAborted } from "@lxns-network/chunithm-chart-engine/assets/abort";
import type { FrameSurface } from "@lxns-network/chunithm-chart-engine/render/frameTypes";
import { readPack } from "@lxns-network/chunithm-chart-engine/assets/packFormat";
import { createHudRenderer } from "@lxns-network/chunithm-chart-engine/hud/hudRenderer";
import {
  assembleHud,
  createHudGeometry,
  prepareHudChart,
  readHudScene,
  type HudChart,
  type HudChartState,
} from "@lxns-network/chunithm-chart-engine/hud/hudScene";
import { loadHudTextureImages } from "@lxns-network/chunithm-chart-engine/hud/hudTextures";
import {
  createHudValueReader,
  createHudValues,
} from "@lxns-network/chunithm-chart-engine/hud/timelineValues";
import type { Timeline } from "@lxns-network/chunithm-chart-engine/chart/timeline/reader";

const SCENE_FILE = "chunithm-hud.bin";
/** Directory the scene's texture paths are relative to. */
const TEXTURE_DIRECTORY = "hud/";

export interface HudSong {
  title: string;
  artist: string;
  difficulty: string;
  rawLevel: number;
  levelDecimal: number;
  exType: number;
  /** A WORLD'S END song's star frame, in half stars. */
  starDifType?: number;
  /** A WORLD'S END song's tag text. */
  worldsEndTag?: string;
}

async function fetchOk(url: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, { signal, credentials: "omit" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response;
}

async function loadJacket(url: string, signal: AbortSignal): Promise<ImageBitmap> {
  const blob = await (await fetchOk(url, signal)).blob();
  return createImageBitmap(blob, {
    imageOrientation: "none",
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
}

type HudResources = Awaited<ReturnType<typeof loadHudResources>>;

/**
 * Loads the interface's scene file, the chart's song and decoded textures. The scene file sits next
 * to the note pack, its textures under the pack directory's `hud/`, and the song and jacket come
 * from the chart, so only they wait for the chart. Nothing waits for the jacket image: its texture
 * starts as one transparent texel and `jacket` settles with the image, or rejects when it cannot be
 * loaded.
 */
export async function loadHudResources(input: {
  base: string;
  song: Promise<HudSong>;
  jacketUrl: Promise<string | null>;
  signal: AbortSignal;
}) {
  const { signal } = input;
  throwIfAborted(signal);
  let disposed = false;
  let decodedImages: Awaited<ReturnType<typeof loadHudTextureImages>> = [];
  let jacketImage: ImageBitmap | null = null;
  const releaseImages = () => {
    for (const image of decodedImages) if (image instanceof ImageBitmap) image.close();
    decodedImages = [];
  };
  const dispose = () => {
    disposed = true;
    signal.removeEventListener("abort", dispose);
    releaseImages();
    jacketImage?.close();
    jacketImage = null;
  };
  signal.addEventListener("abort", dispose, { once: true });
  const jacket: Promise<ImageBitmap | null> = input.jacketUrl
    .then((url) => (url ? loadJacket(new URL(url, window.location.href).href, signal) : null))
    .then((image) => {
      if (disposed) {
        image?.close();
        return null;
      }
      jacketImage = image;
      return image;
    });
  jacket.catch(() => {});
  const hudReady = fetchOk(new URL(SCENE_FILE, input.base).href, signal)
    .then((response) => response.arrayBuffer())
    .then((bytes) => readHudScene(readPack(bytes, "chunithm")));
  const empty = { width: 1, height: 1, pixels: new Uint8Array(4) };
  const textureBase = new URL(TEXTURE_DIRECTORY, input.base).href;
  try {
    const [hud, song, images, jacketUrl] = await Promise.all([
      hudReady,
      input.song,
      hudReady
        .then((scene) => loadHudTextureImages(scene, textureBase, empty, signal))
        .then((images) => {
          decodedImages = images;
          if (disposed) releaseImages();
          return images;
        }),
      input.jacketUrl,
    ]);
    throwIfAborted(signal);
    return { hud, song, images, jacket, expectsJacket: !!jacketUrl, releaseImages, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

export interface HudHost {
  /** What the interface cannot draw for this song. */
  readonly missing: readonly string[];
  readonly scrolling: boolean;
  /** Draws the interface for a grid step over what the scene just rendered. */
  draw(step: number, textSeconds?: number): void;
  selectSpeed(speedRow: number): void;
  selectMirror(mirror: boolean): void;
  replaceChart(song: HudSong, timeline: Timeline): void;
  dispose(): void;
}

/**
 * Draws the playing interface with the engine renderer on the scene's own context, from the score rows
 * of the chart's timeline. Takes ownership of the resources' images. A jacket that arrives later is
 * drawn from then on; one that fails switches to the layout without a jacket. Either asks for a
 * frame through `onChange`.
 */
export function createHudHost(input: {
  canvas: HTMLCanvasElement;
  scene: FrameSurface;
  resources: HudResources;
  speedRow: number;
  mirror: boolean;
  timeline: Timeline;
  onChange(): void;
}): HudHost {
  const { canvas, scene, resources, onChange } = input;
  const { hud, images } = resources;
  let song = resources.song;
  const gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
  if (!gl) throw new Error("The scene's WebGL context is not available");
  const renderer = scene.withPresentation((device) => {
    try {
      return createHudRenderer(gl, hud, images);
    } finally {
      resources.releaseImages();
      device.markResourcesUnknown();
    }
  });
  let speedRow = input.speedRow;
  let mirror = input.mirror;
  let jacket = resources.expectsJacket;
  const chartOf = (): HudChart => ({
    title: song.title,
    artist: song.artist,
    difficulty: song.difficulty,
    rawLevel: song.rawLevel,
    levelDecimal: song.levelDecimal,
    exType: song.exType,
    starDifType: song.starDifType,
    worldsEndTag: song.worldsEndTag,
    jacket,
    speedRow,
    mirror,
  });
  let chart: HudChartState;
  const hasScrollingText = () => {
    for (const text of chart.texts.values()) if (text.scrollPeriod) return true;
    return false;
  };
  try {
    chart = prepareHudChart(hud, chartOf());
  } catch (error) {
    renderer.dispose();
    resources.dispose();
    throw error;
  }
  const geometry = createHudGeometry(hud);
  let read = createHudValueReader(input.timeline);
  const values = createHudValues();
  let revision = 0;
  let assembled = "";
  let disposed = false;
  let textureFailure: { cause: unknown } | null = null;
  const slot = hud.meta.textures.findIndex((texture) => texture.source.kind === "jacket");
  resources.jacket.then(
    (image) => {
      try {
        if (!image) return;
        if (!disposed)
          scene.withPresentation((device) => {
            try {
              renderer.replaceTexture(slot, image);
            } finally {
              device.markResourcesUnknown();
            }
          });
        if (!disposed) onChange();
      } catch (cause) {
        if (!disposed) {
          textureFailure = { cause };
          onChange();
        }
      } finally {
        resources.dispose();
      }
    },
    () => {
      resources.dispose();
      if (disposed || !jacket) return;
      jacket = false;
      chart = prepareHudChart(hud, chartOf());
      assembled = "";
      onChange();
    },
  );
  return {
    get missing() {
      return chart.missing;
    },
    get scrolling() {
      return hasScrollingText();
    },
    draw(step, textSeconds = step / 120) {
      if (disposed) return;
      if (textureFailure) throw textureFailure.cause;
      read(step, values);
      const key = `${values.score}:${values.combo}:${values.gauge}:${values.counts.join()}`;
      if (key !== assembled || hasScrollingText()) {
        assembled = key;
        assembleHud(hud, chart, values, geometry, textSeconds);
        revision++;
      }
      scene.withPresentation((device) => {
        const target = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        try {
          renderer.resize(canvas.width, canvas.height);
          renderer.draw(geometry, revision);
          gl.bindFramebuffer(gl.FRAMEBUFFER, target);
          gl.viewport(0, 0, canvas.width, canvas.height);
          renderer.composite();
        } finally {
          device.markExternalBindingsUnknown();
        }
      });
    },
    replaceChart(nextSong, timeline) {
      song = nextSong;
      read = createHudValueReader(timeline);
      chart = prepareHudChart(hud, chartOf());
      assembled = "";
    },
    selectSpeed(row) {
      speedRow = row;
      chart = prepareHudChart(hud, chartOf());
      assembled = "";
    },
    selectMirror(value) {
      mirror = value;
      chart = prepareHudChart(hud, chartOf());
      assembled = "";
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resources.dispose();
      scene.withPresentation((device) => {
        try {
          renderer.dispose();
        } finally {
          device.markResourcesUnknown();
        }
      });
    },
  };
}
