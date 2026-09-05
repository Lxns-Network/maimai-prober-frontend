/// <reference types="vite/client" />

declare const __BUILD_VERSION__: string;
declare const __BUILD_COMMIT__: string;

declare module "dayjs/locale/*";
declare module "react-color-extractor";
declare module "react-helmet";
declare module "wordcloud";

interface ImportMetaEnv {
  /** 由 scripts/chart-bench.mjs --prod 设为 "1"，把渲染基准工具编进生产包。 */
  readonly VITE_CHART_BENCH?: string;
}
