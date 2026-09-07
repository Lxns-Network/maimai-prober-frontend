function getFinitePositiveLatency(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : null;
}

function clampContextTime(time: number, currentTime: number): number {
  return Math.max(0, Math.min(time, currentTime));
}

/**
 * 基于硬件音频输出时间戳外推当前的 AudioContext 时刻。
 *
 * 若环境不支持 getOutputTimestamp、调用抛错或时间戳字段无效，安全返回 null。
 */
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

/**
 * 获取音频输出管道的总延迟（单位：秒）。
 *
 * 优先读取 outputLatency，不可用时降级为 baseLatency，均无效则回退为 0。
 */
function getAudioOutputLatency(audioContext: AudioContext): number {
  return (
    getFinitePositiveLatency(audioContext.outputLatency) ??
    getFinitePositiveLatency(audioContext.baseLatency) ??
    0
  );
}

/**
 * 返回当前估算已到达物理输出端（即听众正在听到）的 AudioContext 时刻（秒）。
 *
 * 【调用约束】仅供视觉时钟与音画同步使用。由于该时刻已扣除输出延迟（处于过去），
 * 严禁传入 source.start() 等音频调度方法。
 *
 * 返回值始终处于 [0, audioContext.currentTime] 区间内。不支持硬件时间戳时自动退化为延迟补偿。
 */
export function getAudioContextOutputTime(audioContext: AudioContext): number {
  const currentTime = audioContext.currentTime;
  const latencyAdjustedTime = currentTime - getAudioOutputLatency(audioContext);
  const timestampTime = getTimestampContextTime(audioContext);
  // 时间戳与延迟估算并存时取较小值（保守估计），防止时间戳抖动导致画面超前于实际听感
  const outputTime =
    timestampTime === null ? latencyAdjustedTime : Math.min(timestampTime, latencyAdjustedTime);

  return clampContextTime(outputTime, currentTime);
}
