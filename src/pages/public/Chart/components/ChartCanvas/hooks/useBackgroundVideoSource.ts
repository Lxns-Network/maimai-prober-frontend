import { useEffect, type RefObject } from "react";
import type { Chart } from "@lxns-network/maimai-chart-engine";
import { playbackTimeRef, useGameStore } from "../../../stores/useGameStore";
import { useGameSettingsStore } from "../../../stores/useGameSettingsStore";
import { buildVideoUrl } from "../../../utils/videoUrl";

interface UseBackgroundVideoSourceOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  chartData: Chart | null;
  renderFrame: (beatsOverride?: number) => void;
}

export function useBackgroundVideoSource({
  videoRef,
  chartData,
  renderFrame,
}: UseBackgroundVideoSourceOptions): void {
  const showVideo = useGameSettingsStore((s) => s.showVideo);
  const videoServer = useGameSettingsStore((s) => s.videoServer);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const refresh = () => {
      if (!useGameStore.getState().isPlaying) {
        renderFrame(playbackTimeRef.current);
      }
    };

    const url = showVideo ? buildVideoUrl(videoServer) : null;
    if (url) {
      video.src = url;
      video.load();
      video.addEventListener("loadeddata", refresh);
      video.addEventListener("seeked", refresh);
    } else {
      // showVideo 关闭，或开启但当前谱面无有效视频 URL：都清除 source，避免上一谱面背景视频残留。
      video.removeAttribute("src");
      video.load();
    }

    renderFrame(playbackTimeRef.current);
    return () => {
      video.removeEventListener("loadeddata", refresh);
      video.removeEventListener("seeked", refresh);
    };
  }, [videoRef, showVideo, videoServer, chartData, renderFrame]);
}
