function getFinitePositiveLatency(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : null;
}

function clampContextTime(time: number, currentTime: number): number {
  return Math.max(0, Math.min(time, currentTime));
}

function getTimestampContextTime(audioContext: AudioContext): number | null {
  try {
    const timestamp = audioContext.getOutputTimestamp();
    const { contextTime, performanceTime } = timestamp;
    if (
      contextTime === undefined ||
      performanceTime === undefined ||
      !Number.isFinite(contextTime) ||
      !Number.isFinite(performanceTime)
    ) {
      return null;
    }

    return contextTime + (performance.now() - performanceTime) / 1000;
  } catch {
    return null;
  }
}

function getAudioOutputLatency(audioContext: AudioContext): number {
  return (
    getFinitePositiveLatency(audioContext.outputLatency) ??
    getFinitePositiveLatency(audioContext.baseLatency) ??
    0
  );
}

/**
 * 返回当前估算已到达输出端（即听众耳朵正在听到）的 AudioContext 时刻。
 * 供视觉时钟使用（贴合听感），不要用于 source.start()。
 */
export function getAudioContextOutputTime(audioContext: AudioContext): number {
  const currentTime = audioContext.currentTime;
  const latencyAdjustedTime = currentTime - getAudioOutputLatency(audioContext);
  const timestampTime = getTimestampContextTime(audioContext);
  const outputTime =
    timestampTime === null ? latencyAdjustedTime : Math.min(timestampTime, latencyAdjustedTime);

  return clampContextTime(outputTime, currentTime);
}
