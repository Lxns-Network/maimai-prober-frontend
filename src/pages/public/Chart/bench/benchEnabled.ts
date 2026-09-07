/**
 * 是否把 `window.__chartBench` 编进当前构建；渲染计时仅在展开面板或录制播放时启用。
 * dev 恒为 true；生产构建只在 `VITE_CHART_BENCH=1` 时为 true（scripts/chart-bench.mjs --prod 会设）。
 * 两个条件都是构建期常量，关闭时相关代码会被 tree-shake 掉。
 */
export const CHART_BENCH_ENABLED = import.meta.env.DEV || import.meta.env.VITE_CHART_BENCH === "1";
