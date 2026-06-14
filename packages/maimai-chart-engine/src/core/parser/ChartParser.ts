export type ChartFileType = "simai" | "ma2";

export { parseMa2Chart } from "./Ma2Parser";
export { getAvailableDifficulties, parseSimaiChart } from "./SimaiParser";
export { parseSimaiChart as default } from "./SimaiParser";
