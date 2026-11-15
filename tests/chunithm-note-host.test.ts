import { describe, expect, it, vi } from "vitest";
import { Timeline } from "@lxns-network/chunithm-chart-engine/chart/timeline/reader";
import { TimelineWriter } from "@lxns-network/chunithm-chart-engine/chart/timeline/writer";

const fixture = vi.hoisted(() => ({
  disposeAssets: vi.fn(),
  buildLayer: vi.fn(),
}));

vi.mock("@lxns-network/chunithm-chart-engine/chart/worker/loadChart", () => ({
  loadChart: async () => {
    const record = new DataView(new ArrayBuffer(356));
    record.setFloat32(8, 3000, true);
    record.setInt32(20, -1, true);
    return {
      score: { records: [record], timeline: new Map(), scroll: new DataView(new ArrayBuffer(0)) },
      timeline: Timeline.from(
        new TimelineWriter().finish({
          durationSeconds: 0,
          noteCount: 1,
          unsupported: [],
          defaultSpeedRow: 0,
          appearIsPlaceholder: true,
        }),
      ),
    };
  },
}));
vi.mock("@lxns-network/chunithm-chart-engine/notes/noteLayer", () => ({
  createNoteLayer: fixture.buildLayer,
}));
vi.mock("@lxns-network/chunithm-chart-engine/assets/loadAssets", () => ({
  loadChunithmAssets: async () => ({
    pack: {},
    textures: new Map([["image", { texture: {} }]]),
    dispose: fixture.disposeAssets,
  }),
}));

import { createNoteHost } from "../src/pages/public/Chart/chunithm/rendering/notes";

function input() {
  const gl = { bindTexture() {}, texParameteri() {} };
  return {
    canvas: { width: 800, height: 600, getContext: () => gl } as unknown as HTMLCanvasElement,
    scene: {
      withPresentation: (run: (device: unknown) => void) => run({ markResourcesUnknown() {} }),
      setExternalNoteRenderer() {},
    } as never,
    speedRow: 0,
    judgePositionOffset: () => 0,
    criticalDisplayRow: () => 0,
    chart: {
      bytes: new Uint8Array(),
      config: new Uint8Array(),
      difficulty: 0,
      mirror: false,
      musicId: 2999,
    },
    base: "https://assets.example.test/",
    signal: new AbortController().signal,
  };
}

describe("note host asset ownership", () => {
  it("releases uploaded assets when layer construction fails", async () => {
    fixture.disposeAssets.mockClear();
    fixture.buildLayer.mockImplementation(() => {
      throw new RangeError("Judge attribution missing; rebake");
    });
    await expect(createNoteHost(input())).rejects.toThrow(/attribution/);
    expect(fixture.disposeAssets).toHaveBeenCalledTimes(1);
  });

  it("retains assets until a successful host is disposed", async () => {
    fixture.disposeAssets.mockClear();
    const disposeLayer = vi.fn();
    fixture.buildLayer.mockReturnValue({
      detachRenderer() {},
      renderer: { dispose() {} },
      dispose: disposeLayer,
    });
    const host = await createNoteHost(input());
    expect(fixture.disposeAssets).not.toHaveBeenCalled();
    host.dispose();
    expect(disposeLayer).toHaveBeenCalledTimes(1);
    expect(fixture.disposeAssets).toHaveBeenCalledTimes(1);
  });
});

it("invalidates shared GL bindings even when note layer construction fails", async () => {
  const args = input();
  let invalidations = 0;
  args.scene = {
    withPresentation: (run: (device: unknown) => void) =>
      run({
        markResourcesUnknown() {
          invalidations++;
        },
      }),
    setExternalNoteRenderer() {},
  } as never;
  fixture.buildLayer.mockImplementation(() => {
    throw new Error("controlled construction failure");
  });
  await expect(createNoteHost(args)).rejects.toThrow("controlled construction failure");
  expect(invalidations).toBeGreaterThan(0);
});
