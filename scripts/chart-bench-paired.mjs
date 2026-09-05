#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { preview } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function positiveInteger(value, fallback, label) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function optionalNonNegative(value, label) {
  if (value === undefined) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be non-negative`);
  return parsed;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function relativeStandardDeviationPercent(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return average === 0 ? 0 : (Math.sqrt(variance) / average) * 100;
}

const tCritical95 = [
  Infinity,
  12.706,
  4.303,
  3.182,
  2.776,
  2.571,
  2.447,
  2.365,
  2.306,
  2.262,
  2.228,
  2.201,
  2.179,
  2.16,
  2.145,
  2.131,
  2.12,
  2.11,
  2.101,
  2.093,
  2.086,
  2.08,
  2.074,
  2.069,
  2.064,
  2.06,
  2.056,
  2.052,
  2.048,
  2.045,
  2.042,
];

function summarizePairs(pairs) {
  const baselineScores = pairs.map((pair) => pair.baseline.throughput.score);
  const candidateScores = pairs.map((pair) => pair.candidate.throughput.score);
  const deltas = pairs.map((pair) => pair.deltaPercent);
  const logRatios = pairs.map((pair) =>
    Math.log(pair.candidate.throughput.score / pair.baseline.throughput.score),
  );
  const averageLogRatio = mean(logRatios);
  const standardDeviation = Math.sqrt(
    logRatios.reduce((sum, value) => sum + (value - averageLogRatio) ** 2, 0) /
      (logRatios.length - 1),
  );
  const critical = tCritical95[Math.min(logRatios.length - 1, 30)];
  const margin = critical * (standardDeviation / Math.sqrt(logRatios.length));
  const confidence95Percent = {
    low: (Math.exp(averageLogRatio - margin) - 1) * 100,
    high: (Math.exp(averageLogRatio + margin) - 1) * 100,
  };
  // 每次 score() 内部五轮的 RSD 只是单点精度信号。配对设计的推断量是各轮 delta 的离散度，
  // 已经体现在下面的置信区间里，因此单次运行偏噪不足以否决结论；只有过半运行都不稳定，
  // 才说明这台机器当时整体不可测量。
  const totalRuns = pairs.length * 2;
  const unstableRuns = pairs.reduce(
    (count, pair) =>
      count +
      (pair.baseline.throughput.stable ? 0 : 1) +
      (pair.candidate.throughput.stable ? 0 : 1),
    0,
  );
  const machineTooNoisy = unstableRuns > totalRuns / 2;
  const verdict = machineTooNoisy
    ? "inconclusive-unstable-run"
    : confidence95Percent.low > 0
      ? "improvement"
      : confidence95Percent.high < 0
        ? "regression"
        : "inconclusive";

  // 顺序效应：未达热稳态时 AB 与 BA 会被漂移系统性地拉向相反方向，两组均值差得越大越不可信。
  const abDeltas = pairs.filter((pair) => pair.order === "AB").map((pair) => pair.deltaPercent);
  const baDeltas = pairs.filter((pair) => pair.order === "BA").map((pair) => pair.deltaPercent);
  const orderEffect =
    abDeltas.length > 0 && baDeltas.length > 0
      ? {
          abMeanPercent: mean(abDeltas),
          baMeanPercent: mean(baDeltas),
          gapPercentPoints: Math.abs(mean(abDeltas) - mean(baDeltas)),
        }
      : null;

  return {
    verdict,
    unstableRuns,
    totalRuns,
    orderEffect,
    medianDeltaPercent: median(deltas),
    geometricMeanDeltaPercent: (Math.exp(averageLogRatio) - 1) * 100,
    confidence95Percent,
    minimumDeltaPercent: Math.min(...deltas),
    maximumDeltaPercent: Math.max(...deltas),
    baselineScoreRsdPercent: relativeStandardDeviationPercent(baselineScores),
    candidateScoreRsdPercent: relativeStandardDeviationPercent(candidateScores),
  };
}

async function build(checkout, label) {
  console.log(`\nbuilding ${label}: ${checkout}`);
  await new Promise((resolve, reject) => {
    const child = spawn("yarn", ["vike", "build"], {
      cwd: checkout,
      env: { ...process.env, VITE_CHART_BENCH: "1" },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} build failed (${signal ?? `exit ${code}`})`));
    });
  });
}

async function startPreview(checkout, port) {
  const clientOutDir = path.join(checkout, "dist/client");
  if (!existsSync(clientOutDir)) {
    throw new Error(`missing production build: ${clientOutDir}`);
  }
  return preview({
    root: checkout,
    configFile: false,
    appType: "mpa",
    logLevel: "warn",
    build: { outDir: "dist/client" },
    preview: { host: "127.0.0.1", port, strictPort: true, headers: isolationHeaders },
  });
}

function comparableConfig(result) {
  return {
    chartTitle: result.config.chartTitle,
    noteCount: result.config.noteCount,
    startMs: result.config.startMs,
    endMs: result.config.endMs,
    fps: result.config.fps,
    size: result.config.size,
    dpr: result.config.dpr,
    syncGpu: result.config.syncGpu,
    source: result.config.source,
    frames: result.config.frames,
    passes: result.config.passes,
    warmupFrames: result.config.warmupFrames,
    warmupPasses: result.config.warmupPasses,
    settings: result.config.settings,
    chunkFrames: result.throughput?.chunkFrames,
  };
}

function assertComparable(baseline, candidate) {
  if (!baseline.throughput || !candidate.throughput) {
    throw new Error("paired benchmark requires throughput results");
  }
  if (JSON.stringify(comparableConfig(baseline)) !== JSON.stringify(comparableConfig(candidate))) {
    throw new Error("baseline and candidate benchmark configurations differ");
  }
}

async function readEnvironment(page) {
  return page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      crossOriginIsolated: globalThis.crossOriginIsolated,
      gpuRenderer: gl && info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown",
      userAgent: navigator.userAgent,
    };
  });
}

const args = parseArgs(process.argv.slice(2));
if (!args.baseline) {
  console.error(
    "usage: node scripts/chart-bench-paired.mjs --baseline <checkout> [--candidate <checkout>] [--rounds 5] [--warmup-rounds 1] [--cooldown-sec 60] [--skip-build] [--out <file>]",
  );
  process.exit(2);
}

const baselineRoot = path.resolve(root, String(args.baseline));
const candidateRoot = path.resolve(root, String(args.candidate ?? root));
const rounds = positiveInteger(args.rounds, 5, "--rounds");
if (rounds < 3) throw new Error("--rounds must be at least 3 for a paired confidence interval");
const warmupRounds = positiveInteger(args["warmup-rounds"], 1, "--warmup-rounds");
// 连续满负荷跑分会把机器烤到降频，实测同一基线可从 197 掉到 73 fps。每次运行前静置
// 一段时间能显著降低热耦合；默认 0（不静置）以保持旧行为。
const cooldownSec = optionalNonNegative(args["cooldown-sec"], "--cooldown-sec");
const baselinePort = positiveInteger(args.port, 3011, "--port");
const candidatePort = positiveInteger(args["candidate-port"], baselinePort + 1, "--candidate-port");
if (baselinePort === candidatePort) throw new Error("preview ports must differ");

const playwrightDir = args.playwright ?? process.env.CHART_BENCH_PLAYWRIGHT;
const { chromium } = playwrightDir
  ? createRequire(path.join(playwrightDir, "package.json"))("playwright-core")
  : await import("playwright-core");

if (!args["skip-build"]) {
  await build(baselineRoot, "A baseline");
  await build(candidateRoot, "B candidate");
}

const [baselineServer, candidateServer] = await Promise.all([
  startPreview(baselineRoot, baselinePort),
  startPreview(candidateRoot, candidatePort),
]);
let browser;

try {
  browser = await chromium.launch({
    headless: true,
    channel: "chromium",
    args: [
      "--enable-gpu",
      ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
      "--ignore-gpu-blocklist",
      "--enable-accelerated-2d-canvas",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1440 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("page error:", error.message));

  let runIndex = 0;
  const environments = new Map();
  async function run(label, port) {
    if (cooldownSec > 0) {
      await new Promise((resolve) => setTimeout(resolve, cooldownSec * 1000));
    }
    runIndex++;
    await page.goto(`http://127.0.0.1:${port}/chart/?paired=${runIndex}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => window.__chartBench !== undefined, null, { timeout: 60_000 });
    await page.waitForTimeout(300);
    const environment = await readEnvironment(page);
    if (!environment.crossOriginIsolated) {
      throw new Error(`${label} page is not cross-origin isolated`);
    }
    if (/swiftshader|llvmpipe|software/i.test(environment.gpuRenderer)) {
      throw new Error(`${label} requires hardware acceleration, got ${environment.gpuRenderer}`);
    }
    environments.set(label, environment);

    const startedAt = performance.now();
    const result = await page.evaluate(() => window.__chartBench.score());
    const elapsedSeconds = (performance.now() - startedAt) / 1000;
    console.log(
      `${label}: ${result.throughput.score.toFixed(2)} stress fps, internal RSD ${result.throughput.scoreRelativeStdDevPercent.toFixed(2)}%, ${elapsedSeconds.toFixed(1)}s`,
    );
    return result;
  }

  // 先各加载一次页面确认两侧都带 __chartBench（忘记用 VITE_CHART_BENCH=1 构建时最常见），
  // 否则会在跑完一次三分钟的基准后才失败。
  for (const [label, port] of [
    ["A baseline", baselinePort],
    ["B candidate", candidatePort],
  ]) {
    await page.goto(`http://127.0.0.1:${port}/chart/`, { waitUntil: "domcontentloaded" });
    const ready = await page
      .waitForFunction(() => window.__chartBench !== undefined, null, { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!ready) {
      throw new Error(
        `${label} build does not expose window.__chartBench; rebuild it with VITE_CHART_BENCH=1`,
      );
    }
  }

  console.log(`\nwarming up ${warmupRounds} round(s); warmups are excluded from the report`);
  for (let warmup = 0; warmup < warmupRounds; warmup++) {
    const order = warmup % 2 === 0 ? "AB" : "BA";
    console.log(`warmup ${warmup + 1}/${warmupRounds} (${order})`);
    if (order === "AB") {
      await run("A baseline", baselinePort);
      await run("B candidate", candidatePort);
    } else {
      await run("B candidate", candidatePort);
      await run("A baseline", baselinePort);
    }
  }

  const pairs = [];
  for (let round = 0; round < rounds; round++) {
    const order = round % 2 === 0 ? "AB" : "BA";
    console.log(`\nround ${round + 1}/${rounds} (${order})`);
    let baseline;
    let candidate;
    if (order === "AB") {
      baseline = await run("A baseline", baselinePort);
      candidate = await run("B candidate", candidatePort);
    } else {
      candidate = await run("B candidate", candidatePort);
      baseline = await run("A baseline", baselinePort);
    }
    assertComparable(baseline, candidate);
    const deltaPercent =
      ((candidate.throughput.score - baseline.throughput.score) / baseline.throughput.score) * 100;
    console.log(`pair delta: ${deltaPercent >= 0 ? "+" : ""}${deltaPercent.toFixed(2)}%`);
    pairs.push({ round: round + 1, order, deltaPercent, baseline, candidate });
  }

  const baselineEnvironment = environments.get("A baseline");
  const candidateEnvironment = environments.get("B candidate");
  if (
    baselineEnvironment.gpuRenderer !== candidateEnvironment.gpuRenderer ||
    baselineEnvironment.userAgent !== candidateEnvironment.userAgent
  ) {
    throw new Error("baseline and candidate browser environments differ");
  }

  const summary = summarizePairs(pairs);
  console.log("\npaired summary");
  console.log(
    `deltas: ${pairs.map((pair) => `${pair.deltaPercent >= 0 ? "+" : ""}${pair.deltaPercent.toFixed(2)}%`).join(", ")}`,
  );
  console.log(
    `median ${summary.medianDeltaPercent.toFixed(2)}%, geometric mean ${summary.geometricMeanDeltaPercent.toFixed(2)}%, 95% CI [${summary.confidence95Percent.low.toFixed(2)}%, ${summary.confidence95Percent.high.toFixed(2)}%]`,
  );
  console.log(
    `cross-round absolute RSD: A ${summary.baselineScoreRsdPercent.toFixed(2)}%, B ${summary.candidateScoreRsdPercent.toFixed(2)}%`,
  );
  if (summary.orderEffect) {
    console.log(
      `order effect: AB mean ${summary.orderEffect.abMeanPercent.toFixed(2)}% vs BA mean ${summary.orderEffect.baMeanPercent.toFixed(2)}% (gap ${summary.orderEffect.gapPercentPoints.toFixed(2)}pp)`,
    );
  }
  console.log(
    `internally unstable runs: ${summary.unstableRuns}/${summary.totalRuns} (single-run RSD > 5%)`,
  );
  console.log(`verdict: ${summary.verdict}`);

  const report = {
    version: 1,
    timestamp: new Date().toISOString(),
    baselineRoot,
    candidateRoot,
    rounds,
    warmupRounds,
    cooldownSec,
    environment: {
      browserVersion: await browser.version(),
      platform: process.platform,
      arch: process.arch,
      ...baselineEnvironment,
    },
    summary,
    pairs,
  };
  if (args.out) {
    const outputPath = path.resolve(root, String(args.out));
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`saved ${path.relative(root, outputPath)}`);
  }

  await context.close();
} finally {
  await browser?.close();
  await Promise.all([baselineServer.close(), candidateServer.close()]);
}
