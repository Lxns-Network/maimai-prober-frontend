import type { Chart, MainRenderer } from "@lxns-network/maimai-chart-engine";
import { getLeadInMs } from "../../utils/timeConversion";

interface TimelineSnapshot {
  totalMeasures: number;
  beatsPerMeasure: number;
}

interface SyncBackgroundVideoFrameOptions {
  renderer: MainRenderer;
  video: HTMLVideoElement | null;
  chart: Chart;
  timeline: TimelineSnapshot;
  currentBeats: number;
  currentMs: number;
  playing: boolean;
  showVideo: boolean;
  musicOffset: number;
  playbackSpeed: number;
}

export function syncBackgroundVideoFrame({
  renderer,
  video,
  chart,
  timeline,
  currentBeats,
  currentMs,
  playing,
  showVideo,
  musicOffset,
  playbackSpeed,
}: SyncBackgroundVideoFrameOptions): void {
  if (!showVideo || !video) {
    renderer.setBackgroundVideo(null);
    return;
  }

  const leadInMs = getLeadInMs(chart.bpm);
  const target = (currentMs - leadInMs - musicOffset) / 1000;
  const duration = video.duration;
  const totalBeats = timeline.totalMeasures * timeline.beatsPerMeasure;
  const stoppedAtEnd = !playing && currentBeats >= totalBeats;
  const inWindow = target > 0 && !stoppedAtEnd && (!Number.isFinite(duration) || target < duration);

  renderer.setBackgroundVideo(inWindow ? video : null);
  if (!inWindow) {
    if (!video.paused) video.pause();
    if (target <= 0 && video.currentTime > 0) video.currentTime = 0;
    return;
  }

  if (playing) {
    const drift = video.currentTime - target;
    if (Math.abs(drift) > 0.3) {
      video.currentTime = target;
      video.playbackRate = playbackSpeed;
    } else {
      video.playbackRate =
        drift < -0.02
          ? playbackSpeed + 0.1
          : drift > 0.02
            ? Math.max(0.1, playbackSpeed - 0.1)
            : playbackSpeed;
    }
    if (video.paused) void video.play().catch(() => {});
    return;
  }

  if (!video.paused) video.pause();
  if (Math.abs(video.currentTime - target) > 0.04) video.currentTime = target;
}
