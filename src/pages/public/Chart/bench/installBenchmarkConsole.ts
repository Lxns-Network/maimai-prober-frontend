import { useEffect } from "react";
import { useGameStore } from "../stores/useGameStore";
import { useGameSettingsStore } from "../stores/useGameSettingsStore";
import {
  formatRenderBenchmarkReport,
  runRenderBenchmark,
  type RenderBenchmarkOptions,
  type RenderBenchmarkResult,
  type StageStats,
} from "./renderBenchmark";
import { CHART_BENCH_ENABLED } from "./benchEnabled";
import {
  formatPlaybackProfileReport,
  runPlaybackProfile,
  type PlaybackProfileOptions,
  type PlaybackProfileResult,
} from "./playbackProfile";
import {
  createStressChartFixture,
  STRESS_BENCHMARK_PRESET,
  STRESS_RENDERER_SETTINGS,
  type StressChartFixture,
} from "./stressChart";

/**
 * DevTools 里可直接调用的谱面渲染基准入口，挂在 `window.__chartBench`。
 * 只在 DEV 安装；用当前页面已加载的谱面和当前渲染设置。
 */
export interface ChartBenchConsole {
  /** 当前页面是否已加载好谱面；自动化脚本用它轮询就绪。 */
  hasChart(): boolean;
  /** 切换应用内全屏（100vmin 画布），让 backing store 尺寸接近真机全屏播放。 */
  setFullscreen(enabled: boolean): void;
  /** 把内置固定压测谱面装进播放器，供人工观察或 profilePlayback 使用。 */
  loadStressChart(): Omit<StressChartFixture, "chart"> & { noteCount: number };
  /** 用固定谱面、设置、画布和三轮采样运行可跨版本对照的统一跑分。 */
  score(): Promise<RenderBenchmarkResult>;
  /** 跑离屏基准（CPU 阶段耗时）并返回结构化结果，同时把文本报告打到 console。 */
  run(options?: RenderBenchmarkOptions): Promise<RenderBenchmarkResult>;
  /** 上一次 run 的结果。 */
  last: RenderBenchmarkResult | null;
  /**
   * 真实播放剖析：从 startMs 播到 endMs，记录每个 rAF 间隔与该帧 CPU 耗时，找出掉帧并归因。
   * 会接管播放（seek → play → 结束 pause）。
   */
  profilePlayback(options?: PlaybackProfileOptions): Promise<PlaybackProfileResult>;
  lastPlayback: PlaybackProfileResult | null;
  /** 把 a（默认上一次）与 b 的各阶段 p50 / p95 做差，打印对照表。 */
  compare(b: RenderBenchmarkResult, a?: RenderBenchmarkResult): string;
  /** 把结果序列化成 JSON 字符串，方便存到文件做长期对照。 */
  toJSON(result?: RenderBenchmarkResult): string;
}

declare global {
  interface Window {
    __chartBench?: ChartBenchConsole;
  }
}

const COMPARE_STAGE_WIDTH = 11;
const COMPARE_NUMBER_WIDTH = 8;

function formatDelta(before: number, after: number): string {
  const delta = after - before;
  const sign = delta > 0 ? "+" : "";
  const percent = before > 0 ? ` (${sign}${((delta / before) * 100).toFixed(0)}%)` : "";
  return `${sign}${delta.toFixed(3)}${percent}`;
}

function formatComparison(a: RenderBenchmarkResult, b: RenderBenchmarkResult): string {
  const sourceA = a.config.source ?? { kind: "loaded-chart" };
  const sourceB = b.config.source ?? { kind: "loaded-chart" };
  if (
    sourceA.kind === "stress-chart" &&
    sourceB.kind === "stress-chart" &&
    (sourceA.id !== sourceB.id || sourceA.hash !== sourceB.hash)
  ) {
    throw new Error(
      `Incompatible stress benchmarks: ${sourceA.id}/${sourceA.hash} vs ${sourceB.id}/${sourceB.hash}`,
    );
  }
  if (sourceA.kind === "stress-chart" && sourceB.kind === "stress-chart") {
    const comparableA = [
      a.config.startMs,
      a.config.endMs,
      a.config.fps,
      a.config.size,
      a.config.dpr,
      a.config.syncGpu,
      a.config.passes,
      a.config.warmupPasses,
      a.config.settings,
      a.throughput?.chunkFrames,
    ];
    const comparableB = [
      b.config.startMs,
      b.config.endMs,
      b.config.fps,
      b.config.size,
      b.config.dpr,
      b.config.syncGpu,
      b.config.passes,
      b.config.warmupPasses,
      b.config.settings,
      b.throughput?.chunkFrames,
    ];
    if (JSON.stringify(comparableA) !== JSON.stringify(comparableB)) {
      throw new Error("Incompatible stress benchmark settings");
    }
  }
  if (a.environment || b.environment) {
    if (JSON.stringify(a.environment) !== JSON.stringify(b.environment)) {
      throw new Error("Incompatible benchmark environments");
    }
  }
  const num = (value: number) => value.toFixed(3).padStart(COMPARE_NUMBER_WIDTH);
  const unstable = a.throughput?.stable === false || b.throughput?.stable === false;
  const scoreDeltaPercent =
    a.throughput && b.throughput && a.throughput.score > 0
      ? ((b.throughput.score - a.throughput.score) / a.throughput.score) * 100
      : null;
  const noiseFloorPercent =
    a.throughput && b.throughput
      ? Math.max(
          3,
          a.throughput.scoreRelativeStdDevPercent * 2,
          b.throughput.scoreRelativeStdDevPercent * 2,
        )
      : null;
  const lines = [
    `A: ${a.config.chartTitle} ${a.config.frames}f ${a.config.timestamp}  stalls ${a.stallFrames}`,
    `B: ${b.config.chartTitle} ${b.config.frames}f ${b.config.timestamp}  stalls ${b.stallFrames}`,
    ...(a.throughput && b.throughput
      ? [
          `score: ${a.throughput.score.toFixed(0)} -> ${b.throughput.score.toFixed(0)} stress frames/s  ${formatDelta(a.throughput.score, b.throughput.score)}`,
          `spread: ${a.throughput.scoreSpreadPercent.toFixed(1)}% -> ${b.throughput.scoreSpreadPercent.toFixed(1)}%`,
          unstable
            ? "verdict: INCONCLUSIVE (at least one benchmark is unstable)"
            : Math.abs(scoreDeltaPercent!) < noiseFloorPercent!
              ? `verdict: within measured noise (minimum meaningful delta ${noiseFloorPercent!.toFixed(1)}%)`
              : `verdict: ${scoreDeltaPercent! > 0 ? "improvement" : "regression"} (${scoreDeltaPercent!.toFixed(1)}%, noise floor ${noiseFloorPercent!.toFixed(1)}%)`,
        ]
      : []),
    "",
    `${"stage".padEnd(COMPARE_STAGE_WIDTH)}${"A p50".padStart(COMPARE_NUMBER_WIDTH)}${"B p50".padStart(COMPARE_NUMBER_WIDTH)}  ${"Δ p50".padEnd(20)}${"A p95".padStart(COMPARE_NUMBER_WIDTH)}${"B p95".padStart(COMPARE_NUMBER_WIDTH)}  Δ p95`,
  ];
  const row = (label: string, sa: StageStats, sb: StageStats) =>
    `${label.padEnd(COMPARE_STAGE_WIDTH)}${num(sa.p50)}${num(sb.p50)}  ${formatDelta(sa.p50, sb.p50).padEnd(20)}${num(sa.p95)}${num(sb.p95)}  ${formatDelta(sa.p95, sb.p95)}`;
  for (const stage of Object.keys(a.stages) as (keyof typeof a.stages)[]) {
    lines.push(row(stage, a.stages[stage], b.stages[stage]));
  }
  if (a.gpuSync && b.gpuSync) lines.push(row("gpuSync", a.gpuSync, b.gpuSync));
  return lines.join("\n");
}

function createChartBenchConsole(): ChartBenchConsole {
  const bench: ChartBenchConsole = {
    last: null,
    lastPlayback: null,
    hasChart() {
      return useGameStore.getState().chartData !== null;
    },
    setFullscreen(enabled) {
      useGameStore.getState().setIsFullscreen(enabled);
    },
    loadStressChart() {
      const fixture = createStressChartFixture();
      const store = useGameStore.getState();
      store.setMusicUrl("");
      store.setRawSimaiText("");
      store.setAvailableDifficulties({ 6: true });
      store.setSelectedDifficulty(6);
      store.setChartData(fixture.chart);
      return {
        id: fixture.id,
        version: fixture.version,
        hash: fixture.hash,
        noteCount: fixture.chart.notes.length,
      };
    },
    async score() {
      const fixture = createStressChartFixture();
      const wasPlaying = useGameStore.getState().isPlaying;
      if (wasPlaying) useGameStore.getState().pause();
      const result = await runRenderBenchmark(fixture.chart, STRESS_RENDERER_SETTINGS, {
        ...STRESS_BENCHMARK_PRESET,
        onProgress: (done, total) => {
          if (done === total || done % 1200 === 0) {
            console.info(`[chartBench] ${done}/${total} frames`);
          }
        },
        source: {
          kind: "stress-chart",
          id: fixture.id,
          version: fixture.version,
          hash: fixture.hash,
        },
      });
      bench.last = result;
      console.info(`[chartBench]\n${formatRenderBenchmarkReport(result)}`);
      return result;
    },
    async run(options = {}) {
      const chart = useGameStore.getState().chartData;
      if (!chart) throw new Error("No chart loaded: open /chart?chart_id=... first");
      const settings = useGameSettingsStore.getState();
      const wasPlaying = useGameStore.getState().isPlaying;
      if (wasPlaying) useGameStore.getState().pause();

      const result = await runRenderBenchmark(chart, settings, {
        onProgress: (done, total) => {
          if (done === total || done % 1200 === 0) {
            console.info(`[chartBench] ${done}/${total} frames`);
          }
        },
        ...options,
      });
      bench.last = result;
      console.info(`[chartBench]\n${formatRenderBenchmarkReport(result)}`);
      return result;
    },
    async profilePlayback(options = {}) {
      const result = await runPlaybackProfile(options);
      bench.lastPlayback = result;
      console.info(`[chartBench] playback\n${formatPlaybackProfileReport(result)}`);
      return result;
    },
    compare(b, a = bench.last ?? undefined) {
      if (!a) throw new Error("No baseline: run() first or pass one explicitly");
      const text = formatComparison(a, b);
      console.info(`[chartBench] compare\n${text}`);
      return text;
    },
    toJSON(result = bench.last ?? undefined) {
      if (!result) throw new Error("No result to serialize");
      return JSON.stringify(result, null, 2);
    },
  };
  return bench;
}

/** CHART_BENCH_ENABLED 时把 `window.__chartBench` 装到页面上，组件卸载时移除；否则是空操作。 */
export function useInstallBenchmarkConsole(): void {
  useEffect(() => {
    if (!CHART_BENCH_ENABLED) return;
    window.__chartBench = createChartBenchConsole();
    return () => {
      delete window.__chartBench;
    };
  }, []);
}
