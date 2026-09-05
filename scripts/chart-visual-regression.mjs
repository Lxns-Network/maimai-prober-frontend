#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { preview } from "vite";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const beatMs = 250;
const sampleTimesMs = [
  1000, 1031, 1250, 3000, 3141, 5250, 7333, 9000, 11000, 13062, 15500, 17777, 20000,
];
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

function optionalNumber(value, label) {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be non-negative`);
  return parsed;
}

async function build(root) {
  console.log(`building visual benchmark: ${root}`);
  await new Promise((resolve, reject) => {
    const child = spawn("yarn", ["vike", "build"], {
      cwd: root,
      env: { ...process.env, VITE_CHART_BENCH: "1" },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`build failed (${signal ?? `exit ${code}`})`));
    });
  });
}

async function comparePngBuffers(page, before, after) {
  return page.evaluate(
    async ([beforeBase64, afterBase64]) => {
      const decode = async (base64) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return createImageBitmap(new Blob([bytes], { type: "image/png" }));
      };
      const [beforeImage, afterImage] = await Promise.all([
        decode(beforeBase64),
        decode(afterBase64),
      ]);
      if (beforeImage.width !== afterImage.width || beforeImage.height !== afterImage.height) {
        const dimensions = {
          before: { width: beforeImage.width, height: beforeImage.height },
          after: { width: afterImage.width, height: afterImage.height },
        };
        beforeImage.close();
        afterImage.close();
        return { dimensions, sizeMismatch: true };
      }

      const width = beforeImage.width;
      const height = beforeImage.height;
      const read = (image) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, width, height).data;
      };
      const beforeData = read(beforeImage);
      const afterData = read(afterImage);
      beforeImage.close();
      afterImage.close();

      let changedPixels = 0;
      let pixelsOver2 = 0;
      let pixelsOver8 = 0;
      let pixelsOver32 = 0;
      let maximumChannelDelta = 0;
      let absoluteChannelDelta = 0;
      let darkenedPixels = 0;
      let lightenedPixels = 0;
      let left = width;
      let top = height;
      let right = -1;
      let bottom = -1;

      for (let offset = 0, pixel = 0; offset < beforeData.length; offset += 4, pixel++) {
        let pixelMaximum = 0;
        let brightnessDelta = 0;
        for (let channel = 0; channel < 4; channel++) {
          const delta = afterData[offset + channel] - beforeData[offset + channel];
          const absolute = Math.abs(delta);
          absoluteChannelDelta += absolute;
          pixelMaximum = Math.max(pixelMaximum, absolute);
          if (channel < 3) brightnessDelta += delta;
        }
        maximumChannelDelta = Math.max(maximumChannelDelta, pixelMaximum);
        if (pixelMaximum === 0) continue;
        changedPixels++;
        if (pixelMaximum > 2) pixelsOver2++;
        if (pixelMaximum > 8) pixelsOver8++;
        if (pixelMaximum > 32) pixelsOver32++;
        if (brightnessDelta < 0) darkenedPixels++;
        if (brightnessDelta > 0) lightenedPixels++;
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }

      const totalPixels = width * height;
      return {
        sizeMismatch: false,
        dimensions: { width, height },
        totalPixels,
        changedPixels,
        changedPercent: (changedPixels / totalPixels) * 100,
        pixelsOver2,
        pixelsOver8,
        pixelsOver32,
        maximumChannelDelta,
        meanAbsoluteChannelDelta: absoluteChannelDelta / beforeData.length,
        darkenedPixels,
        lightenedPixels,
        boundingBox:
          changedPixels === 0 ? null : { left, top, right: right + 1, bottom: bottom + 1 },
      };
    },
    [before.toString("base64"), after.toString("base64")],
  );
}

async function captureFrame(page, timeMs) {
  const dataUrl = await page.evaluate(
    async ([beat]) => {
      window.__chartBench.seekBeats(beat);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const canvas = [...document.querySelectorAll("canvas")].sort(
        (a, b) => b.width * b.height - a.width * a.height,
      )[0];
      if (!canvas) throw new Error("chart canvas not found");
      return canvas.toDataURL("image/png");
    },
    [timeMs / beatMs],
  );
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

const args = parseArgs(process.argv.slice(2));
if (!args.out) {
  console.error(
    "usage: node scripts/chart-visual-regression.mjs --out <dir> [--compare <dir>] [--root <checkout>] [--skip-build] [--strict] [--dpr 2] [--no-fullscreen] [--settings '{\"highlightExNotes\":true}'] [--report-only] [--threshold 8] [--max-channel-delta 64] [--max-over-threshold 32] [--max-changed-percent 10]",
  );
  process.exit(2);
}

const root = path.resolve(repositoryRoot, String(args.root ?? repositoryRoot));
const outputDirectory = path.resolve(repositoryRoot, String(args.out));
const comparisonDirectory = args.compare
  ? path.resolve(repositoryRoot, String(args.compare))
  : null;
const reportPath = args.report
  ? path.resolve(repositoryRoot, String(args.report))
  : path.join(outputDirectory, "report.json");
const port = Number(args.port ?? 3013);
const pixelThreshold = optionalNumber(args.threshold, "--threshold") ?? 8;
const deviceScaleFactor = optionalNumber(args.dpr, "--dpr") ?? 2;
const useFullscreen = !args["no-fullscreen"];
// 渲染设置直接种到 zustand 的 persist key 上；不给就用应用默认值。
const settingsOverride = args.settings ? JSON.parse(String(args.settings)) : null;
// strict = 要求逐像素完全一致，用于证明"这次改动不改变任何像素"。
const strict = Boolean(args.strict);
const useDefaultBudgets = comparisonDirectory !== null && !args["report-only"] && !strict;
const budgets = strict
  ? { maximumChannelDelta: 0, pixelsOverThreshold: 0, changedPercent: 0 }
  : {
      maximumChannelDelta:
        optionalNumber(args["max-channel-delta"], "--max-channel-delta") ??
        (useDefaultBudgets ? 64 : null),
      pixelsOverThreshold:
        optionalNumber(args["max-over-threshold"], "--max-over-threshold") ??
        (useDefaultBudgets ? 32 : null),
      changedPercent:
        optionalNumber(args["max-changed-percent"], "--max-changed-percent") ??
        (useDefaultBudgets ? 10 : null),
    };

if (!args["skip-build"]) await build(root);
const clientOutDir = path.join(root, "dist/client");
if (!existsSync(clientOutDir)) throw new Error(`missing production build: ${clientOutDir}`);
if (comparisonDirectory && !existsSync(comparisonDirectory)) {
  throw new Error(`missing comparison directory: ${comparisonDirectory}`);
}
mkdirSync(outputDirectory, { recursive: true });

const playwrightDir = args.playwright ?? process.env.CHART_BENCH_PLAYWRIGHT;
const { chromium } = playwrightDir
  ? createRequire(path.join(playwrightDir, "package.json"))("playwright-core")
  : await import("playwright-core");
const server = await preview({
  root,
  configFile: false,
  appType: "mpa",
  logLevel: "warn",
  build: { outDir: "dist/client" },
  preview: { host: "127.0.0.1", port, strictPort: true, headers: isolationHeaders },
});
let browser;
let failed = false;

try {
  browser = await chromium.launch({
    headless: true,
    channel: "chromium",
    args: [
      "--enable-gpu",
      ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
      "--ignore-gpu-blocklist",
      "--enable-accelerated-2d-canvas",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1440 },
    deviceScaleFactor,
  });
  if (settingsOverride) {
    await page.addInitScript((value) => {
      const raw = localStorage.getItem("maimai_chart_preview_settings");
      const existing = raw ? JSON.parse(raw) : { state: {}, version: 1 };
      localStorage.setItem(
        "maimai_chart_preview_settings",
        JSON.stringify({ ...existing, state: { ...existing.state, ...value } }),
      );
    }, settingsOverride);
  }
  page.on("pageerror", (error) => console.error("page error:", error.message));
  await page.goto(`http://127.0.0.1:${port}/chart/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__chartBench !== undefined, null, { timeout: 60_000 });
  const environment = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      crossOriginIsolated: globalThis.crossOriginIsolated,
      gpuRenderer: gl && info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown",
      userAgent: navigator.userAgent,
    };
  });
  if (!environment.crossOriginIsolated) throw new Error("visual benchmark is not isolated");
  if (/swiftshader|llvmpipe|software/i.test(environment.gpuRenderer)) {
    throw new Error(
      `visual benchmark requires hardware acceleration, got ${environment.gpuRenderer}`,
    );
  }
  await page.evaluate((fullscreen) => {
    window.__chartBench.loadStressChart();
    window.__chartBench.setFullscreen(fullscreen);
  }, useFullscreen);
  await page.waitForTimeout(600);

  const frames = [];
  for (const timeMs of sampleTimesMs) {
    const filename = `${String(timeMs).padStart(5, "0")}.png`;
    const first = await captureFrame(page, timeMs);
    const second = await captureFrame(page, timeMs);
    const deterministic = await comparePngBuffers(page, first, second);
    if (deterministic.sizeMismatch || deterministic.changedPixels !== 0) {
      failed = true;
      console.error(`${filename}: NON-DETERMINISTIC (${deterministic.changedPixels} pixels)`);
    }
    writeFileSync(path.join(outputDirectory, filename), first);

    let comparison = null;
    const violations = [];
    if (comparisonDirectory) {
      const baselinePath = path.join(comparisonDirectory, filename);
      if (!existsSync(baselinePath)) throw new Error(`missing baseline frame: ${baselinePath}`);
      comparison = await comparePngBuffers(page, readFileSync(baselinePath), first);
      if (comparison.sizeMismatch) {
        violations.push("image dimensions differ");
      } else {
        const overThreshold =
          pixelThreshold === 2
            ? comparison.pixelsOver2
            : pixelThreshold === 8
              ? comparison.pixelsOver8
              : null;
        if (overThreshold === null && budgets.pixelsOverThreshold !== null) {
          throw new Error("--max-over-threshold currently supports --threshold 2 or 8");
        }
        if (
          budgets.maximumChannelDelta !== null &&
          comparison.maximumChannelDelta > budgets.maximumChannelDelta
        ) {
          violations.push(
            `max delta ${comparison.maximumChannelDelta} > ${budgets.maximumChannelDelta}`,
          );
        }
        if (budgets.pixelsOverThreshold !== null && overThreshold > budgets.pixelsOverThreshold) {
          violations.push(
            `${overThreshold} pixels over ${pixelThreshold} > ${budgets.pixelsOverThreshold}`,
          );
        }
        if (budgets.changedPercent !== null && comparison.changedPercent > budgets.changedPercent) {
          violations.push(
            `${comparison.changedPercent.toFixed(4)}% changed > ${budgets.changedPercent}%`,
          );
        }
      }
      const overThreshold = pixelThreshold === 2 ? comparison.pixelsOver2 : comparison.pixelsOver8;
      if (comparison.sizeMismatch) {
        console.log(`${filename}: dimension mismatch FAIL`);
      } else {
        console.log(
          `${filename}: changed ${comparison.changedPixels} (${comparison.changedPercent.toFixed(4)}%), >${pixelThreshold} ${overThreshold}, >32 ${comparison.pixelsOver32}, max ${comparison.maximumChannelDelta}, MAE ${comparison.meanAbsoluteChannelDelta.toFixed(5)}${violations.length ? ` FAIL ${violations.join("; ")}` : ""}`,
        );
      }
      if (violations.length) failed = true;
    } else {
      console.log(`${filename}: captured, deterministic`);
    }
    frames.push({ timeMs, filename, deterministic, comparison, violations });
  }

  // 精灵裁剪自检：截图只能证明这 13 个时刻没切边，这一步直接把"手工推导的裁剪矩形"
  // 与"烘焙精灵的真实墨迹"对上，覆盖到本次渲染过的全部 tap 变体。
  const cropViolations = await page.evaluate(() => window.__chartBench.validateSpriteCrops());
  if (cropViolations.length > 0) {
    failed = true;
    console.error(`sprite crop check FAILED (${cropViolations.length}):`);
    for (const violation of cropViolations.slice(0, 10)) console.error(`  ${violation}`);
  } else {
    console.log("sprite crop check: ok");
  }

  const report = {
    version: 1,
    timestamp: new Date().toISOString(),
    root,
    outputDirectory,
    comparisonDirectory,
    sampleTimesMs,
    pixelThreshold,
    strict,
    deviceScaleFactor,
    fullscreen: useFullscreen,
    settingsOverride,
    budgets,
    environment: {
      browserVersion: await browser.version(),
      platform: process.platform,
      arch: process.arch,
      ...environment,
    },
    passed: !failed,
    cropViolations,
    frames,
  };
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(
    `${failed ? "FAILED" : "passed"}; report ${path.relative(repositoryRoot, reportPath)}`,
  );
  await page.close();
} finally {
  await browser?.close();
  await server.close();
}

if (failed) process.exitCode = 1;
