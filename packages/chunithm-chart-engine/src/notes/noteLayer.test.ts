import { describe, expect, it, vi } from "vitest";
import type { Pack, PackEntry } from "../assets/packFormat";
import { TimelineWriter } from "../chart/timeline/writer";
import { Timeline } from "../chart/timeline/reader";
import { createNoteLayer } from "./noteLayer";
import { BakedSpeedMismatchError } from "./bakedSpeed";
import { computeAppear } from "./appear";
import { createBandBuffer } from "./render/bandBuffer";
import { evaluateInstances } from "./evaluate";
import { GROUND_MAIN_PART } from "../chart/bake/events";
import type { MotionTracks } from "../chart/lifecycle/motion";
import type { ObjectLifetimes } from "../chart/lifecycle/nativeChart";
const frames = vi.hoisted(() => [] as number[]);
const snapshots = vi.hoisted(
  () =>
    [] as {
      model: string;
      world: number[];
    }[][],
);
const instanceFrames = vi.hoisted(() => [] as (number | undefined)[][]);
const probes = vi.hoisted(
  () =>
    [] as {
      bound: number | undefined;
      unbound: number | undefined;
    }[],
);
vi.mock("./appear", async (original) => {
  const module = await original<typeof import("./appear")>();
  return { ...module, computeAppear: vi.fn(module.computeAppear) };
});
vi.mock("./evaluate", async (original) => {
  const module = await original<typeof import("./evaluate")>();
  return { ...module, evaluateInstances: vi.fn(module.evaluateInstances) };
});
vi.mock("./render/noteRenderer", () => ({
  createNoteRenderer: () => ({
    prepare: ({
      instances,
    }: {
      instances: {
        record: number;
        model: string;
      }[];
    }) => ({
      entries: instances.map((instance) => ({
        pass: 2,
        key: 1,
        depth: 0,
        draw() {
          snapshots.push([{ model: instance.model, world: [] }]);
          return { draws: 1, instances: 1, bandVertices: 0, cpuMs: 0 };
        },
      })),
      stats: { draws: 0, instances: 0, bandVertices: 0, cpuMs: 0 },
    }),
    frame: ({
      instances,
      animationFrame,
      animationFrameOf,
    }: {
      instances: {
        model: string;
        world: Float32Array;
        frame?: number;
      }[];
      animationFrame: number;
      animationFrameOf: (model: string) => number | undefined;
    }) => {
      frames.push(animationFrame);
      instanceFrames.push(instances.map((i) => i.frame));
      probes.push({
        bound: animationFrameOf?.("note/model/146"),
        unbound: animationFrameOf?.("note/model/5"),
      });
      snapshots.push(instances.map((i) => ({ model: i.model, world: [...i.world] })));
      return {
        draws: 1,
        instances: instances.length,
        bandVertices: 0,
        cpuMs: 0,
      };
    },
    bands: () => createBandBuffer(65536),
    dispose() {},
  }),
}));
function layer(
  air: boolean,
  visibilityBlockSteps?: number,
  clockBound = false,
  primary = 0,
  strictResources = false,
  motionRows: readonly (readonly [number, number, number, number, number])[] = [],
  speedRow = 0,
  airObserved = air,
  groundShown: readonly (readonly [number, number])[] = [],
  motion?: MotionTracks,
  lifetimes?: ObjectLifetimes,
) {
  const record = new DataView(new ArrayBuffer(356));
  record.setFloat32(8, 1025, true);
  record.setInt32(0x10, primary, true);
  record.setInt32(0x14, air ? 3 : -1, true);
  const entries = new Map<string, PackEntry>();
  for (let id = 0; id < 200; id++) {
    const name = `note/model/${id}`;
    entries.set(name, {
      name,
      kind: "table",
      offset: 0,
      length: 0,
      meta: {
        meshes: [`mesh/${id}`],
        units: 16,
        pass: 2,
        layer: 20,
        widthBase: 1,
        initialKey: 0x8580,
        widthStepI32: 0,
      },
    });
  }
  if (clockBound) {
    entries.set("uvc/ntt_airup", {
      name: "uvc/ntt_airup",
      kind: "uvc",
      offset: 0,
      length: 0,
      meta: { frameCount: 121 },
    });
    for (const id of [146, 161]) {
      const model = entries.get(`note/model/${id}`)!;
      entries.set(model.name, {
        ...model,
        meta: {
          ...model.meta,
          materials: [{ uvAnimation: { resource: "uvc/ntt_airup", tracks: [0], loop: true } }],
        },
      });
    }
  }
  if (primary === 9)
    entries.set("note/band/slide/2/13", {
      name: "note/band/slide/2/13",
      kind: "table",
      offset: 0,
      length: 0,
      meta: { layer: 30, initialKey: 0x8580 },
    });
  const pack: Pack = { entries, version: 1, engine: "chunithm", bytes: new Uint8Array() };
  const writer = new TimelineWriter();
  writer.push("judge", { time: 1.025, note: 0, kind: 0, result: 4, part: 1 });
  if (air) writer.push("judge", { time: 1.0333333333333334, note: 0, kind: 0, result: 4, part: 2 });
  if (airObserved) writer.push("airmodel", { time: 0, note: 0, part: 0xfffa, shown: 1 });
  for (const [time, shown] of groundShown)
    writer.push("airmodel", { time, note: 0, part: GROUND_MAIN_PART, shown });
  for (const [time, note, part, model, frame] of motionRows)
    writer.push("motion", { time, note, part, model, frame });
  const timeline = Timeline.from(
    writer.finish({
      durationSeconds: 2,
      noteCount: 1,
      unsupported: [],
      defaultSpeedRow: 0,
      appearIsPlaceholder: true,
    }),
  );
  return createNoteLayer({
    gl: {} as WebGL2RenderingContext,
    pack,
    score: {
      records: [record],
      timeline: new Map(),
      scroll: new DataView(new ArrayBuffer(0)),
      ...(primary === 9
        ? { ladders: new Map([[0, { joints: [new DataView(new ArrayBuffer(36))], samples: [] }]]) }
        : {}),
    },
    timeline,
    motion,
    lifetimes,
    speedRow,
    visibilityBlockSteps,
    strictResources,
    viewProjection: new Float32Array(16),
  });
}
describe("note layer result visibility", () => {
  it("passes synchronized curve phase to the renderer without accumulating seek history", () => {
    const notes = layer(false);
    frames.length = 0;
    notes.frame(0);
    notes.frame(100);
    notes.frame(0);
    expect(frames).toEqual([0.5, 0.5, 0.5]);
    notes.dispose();
  });
  it("hands the renderer each clock-bound model's own frame, independent of seek history", () => {
    const notes = layer(false, undefined, true);
    probes.length = 0;
    for (const step of [0, 100, 0]) notes.frame(step);
    expect(probes.map((probe) => probe.bound)).toEqual([0.5, 50.5, 0.5]);
    expect(probes.map((probe) => probe.unbound)).toEqual([undefined, undefined, undefined]);
    notes.dispose();
  });
  it("hides a flat model on the exact result tick, independently of record retention", () => {
    const notes = layer(false);
    expect([122, 123, 124, 122].map((step) => notes.frame(step).instances)).toEqual([1, 0, 0, 1]);
    notes.dispose();
  });
  it("keeps the AIR alone after the parent's result and supports backward seeks", () => {
    const notes = layer(true);
    expect([122, 123, 124, 125, 122].map((step) => notes.frame(step).instances)).toEqual([
      2, 1, 0, 0, 2,
    ]);
    notes.dispose();
  });
});
describe("note object lifetimes", () => {
  const lifetimes: ObjectLifetimes = {
    records: Uint32Array.of(0),
    spawns: Int32Array.of(100),
    removals: Int32Array.of(123),
  };
  it("draws a record exactly while one of its objects exists, in either seek direction", () => {
    const notes = layer(false, 60, false, 0, false, [], 0, false, [], undefined, lifetimes);
    try {
      expect([99, 100, 122, 123, 60, 110].map((step) => notes.frame(step).instances)).toEqual([
        0, 1, 1, 0, 0, 1,
      ]);
    } finally {
      notes.dispose();
    }
  });
  it("never scans visibility windows", () => {
    vi.mocked(computeAppear).mockClear();
    const notes = layer(false, 60, false, 0, false, [], 0, false, [], undefined, lifetimes);
    try {
      for (const step of [0, 100, 119, 120, 240, 60]) notes.frame(step);
      expect(computeAppear).not.toHaveBeenCalled();
    } finally {
      notes.dispose();
    }
  });
});
describe("bounded note visibility", () => {
  it("only scans the requested half-open block and reuses it until crossing a boundary", () => {
    vi.mocked(computeAppear).mockClear();
    const notes = layer(true, 60);
    try {
      expect(computeAppear).not.toHaveBeenCalled();
      for (const step of [100, 119, 120, 100, 123, 122]) notes.frame(step);
      expect(
        vi.mocked(computeAppear).mock.calls.map(([input]) => [input.fromStep, input.toStep]),
      ).toEqual([
        [60, 120],
        [120, 180],
        [60, 120],
        [120, 180],
      ]);
    } finally {
      notes.dispose();
    }
  });
  it("matches full-scan evaluated instances at block edges, result ticks and reverse seeks", () => {
    const full = layer(true);
    const blocked = layer(true, 60);
    try {
      for (const step of [0, 59, 60, 119, 120, 122, 123, 124, 125, 180, 60, 122, 0]) {
        snapshots.length = 0;
        full.frame(step);
        blocked.frame(step);
        expect(snapshots[1], `step ${step}`).toEqual(snapshots[0]);
      }
    } finally {
      full.dispose();
      blocked.dispose();
    }
  });
  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid visibility block size %s", (size) => {
    expect(() => layer(false, size)).toThrow(RangeError);
  });
});
describe("observed ground display", () => {
  /** Visible from step 0 to 40 and again from 80, sampled within the requested band. */
  const gapped: typeof computeAppear = (input) => {
    const fromStep = input.fromStep ?? 0;
    const toStep = input.toStep ?? input.steps! + 1;
    const runs = [
      [0, 40],
      [80, 200],
    ]
      .map(([start, end]) => [Math.max(start, fromStep), Math.min(end, toStep)])
      .filter(([start, end]) => start < end);
    return {
      row: input.row,
      steps: input.steps!,
      fromStep,
      toStep,
      intervals: Int32Array.from(runs.flat()),
      intervalCounts: Uint32Array.of(runs.length),
    };
  };
  it.each([
    ["one full scan", undefined],
    ["visibility blocks", 60],
  ])(
    "draws a note through a gap in its visible intervals while its model was observed shown, with %s",
    async (_label, block) => {
      const actual = await vi.importActual<typeof import("./appear")>("./appear");
      vi.mocked(computeAppear).mockImplementation(gapped);
      try {
        const notes = layer(false, block, false, 0, false, [], 0, false, [
          [0, 1],
          [1, 0],
        ]);
        try {
          expect([20, 60, 100, 119, 120].map((step) => notes.frame(step).instances)).toEqual([
            1, 1, 1, 1, 0,
          ]);
        } finally {
          notes.dispose();
        }
      } finally {
        vi.mocked(computeAppear).mockImplementation(actual.computeAppear);
      }
    },
  );
});
describe("prepared note layer", () => {
  it("prepares without drawing and counts visible records rather than their meshes", () => {
    const notes = layer(true, 60);
    snapshots.length = 0;
    try {
      const order = { modelDepth: () => 0, bandDepth: () => 0, cameraPosition: [0, 0, 0] };
      const both = notes.prepare(122, order);
      expect(snapshots).toHaveLength(0);
      expect(both.entries).toHaveLength(2);
      expect(both.notes).toBe(1);
      both.entries[0].draw();
      expect(snapshots).toHaveLength(1);
      expect(notes.prepare(124, order).notes).toBe(0);
      expect(notes.prepare(-1, order).entries).toHaveLength(0);
    } finally {
      notes.dispose();
    }
  });
  it("orders instanced groups by the camera position the frame order carries", () => {
    const notes = layer(true, 60);
    try {
      const cameraPosition = [0, 40, 60];
      notes.prepare(122, { modelDepth: () => 0, bandDepth: () => 0, cameraPosition });
      expect(vi.mocked(evaluateInstances).mock.lastCall?.[0].cameraPosition).toBe(cameraPosition);
    } finally {
      notes.dispose();
    }
  });
});
it("refuses a required HOLD band profile instead of entering ready with only the head and tail", () => {
  expect(() => layer(false, 60, false, 1, true)).toThrow(/HOLD.*band profile/i);
});
it("allows a ladder with no drawable marker samples while retaining its band plan", () => {
  const notes = layer(false, 60, false, 9, true);
  try {
    expect(notes.steps).toBeGreaterThan(0);
  } finally {
    notes.dispose();
  }
});
describe("recorded motion in a strict layer", () => {
  const rows = Array.from(
    { length: 300 },
    (_, step) => [step / 120, 0, 0xfffa, 161, step + 0.25] as const,
  );
  const parentShown = [[0, 1]] as const;
  it("refuses a clock-bound AIR whose motion was never recorded", () => {
    const notes = layer(true, undefined, true, 0, true, [], 0, true, parentShown);
    try {
      expect(() => notes.frame(122)).toThrow(/recorded/i);
    } finally {
      notes.dispose();
    }
  });
  it("hands the renderer the frame recorded for the AIR's own part and step", () => {
    const notes = layer(true, undefined, true, 0, true, rows, 0, true, parentShown);
    try {
      instanceFrames.length = 0;
      notes.frame(122);
      expect(instanceFrames[instanceFrames.length - 1]).toEqual([undefined, 122.25]);
    } finally {
      notes.dispose();
    }
  });
  it("refuses to build when the bake never observed the AIR's display state", () => {
    expect(() => layer(true, undefined, true, 0, true, rows, 0, false)).toThrow(
      /observed model states/,
    );
  });
  it("refuses to play recorded motion at another display speed", () => {
    expect(() => layer(true, undefined, true, 0, true, rows, 3)).toThrow(BakedSpeedMismatchError);
  });
  const tracks = (speedRow: number): MotionTracks => ({
    speedRow,
    records: Uint32Array.of(0),
    parts: Uint16Array.of(0xfffa),
    models: Uint16Array.of(161),
    firsts: Int32Array.of(100),
    offsets: Uint32Array.of(0, 50),
    frames: Float32Array.from({ length: 50 }, (_, k) => k + 0.75),
  });
  it("hands the renderer the computed frame for the AIR's own part and step", () => {
    const notes = layer(true, undefined, true, 0, true, [], 0, true, parentShown, tracks(0));
    try {
      instanceFrames.length = 0;
      notes.frame(122);
      expect(instanceFrames[instanceFrames.length - 1]).toEqual([undefined, 22.75]);
    } finally {
      notes.dispose();
    }
  });
  it("refuses computed motion of another display speed", () => {
    expect(() =>
      layer(true, undefined, true, 0, true, [], 0, true, parentShown, tracks(3)),
    ).toThrow(BakedSpeedMismatchError);
  });
});
