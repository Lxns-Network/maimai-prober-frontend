import { RENDER_PROFILE_STAGES, type RenderProfileStage } from "@lxns-network/maimai-chart-engine";
import { playbackTimeRef, useGameStore } from "../stores/useGameStore";
import { useGameSettingsStore } from "../stores/useGameSettingsStore";
import { beatsToMs, msToBeats } from "../utils/timeConversion";
import type { StageStats } from "./renderBenchmark";

/**
 * 实时播放剖析：真的走 rAF + 音频时钟 + 主画布合成，逐帧记录 rAF 间隔与该帧的 CPU 阶段耗时。
 * 与 runRenderBenchmark 的区别：那边是批量渲染、不等 vsync，测不到 GPU 反压和合成造成的掉帧；
 * 这边测的就是用户看到的帧率，代价是结果受机器负载与刷新率影响，需要多跑几次。
 */
export interface PlaybackProfileOptions {
  /** 起止时间（谱面毫秒）。默认从当前播放头到谱面结束。 */
  startMs?: number;
  endMs?: number;
  /** 判定掉帧的 rAF 间隔阈值。默认按测得的显示器刷新周期 × 1.5。 */
  droppedFrameMs?: number;
  /** 音乐尚未加载时等待真正开始播放的最长时间；超时抛错，避免产生 0 帧的假通过。 */
  startTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface DroppedFrame {
  /** 谱面时间 */
  ms: number;
  /** 这一帧到上一帧的 rAF 间隔 */
  intervalMs: number;
  /** 这一帧渲染的 CPU 阶段耗时；有 GPU 反压时 total 会显著大于各阶段之和以外的正常值 */
  cpuTotalMs: number;
  topStage: RenderProfileStage;
  /** 这一帧间隔内发生的 store 写入（触发 React 重渲染的直接来源）。 */
  storeWrites: string[];
}

/** 一次 zustand store 更新：谱面时间与浅比较下变化的键。 */
export interface StoreWrite {
  ms: number;
  wallMs: number;
  store: "game" | "settings";
  keys: string[];
}

export interface PlaybackProfileResult {
  config: {
    chartTitle: string;
    startMs: number;
    endMs: number;
    refreshIntervalMs: number;
    droppedFrameMs: number;
    devicePixelRatio: number;
    backingPixels: number;
    timestamp: string;
  };
  frames: number;
  /** rAF 间隔分布 */
  interval: StageStats;
  /** 每帧 CPU total 分布（渲染器阶段计时之和） */
  cpuTotal: StageStats;
  /** 各阶段 CPU 分布 */
  stages: Record<RenderProfileStage, StageStats>;
  droppedFrames: DroppedFrame[];
  /** 剖析期间的全部 store 写入；播放中稳态应为空，出现即意味着一次控件树重渲染。 */
  storeWrites: StoreWrite[];
  /** 间隔 > droppedFrameMs 的帧占比 */
  droppedRatio: number;
  /** 掉帧那一刻 CPU total 的中位数：远小于间隔说明是 GPU/合成侧的锅，接近间隔说明是 JS。 */
  droppedCpuMedianMs: number;
}

const MAX_DROPPED_FRAMES = 50;

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
  }
}

/** 正在录制时由 ChartCanvas 交付的单帧阶段耗时（毫秒）。 */
export type FrameProfileDetail = Record<RenderProfileStage, number>;
/** 订阅期间启用 renderer 计时，返回的函数负责释放此次采集需求。 */
export type SubscribeFrameProfile = (onFrame: (profile: FrameProfileDetail) => void) => () => void;

function computeStats(values: number[]): StageStats {
  if (values.length === 0) return { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p))];
  return {
    avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted[sorted.length - 1],
  };
}

/** 用连续 rAF 时间戳估计显示器刷新周期（取中位数，抗首帧抖动）。 */
async function measureRefreshInterval(signal?: AbortSignal): Promise<number> {
  throwIfAborted(signal);
  const stamps: number[] = [];
  await new Promise<void>((resolve, reject) => {
    let rafId = 0;
    const abort = () => {
      cancelAnimationFrame(rafId);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
    const tick = (t: number) => {
      stamps.push(t);
      if (stamps.length >= 20) {
        signal?.removeEventListener("abort", abort);
        resolve();
      } else rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  });
  const deltas = stamps.slice(1).map((t, i) => t - stamps[i]);
  return computeStats(deltas).p50;
}

/** 订阅两个 store，把每次更新变化的顶层键（timeline 展开一层）记下来；返回取消订阅函数。 */
function recordStoreWrites(sink: StoreWrite[], chartMsNow: () => number): () => void {
  const diffKeys = (prev: object, next: object): string[] => {
    const keys: string[] = [];
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      if (typeof next[key] === "function") continue;
      if (prev[key] === next[key]) continue;
      if (key === "timeline" && prev[key] && next[key]) {
        const pt = prev[key] as Record<string, unknown>;
        const nt = next[key] as Record<string, unknown>;
        for (const sub of Object.keys(nt)) if (pt[sub] !== nt[sub]) keys.push(`timeline.${sub}`);
        continue;
      }
      keys.push(String(key));
    }
    return keys;
  };
  const unsubGame = useGameStore.subscribe((next, prev) => {
    const keys = diffKeys(prev, next);
    if (keys.length)
      sink.push({ ms: chartMsNow(), wallMs: performance.now(), store: "game", keys });
  });
  const unsubSettings = useGameSettingsStore.subscribe((next, prev) => {
    const keys = diffKeys(prev, next);
    if (keys.length) {
      sink.push({ ms: chartMsNow(), wallMs: performance.now(), store: "settings", keys });
    }
  });
  return () => {
    unsubGame();
    unsubSettings();
  };
}

/**
 * 从 startMs 播放到 endMs，记录每个 rAF 的间隔与 ChartCanvas 上报的该帧 CPU 阶段耗时。
 * 通过 subscribeFrameProfile 申请并接收计时，结束时取消订阅；未录制时不采集单帧快照。
 * 播放达到 endMs 后 resolve；提前停止、超时或 signal 中止时抛错。
 */
export async function runPlaybackProfile(
  subscribeFrameProfile: SubscribeFrameProfile,
  options: PlaybackProfileOptions = {},
): Promise<PlaybackProfileResult> {
  const store = useGameStore.getState();
  const chart = store.chartData;
  if (!chart) throw new Error("No chart loaded");

  const totalBeats = store.timeline.totalMeasures * store.timeline.beatsPerMeasure;
  const chartEndMs = beatsToMs(totalBeats, chart.bpmEvents, chart.bpm);
  const startMs = options.startMs ?? beatsToMs(playbackTimeRef.current, chart.bpmEvents, chart.bpm);
  const endMs = Math.min(chartEndMs, options.endMs ?? chartEndMs);
  if (endMs <= startMs) throw new Error("endMs must be greater than startMs");

  const refreshIntervalMs = await measureRefreshInterval(options.signal);
  const droppedFrameMs = options.droppedFrameMs ?? refreshIntervalMs * 1.5;
  const startTimeoutMs = options.startTimeoutMs ?? 15_000;
  if (!Number.isFinite(startTimeoutMs) || startTimeoutMs <= 0) {
    throw new Error("startTimeoutMs must be a positive number");
  }

  const intervals: number[] = [];
  const cpuTotals: number[] = [];
  const stageSamples = new Map<RenderProfileStage, number[]>();
  for (const stage of RENDER_PROFILE_STAGES) stageSamples.set(stage, []);
  const dropped: DroppedFrame[] = [];

  let lastFrameProfile: FrameProfileDetail | null = null;

  const canvas = document.querySelector<HTMLCanvasElement>("canvas");
  const backingPixels = canvas ? canvas.width * canvas.height : 0;

  const storeWrites: StoreWrite[] = [];
  const chartMsNow = () =>
    Math.round(beatsToMs(playbackTimeRef.current, chart.bpmEvents, chart.bpm));

  await new Promise<void>((resolve, reject) => {
    let lastTimestamp = -1;
    let rafId = 0;
    let startTimeoutId: number | null = null;
    let started = false;
    let finished = false;
    let stopRecording: (() => void) | null = null;
    let unsubscribeFrameProfile: (() => void) | null = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(rafId);
      if (startTimeoutId !== null) window.clearTimeout(startTimeoutId);
      options.signal?.removeEventListener("abort", abort);
      unsubscribeFrameProfile?.();
      useGameStore.getState().pause();
      stopRecording?.();
    };
    const abort = () => {
      finish();
      reject(options.signal?.reason ?? new DOMException("Playback profile aborted", "AbortError"));
    };
    const tick = (timestamp: number) => {
      if (options.signal?.aborted) {
        finish();
        reject(new DOMException("Playback profile aborted", "AbortError"));
        return;
      }
      const state = useGameStore.getState();
      const nowMs = beatsToMs(playbackTimeRef.current, chart.bpmEvents, chart.bpm);
      if (!started) {
        if (state.isPlaying) {
          started = true;
          if (startTimeoutId !== null) window.clearTimeout(startTimeoutId);
        } else {
          rafId = requestAnimationFrame(tick);
          return;
        }
      }
      if (nowMs >= endMs) {
        finish();
        resolve();
        return;
      }
      if (!state.isPlaying) {
        finish();
        reject(new Error("Playback stopped before reaching endMs"));
        return;
      }
      // 间隔无条件记录：一次停顿里 ChartCanvas 的 rAF 往往根本没跑，若以"有 profile"为记录条件，
      // 掉帧本身就会被漏掉。没有 profile 时 CPU 记 0——正好表明这一帧的时间没花在渲染上。
      if (lastTimestamp >= 0) {
        const interval = timestamp - lastTimestamp;
        const profile = lastFrameProfile;
        intervals.push(interval);
        cpuTotals.push(profile?.total ?? 0);
        for (const stage of RENDER_PROFILE_STAGES) {
          stageSamples.get(stage)!.push(profile?.[stage] ?? 0);
        }
        if (interval > droppedFrameMs && dropped.length < MAX_DROPPED_FRAMES) {
          let topStage: RenderProfileStage = "prepare";
          let topMs = -1;
          if (profile) {
            for (const stage of RENDER_PROFILE_STAGES) {
              if (stage === "total") continue;
              if (profile[stage] > topMs) {
                topMs = profile[stage];
                topStage = stage;
              }
            }
          }
          const windowStart = timestamp - interval;
          dropped.push({
            ms: Math.round(nowMs),
            intervalMs: interval,
            cpuTotalMs: profile?.total ?? 0,
            topStage,
            storeWrites: storeWrites
              .filter((w) => w.wallMs >= windowStart && w.wallMs <= timestamp)
              .map((w) => `${w.store}:${w.keys.join(",")}`),
          });
        }
      }
      lastTimestamp = timestamp;
      lastFrameProfile = null;
      rafId = requestAnimationFrame(tick);
    };

    throwIfAborted(options.signal);
    options.signal?.addEventListener("abort", abort, { once: true });
    unsubscribeFrameProfile = subscribeFrameProfile((profile) => {
      lastFrameProfile = profile;
    });
    store.setPreciseTime(msToBeats(startMs, chart.bpmEvents, chart.bpm), true);
    store.play();
    // 起播的 seek / play 本身必然写 store，从这里开始记才是"播放中"的写入。
    stopRecording = recordStoreWrites(storeWrites, chartMsNow);
    startTimeoutId = window.setTimeout(() => {
      if (started) return;
      finish();
      reject(new Error(`Playback did not start within ${startTimeoutMs}ms`));
    }, startTimeoutMs);
    rafId = requestAnimationFrame(tick);
  });

  if (intervals.length === 0) {
    throw new Error("Playback profile captured no frames");
  }

  const stages = {} as Record<RenderProfileStage, StageStats>;
  for (const stage of RENDER_PROFILE_STAGES) stages[stage] = computeStats(stageSamples.get(stage)!);
  const droppedCount = intervals.filter((v) => v > droppedFrameMs).length;

  return {
    config: {
      chartTitle: chart.title,
      startMs,
      endMs,
      refreshIntervalMs,
      droppedFrameMs,
      devicePixelRatio: window.devicePixelRatio,
      backingPixels,
      timestamp: new Date().toISOString(),
    },
    frames: intervals.length,
    interval: computeStats(intervals),
    cpuTotal: computeStats(cpuTotals),
    stages,
    droppedFrames: dropped,
    storeWrites,
    droppedRatio: intervals.length > 0 ? droppedCount / intervals.length : 0,
    droppedCpuMedianMs: computeStats(dropped.map((d) => d.cpuTotalMs)).p50,
  };
}

export function formatPlaybackProfileReport(result: PlaybackProfileResult): string {
  const num = (v: number) => v.toFixed(2).padStart(8);
  const c = result.config;
  const lines = [
    `chart: ${c.chartTitle}  ${c.startMs}ms - ${c.endMs}ms  ${result.frames} frames`,
    `display: ${(1000 / c.refreshIntervalMs).toFixed(0)}Hz (${c.refreshIntervalMs.toFixed(2)}ms), dpr ${c.devicePixelRatio}, backing ${(c.backingPixels / 1e6).toFixed(2)}MP`,
    `dropped: ${(result.droppedRatio * 100).toFixed(1)}% of frames > ${c.droppedFrameMs.toFixed(1)}ms; CPU median at drop ${result.droppedCpuMedianMs.toFixed(2)}ms`,
    "",
    `${"".padEnd(11)}${["p50", "p95", "p99", "max", "avg"].map((h) => h.padStart(8)).join("")}`,
    `${"interval".padEnd(11)}${num(result.interval.p50)}${num(result.interval.p95)}${num(result.interval.p99)}${num(result.interval.max)}${num(result.interval.avg)}`,
    `${"cpuTotal".padEnd(11)}${num(result.cpuTotal.p50)}${num(result.cpuTotal.p95)}${num(result.cpuTotal.p99)}${num(result.cpuTotal.max)}${num(result.cpuTotal.avg)}`,
  ];
  for (const stage of RENDER_PROFILE_STAGES) {
    if (stage === "total") continue;
    const s = result.stages[stage];
    lines.push(
      `${stage.padEnd(11)}${num(s.p50)}${num(s.p95)}${num(s.p99)}${num(s.max)}${num(s.avg)}`,
    );
  }
  lines.push(
    "",
    "dropped frames (chart ms / interval / cpu / top stage / store writes in that interval):",
  );
  for (const d of result.droppedFrames.slice(0, 15)) {
    lines.push(
      `  ${String(d.ms).padStart(7)}  ${d.intervalMs.toFixed(1).padStart(6)}ms  ${d.cpuTotalMs.toFixed(2).padStart(6)}ms  ${d.topStage.padEnd(10)} ${d.storeWrites.join(" ") || "-"}`,
    );
  }
  lines.push("", `store writes during playback: ${result.storeWrites.length}`);
  for (const w of result.storeWrites.slice(0, 20)) {
    lines.push(`  ${String(w.ms).padStart(7)}  ${w.store}: ${w.keys.join(", ")}`);
  }
  return lines.join("\n");
}
