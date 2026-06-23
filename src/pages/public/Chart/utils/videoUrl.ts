import { getChartIdForFilename } from "./fileDownload";

export function buildVideoUrl(videoServer: string): string | null {
  const numId = Number(getChartIdForFilename());
  if (!Number.isFinite(numId)) return null;

  const base = videoServer.replace(/\/+$/, "");
  return `${base}/${numId % 10000}.mp4`;
}
