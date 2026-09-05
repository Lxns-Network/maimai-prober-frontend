#!/usr/bin/env node
// 无头跑谱面渲染基准：启动 Vite dev server → Chromium 打开 /chart → 调 window.__chartBench.run()
// → 把报告打到 stdout，JSON 存到 --out。用于改动前后对照，无需人工操作。
//
//   node scripts/chart-bench.mjs --stress [--prod] [--out .bench/score.json]
//   node scripts/chart-bench.mjs --chart 11663 [--difficulty 4] [--start 60000 --end 90000]
//        [--fps 120] [--size 1440] [--dpr 1.3] [--sync-gpu] [--out .bench/before.json]
//        [--compare .bench/before.json] [--trace .bench/trace.json] [--port 3011] [--no-gpu]
//        [--playwright <dir>] [--playback] [--fullscreen] [--device-dpr 2] [--prod]
//
// --prod：先 `vite build`（VITE_CHART_BENCH=1 让 __chartBench 与帧计时进生产包），再用
// `vite preview` 提供 dist/client。dev 模式下 React 会给每个组件发 performance.measure、
// Sentry Replay 录 DOM，这两项在 trace 里能占到长任务的一半以上，掉帧的绝对值不可信；
// 判断"用户会不会掉帧"必须用 --prod。构建约 1 分钟，dist 会被覆盖。
//
// --playback：不跑离屏基准，改为真实播放 start→end 一遍，记录每个 rAF 的间隔与该帧 CPU 耗时，
// 报告掉帧率、掉帧时刻及其归因（CPU 还是 GPU/合成）。无头 Chromium 的合成器按 120Hz 出帧。
// 非全屏时页面把画布限制在 600 CSS px，backing 很小、量不出合成压力；--fullscreen 会进入应用的
// 全屏模式（100vmin），配合 --device-dpr 模拟高 DPR 设备（默认 2，对应 1440px 视口 ≈ 3.5MP
// backing，即用户截图里的配置）。音频走静音输出，AudioContext 无需用户手势即可启动。
//
// 浏览器：playwright-core 在 devDependencies 里，Chromium 本体不在——首次运行前执行
//   yarn playwright-core install chromium
// 会下到 ~/Library/Caches/ms-playwright（约 150MB）。--playwright 可指向另一份 playwright-core。
//
// 默认用新版 headless Chromium + 真 GPU（Metal）。软件光栅（SwiftShader）会在命令缓冲刷新时
// 阻塞几百毫秒到几秒，并被算到恰好发出那次绘制的阶段上，让 max / p99 完全失真；--no-gpu 仅用于
// 排查 GPU 相关差异。dev server 加了 COOP/COEP 头让页面 cross-origin isolated，performance.now()
// 精度从 100µs 提到 5µs，否则单帧阶段耗时大多被量化成 0。
//
// --trace 会把基准期间的 Chrome trace（含 GPU / GC / 光栅任务）写到指定文件，可拖进
// chrome://tracing 或 DevTools Performance 面板打开；用来归因 CPU 阶段表看不到的 GPU / GC 停顿。
//
// 仓库包含 playwright-core，但不提交 Chromium 本体。--playwright 或 CHART_BENCH_PLAYWRIGHT
// 可指向另一份已安装的 playwright-core 包目录（含 node_modules 的上层）。

import { createServer } from "vite";
import { build as vikeBuild, preview as vikePreview } from "vike/api";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readTraceEvents } from "./lib/traceEvents.mjs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

const args = parseArgs(process.argv.slice(2));
if (!args.chart && !args.stress) {
  console.error("usage: node scripts/chart-bench.mjs --stress [options]");
  console.error("   or: node scripts/chart-bench.mjs --chart <chart_id> [options]");
  process.exit(2);
}
if (args.chart && args.stress) {
  console.error("choose either --stress or --chart, not both");
  process.exit(2);
}

const playwrightDir = args.playwright ?? process.env.CHART_BENCH_PLAYWRIGHT;
const { chromium } = playwrightDir
  ? createRequire(path.join(playwrightDir, "package.json"))("playwright-core")
  : await import("playwright-core");

const port = Number(args.port ?? 3011);
const benchOptions = {
  ...(args.start !== undefined && { startMs: Number(args.start) }),
  ...(args.end !== undefined && { endMs: Number(args.end) }),
  ...(args.fps !== undefined && { fps: Number(args.fps) }),
  ...(args.size !== undefined && { size: Number(args.size) }),
  ...(args.dpr !== undefined && { dpr: Number(args.dpr) }),
  ...(args["sync-gpu"] && { syncGpu: true }),
};

/**
 * 真实播放模式：页面内 profilePlayback 接管播放并逐帧记录 rAF 间隔与 CPU 耗时。
 * 新版 headless Chromium 自带合成器节拍（无显示器时约 60Hz），rAF 会正常触发；
 * 报告里的 display 行会打印实际测到的刷新周期。
 */
async function runPlaybackMode(page, options) {
  return page.evaluate((opts) => window.__chartBench.profilePlayback(opts), {
    startMs: options.startMs,
    endMs: options.endMs,
  });
}

/**
 * 把 trace 里渲染进程主线程的长任务（> 8ms）按内部事件归因打印出来，并统计 GC 与 GPU 反压等待。
 * 不替代 DevTools 的火焰图，只用来快速回答"掉帧那一刻主线程在等什么"。
 * 流式读取：20s 播放 trace 可超过 500MB，整文件 JSON.parse 会触发 V8 字符串长度上限。
 */
async function summarizeTrace(tracePath) {
  const threadNames = new Map();
  const mainCandidates = new Map();
  const xEvents = [];
  const flushes = [];
  const profiles = new Map();
  for await (const e of readTraceEvents(tracePath)) {
    if (e.ph === "M" && e.name === "thread_name") {
      threadNames.set(`${e.pid}:${e.tid}`, e.args.name);
      continue;
    }
    if (e.ph === "X") {
      if (e.name === "CommandBuffer::Flush") flushes.push(e.dur / 1000);
      const key = `${e.pid}:${e.tid}`;
      mainCandidates.set(key, (mainCandidates.get(key) ?? 0) + 1);
      xEvents.push(e);
      continue;
    }
    if (e.name === "Profile") {
      profiles.set(`${e.pid}:${e.id}`, {
        thread: `${e.pid}:${e.tid}`,
        startTime: e.args.data.startTime,
        chunks: [],
      });
    } else if (e.name === "ProfileChunk") {
      profiles.get(`${e.pid}:${e.id}`)?.chunks.push({ ts: e.ts, data: e.args.data });
    }
  }
  // 页面所在渲染进程的主线程是事件最多的 CrRendererMain（还会有扩展 / 空白页的渲染进程）。
  const mainKey = [...threadNames]
    .filter(([, name]) => name === "CrRendererMain")
    .map(([key]) => key)
    .sort((a, b) => (mainCandidates.get(b) ?? 0) - (mainCandidates.get(a) ?? 0))[0];
  if (!mainKey) return;
  const onMain = xEvents.filter((e) => `${e.pid}:${e.tid}` === mainKey);
  const sum = (re) => {
    const xs = onMain.filter((e) => re.test(e.name));
    const total = xs.reduce((a, e) => a + e.dur, 0) / 1000;
    const max = Math.max(0, ...xs.map((e) => e.dur)) / 1000;
    return `n=${xs.length} total=${total.toFixed(1)}ms max=${max.toFixed(2)}ms`;
  };
  console.log("\nmain thread:");
  console.log(
    `  canvas cmd serialize (RasterCHROMIUM)  ${sum(/^RasterImplementation::RasterCHROMIUM$/)}`,
  );
  console.log(
    `  GPU backpressure (WaitForCmd/Finish)   ${sum(/WaitForCmd|CommandBufferHelper::Finish|WaitForGetOffset/)}`,
  );
  console.log(
    `  FinalizeFrame                          ${sum(/^CanvasRenderingContext2D::FinalizeFrame$/)}`,
  );
  console.log(`  MinorGC                                ${sum(/^MinorGC$/)}`);
  console.log(`  MajorGC                                ${sum(/^MajorGC$/)}`);
  flushes.sort((a, b) => a - b);
  if (flushes.length) {
    const at = (q) => flushes[Math.floor((flushes.length - 1) * q)].toFixed(2);
    console.log(
      `gpu process CommandBuffer::Flush: n=${flushes.length} p50=${at(0.5)} p95=${at(0.95)} max=${at(1)}ms`,
    );
  }
  const profile = collectCpuProfile([...profiles.values()].filter((p) => p.thread === mainKey));
  const longTasks = onMain
    .filter((e) => e.name === "RunTask" && e.dur > 8000)
    .sort((a, b) => b.dur - a.dur)
    .slice(0, 8);
  if (longTasks.length) {
    console.log(`main-thread tasks > 8ms: ${longTasks.length} shown (top by duration)`);
    for (const task of longTasks) {
      const inside = new Map();
      for (const e of onMain) {
        if (e.name === "RunTask") continue;
        if (e.ts < task.ts || e.ts + e.dur > task.ts + task.dur) continue;
        inside.set(e.name, (inside.get(e.name) ?? 0) + e.dur);
      }
      const top = [...inside]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, dur]) => `${name}=${(dur / 1000).toFixed(1)}`)
        .join("  ");
      console.log(`  ${(task.dur / 1000).toFixed(1).padStart(6)}ms  ${top}`);
      for (const line of profile.framesIn(task.ts, task.ts + task.dur, 4)) {
        console.log(`            ${line}`);
      }
    }
  }
}

/**
 * 把 v8.cpu_profiler 的采样拼回一条时间线，提供"某时间窗内哪些栈帧出现最多"的查询。
 * 优先报告应用代码（src/、packages/）；窗口内没有应用帧时退回到浏览器内建帧
 * （GC、Canvas 内建函数等），这样 GC 停顿和纹理上传也能被点名，而不是打印 (root)/(idle)。
 */
function collectCpuProfile(profiles) {
  const nodes = new Map();
  const parentOf = new Map();
  const samples = [];
  const times = [];
  for (const prof of profiles) {
    let t = prof.startTime;
    for (const chunk of prof.chunks.sort((a, b) => a.ts - b.ts)) {
      const data = chunk.data;
      for (const node of data.cpuProfile?.nodes ?? []) {
        nodes.set(node.id, node);
        if (node.parent != null) parentOf.set(node.id, node.parent);
        for (const child of node.children ?? []) parentOf.set(child, node.id);
      }
      const chunkSamples = data.cpuProfile?.samples ?? [];
      const deltas = data.timeDeltas ?? [];
      for (let i = 0; i < chunkSamples.length; i++) {
        t += deltas[i] ?? 0;
        samples.push(chunkSamples[i]);
        times.push(t);
      }
    }
  }
  const label = (id) => {
    const frame = nodes.get(id)?.callFrame ?? {};
    const url = (frame.url || "")
      .replace(/^.*\/(src|packages)\//, "$1/")
      .replace(/^https?:\/\/[^/]+\//, "")
      .replace(/\?v=\w+$/, "");
    return `${frame.functionName || "(anon)"} ${url}:${frame.lineNumber}`;
  };
  const isNoise = (text) => /^\((root|idle|program)\) :/.test(text);
  return {
    framesIn(startTs, endTs, limit) {
      const app = new Map();
      const builtin = new Map();
      let total = 0;
      for (let i = 0; i < samples.length; i++) {
        if (times[i] < startTs || times[i] > endTs) continue;
        total++;
        const seen = new Set();
        let id = samples[i];
        for (let depth = 0; id != null && depth < 60; depth++) {
          const text = label(id);
          if (!seen.has(text) && !isNoise(text)) {
            seen.add(text);
            const bucket = /^\S+ (src|packages|assets)\//.test(text) ? app : builtin;
            bucket.set(text, (bucket.get(text) ?? 0) + 1);
          }
          id = parentOf.get(id);
        }
      }
      if (total === 0) return ["(no cpu profile samples in window)"];
      const pick = app.size > 0 ? app : builtin;
      return [...pick]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([text, n]) => `${String(Math.round((n / total) * 100)).padStart(3)}%  ${text}`);
    },
  };
}

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

/** Vike 的生产 HTML 由自定义中间件返回，需要在它之前补上隔离响应头。 */
function benchmarkIsolationPlugin() {
  return {
    name: "chart-benchmark-isolation",
    enforce: "pre",
    configurePreviewServer(server) {
      server.middlewares.use((_request, response, next) => {
        for (const [name, value] of Object.entries(isolationHeaders)) {
          response.setHeader(name, value);
        }
        next();
      });
    },
  };
}

let server;
if (args.prod) {
  process.env.VITE_CHART_BENCH = "1";
  // 走 vike 的 build（同时产出 dist/client 与 dist/server，vike preview 两者都要）。
  // Sentry sourcemap 上传没有 token 会报 403，只是噪音，构建照常完成。
  await vikeBuild({
    viteConfig: { root, configFile: path.join(root, "vite.config.ts"), logLevel: "warn" },
  });
  const { viteServer } = await vikePreview({
    viteConfig: {
      root,
      configFile: path.join(root, "vite.config.ts"),
      logLevel: "warn",
      plugins: [benchmarkIsolationPlugin()],
      preview: { port, strictPort: true, host: "127.0.0.1", headers: isolationHeaders },
    },
  });
  server = viteServer;
} else {
  server = await createServer({
    root,
    configFile: path.join(root, "vite.config.ts"),
    logLevel: "warn",
    server: { port, strictPort: true, host: "127.0.0.1", headers: isolationHeaders },
  });
  await server.listen();
}

let browser;
try {
  const useGpu = !args["no-gpu"];
  const playback = Boolean(args.playback);
  browser = await chromium.launch({
    headless: true,
    // channel "chromium" = 完整版新 headless（非 headless_shell），才能真正起 GPU 进程。
    channel: "chromium",
    args: [
      ...(useGpu
        ? [
            "--enable-gpu",
            "--use-angle=metal",
            "--ignore-gpu-blocklist",
            "--enable-accelerated-2d-canvas",
          ]
        : []),
      ...(playback
        ? [
            "--autoplay-policy=no-user-gesture-required",
            "--mute-audio",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
          ]
        : []),
    ],
  });
  const deviceDpr = Number(args["device-dpr"] ?? (playback ? 2 : 1));
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1440 },
    deviceScaleFactor: deviceDpr,
  });
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.startsWith("[chartBench]")) console.log(text.replace(/^\[chartBench\]\s*/, ""));
  });
  page.on("pageerror", (err) => console.error("page error:", err.message));

  const url = new URL(`http://127.0.0.1:${port}/chart`);
  if (args.chart) url.searchParams.set("chart_id", String(args.chart));
  if (args.difficulty !== undefined) url.searchParams.set("difficulty", String(args.difficulty));
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__chartBench !== undefined, null, {
    timeout: 60_000,
  });
  if (args.stress && playback) {
    await page.evaluate(() => window.__chartBench.loadStressChart());
  } else if (!args.stress) {
    await page.waitForFunction(() => window.__chartBench?.hasChart() === true, null, {
      timeout: 60_000,
    });
  }
  const env = await page.evaluate(() => ({
    isolated: globalThis.crossOriginIsolated,
    gpu: (() => {
      const gl = document.createElement("canvas").getContext("webgl");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return gl && info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
    })(),
  }));
  console.log(
    `env: ${args.prod ? "production build" : "dev server"} crossOriginIsolated=${env.isolated} renderer=${env.gpu}`,
  );
  if (!env.isolated) {
    throw new Error(
      "benchmark page is not cross-origin isolated; timing precision is insufficient",
    );
  }
  if (useGpu && /swiftshader|llvmpipe|software/i.test(env.gpu)) {
    throw new Error(`benchmark requires hardware acceleration, got ${env.gpu}`);
  }

  const tracePath = args.trace ? path.resolve(root, String(args.trace)) : null;
  if (tracePath) {
    mkdirSync(path.dirname(tracePath), { recursive: true });
    await browser.startTracing(page, {
      path: tracePath,
      screenshots: false,
      categories: [
        "devtools.timeline",
        "disabled-by-default-devtools.timeline",
        "disabled-by-default-devtools.timeline.frame",
        // JS 采样栈：DevTools Performance 面板据此画火焰图，能看到长任务里的具体函数。
        "disabled-by-default-v8.cpu_profiler",
        "v8.execute",
        "disabled-by-default-v8.gc",
        "gpu",
        "cc",
        "viz",
        "blink",
        "blink.user_timing",
        "cc.debug.scheduler.frames",
      ],
    });
  }

  if (args.fullscreen) {
    // 走应用自己的全屏状态而不是 Fullscreen API（无头没有用户手势）；ChartCanvas 会据此 resize。
    await page.evaluate(() => window.__chartBench.setFullscreen(true));
    await page.waitForTimeout(300);
  }

  const result = playback
    ? await runPlaybackMode(page, benchOptions)
    : args.stress
      ? await page.evaluate(() => window.__chartBench.score())
      : await page.evaluate((options) => window.__chartBench.run(options), benchOptions);
  result.environment = {
    mode: args.prod ? "production" : "development",
    crossOriginIsolated: env.isolated,
    gpuRenderer: env.gpu,
    browserVersion: await browser.version(),
    platform: process.platform,
    arch: process.arch,
  };

  if (tracePath) {
    await browser.stopTracing();
    console.log(`\ntrace saved ${path.relative(root, tracePath)}`);
    await summarizeTrace(tracePath);
  }

  if (args.out) {
    const outPath = path.resolve(root, String(args.out));
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`\nsaved ${path.relative(root, outPath)}`);
  }
  if (args.compare && !playback) {
    const baseline = JSON.parse(readFileSync(path.resolve(root, String(args.compare)), "utf8"));
    // compare 会把对照表打到页面 console，上面的 console 转发已经输出到 stdout。
    await page.evaluate(([a, b]) => window.__chartBench.compare(b, a), [baseline, result]);
  }
} finally {
  await browser?.close();
  await server.close();
}
