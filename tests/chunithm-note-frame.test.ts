import type { LoadedChart } from "@lxns-network/chunithm-chart-engine/chart/worker/loadChart";
import type { Pack } from "@lxns-network/chunithm-chart-engine/assets/packFormat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FrameExternalRenderer } from "@lxns-network/chunithm-chart-engine/render/frameTypes";

const mocked = vi.hoisted(() => ({ load: vi.fn(), assets: vi.fn(), layer: vi.fn() }));
vi.mock("@lxns-network/chunithm-chart-engine/chart/worker/loadChart", () => ({
  loadChart: mocked.load,
}));
vi.mock("@lxns-network/chunithm-chart-engine/assets/loadAssets", () => ({
  loadChunithmAssets: mocked.assets,
}));
vi.mock("@lxns-network/chunithm-chart-engine/notes/noteLayer", () => ({
  createNoteLayer: mocked.layer,
}));
import { createNoteHost } from "../src/pages/public/Chart/chunithm/rendering/notes";

function setup() {
  const releaseAssets = vi.fn(),
    releaseLayer = vi.fn();
  const prepare = vi.fn<
    (
      step: number,
      order: unknown,
    ) => {
      entries: { pass: number; key: number; depth: number; draw(): { draws: number } }[];
      notes: number;
      stats: Record<string, never>;
    }
  >(() => ({
    entries: [{ pass: 2, key: 0x1401, depth: 0, draw: () => ({ draws: 1 }) }],
    notes: 1,
    stats: {},
  }));
  const layers: {
    dispose: typeof releaseLayer;
    prepare: typeof prepare;
    setViewProjection: ReturnType<typeof vi.fn>;
    setSpeed: ReturnType<typeof vi.fn>;
  }[] = [];
  let producer: FrameExternalRenderer | null = null;
  const effectCamera = { position: [0, 57, 44], up: [0, 1, 0] };
  const scene = {
    readEffectCamera: () => ({ position: [...effectCamera.position], up: [...effectCamera.up] }),
    withPresentation: (action: (device: unknown) => unknown) =>
      action({ markResourcesUnknown() {} }),
    setExternalNoteRenderer: (next: FrameExternalRenderer | null) => {
      producer = next;
    },
  };
  const gl = { bindTexture() {}, texParameteri() {}, isContextLost: () => false };
  const canvas = { width: 640, height: 640, getContext: () => gl };
  const controller = new AbortController();
  mocked.load.mockResolvedValue({ score: { records: [] }, timeline: {} });
  mocked.assets.mockResolvedValue({
    textures: new Map(),
    pack: { entries: new Map() },
    dispose: releaseAssets,
  });
  mocked.layer.mockImplementation(() => {
    const layer = {
      detachRenderer() {},
      renderer: { dispose() {} },
      dispose: vi.fn(),
      prepare,
      setViewProjection: vi.fn(),
      setSpeed: vi.fn(),
    };
    layers.push(layer);
    return layer;
  });
  return {
    scene,
    effectCamera,
    canvas,
    controller,
    layers,
    prepare,
    releaseAssets,
    producer: () => producer,
  };
}
const camera = {
  viewport: { width: 640, height: 640 },
  cameraA: new Array(16).fill(0),
  cameraB: new Array(16).fill(0),
  viewProjection: new Float32Array(16),
};
const chart = {
  bytes: new Uint8Array(),
  config: new Uint8Array(),
  difficulty: 4,
  mirror: false,
  musicId: 2999,
};
beforeEach(() => vi.clearAllMocks());

describe("engine host scene ownership", () => {
  it("registers a sortable producer instead of drawing over the completed scene", async () => {
    const h = setup();
    const host = await createNoteHost({
      ...h,
      scene: h.scene as never,
      canvas: h.canvas as never,
      speedRow: 0,
      judgePositionOffset: () => 0,
      criticalDisplayRow: () => 0,
      chart,
      base: "https://assets.test/",
      signal: h.controller.signal,
    });
    try {
      expect(h.producer()).toBeTypeOf("function");
      const frame = h.producer()!({
        seconds: 1,
        speedRow: 0,
        camera,
        environment: { fpcw: 0x037f, mxcsr: 0x1f80 },
      });
      expect(frame.notes).toBe(1);
      expect(frame.entries.map((entry) => entry.pass)).toEqual([16]);
      expect(h.prepare.mock.calls[0][0]).toBe(120);
      h.producer()!({
        seconds: 1,
        speedRow: 4,
        camera,
        environment: { fpcw: 0x037f, mxcsr: 0x1f80 },
      });
      expect(h.layers).toHaveLength(1);
      expect(h.layers[0].setSpeed).toHaveBeenLastCalledWith(4, 1);
      expect(h.layers[0].dispose).not.toHaveBeenCalled();
    } finally {
      host.dispose();
    }
    expect(h.producer()).toBeNull();
    expect(h.layers[0].dispose).toHaveBeenCalledOnce();
    expect(h.releaseAssets).toHaveBeenCalledOnce();
    host.dispose();
    expect(h.releaseAssets).toHaveBeenCalledOnce();
  });

  it("hands each frame the effect camera position it orders instanced groups by", async () => {
    const h = setup();
    const host = await createNoteHost({
      ...h,
      scene: h.scene as never,
      canvas: h.canvas as never,
      speedRow: 0,
      judgePositionOffset: () => 0,
      criticalDisplayRow: () => 0,
      chart,
      base: "https://assets.test/",
      signal: h.controller.signal,
    });
    try {
      const environment = { fpcw: 0x037f, mxcsr: 0x1f80 };
      h.effectCamera.position = [3, 57, 44];
      h.producer()!({ seconds: 1, speedRow: 0, camera, environment });
      h.effectCamera.position = [-5, 40, 61];
      h.producer()!({ seconds: 1, speedRow: 0, camera, environment });
      const positions = h.prepare.mock.calls.map(
        ([, order]) => (order as { cameraPosition: ArrayLike<number> }).cameraPosition,
      );
      expect(positions.map((position) => Array.from(position))).toEqual([
        [3, 57, 44],
        [-5, 40, 61],
      ]);
    } finally {
      host.dispose();
    }
  });

  it("uses the computation and the pack request the page already started", async () => {
    const h = setup();
    const first = { score: { records: [] }, timeline: { started: true } } as unknown as LoadedChart;
    const pack = Promise.resolve({ entries: new Map() } as unknown as Pack);
    const takePack = vi.fn(() => pack);
    const host = await createNoteHost({
      ...h,
      scene: h.scene as never,
      canvas: h.canvas as never,
      speedRow: 0,
      judgePositionOffset: () => 0,
      criticalDisplayRow: () => 0,
      chart,
      first: Promise.resolve(first),
      takePack,
      base: "https://assets.test/",
      signal: h.controller.signal,
    });
    try {
      expect(mocked.load).not.toHaveBeenCalled();
      expect(host.timeline).toBe(first.timeline);
      expect(takePack).toHaveBeenCalledTimes(1);
      expect((mocked.assets.mock.calls[0][2] as { pack: unknown }).pack).toBe(pack);
    } finally {
      host.dispose();
    }
  });

  it("aborts its registered producer and releases assets on the page lifetime", async () => {
    const h = setup();
    const host = await createNoteHost({
      ...h,
      scene: h.scene as never,
      canvas: h.canvas as never,
      speedRow: 0,
      judgePositionOffset: () => 0,
      criticalDisplayRow: () => 0,
      chart,
      base: "https://assets.test/",
      signal: h.controller.signal,
    });
    h.controller.abort();
    expect(h.producer()).toBeNull();
    expect(h.releaseAssets).toHaveBeenCalledOnce();
    host.dispose();
    expect(h.releaseAssets).toHaveBeenCalledOnce();
  });
});
