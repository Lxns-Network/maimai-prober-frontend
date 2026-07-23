import { useEffect, type RefObject } from "react";
import { playbackTimeRef, useGameStore } from "../../../stores/useGameStore";
import { downloadBlob, getChartIdForFilename } from "../../../utils/fileDownload";
import { formatChartTimeForFilename } from "../../../utils/format";
import { beatsToMs } from "../../../utils/timeConversion";
import { canvasToBlob } from "../../../utils/canvasToBlob";
import { notifyChart } from "../../../utils/chartNotification";

export function useFrameCaptureEvents(canvasRef: RefObject<HTMLCanvasElement | null>): void {
  useEffect(() => {
    const captureFrame = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const chart = useGameStore.getState().chartData;
      const currentMs = chart ? beatsToMs(playbackTimeRef.current, chart.bpmEvents, chart.bpm) : 0;
      const chartId = getChartIdForFilename();
      const filename = `maimai-chart-${chartId}-${formatChartTimeForFilename(currentMs)}.png`;

      let blob: Blob;
      try {
        blob = await canvasToBlob(canvas);
      } catch {
        notifyChart("导出失败", "无法获取当前帧", "red");
        return null;
      }

      return { blob, filename };
    };

    const shareFrame = async () => {
      const frame = await captureFrame();
      if (!frame) return;

      let file: File;
      try {
        file = new File([frame.blob], frame.filename, { type: "image/png" });
        if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
          throw new Error("Cannot share image file");
        }
      } catch {
        notifyChart("无法分享", "当前浏览器不支持分享图片", "red");
        return;
      }

      try {
        await navigator.share({ files: [file] });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        notifyChart("分享失败", "系统分享不可用", "red");
      }
    };

    const downloadFrame = async () => {
      const frame = await captureFrame();
      if (!frame) return;

      downloadBlob(frame.blob, frame.filename);
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

    window.addEventListener("maimai-chart-export-frame", shareFrame);
    window.addEventListener("maimai-chart-download-frame", downloadFrame);
    window.addEventListener("maimai-chart-copy-frame", copyFrame);
    return () => {
      window.removeEventListener("maimai-chart-export-frame", shareFrame);
      window.removeEventListener("maimai-chart-download-frame", downloadFrame);
      window.removeEventListener("maimai-chart-copy-frame", copyFrame);
    };
  }, [canvasRef]);
}
