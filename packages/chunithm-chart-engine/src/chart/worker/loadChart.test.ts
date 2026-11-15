import { describe, expect, it, vi } from "vitest";
import { loadChart, openChartSession } from "./loadChart";
import { createChartHandler, handleChartRequest } from "./computeChart";
import type { ChartRequest } from "./protocol";
import { TimelineWriter } from "../timeline/writer";
import { Timeline } from "../timeline/reader";
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: ((e: MessageEvent) => void) | null = null;
  terminated = false;
  posted: unknown[] = [];
  constructor(
    private readonly reply: (req: { id: number }) => unknown,
    private readonly delayMs = 0,
  ) {}
  postMessage(req: { id: number }) {
    this.posted.push(req);
    setTimeout(() => this.onmessage?.({ data: this.reply(req) } as MessageEvent), this.delayMs);
  }
  terminate() {
    this.terminated = true;
  }
}
const ok = (req: { id: number }) => ({
  id: req.id,
  ok: true,
  timeline: new TimelineWriter().finish({
    durationSeconds: 1,
    noteCount: 0,
    unsupported: [],
    defaultSpeedRow: 0,
    appearIsPlaceholder: true,
  }),
});
const options = (worker: FakeWorker, signal?: AbortSignal) => ({
  difficulty: 3,
  mirror: false,
  musicId: 2999,
  config: new Uint8Array(0xb0c),
  signal,
  createWorker: () => worker as unknown as Worker,
});
describe("loadChart", () => {
  it("resolves with a Timeline from the worker reply", async () => {
    const worker = new FakeWorker(ok);
    const tl = await loadChart(new Uint8Array(4), options(worker));
    expect(tl.duration).toBe(1);
    expect(worker.terminated).toBe(true);
  });
  it("surfaces parse errors with their line number", async () => {
    const fail = (req: { id: number }) => ({
      id: req.id,
      ok: false,
      error: { name: "ChartParseError", message: "bad", line: 12 },
    });
    await expect(loadChart(new Uint8Array(4), options(new FakeWorker(fail)))).rejects.toMatchObject(
      { name: "ChartParseError", message: "bad", line: 12 },
    );
  });
  it("ignores replies for another request id", async () => {
    const worker = new FakeWorker((req) => ({ ...ok(req), id: req.id + 1000 }));
    const ctl = new AbortController();
    const p = loadChart(new Uint8Array(4), options(worker, ctl.signal));
    await new Promise((r) => setTimeout(r, 10));
    ctl.abort();
    await expect(p).rejects.toThrow(/abort/i);
  });
  it("aborting terminates the worker and rejects; a late reply is ignored", async () => {
    const worker = new FakeWorker(ok, 50);
    const ctl = new AbortController();
    const p = loadChart(new Uint8Array(4), options(worker, ctl.signal));
    ctl.abort();
    await expect(p).rejects.toThrow(/abort/i);
    expect(worker.terminated).toBe(true);
    await new Promise((r) => setTimeout(r, 80));
  });
  it("rejects at once for an already aborted signal", async () => {
    const worker = new FakeWorker(ok);
    const ctl = new AbortController();
    ctl.abort();
    await expect(loadChart(new Uint8Array(4), options(worker, ctl.signal))).rejects.toThrow(
      /abort/i,
    );
    expect(worker.terminated).toBe(true);
    expect(worker.posted).toEqual([]);
  });
  it("times out after 30s", async () => {
    vi.useFakeTimers();
    try {
      const worker = new FakeWorker(ok, 60000);
      const p = loadChart(new Uint8Array(4), options(worker));
      const caught = p.catch((e: unknown) => e);
      vi.advanceTimersByTime(30001);
      expect(String(await caught)).toMatch(/30s/);
      expect(worker.terminated).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it("posts the chart request as the Worker's only message", async () => {
    const worker = new FakeWorker(ok);
    await loadChart(new Uint8Array(4), options(worker));
    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0]).toMatchObject({ musicId: 2999, difficulty: 3 });
  });
  it("rejects at once when the worker raises an error", async () => {
    const worker = new FakeWorker(ok, 60000);
    const p = loadChart(new Uint8Array(4), options(worker));
    const caught = p.catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 0));
    const failure = new Error("worker exploded");
    worker.onerror?.({ message: failure.message, error: failure } as ErrorEvent);
    expect(String(await caught)).toMatch(/worker exploded/);
    expect(worker.terminated).toBe(true);
  });
  it("names the failure when the worker reports an error without a message", async () => {
    const worker = new FakeWorker(ok, 60000);
    const p = loadChart(new Uint8Array(4), options(worker));
    const caught = p.catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 0));
    worker.onerror?.({} as ErrorEvent);
    const error = (await caught) as Error;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/without reporting a reason/);
    expect(worker.terminated).toBe(true);
  });
  it("rejects at once when a worker message cannot be deserialized", async () => {
    const worker = new FakeWorker(ok, 60000);
    const p = loadChart(new Uint8Array(4), options(worker));
    const caught = p.catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 0));
    worker.onmessageerror?.({} as MessageEvent);
    expect(String(await caught)).toMatch(/deserialized/);
    expect(worker.terminated).toBe(true);
  });
  it("does not transfer away the caller's buffers", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const config = new Uint8Array(0xb0c);
    await loadChart(bytes, { ...options(new FakeWorker(ok)), config });
    expect(bytes.byteLength).toBe(4);
    expect(config.byteLength).toBe(0xb0c);
  });
});
const TAP_CHART =
  "VERSION\t1.13.00\t1.13.00\nRESOLUTION\t384\nBPM_DEF\t120\t120\t120\t120\nMET_DEF\t4\t4\nCLK_DEF\t384\nBPM\t0\t0\t120\nTAP\t0\t192\t0\t4\n";
function request(bytes: Uint8Array, config: Uint8Array): ChartRequest {
  return {
    id: 7,
    bytes: bytes.slice().buffer,
    difficulty: 4,
    mirror: false,
    musicId: 2999,
    config: config.slice().buffer,
  };
}
describe("handleChartRequest", () => {
  it("returns a parse failure with name, message and line", () => {
    const junk = new TextEncoder().encode("VERSION\t1.13.00\t1.13.00\nHLD\t0\t0\t0\t4\t192\n");
    const { message } = handleChartRequest(request(junk, new Uint8Array(0xb0c)));
    expect(message.ok).toBe(false);
    if (message.ok) return;
    expect(message.error.name).toBe("ChartParseError");
    expect(message.error.message.length).toBeGreaterThan(0);
    expect(message.error.line === null || typeof message.error.line === "number").toBe(true);
  });
});
describe("renderable chart loading", () => {
  it("returns the bound score and motion from the same Worker request as its timeline", async () => {
    const chart = new TextEncoder().encode(TAP_CHART);
    const { compileJudgeTimingIni } = await import("../bind/config");
    const config = compileJudgeTimingIni(new Uint8Array());
    const worker = new FakeWorker((req) => handleChartRequest(req as ChartRequest).message);
    {
      const loaded = await loadChart(chart, {
        ...options(worker),
        config: new Uint8Array(config.buffer),
        includeScore: true,
      });
      expect(loaded.timeline.count("judge")).toBe(1);
      expect(loaded.score.records).toHaveLength(1);
      expect(loaded.score.records[0].byteLength).toBe(356);
      expect(loaded.score.records[0].getFloat32(8, true)).toBe(1000);
      expect(loaded.score.records[0].getInt32(0x10, true)).toBe(0);
      expect(loaded.score.timeline).toBeInstanceOf(Map);
      expect(loaded.score.scroll).toBeInstanceOf(DataView);
      expect(loaded.motion.speedRow).toBe(0);
      expect([...loaded.lifetimes.records]).toEqual([0]);
      expect(loaded.lifetimes.removals[0]).toBeGreaterThan(loaded.lifetimes.spawns[0]);
      expect(loaded.timeline.count("effect")).toBeGreaterThan(0);
      expect(loaded.effects.instances.resource).toHaveLength(loaded.timeline.count("effect"));
      expect(loaded.effects.consumption.instance.length).toBeGreaterThan(0);
      expect(loaded.effects.moves.step).toHaveLength(loaded.effects.moves.instance.length);
      expect(loaded.effects.instances.posX).toHaveLength(loaded.effects.instances.resource.length);
      expect(worker.terminated).toBe(true);
    }
  });
  it("transfers every score and motion buffer without aliasing the input chart or configuration", async () => {
    const { compileJudgeTimingIni } = await import("../bind/config");
    const config = compileJudgeTimingIni(new Uint8Array());
    const req = {
      ...request(new TextEncoder().encode(TAP_CHART), new Uint8Array(config.buffer)),
      includeScore: true,
    };
    {
      const result = handleChartRequest(req);
      expect(result.message.ok).toBe(true);
      if (!result.message.ok) return;
      expect(result.message.score).toBeDefined();
      const copied = structuredClone(result.message, { transfer: result.transfer });
      expect(copied.score!.scroll.byteLength).toBeGreaterThanOrEqual(0);
      expect(result.message.timeline.byteLength).toBe(0);
      expect(result.message.score!.scroll.buffer.byteLength).toBe(0);
      expect(result.message.motion!.offsets.buffer.byteLength).toBe(0);
      expect(copied.motion!.offsets).toHaveLength(1);
      expect(result.message.lifetimes!.records.buffer.byteLength).toBe(0);
      expect(copied.lifetimes!.records).toHaveLength(1);
      expect(result.message.effects!.instances.end.buffer.byteLength).toBe(0);
      expect(result.message.effects!.consumption.low.buffer.byteLength).toBe(0);
      expect(result.message.effects!.moves.step.buffer.byteLength).toBe(0);
      expect(result.message.effects!.instances.posX.buffer.byteLength).toBe(0);
      expect(copied.effects!.instances.end.length).toBeGreaterThan(0);
      expect(req.bytes!.byteLength).toBeGreaterThan(0);
      expect(req.config!.byteLength).toBe(0xb0c);
    }
  });
  it("rejects a timeline-only reply when render data was requested", async () => {
    const worker = new FakeWorker(ok);
    await expect(
      loadChart(new Uint8Array(), { ...options(worker), includeScore: true }),
    ).rejects.toThrow(/score/i);
    expect(worker.terminated).toBe(true);
  });
});
describe("caller-selected chart load deadline", () => {
  it("keeps a long bake alive past the default deadline when explicitly requested", async () => {
    vi.useFakeTimers();
    try {
      const worker = new FakeWorker(ok, 45000);
      const result = loadChart(new Uint8Array(), { ...options(worker), timeoutMs: 60000 });
      const observed = result.then(
        (value) => value,
        (error: unknown) => error,
      );
      await vi.advanceTimersByTimeAsync(30001);
      expect(worker.terminated).toBe(false);
      await vi.advanceTimersByTimeAsync(15000);
      expect(await observed).toBeInstanceOf(Timeline);
      expect(worker.terminated).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
it("terminates immediately when posting the request fails", async () => {
  const worker = new FakeWorker(ok);
  worker.postMessage = () => {
    throw new DOMException("Cannot clone chart", "DataCloneError");
  };
  await expect(loadChart(new Uint8Array(), options(worker))).rejects.toMatchObject({
    name: "DataCloneError",
  });
  expect(worker.terminated).toBe(true);
});
it.each([0, -1, NaN, Infinity, 0x80000000])(
  "rejects invalid timeout %s before starting a Worker",
  async (timeoutMs) => {
    const worker = new FakeWorker(ok);
    await expect(loadChart(new Uint8Array(), { ...options(worker), timeoutMs })).rejects.toThrow(
      /timeout/i,
    );
    expect(worker.posted).toEqual([]);
  },
);
describe("display speed of a baked chart", () => {
  it("sends the requested speed row with the chart request", async () => {
    const worker = new FakeWorker(ok);
    await loadChart(new Uint8Array(4), { ...options(worker), speedRow: 5 });
    expect(worker.posted[0]).toMatchObject({ speedRow: 5 });
  });
  it("rejects a speed row that is not a row index before starting a worker", async () => {
    let created = 0;
    const createWorker = () => (created++, new FakeWorker(ok) as unknown as Worker);
    for (const speedRow of [-1, 1.5, Number.NaN])
      await expect(
        loadChart(new Uint8Array(4), { ...options(new FakeWorker(ok)), speedRow, createWorker }),
      ).rejects.toThrow(/speed row/i);
    expect(created).toBe(0);
  });
  it("runs the lifecycles at the speed row the request names", async () => {
    const { compileJudgeTimingIni } = await import("../bind/config");
    const config = compileJudgeTimingIni(new Uint8Array());
    const { message } = handleChartRequest({
      ...request(new TextEncoder().encode(TAP_CHART), new Uint8Array(config.buffer)),
      speedRow: 6,
      includeScore: true,
    });
    expect(message.ok).toBe(true);
    if (!message.ok) return;
    expect(Timeline.from(message.timeline).meta.defaultSpeedRow).toBe(6);
    expect(message.motion!.speedRow).toBe(6);
  });
});
describe("chart worker session", () => {
  const tapConfig = async () => {
    const { compileJudgeTimingIni } = await import("../bind/config");
    return new Uint8Array(compileJudgeTimingIni(new Uint8Array()).buffer);
  };
  const deliver = (result: ReturnType<typeof handleChartRequest>) =>
    structuredClone(result.message, { transfer: result.transfer });
  const bytesOf = (message: ReturnType<typeof handleChartRequest>["message"]) =>
    message.ok ? [...new Uint8Array(message.timeline)] : message.error;
  it("computes further speed rows from the chart it already bound", async () => {
    const handle = createChartHandler();
    const first = {
      ...request(new TextEncoder().encode(TAP_CHART), await tapConfig()),
      includeScore: true,
    };
    expect(deliver(handle(first)).ok).toBe(true);
    for (const speedRow of [6, 0, 12]) {
      const next = deliver(
        handle({
          id: 8,
          includeScore: true,
          difficulty: 4,
          mirror: false,
          musicId: 2999,
          speedRow,
        }),
      );
      const fresh = deliver(handleChartRequest({ ...first, speedRow }));
      expect(next.ok).toBe(true);
      expect(bytesOf(next)).toEqual(bytesOf(fresh));
      if (!next.ok || !fresh.ok) return;
      expect(
        next.score!.records.map((record) => [
          ...new Uint8Array(record.buffer, record.byteOffset, record.byteLength),
        ]),
      ).toEqual(
        fresh.score!.records.map((record) => [
          ...new Uint8Array(record.buffer, record.byteOffset, record.byteLength),
        ]),
      );
      expect(next.motion).toEqual(fresh.motion);
    }
  });
  it("reports a request that names no chart before any was sent", () => {
    const { message } = createChartHandler()({
      id: 3,
      difficulty: 4,
      mirror: false,
      musicId: 2999,
      speedRow: 1,
    });
    expect(message).toMatchObject({ id: 3, ok: false });
  });
  const sessionOptions = (workers: FakeWorker[], reply = ok, delayMs = 0) => ({
    difficulty: 3,
    mirror: false,
    musicId: 2999,
    config: new Uint8Array(0xb0c),
    createWorker: () => {
      const worker = new FakeWorker(reply, delayMs);
      workers.push(worker);
      return worker as unknown as Worker;
    },
  });
  const okWithScore = (req: { id: number }) => ({
    ...ok(req),
    score: { records: [], timeline: new Map(), scroll: new DataView(new ArrayBuffer(0)) },
    motion: {},
    lifetimes: {},
    effects: {},
    livePlayback: {
      timeline: new TimelineWriter().finish({
        durationSeconds: 1,
        noteCount: 0,
        unsupported: [],
        defaultSpeedRow: 0,
        appearIsPlaceholder: true,
      }),
      runs: [],
    },
  });
  class ControlledWorker {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    onmessageerror: ((e: MessageEvent) => void) | null = null;
    terminated = false;
    posted: ChartRequest[] = [];
    postMessage(req: ChartRequest) {
      this.posted.push(req);
    }
    reply(index: number) {
      this.onmessage?.({ data: okWithScore(this.posted[index]) } as MessageEvent);
    }
    terminate() {
      this.terminated = true;
    }
  }
  it("serves every speed row from one worker and sends the chart once", async () => {
    const workers: FakeWorker[] = [];
    const session = openChartSession(new Uint8Array(4), sessionOptions(workers, okWithScore));
    await session.compute(0);
    await session.compute(3);
    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toHaveLength(2);
    expect(workers[0].posted[0]).toMatchObject({ speedRow: 0, includeScore: true });
    expect((workers[0].posted[0] as ChartRequest).bytes?.byteLength).toBe(4);
    expect(workers[0].posted[1]).toMatchObject({ speedRow: 3 });
    expect((workers[0].posted[1] as ChartRequest).bytes).toBeUndefined();
    expect(workers[0].terminated).toBe(false);
    session.dispose();
    expect(workers[0].terminated).toBe(true);
  });
  it("keeps its worker when a computation is abandoned", async () => {
    const workers: FakeWorker[] = [];
    const session = openChartSession(new Uint8Array(4), sessionOptions(workers, okWithScore, 20));
    const controller = new AbortController();
    const abandoned = session.compute(1, controller.signal);
    controller.abort();
    await expect(abandoned).rejects.toThrow(/abort/i);
    await session.compute(2);
    expect(workers).toHaveLength(1);
    expect(workers[0].terminated).toBe(false);
    session.dispose();
  });
  it("does not send an abandoned queued row before the latest request", async () => {
    const worker = new ControlledWorker();
    const session = openChartSession(new Uint8Array(4), {
      ...sessionOptions([], okWithScore),
      createWorker: () => worker as unknown as Worker,
    });
    try {
      const firstAbort = new AbortController();
      const first = session.compute(1, firstAbort.signal);
      const queuedAbort = new AbortController();
      const queued = session.compute(2, queuedAbort.signal);
      expect(worker.posted.map((req) => req.speedRow)).toEqual([1]);
      firstAbort.abort();
      queuedAbort.abort();
      await expect(first).rejects.toMatchObject({ name: "AbortError" });
      await expect(queued).rejects.toMatchObject({ name: "AbortError" });
      const latest = session.compute(3);
      expect(worker.posted.map((req) => req.speedRow)).toEqual([1]);
      worker.reply(0);
      expect(worker.posted.map((req) => req.speedRow)).toEqual([1, 3]);
      expect(worker.posted[1].bytes).toBeUndefined();
      worker.reply(1);
      await expect(latest).resolves.toMatchObject({ score: { records: [] } });
      expect(worker.terminated).toBe(false);
    } finally {
      session.dispose();
    }
  });
  it("serves concurrent computations in order without abandoning their results", async () => {
    const worker = new ControlledWorker();
    const session = openChartSession(new Uint8Array(4), {
      ...sessionOptions([], okWithScore),
      createWorker: () => worker as unknown as Worker,
    });
    try {
      const first = session.compute(1);
      const second = session.compute(2);
      expect(worker.posted.map((req) => req.speedRow)).toEqual([1]);
      worker.reply(0);
      expect(worker.posted.map((req) => req.speedRow)).toEqual([1, 2]);
      worker.reply(1);
      await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    } finally {
      session.dispose();
    }
  });
  it("surfaces an active row failure and continues the queued computation", async () => {
    const worker = new ControlledWorker();
    const session = openChartSession(new Uint8Array(4), {
      ...sessionOptions([], okWithScore),
      createWorker: () => worker as unknown as Worker,
    });
    try {
      const failed = session.compute(1).catch((error: unknown) => error);
      const next = session.compute(2);
      worker.onmessage?.({
        data: {
          id: worker.posted[0].id,
          ok: false,
          error: { name: "RangeError", message: "invalid row", line: null },
        },
      } as MessageEvent);
      expect(await failed).toMatchObject({ name: "RangeError", message: "invalid row" });
      expect(worker.posted.map((req) => req.speedRow)).toEqual([1, 2]);
      worker.reply(1);
      await expect(next).resolves.toMatchObject({ score: { records: [] } });
    } finally {
      session.dispose();
    }
  });
  it("rejects active and queued computations when the session is disposed", async () => {
    const worker = new ControlledWorker();
    const session = openChartSession(new Uint8Array(4), {
      ...sessionOptions([], okWithScore),
      createWorker: () => worker as unknown as Worker,
    });
    const first = session.compute(1).catch((error: unknown) => error);
    const second = session.compute(2).catch((error: unknown) => error);
    session.dispose();
    expect(await first).toMatchObject({ name: "AbortError" });
    expect(await second).toMatchObject({ name: "AbortError" });
    expect(worker.posted.map((req) => req.speedRow)).toEqual([1]);
    expect(worker.terminated).toBe(true);
  });
  it("ends a stalled abandoned computation and rejects queued work at its deadline", async () => {
    vi.useFakeTimers();
    const workers: ControlledWorker[] = [];
    const session = openChartSession(new Uint8Array(4), {
      ...sessionOptions([], okWithScore),
      timeoutMs: 1000,
      createWorker: () => {
        const worker = new ControlledWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      },
    });
    try {
      const controller = new AbortController();
      const first = session.compute(1, controller.signal);
      controller.abort();
      await expect(first).rejects.toMatchObject({ name: "AbortError" });
      vi.advanceTimersByTime(500);
      const queued = session.compute(2).catch((error: unknown) => error);
      vi.advanceTimersByTime(500);
      expect(String(await queued)).toMatch(/1s/);
      expect(workers[0].terminated).toBe(true);
      expect(workers[0].posted.map((req) => req.speedRow)).toEqual([1]);
      const next = session.compute(3);
      expect(workers[1].posted[0].bytes?.byteLength).toBe(4);
      workers[1].reply(0);
      await expect(next).resolves.toMatchObject({ score: { records: [] } });
    } finally {
      session.dispose();
      vi.useRealTimers();
    }
  });
  it("sends the chart again to a new worker after a worker failure", async () => {
    const workers: FakeWorker[] = [];
    const session = openChartSession(
      new Uint8Array(4),
      sessionOptions(workers, okWithScore, 60000),
    );
    const pending = session.compute(0).catch((error: unknown) => error);
    await new Promise((r) => setTimeout(r, 0));
    workers[0].onerror?.({
      message: "worker exploded",
      error: new Error("worker exploded"),
    } as ErrorEvent);
    expect(String(await pending)).toMatch(/worker exploded/);
    expect(workers[0].terminated).toBe(true);
    void session.compute(1).catch(() => {});
    expect(workers).toHaveLength(2);
    expect((workers[1].posted[0] as ChartRequest).bytes?.byteLength).toBe(4);
    session.dispose();
  });
  it("ends a computation that exceeds its deadline with its worker", async () => {
    vi.useFakeTimers();
    try {
      const workers: FakeWorker[] = [];
      const session = openChartSession(new Uint8Array(4), {
        ...sessionOptions(workers, okWithScore, 60000),
        timeoutMs: 1000,
      });
      const caught = session.compute(0).catch((error: unknown) => error);
      vi.advanceTimersByTime(1001);
      expect(String(await caught)).toMatch(/1s/);
      expect(workers[0].terminated).toBe(true);
      session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
  it("refuses computations after disposal and rejects those in flight", async () => {
    const workers: FakeWorker[] = [];
    const session = openChartSession(
      new Uint8Array(4),
      sessionOptions(workers, okWithScore, 60000),
    );
    const pending = session.compute(0).catch((error: unknown) => error);
    session.dispose();
    expect(String(await pending)).toMatch(/abort|dispos/i);
    await expect(session.compute(1)).rejects.toThrow(/dispos/i);
  });
  it("does not transfer away the caller's buffers", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const config = new Uint8Array(0xb0c);
    const workers: FakeWorker[] = [];
    const session = openChartSession(bytes, { ...sessionOptions(workers, okWithScore), config });
    await session.compute(0);
    expect(bytes.byteLength).toBe(4);
    expect(config.byteLength).toBe(0xb0c);
    session.dispose();
  });
});
