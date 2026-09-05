#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { preview } from "vite";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(repositoryRoot, String(args.root ?? repositoryRoot));
const port = Number(args.port ?? 3017);
const deviceScaleFactor = Number(args.dpr ?? 2);
const settingsOverride = args.settings ? JSON.parse(String(args.settings)) : null;

const clientOutDir = path.join(root, "dist/client");
if (!existsSync(clientOutDir)) throw new Error(`missing production build: ${clientOutDir}`);

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
  page.on("pageerror", (error) => console.error("page error:", error.message));

  await page.addInitScript((value) => {
    if (value) {
      const raw = localStorage.getItem("maimai_chart_preview_settings");
      const existing = raw ? JSON.parse(raw) : { state: {}, version: 1 };
      localStorage.setItem(
        "maimai_chart_preview_settings",
        JSON.stringify({ ...existing, state: { ...existing.state, ...value } }),
      );
    }

    // 只统计画到"页面上那张画布"的合成量；烘焙精灵时的离屏绘制不计入。
    const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    window.__fillAudit = { active: false, records: [], frames: 0 };
    // 渲染器每画完一帧就派发这个事件（bench 构建），用它精确数帧，
    // 因为暂停态的预览循环只在播放头变化时才重画。
    window.addEventListener("maimai-chart-frame-profile", () => {
      if (window.__fillAudit.active) window.__fillAudit.frames++;
    });
    CanvasRenderingContext2D.prototype.drawImage = function (...callArgs) {
      const audit = window.__fillAudit;
      if (audit.active && this.canvas && this.canvas.isConnected) {
        const source = callArgs[0];
        let destWidth;
        let destHeight;
        if (callArgs.length >= 9) {
          destWidth = callArgs[7];
          destHeight = callArgs[8];
        } else if (callArgs.length >= 5) {
          destWidth = callArgs[3];
          destHeight = callArgs[4];
        } else {
          destWidth = source.width ?? 0;
          destHeight = source.height ?? 0;
        }
        const transform = this.getTransform();
        const deviceArea = Math.abs(
          destWidth * destHeight * (transform.a * transform.d - transform.b * transform.c),
        );
        audit.records.push({
          sourceWidth: source.width ?? 0,
          sourceHeight: source.height ?? 0,
          deviceArea,
        });
      }
      return originalDrawImage.apply(this, callArgs);
    };
  }, settingsOverride);

  // --chart 走线上真实谱面（需要网络）；不给就用内置压测谱面。
  const url = new URL(`http://127.0.0.1:${port}/chart/`);
  if (args.chart) url.searchParams.set("chart_id", String(args.chart));
  if (args.difficulty !== undefined) url.searchParams.set("difficulty", String(args.difficulty));
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__chartBench !== undefined, null, { timeout: 60_000 });
  if (args.chart) {
    await page.waitForFunction(() => window.__chartBench.hasChart() === true, null, {
      timeout: 60_000,
    });
    await page.evaluate(() => window.__chartBench.setFullscreen(true));
  } else {
    await page.evaluate(() => {
      window.__chartBench.loadStressChart();
      window.__chartBench.setFullscreen(true);
    });
  }
  await page.waitForTimeout(600);

  const frames = [];
  for (const timeMs of sampleTimesMs) {
    const frame = await page.evaluate(
      async ([timeMs]) => {
        // 暂停态只在播放头变化时重画，所以统计窗口必须罩住 seek 本身。
        window.__fillAudit.records.length = 0;
        window.__fillAudit.frames = 0;
        window.__fillAudit.active = true;
        window.__chartBench.seekMs(timeMs);
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        window.__fillAudit.active = false;
        const renderedFrames = Math.max(1, window.__fillAudit.frames);
        const records = window.__fillAudit.records;
        const canvas = [...document.querySelectorAll("canvas")].sort(
          (a, b) => b.width * b.height - a.width * a.height,
        )[0];
        const bySource = new Map();
        let totalArea = 0;
        for (const record of records) {
          totalArea += record.deviceArea;
          const key = `${record.sourceWidth}x${record.sourceHeight}`;
          const group = bySource.get(key) ?? { key, draws: 0, area: 0 };
          group.draws++;
          group.area += record.deviceArea;
          bySource.set(key, group);
        }
        return {
          canvasPixels: canvas.width * canvas.height,
          renderedFrames,
          draws: records.length,
          totalArea: totalArea / renderedFrames,
          drawsPerFrame: records.length / renderedFrames,
          bySource: [...bySource.values()]
            .map((group) => ({
              ...group,
              area: group.area / renderedFrames,
              draws: group.draws / renderedFrames,
            }))
            .sort((a, b) => b.area - a.area)
            .slice(0, 8),
        };
      },
      [timeMs],
    );
    frames.push({ timeMs, ...frame });
  }

  const canvasPixels = frames[0].canvasPixels;
  const totals = new Map();
  let sumArea = 0;
  let sumDraws = 0;
  for (const frame of frames) {
    sumArea += frame.totalArea;
    sumDraws += frame.drawsPerFrame;
    for (const group of frame.bySource) {
      const existing = totals.get(group.key) ?? { key: group.key, draws: 0, area: 0 };
      existing.draws += group.draws;
      existing.area += group.area;
      totals.set(group.key, existing);
    }
  }
  const frameCount = frames.length;
  console.log(`canvas: ${canvasPixels.toLocaleString()} device px (dpr ${deviceScaleFactor})`);
  console.log(
    `per frame: ${(sumDraws / frameCount).toFixed(0)} drawImage, ${(sumArea / frameCount / 1e6).toFixed(2)} Mpx composited = ${((sumArea / frameCount / canvasPixels) * 100).toFixed(0)}% of canvas`,
  );
  console.log("\ntop sprite sources (per frame, averaged over sampled times):");
  for (const group of [...totals.values()].sort((a, b) => b.area - a.area).slice(0, 8)) {
    console.log(
      `  ${group.key.padEnd(12)} ${(group.draws / frameCount).toFixed(0).padStart(5)} draws  ${(group.area / frameCount / 1e6).toFixed(2)} Mpx  ${((group.area / sumArea) * 100).toFixed(0)}% of composited`,
    );
  }

  if (args.out) {
    const outputPath = path.resolve(repositoryRoot, String(args.out));
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(
      outputPath,
      JSON.stringify({ canvasPixels, deviceScaleFactor, settingsOverride, frames }, null, 2),
    );
    console.log(`\nsaved ${path.relative(repositoryRoot, outputPath)}`);
  }
  await page.close();
} finally {
  await browser?.close();
  await server.close();
}
