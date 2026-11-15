import type { MotionTracks } from "../lifecycle/motion";
import type { LivePlaybackData } from "../../notes/livePlayback";
import type { ObjectLifetimes } from "../lifecycle/nativeChart";
import type { NoteScore } from "../../notes/score";
import { registerImmutableTimeline } from "../../notes/timing";
import { registerImmutableScroll } from "../../notes/space";
import { Timeline } from "../timeline/reader";
import type { ChartEffects, ChartReply, ChartRequest } from "./protocol";

export interface LoadChartOptions {
  /** Returns render data with the timeline when true. */
  includeScore?: boolean;
  includeMirror?: boolean;
  difficulty: number;
  mirror: boolean;
  /** Song selecting the result reaction release. */
  musicId: number;
  /** Display speed row the lifecycles run at; row 0 when omitted. */
  speedRow?: number;
  config: Uint8Array;
  signal?: AbortSignal;
  /** Load deadline in milliseconds; defaults to 30,000. */
  timeoutMs?: number;
  createWorker?: () => Worker;
}

export interface LoadedChart {
  timeline: Timeline;
  score: NoteScore;
  motion: MotionTracks;
  lifetimes: ObjectLifetimes;
  effects: ChartEffects;
  livePlayback: LivePlaybackData;
  mirrored?: { score: NoteScore; effects: ChartEffects };
}

const TIMEOUT_MS = 30_000;
let nextId = 1;

function defaultWorker(): Worker {
  return new Worker(new URL("./chartWorker.ts", import.meta.url), { type: "module" });
}

/**
 * Parses, binds and runs the note lifecycles of `bytes` in a dedicated Worker and resolves with the Timeline. The
 * Worker is terminated when the request settles, aborts, errors or exceeds its deadline. The caller's
 * buffers are copied before transfer.
 */
export function loadChart(
  bytes: Uint8Array,
  options: LoadChartOptions & { includeScore: true },
): Promise<LoadedChart>;
export function loadChart(
  bytes: Uint8Array,
  options: LoadChartOptions & { includeScore?: false },
): Promise<Timeline>;
export function loadChart(
  bytes: Uint8Array,
  options: LoadChartOptions,
): Promise<Timeline | LoadedChart>;
export function loadChart(
  bytes: Uint8Array,
  options: LoadChartOptions,
): Promise<Timeline | LoadedChart> {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 0x7fffffff)
    return Promise.reject(new RangeError("Chart load timeout must be a positive timer duration"));
  if (
    options.speedRow !== undefined &&
    (!Number.isSafeInteger(options.speedRow) || options.speedRow < 0)
  )
    return Promise.reject(new RangeError("Chart speed row must be a non-negative row index"));
  const worker = (options.createWorker ?? defaultWorker)();
  const id = nextId++;
  return new Promise<Timeline | LoadedChart>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      fn();
    };
    const onAbort = () => done(() => reject(new DOMException("Chart load aborted", "AbortError")));
    const timer = setTimeout(
      () => done(() => reject(new Error(`Chart load exceeded ${timeoutMs / 1000}s`))),
      timeoutMs,
    );
    if (options.signal?.aborted) return onAbort();
    options.signal?.addEventListener("abort", onAbort);
    worker.onerror = (e: ErrorEvent) =>
      done(() =>
        reject(
          e.error instanceof Error
            ? e.error
            : new Error(e.message || "Chart worker failed without reporting a reason"),
        ),
      );
    worker.onmessageerror = () =>
      done(() => reject(new Error("Chart worker message could not be deserialized")));
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as ChartReply;
      if (msg.id !== id) return;
      if (msg.ok) {
        const timeline = msg.timeline;
        done(() => {
          try {
            const parsed = Timeline.from(timeline);
            if (options.includeScore) {
              if (!msg.score || !msg.motion || !msg.lifetimes || !msg.effects || !msg.livePlayback)
                throw new RangeError(
                  "Chart worker returned no render score, motion, lifetimes or effects",
                );
              registerImmutableTimeline(msg.score);
              registerImmutableScroll(msg.score.scroll);
              if (msg.mirrored) {
                registerImmutableTimeline(msg.mirrored.score);
                registerImmutableScroll(msg.mirrored.score.scroll);
              }
              resolve({
                timeline: parsed,
                score: msg.score,
                motion: msg.motion,
                lifetimes: msg.lifetimes,
                effects: msg.effects,
                livePlayback: msg.livePlayback,
                mirrored: msg.mirrored,
              });
            } else resolve(parsed);
          } catch (error) {
            reject(error);
          }
        });
      } else
        done(() =>
          reject(
            Object.assign(new Error(msg.error.message), {
              name: msg.error.name,
              line: msg.error.line,
            }),
          ),
        );
    };
    try {
      const chart = bytes.slice().buffer;
      const config = options.config.slice().buffer;
      const request: ChartRequest = {
        id,
        includeScore: options.includeScore,
        includeMirror: options.includeMirror,
        bytes: chart,
        difficulty: options.difficulty,
        mirror: options.mirror,
        musicId: options.musicId,
        ...(options.speedRow === undefined ? {} : { speedRow: options.speedRow }),
        config,
      };
      worker.postMessage(request, [chart, config]);
    } catch (error) {
      done(() => reject(error));
    }
  });
}

/** Speed rows of one chart computed in one Worker that keeps the chart's binding between rows. */
export interface ChartSession {
  /**
   * Runs every note lifecycle at `speedRow`. An aborted queued computation is removed; an aborted
   * active computation continues until it replies or reaches its original deadline. Deadlines include
   * queue time. A Worker failure or deadline ends the Worker and rejects all pending computations;
   * the next row starts a new one.
   */
  compute(speedRow: number, signal?: AbortSignal): Promise<LoadedChart>;
  dispose(): void;
}

/** Opens a session over `bytes`. The caller's buffers are copied; no Worker starts before `compute`. */
export function openChartSession(
  bytes: Uint8Array,
  options: Omit<LoadChartOptions, "includeScore" | "speedRow" | "signal">,
): ChartSession {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const chart = bytes.slice();
  const config = options.config.slice();
  const pending = new Map<
    number,
    {
      speedRow: number;
      timer: ReturnType<typeof setTimeout>;
      resolve(chart: LoadedChart): void;
      reject(error: unknown): void;
    }
  >();
  const queued: number[] = [];
  let active: { id: number; timer: ReturnType<typeof setTimeout> } | null = null;
  let worker: Worker | null = null;
  let disposed = false;

  const fail = (error: unknown) => {
    if (active) clearTimeout(active.timer);
    active = null;
    queued.length = 0;
    const ended = worker;
    worker = null;
    if (ended) {
      ended.onmessage = null;
      ended.onerror = null;
      ended.onmessageerror = null;
      ended.terminate();
    }
    const waiting = [...pending.values()];
    pending.clear();
    for (const entry of waiting) entry.reject(error);
  };
  const start = (): Worker => {
    const started = (options.createWorker ?? defaultWorker)();
    started.onerror = (e: ErrorEvent) =>
      fail(
        e.error instanceof Error
          ? e.error
          : new Error(e.message || "Chart worker failed without reporting a reason"),
      );
    started.onmessageerror = () =>
      fail(new Error("Chart worker message could not be deserialized"));
    started.onmessage = (e: MessageEvent) => {
      const msg = e.data as ChartReply;
      if (msg.id !== active?.id) return;
      clearTimeout(active.timer);
      active = null;
      const entry = pending.get(msg.id);
      if (entry) {
        pending.delete(msg.id);
        if (!msg.ok) {
          entry.reject(
            Object.assign(new Error(msg.error.message), {
              name: msg.error.name,
              line: msg.error.line,
            }),
          );
        } else {
          try {
            if (!msg.score || !msg.motion || !msg.lifetimes || !msg.effects || !msg.livePlayback)
              throw new RangeError(
                "Chart worker returned no render score, motion, lifetimes or effects",
              );
            const timeline = Timeline.from(msg.timeline);
            registerImmutableTimeline(msg.score);
            registerImmutableScroll(msg.score.scroll);
            if (msg.mirrored) {
              registerImmutableTimeline(msg.mirrored.score);
              registerImmutableScroll(msg.mirrored.score.scroll);
            }
            entry.resolve({
              timeline,
              score: msg.score,
              motion: msg.motion,
              lifetimes: msg.lifetimes,
              effects: msg.effects,
              livePlayback: msg.livePlayback,
              mirrored: msg.mirrored,
            });
          } catch (error) {
            entry.reject(error);
          }
        }
      }
      dispatch();
    };
    return started;
  };
  const dispatch = () => {
    if (active) return;
    while (queued.length) {
      const id = queued.shift()!;
      const entry = pending.get(id);
      if (!entry) continue;
      try {
        const fresh = !worker;
        worker ??= start();
        const request: ChartRequest = {
          id,
          includeScore: true,
          includeMirror: options.includeMirror,
          difficulty: options.difficulty,
          mirror: options.mirror,
          musicId: options.musicId,
          speedRow: entry.speedRow,
        };
        const transfer: ArrayBuffer[] = [];
        if (fresh) {
          request.bytes = chart.slice().buffer;
          request.config = config.slice().buffer;
          transfer.push(request.bytes, request.config);
        }
        active = { id, timer: entry.timer };
        worker.postMessage(request, transfer);
      } catch (error) {
        fail(error);
      }
      return;
    }
  };

  return {
    compute(speedRow, signal) {
      if (disposed) return Promise.reject(new Error("The chart session has been disposed"));
      if (!Number.isSafeInteger(speedRow) || speedRow < 0)
        return Promise.reject(new RangeError("Chart speed row must be a non-negative row index"));
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 0x7fffffff)
        return Promise.reject(
          new RangeError("Chart load timeout must be a positive timer duration"),
        );
      if (signal?.aborted)
        return Promise.reject(new DOMException("Chart load aborted", "AbortError"));
      const id = nextId++;
      return new Promise<LoadedChart>((resolve, reject) => {
        const settle = (keepTimer = false) => {
          if (!keepTimer) clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        };
        const onAbort = () => {
          pending.delete(id);
          const index = queued.indexOf(id);
          if (index !== -1) queued.splice(index, 1);
          settle(active?.id === id);
          reject(new DOMException("Chart load aborted", "AbortError"));
        };
        const timer = setTimeout(
          () => fail(new Error(`Chart load exceeded ${timeoutMs / 1000}s`)),
          timeoutMs,
        );
        pending.set(id, {
          speedRow,
          timer,
          resolve(loaded) {
            settle();
            resolve(loaded);
          },
          reject(error) {
            settle();
            reject(error);
          },
        });
        signal?.addEventListener("abort", onAbort);
        queued.push(id);
        dispatch();
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      fail(new DOMException("The chart session has been disposed", "AbortError"));
    },
  };
}
