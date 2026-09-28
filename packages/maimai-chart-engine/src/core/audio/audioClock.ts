function getFinitePositiveLatency(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : null;
}

function clampContextTime(time: number, currentTime: number): number {
  return Math.max(0, Math.min(time, currentTime));
}

/** 用硬件时间戳外推 AudioContext 时刻；环境不支持或数据无效时返回 null。 */
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
 * 估算物理输出端（听众耳朵听到）当前的 AudioContext 时刻（秒）。
 *
 * 注意：只能用于视觉时钟与音画同步。因为该时刻已经扣除了输出延迟（处于过去），
 * 绝对不能传给 source.start() 等方法去调度未来的声音。
 *
 * 环境不支持硬件时间戳时自动回退为延迟补偿，返回值始终在 [0, currentTime] 区间内。
 */
export function getAudioContextOutputTime(audioContext: AudioContext): number {
  const currentTime = audioContext.currentTime;
  const latencyAdjustedTime = currentTime - getAudioOutputLatency(audioContext);
  const timestampTime = getTimestampContextTime(audioContext);
  // 两者并存时取较小值（保守估计），防止时间戳抖动导致画面超前于实际听感
  const outputTime =
    timestampTime === null ? latencyAdjustedTime : Math.min(timestampTime, latencyAdjustedTime);

  return clampContextTime(outputTime, currentTime);
}
