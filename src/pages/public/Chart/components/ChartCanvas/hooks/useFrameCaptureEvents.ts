import { useEffect, type RefObject } from "react";
import { playbackTimeRef, useGameStore } from "../../../stores/useGameStore";
import { downloadBlob, getChartIdForFilename } from "../../../utils/fileDownload";
import { formatChartTimeForFilename } from "../../../utils/format";
import { beatsToMs } from "../../../utils/timeConversion";
import { canvasToBlob } from "../../../utils/canvasToBlob";
import { notifyChart } from "../../../utils/chartNotification";

export function useFrameCaptureEvents(canvasRef: RefObject<HTMLCanvasElement | null>): void {
  useEffect(() => {
    const exportFrame = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const chart = useGameStore.getState().chartData;
      const currentMs = chart ? beatsToMs(playbackTimeRef.current, chart.bpmEvents, chart.bpm) : 0;
      const chartId = getChartIdForFilename();
      const filename = `maimai-chart-${chartId}-${formatChartTimeForFilename(currentMs)}.png`;

      let blob: Blob;
      try {
        blob = await canvasToBlob(canvas);
      } catch {
        notifyChart("导出失败", "无法获取当前帧", "red");
        return;
      }

      const file = new File([blob], filename, { type: "image/png" });

      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }

      downloadBlob(blob, filename);
      notifyChart("已保存", "当前帧已下载为 PNG", "green");
    };

    const copyFrame = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": canvasToBlob(canvas) })]);
        notifyChart("已复制", "当前帧已复制到剪贴板", "green");
      } catch {
        notifyChart("复制失败", "剪贴板不可用", "red");
      }
    };

    window.addEventListener("maimai-chart-export-frame", exportFrame);
    window.addEventListener("maimai-chart-copy-frame", copyFrame);
    return () => {
      window.removeEventListener("maimai-chart-export-frame", exportFrame);
      window.removeEventListener("maimai-chart-copy-frame", copyFrame);
    };
  }, [canvasRef]);
}
