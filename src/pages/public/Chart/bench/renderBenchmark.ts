import {
  MainRenderer,
  RENDER_PROFILE_STAGES,
  TimingTimeline,
  type Chart,
  type RenderFrameProfile,
  type RenderProfileStage,
} from "@lxns-network/maimai-chart-engine";
import type { GameSettingsState } from "../stores/useGameSettingsStore";

/** 谱面渲染基准的可调参数；每个字段都会写进结果的 config，方便前后对照。 */
export interface RenderBenchmarkOptions {
  /** 起止时间（谱面毫秒）。默认整张谱面。 */
  startMs?: number;
  endMs?: number;
  /** 帧率步进，决定采样时刻的间隔。默认 120。 */
  fps?: number;
  /** 逻辑边长与 backing 缩放。默认 1440 / 1.3，对应常见的 1440 CSS px 视口。 */
  size?: number;
  dpr?: number;
  /**
   * 强制 GPU 刷新并读回 1 像素。普通阶段基准会每帧同步；吞吐基准只在每个采样块末尾同步，
   * 并把等待时间摊销到块内帧。默认 false。
   */
  syncGpu?: boolean;
  /** 预热帧数（不计入统计），让 sprite 缓存、JIT 稳定。默认 60。 */
  warmupFrames?: number;
  /** 完整预热轮数（不计入统计），使用与吞吐轮相同的 GPU 栅栏路径。默认 0。 */
  warmupPasses?: number;
  /** 完整测量轮数。默认 1；正式跑分使用 5 轮并取中位数。 */
  passes?: number;
  /**
   * 吞吐采样块大小。设置后，每块连续渲染这些帧，块末尾可选强制 GPU 同步；块耗时除以
   * 实际帧数得到 ms/frame。默认不采集吞吐。
   */
  throughputChunkFrames?: number;
  /** 写入结果的输入标识；固定压测谱面用它阻止不同版本之间误对比。 */
  source?: RenderBenchmarkSource;
  onProgress?: (done: number, total: number) => void;
  /** 每处理这么多帧让出一次事件循环，避免长任务卡死页面。默认 240。 */
  yieldEveryFrames?: number;
  signal?: AbortSignal;
}

export type RendererSettings = Pick<
  GameSettingsState,
  | "hiSpeed"
  | "alwaysKeepHiSpeed"
  | "slideDelay"
  | "slideRotation"
  | "mirrorMode"
  | "judgmentLineDesign"
  | "pinkSlideStart"
  | "highlightExNotes"
  | "normalColorBreakSlide"
  | "showFireworks"
  | "showHitEffect"
>;

/** 一个阶段在整个采样窗口内的分布（毫秒）。 */
export interface StageStats {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export type RenderBenchmarkSource =
  | { kind: "loaded-chart" }
  | { kind: "stress-chart"; id: string; version: number; hash: string };

export interface ThroughputPassResult {
  pass: number;
  chunks: number;
  p50MsPerFrame: number;
  p95MsPerFrame: number;
  avgMsPerFrame: number;
  /** 1000 / avgMsPerFrame，即这一整轮可持续的渲染帧率。 */
  score: number;
}

export interface ThroughputResult {
  chunkFrames: number;
  chunks: number;
  msPerFrame: StageStats;
  /** 各轮 score 的中位数，单位是 stress frames/s，越高越好。 */
  score: number;
  /** (最高分 - 最低分) / 中位数；超过 5% 时不宜判断小幅优化。 */
  scoreSpreadPercent: number;
  /** 各轮分数的样本标准差 / 平均值。 */
  scoreRelativeStdDevPercent: number;
  stabilityThresholdPercent: number;
  stable: boolean;
  passes: ThroughputPassResult[];
}

export interface RenderBenchmarkResult {
  config: {
    chartTitle: string;
    difficulty: number | null;
    noteCount: number;
    startMs: number;
    endMs: number;
    fps: number;
    size: number;
    dpr: number;
    syncGpu: boolean;
    source: RenderBenchmarkSource;
    frames: number;
    passes: number;
    sampledFrames: number;
    profiledFrames: number;
    warmupFrames: number;
    warmupPasses: number;
    settings: RendererSettings;
    userAgent: string;
    timestamp: string;
  };
  /** 各阶段统计；total 为整帧 CPU 耗时。 */
  stages: Record<RenderProfileStage, StageStats>;
  /** syncGpu 开启时 GPU 刷新 + 读回的摊销每帧等待时间；关闭时为 null。 */
  gpuSync: StageStats | null;
  /** throughputChunkFrames 开启时的 CPU + GPU 端到端吞吐；否则为 null。 */
  throughput: ThroughputResult | null;
  /**
   * total 超过 STALL_FRAME_MS 的帧数。GC / GPU 刷新造成的偶发长停顿会把 avg 拉高好几倍，
   * 却几乎不动 p50 / p95；单独计数让它可见而不污染均值。
   */
  stallFrames: number;
  /** 最重的 20 帧：用于定位具体是谱面哪个时刻掉帧。 */
  heaviestFrames: {
    pass: number;
    ms: number;
    totalMs: number;
    topStage: RenderProfileStage;
  }[];
  /** 端到端墙钟时间（含 yield、含 syncGpu 时的 GPU 等待）。 */
  wallMs: number;
  /** shell runner 注入；DevTools 直接调用 run() 时不存在。 */
  environment?: BenchmarkEnvironment;
}

export interface BenchmarkEnvironment {
  mode: "production" | "development";
  crossOriginIsolated: boolean;
  gpuRenderer: string;
  browserVersion: string;
  platform: string;
  arch: string;
}

const HEAVIEST_FRAME_COUNT = 20;
/** 约一个 120Hz 帧预算；CPU 侧单帧超过它基本必掉帧。 */
export const STALL_FRAME_MS = 8;
const DEFAULT_STABILITY_THRESHOLD_PERCENT = 5;

function percentile(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[index];
}

function computeStageStats(samples: ArrayLike<number>): StageStats {
  const sorted = Float64Array.from(samples).sort();
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) sum += sorted[i];
  return {
    avg: sorted.length > 0 ? sum / sorted.length : 0,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function relativeStandardDeviationPercent(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return (Math.sqrt(variance) / mean) * 100;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function applySettings(renderer: MainRenderer, settings: RendererSettings): void {
  renderer.setHiSpeed(settings.hiSpeed);
  renderer.setAlwaysKeepHiSpeed(settings.alwaysKeepHiSpeed);
  renderer.setSlideDelay(settings.slideDelay);
  renderer.setPlaybackSpeed(1);
  renderer.setSlideRotation(settings.slideRotation);
  renderer.setMirrorMode(settings.mirrorMode);
  renderer.setJudgmentLineDesign(settings.judgmentLineDesign);
  renderer.setPinkSlideStart(settings.pinkSlideStart);
  renderer.setHighlightExNotes(settings.highlightExNotes);
  renderer.setNormalColorBreakSlide(settings.normalColorBreakSlide);
  renderer.setShowFireworks(settings.showFireworks);
  renderer.setShowHitEffect(settings.showHitEffect);
  renderer.setIsPlaying(true);
}

/**
 * 在脱离 DOM 的 canvas 上按固定时间步进渲染谱面，并返回每个阶段的耗时分布。
 * 与实际播放无关：不依赖 rAF、音频时钟或 store，结果只受渲染器实现和输入参数影响，
 * 因此适合作为改动前后的对照基准。
 *
 * 各阶段统计的是 CPU 时间（JS + Canvas 命令录制）。GPU 工作是异步批量提交的，无法按阶段归因；
 * 开 syncGpu 后会把 GPU 刷新等待单独记到 gpuSync，不混进 CPU 阶段的 total。
 *
 * 会在 signal 中止时抛出 DOMException("AbortError")。
 */
export async function runRenderBenchmark(
  chart: Chart,
  settings: RendererSettings,
  options: RenderBenchmarkOptions = {},
): Promise<RenderBenchmarkResult> {
  const timeline = TimingTimeline.fromChart(chart);
  const beatsPerMeasure = 4;
  const chartEndMs = timeline.msFromBeat(chart.measures * beatsPerMeasure);
  const startMs = Math.max(0, options.startMs ?? 0);
  const endMs = Math.min(chartEndMs, options.endMs ?? chartEndMs);
  const fps = options.fps ?? 120;
  const size = options.size ?? 1440;
  const dpr = options.dpr ?? 1.3;
  const syncGpu = options.syncGpu ?? false;
  const warmupFrames = options.warmupFrames ?? 60;
  const warmupPasses = Math.max(0, Math.floor(options.warmupPasses ?? 0));
  const yieldEveryFrames = options.yieldEveryFrames ?? 240;
  const passes = Math.max(1, Math.floor(options.passes ?? 1));
  const throughputChunkFrames = Math.max(0, Math.floor(options.throughputChunkFrames ?? 0));
  const stepMs = 1000 / fps;
  const frames = Math.max(1, Math.floor((endMs - startMs) / stepMs) + 1);
  const frameBeats = Float64Array.from({ length: frames }, (_, frame) =>
    timeline.beatFromMs(startMs + frame * stepMs),
  );
  const sampledFrames = frames * passes;
  const profiledFrames = throughputChunkFrames > 0 ? frames : sampledFrames;
  const workFrames = sampledFrames + (throughputChunkFrames > 0 ? profiledFrames : 0);

  const canvas = document.createElement("canvas");
  const renderer = new MainRenderer(canvas);
  renderer.resizeToSize(size, dpr);
  applySettings(renderer, settings);
  const readbackCtx = syncGpu ? renderer.getRenderContext().ctx : null;
  const fenceCanvas = document.createElement("canvas");
  fenceCanvas.width = Math.max(1, throughputChunkFrames);
  fenceCanvas.height = 1;
  const fenceCtx =
    throughputChunkFrames > 0 ? fenceCanvas.getContext("2d", { alpha: false }) : null;
  if (throughputChunkFrames > 0 && !fenceCtx) {
    throw new Error("Failed to create throughput fence canvas");
  }

  const samples = new Map<RenderProfileStage, Float64Array>();
  for (const stage of RENDER_PROFILE_STAGES) {
    samples.set(stage, new Float64Array(profiledFrames));
  }
  const frameMs = new Float64Array(profiledFrames);
  const gpuSyncMs: number[] | null = readbackCtx ? [] : null;
  const throughputMsPerFrame: number[] = [];
  const throughputPasses: ThroughputPassResult[] = [];

  const renderAt = (ms: number): RenderFrameProfile | null => {
    renderer.renderFrame(chart, timeline.beatFromMs(ms), beatsPerMeasure);
    return renderer.takeFrameProfile();
  };

  const syncGpuNow = (): number => {
    if (!readbackCtx) return 0;
    const start = performance.now();
    readbackCtx.getImageData(0, 0, 1, 1);
    return performance.now() - start;
  };

  renderer.setProfilingEnabled(throughputChunkFrames === 0);
  // 预热从 startMs 之前一小段开始，让窗口内第一帧已经有热缓存。
  for (let i = warmupFrames; i > 0; i--) {
    renderAt(Math.max(0, startMs - i * stepMs));
  }
  syncGpuNow();

  const wallStart = performance.now();
  let profiledFrame = 0;
  let completedFrames = 0;

  if (throughputChunkFrames > 0) {
    const runThroughputPass = async (
      pass: number,
      measured: boolean,
    ): Promise<ThroughputPassResult> => {
      const passThroughput: number[] = [];
      for (let chunkStart = 0; chunkStart < frames; ) {
        const chunkEnd = Math.min(frames, chunkStart + throughputChunkFrames);
        fenceCtx?.clearRect(0, 0, chunkEnd - chunkStart, 1);
        const throughputStart = performance.now();

        for (let frame = chunkStart; frame < chunkEnd; frame++) {
          if (options.signal?.aborted) throw new DOMException("Benchmark aborted", "AbortError");
          renderer.renderFrame(chart, frameBeats[frame], beatsPerMeasure);
          // 独立目标像素保留每一帧，防止下一次 clear 让浏览器丢弃尚未提交的画面。
          fenceCtx?.drawImage(
            canvas,
            0,
            0,
            canvas.width,
            canvas.height,
            frame - chunkStart,
            0,
            1,
            1,
          );
        }

        const actualChunkFrames = chunkEnd - chunkStart;
        const syncStart = performance.now();
        if ((syncGpu || !measured) && fenceCtx) {
          fenceCtx.getImageData(0, 0, actualChunkFrames, 1);
        }
        const gpuSync = performance.now() - syncStart;
        const msPerFrame = (performance.now() - throughputStart) / actualChunkFrames;
        passThroughput.push(msPerFrame);
        if (measured) {
          throughputMsPerFrame.push(msPerFrame);
          if (gpuSyncMs) gpuSyncMs.push(gpuSync / actualChunkFrames);
          completedFrames += actualChunkFrames;
        }
        chunkStart = chunkEnd;
        if (measured) options.onProgress?.(completedFrames, workFrames);
        await yieldToBrowser();
      }

      const stats = computeStageStats(passThroughput);
      return {
        pass,
        chunks: passThroughput.length,
        p50MsPerFrame: stats.p50,
        p95MsPerFrame: stats.p95,
        avgMsPerFrame: stats.avg,
        score: stats.avg > 0 ? 1000 / stats.avg : 0,
      };
    };

    for (let pass = 0; pass < warmupPasses; pass++) {
      await runThroughputPass(0, false);
    }
    for (let pass = 0; pass < passes; pass++) {
      throughputPasses.push(await runThroughputPass(pass + 1, true));
    }

    renderer.setProfilingEnabled(true);
    for (let i = warmupFrames; i > 0; i--) {
      renderAt(Math.max(0, startMs - i * stepMs));
    }
  }

  const profilePasses = throughputChunkFrames > 0 ? 1 : passes;
  for (let pass = 0; pass < profilePasses; pass++) {
    for (let frame = 0; frame < frames; frame++) {
      if (options.signal?.aborted) throw new DOMException("Benchmark aborted", "AbortError");
      const ms = startMs + frame * stepMs;
      const profile = renderAt(ms);
      frameMs[profiledFrame] = ms;
      if (profile) {
        for (const stage of RENDER_PROFILE_STAGES) {
          samples.get(stage)![profiledFrame] = profile.avgMs[stage];
        }
      }
      if (throughputChunkFrames === 0 && gpuSyncMs) gpuSyncMs.push(syncGpuNow());
      profiledFrame++;

      completedFrames++;
      if (completedFrames % yieldEveryFrames === 0 || frame === frames - 1) {
        options.onProgress?.(completedFrames, workFrames);
        await yieldToBrowser();
      }
    }
  }
  options.onProgress?.(workFrames, workFrames);
  const wallMs = performance.now() - wallStart;

  const stages = {} as Record<RenderProfileStage, StageStats>;
  for (const stage of RENDER_PROFILE_STAGES) stages[stage] = computeStageStats(samples.get(stage)!);

  const totalSamples = samples.get("total")!;
  let stallFrames = 0;
  for (let i = 0; i < totalSamples.length; i++) {
    if (totalSamples[i] > STALL_FRAME_MS) stallFrames++;
  }
  const heaviestFrames = Array.from(totalSamples, (totalMs, index) => ({ totalMs, index }))
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, HEAVIEST_FRAME_COUNT)
    .map(({ totalMs, index }) => {
      let topStage: RenderProfileStage = "prepare";
      let topMs = -1;
      for (const stage of RENDER_PROFILE_STAGES) {
        if (stage === "total") continue;
        const value = samples.get(stage)![index];
        if (value > topMs) {
          topMs = value;
          topStage = stage;
        }
      }
      return {
        pass: Math.floor(index / frames) + 1,
        ms: Math.round(frameMs[index]),
        totalMs,
        topStage,
      };
    });

  const passScores = throughputPasses.map((pass) => pass.score);
  const score = median(passScores);
  const scoreSpreadPercent =
    score > 0 ? ((Math.max(...passScores) - Math.min(...passScores)) / score) * 100 : 0;
  const scoreRelativeStdDevPercent = relativeStandardDeviationPercent(passScores);
  const throughput =
    throughputChunkFrames > 0
      ? {
          chunkFrames: throughputChunkFrames,
          chunks: throughputMsPerFrame.length,
          msPerFrame: computeStageStats(throughputMsPerFrame),
          score,
          scoreSpreadPercent,
          scoreRelativeStdDevPercent,
          stabilityThresholdPercent: DEFAULT_STABILITY_THRESHOLD_PERCENT,
          stable: scoreRelativeStdDevPercent <= DEFAULT_STABILITY_THRESHOLD_PERCENT,
          passes: throughputPasses,
        }
      : null;

  return {
    config: {
      chartTitle: chart.title,
      difficulty: chart.difficulty ?? null,
      noteCount: chart.notes.length,
      startMs,
      endMs,
      fps,
      size,
      dpr,
      syncGpu,
      source: options.source ?? { kind: "loaded-chart" },
      frames,
      passes,
      sampledFrames,
      profiledFrames,
      warmupFrames,
      warmupPasses,
      settings,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    },
    stages,
    gpuSync: gpuSyncMs ? computeStageStats(gpuSyncMs) : null,
    throughput,
    stallFrames,
    heaviestFrames,
    wallMs,
  };
}

const REPORT_STAGE_WIDTH = 11;
const REPORT_NUMBER_WIDTH = 7;

/** 把结果排成等宽文本表，便于直接贴进 PR / issue 对照。 */
export function formatRenderBenchmarkReport(result: RenderBenchmarkResult): string {
  const { config } = result;
  const num = (value: number) => value.toFixed(3).padStart(REPORT_NUMBER_WIDTH);
  const lines = [
    `chart: ${config.chartTitle} (difficulty ${config.difficulty ?? "?"}, ${config.noteCount} notes)`,
    ...(config.source.kind === "stress-chart"
      ? [`benchmark: ${config.source.id} hash ${config.source.hash}`]
      : []),
    `range: ${config.startMs}ms - ${config.endMs}ms @ ${config.fps}fps = ${config.frames} frames x ${config.passes} passes`,
    `canvas: ${config.size}px x ${config.dpr} dpr${config.syncGpu ? " (GPU sync)" : ""}, wall ${result.wallMs.toFixed(0)}ms`,
    `stalls: ${result.stallFrames} frames over ${STALL_FRAME_MS}ms`,
    "",
    `${"stage".padEnd(REPORT_STAGE_WIDTH)}${["p50", "p95", "p99", "max", "avg"].map((h) => h.padStart(REPORT_NUMBER_WIDTH)).join("")}`,
  ];
  if (result.throughput) {
    lines.splice(
      lines.length - 1,
      0,
      `score: ${result.throughput.score.toFixed(0)} stress frames/s (median full-pass throughput, spread ${result.throughput.scoreSpreadPercent.toFixed(1)}%)`,
      `stability: ${result.throughput.stable ? "stable" : "UNSTABLE"} (RSD ${result.throughput.scoreRelativeStdDevPercent.toFixed(1)}%, limit ${result.throughput.stabilityThresholdPercent.toFixed(1)}%)`,
      `throughput: p50 ${result.throughput.msPerFrame.p50.toFixed(3)} / p95 ${result.throughput.msPerFrame.p95.toFixed(3)} ms/frame, ${result.throughput.chunkFrames} frames/chunk`,
    );
  }
  const statsLine = (label: string, s: StageStats) =>
    `${label.padEnd(REPORT_STAGE_WIDTH)}${num(s.p50)}${num(s.p95)}${num(s.p99)}${num(s.max)}${num(s.avg)}`;
  for (const stage of RENDER_PROFILE_STAGES) lines.push(statsLine(stage, result.stages[stage]));
  if (result.gpuSync) lines.push(statsLine("gpuSync", result.gpuSync));
  lines.push("", "heaviest frames:");
  for (const frame of result.heaviestFrames.slice(0, 10)) {
    lines.push(
      `  pass ${frame.pass}  ${String(frame.ms).padStart(7)}ms  ${frame.totalMs.toFixed(2)}ms  ${frame.topStage}`,
    );
  }
  if (result.throughput) {
    lines.push("", "score passes:");
    for (const pass of result.throughput.passes) {
      lines.push(
        `  pass ${pass.pass}: ${pass.score.toFixed(0)}  p95 ${pass.p95MsPerFrame.toFixed(3)}ms/frame`,
      );
    }
  }
  return lines.join("\n");
}
