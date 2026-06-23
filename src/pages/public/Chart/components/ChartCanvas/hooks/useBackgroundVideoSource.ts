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

    if (showVideo) {
      const url = buildVideoUrl(videoServer);
      if (url) {
        video.src = url;
        video.load();
        video.addEventListener("loadeddata", refresh);
        video.addEventListener("seeked", refresh);
      }
    } else {
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
