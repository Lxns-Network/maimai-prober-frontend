import { afterEach, describe, expect, it, vi } from "vitest";
import { compileJudgeTimingIni } from "@lxns-network/chunithm-chart-engine/chart/bind/config";
import { Timeline } from "@lxns-network/chunithm-chart-engine/chart/timeline/reader";
import {
  createChartHandler,
  handleChartRequest,
} from "@lxns-network/chunithm-chart-engine/chart/worker/computeChart";
import type { ChartRequest } from "@lxns-network/chunithm-chart-engine/chart/worker/protocol";

const fixture = vi.hoisted(() => ({ records: [] as number[], disposed: 0 }));
vi.mock("@lxns-network/chunithm-chart-engine/notes/noteLayer", () => ({
  createNoteLayer: (input: {
    score: { records: DataView[] };
    timeline: { count: (s: "judge") => number };
    motion?: { speedRow: number };
    lifetimes?: { records: Uint32Array };
  }) => {
    fixture.records = input.score.records.map((r) => r.getFloat32(8, true));
    if (input.timeline.count("judge") !== 1) throw Error("Missing Worker judgments");
    if (input.motion?.speedRow !== 0) throw Error("Missing Worker motion");
    if (input.lifetimes?.records.length !== 1) throw Error("Missing Worker object lifetimes");
    return {
      detachRenderer() {},
      renderer: { dispose() {} },
      dispose() {},
      setViewProjection() {},
      frame() {},
    };
  },
}));
vi.mock("@lxns-network/chunithm-chart-engine/assets/loadAssets", () => ({
  loadChunithmAssets: async () => ({
    pack: {},
    textures: new Map(),
    dispose: () => fixture.disposed++,
  }),
}));
import { createNoteHost } from "../src/pages/public/Chart/chunithm/rendering/notes";

class WorkerDouble {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror = null;
  onmessageerror = null;
  terminated = false;
  postMessage(data: ChartRequest) {
    const result = handleChartRequest(data);
    const reply = structuredClone(result.message, { transfer: result.transfer });
    queueMicrotask(() => this.onmessage?.({ data: reply } as MessageEvent));
  }
  terminate() {
    this.terminated = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("note host Worker loading", () => {
  it("draws the supplied chart with the judgments and motion its own lifecycles produce", async () => {
    fixture.disposed = 0;
    const workers: WorkerDouble[] = [];
    vi.stubGlobal(
      "Worker",
      class extends WorkerDouble {
        constructor() {
          super();
          workers.push(this);
        }
      },
    );
    vi.stubGlobal("fetch", () => {
      throw Error("Offline chart/events must not be fetched");
    });
    const config = compileJudgeTimingIni(new Uint8Array());
    const bytes = new TextEncoder().encode(
      "VERSION\t1.13.00\t1.13.00\nRESOLUTION\t384\nBPM_DEF\t120\t120\t120\t120\nMET_DEF\t4\t4\nCLK_DEF\t384\nBPM\t0\t0\t120\nTAP\t0\t192\t0\t4\n",
    );
    const host = await createNoteHost({
      canvas: { width: 640, height: 640, getContext: () => ({}) } as unknown as HTMLCanvasElement,
      scene: {
        withPresentation: (run: (device: unknown) => void) => run({ markResourcesUnknown() {} }),
        setExternalNoteRenderer() {},
      } as never,
      judgePositionOffset: () => 0,
      criticalDisplayRow: () => 0,
      speedRow: 0,
      base: "https://assets.example.test/",
      signal: new AbortController().signal,
      chart: {
        bytes,
        config: new Uint8Array(config.buffer),
        difficulty: 3,
        mirror: false,
        musicId: 2999,
      },
    });
    expect(fixture.records).toEqual([1000]);
    expect(workers).toHaveLength(1);
    expect(workers[0].terminated).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(config.byteLength).toBe(0xb0c);
    host.dispose();
    expect(fixture.disposed).toBe(1);
  });
});

it("cancels a pending bake and never builds a layer after the page is disposed", async () => {
  fixture.disposed = 0;
  const worker = new WorkerDouble();
  worker.postMessage = () => {};
  vi.stubGlobal(
    "Worker",
    class {
      constructor() {
        return worker;
      }
    },
  );
  const controller = new AbortController();
  const pending = createNoteHost({
    canvas: { width: 640, height: 640, getContext: () => ({}) } as unknown as HTMLCanvasElement,
    scene: {
      withPresentation: (run: (device: unknown) => void) => run({ markResourcesUnknown() {} }),
      setExternalNoteRenderer() {},
    } as never,
    judgePositionOffset: () => 0,
    criticalDisplayRow: () => 0,
    speedRow: 0,
    base: "https://assets.example.test/",
    signal: controller.signal,
    chart: {
      bytes: new Uint8Array(),
      config: new Uint8Array(),
      difficulty: 3,
      mirror: false,
      musicId: 2999,
    },
  });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(worker.terminated).toBe(true);
  expect(fixture.disposed).toBe(0);
});

it("retimes judgments and sounds for B timing while keeping chart positions and guides", () => {
  const handle = createChartHandler();
  const request = {
    id: 1,
    bytes: new TextEncoder().encode(
      "VERSION\t1.13.00\t1.13.00\nRESOLUTION\t384\nBPM_DEF\t120\t120\t120\t120\nMET_DEF\t4\t4\nCLK_DEF\t384\nBPM\t0\t0\t120\nTAP\t0\t192\t0\t4\nHLD\t1\t0\t4\t4\t192\n",
    ).buffer,
    config: compileJudgeTimingIni(new Uint8Array()).buffer as ArrayBuffer,
    difficulty: 3,
    mirror: false,
    musicId: 1,
    includeScore: true,
    includeMirror: true,
  };
  const compute = (row: number, first = false) => {
    const { message } = handle({
      ...request,
      bytes: first ? request.bytes : undefined,
      judgeTimingRow: row,
    });
    if (!message.ok) throw new Error(message.error.message);
    return { ...message, timeline: Timeline.from(message.timeline) };
  };
  const zero = compute(20, true);
  for (const row of [0, 40]) {
    const next = compute(row);
    const shift = (row === 0 ? -2 : 2) / 60;
    const times = (chart: typeof next) => chart.timeline.column("judge", "time");
    expect(times(next).length).toBe(times(zero).length);
    times(next).forEach((time, i) => expect(time - times(zero)[i]).toBeCloseTo(shift, 6));
    expect(next.score!.records.map((r) => r.getFloat32(8, true))).toEqual(
      zero.score!.records.map((r) => r.getFloat32(8, true)),
    );
    expect(next.lifetimes!.spawns).toEqual(zero.lifetimes!.spawns);
    next.livePlayback!.runs.forEach((run, i) => {
      expect(run.removal - zero.livePlayback!.runs[i].removal).toBe(row === 0 ? -4 : 4);
    });
    const cues = (chart: typeof next, id: number) =>
      Array.from(chart.timeline.column("cue", "time")).filter(
        (_, i) => chart.timeline.column("cue", "cue")[i] === id,
      );
    expect(cues(next, 44)).toEqual(cues(zero, 44));
    for (const id of [60, 92, 71]) {
      expect(cues(next, id).length).toBeGreaterThan(0);
      cues(next, id).forEach((time, i) => expect(time - cues(zero, id)[i]).toBeCloseTo(shift, 6));
    }
  }
  expect(handle({ ...request, bytes: undefined, judgeTimingRow: 41 }).message.ok).toBe(false);
});
