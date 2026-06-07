const MAX_FILENAME_CHART_ID_LENGTH = 80;

export function getChartIdForFilename(): string {
  const chartId = new URLSearchParams(window.location.search).get("chart_id") ?? "";
  const safeChartId = chartId
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_FILENAME_CHART_ID_LENGTH);

  return safeChartId || "unknown";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
