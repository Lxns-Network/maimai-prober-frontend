interface SlideAppearanceTiming {
  noteTimeMs: number;
  approachTimeMs: number;
  slideDelay: number;
}

interface SlideTrackAppearance {
  alpha: number;
  isFading: boolean;
}

/** 轨迹提前变为完全不透明的判定补偿量（毫秒），实测值。 */
const SLIDE_JUDGE_ADJUST_MS = 50;
/** 淡入斜坡时长（毫秒）：透明度在此窗口内线性升至 0.5，实测值。 */
const TRACK_FADE_RAMP_MS = 200;
/** Wi-Fi 轨迹的默认透明度；普通、同时押与 BREAK 三种配色共用该值，实测值。 */
const WIFI_TRACK_ALPHA = 120 / 255;

/**
 * 把 slideDelay（-1 ~ 1，步长 0.1）映射到实测的 21 档出现时机，返回轨迹开始出现的时刻（毫秒）。
 * approachTimeMs 已覆盖完整进场窗口；slideDelay 为 0 时取第 10 档，略早于窗口中点，
 * 且最晚一档仍比 noteTimeMs 提前 approachTimeMs / 21 —— 两者均与实测一致，不是取整误差。
 */
export function getSlideAppearanceStartMs({
  noteTimeMs,
  approachTimeMs,
  slideDelay,
}: SlideAppearanceTiming): number {
  const optionIndex = Math.round((slideDelay + 1) * 10);
  return noteTimeMs - approachTimeMs + (approachTimeMs * optionIndex) / 21;
}

/**
 * 实测的「已出现 Wi-Fi 轨迹取半透明」判据：将剩余时长与绝对时刻直接相比。
 * 两侧量纲并不一致，但这正是实测行为本身——谱面开头数秒之后该条件恒成立，
 * 也正是它让已出现的 Wi-Fi 轨迹停在 0.5 而非 WIFI_TRACK_ALPHA。
 * 未经实测复核，请勿将其「修正」为同量纲比较。
 */
function isWifiTrackHalfAlpha(noteTimeMs: number, currentTimeMs: number): boolean {
  return noteTimeMs - currentTimeMs + TRACK_FADE_RAMP_MS <= currentTimeMs;
}

/**
 * 计算轨迹在 currentTimeMs（谱面毫秒）的透明度与淡入状态，与星星的移动进度无关。
 * 距 noteTimeMs 不足 SLIDE_JUDGE_ADJUST_MS 时轨迹即完全不透明，已出现的 Wi-Fi 轨迹
 * 在同一阈值恢复 WIFI_TRACK_ALPHA。淡入窗口短于 TRACK_FADE_RAMP_MS 的普通轨迹按比例
 * 折算并钳制到 [0, 0.5]，因为 Canvas 会忽略超出 [0, 1] 的 globalAlpha。
 */
export function getSlideTrackAppearance(
  timing: SlideAppearanceTiming,
  currentTimeMs: number,
  isWifi: boolean,
): SlideTrackAppearance {
  const appearanceStart = getSlideAppearanceStartMs(timing);
  if (isWifi && currentTimeMs <= appearanceStart) return { alpha: 0, isFading: false };

  if (currentTimeMs + SLIDE_JUDGE_ADJUST_MS >= timing.noteTimeMs) {
    return { alpha: isWifi ? WIFI_TRACK_ALPHA : 1, isFading: false };
  }

  const elapsed = currentTimeMs - appearanceStart;
  if (elapsed <= 0) return { alpha: 0, isFading: false };

  if (isWifi && elapsed > TRACK_FADE_RAMP_MS) {
    return {
      alpha: isWifiTrackHalfAlpha(timing.noteTimeMs, currentTimeMs) ? 0.5 : WIFI_TRACK_ALPHA,
      isFading: false,
    };
  }

  const fadeWindow = timing.noteTimeMs - appearanceStart;
  const alpha =
    isWifi || fadeWindow >= TRACK_FADE_RAMP_MS
      ? Math.min(0.5, (0.5 * elapsed) / TRACK_FADE_RAMP_MS)
      : Math.max(0, Math.min(0.5, 0.5 * (1 - (timing.noteTimeMs - currentTimeMs) / elapsed)));

  return { alpha, isFading: alpha > 0 && alpha < 0.5 };
}
