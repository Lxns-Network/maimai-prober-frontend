import { defineConfig } from "vitest/config";

export default defineConfig({
  // 与浏览器构建使用同一 ESM 入口，包的 main 指向独立 script 标签使用的全局构建。
  resolve: { alias: { "tess2-ts": "tess2-ts/dist/tess2.es.js" } },
  test: {
    name: "maimai-chart-engine",
    include: ["tests/**/*.test.ts"],
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
  },
});
