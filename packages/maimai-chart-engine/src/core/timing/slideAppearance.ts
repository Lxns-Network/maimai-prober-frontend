interface SlideAppearanceTiming {
  noteTimeMs: number;
  approachTimeMs: number;
  slideDelay: number;
}

interface SlideTrackAppearance {
  alpha: number;
  isFading: boolean;
}

/** 轨迹提前变完全不透明的判定补偿量（50ms），实测值。 */
const SLIDE_JUDGE_ADJUST_MS = 50;
/** 淡入斜坡时长（200ms）：透明度在线性升至 0.5 的窗口，实测值。 */
const TRACK_FADE_RAMP_MS = 200;
/** Wi-Fi 轨迹的默认透明度（120/255）；普通、同时押和 BREAK 共用，实测值。 */
const WIFI_TRACK_ALPHA = 120 / 255;

/**
 * 把 slideDelay（-1 ~ 1，步长 0.1）映射到实测的 21 档出现时机，算轨迹开始出现的绝对时刻（ms）。
 * approachTimeMs 覆盖完整进场窗口；slideDelay 为 0 时对应第 10 档，略早于中点；
 * 最晚一档仍比 noteTimeMs 提前 approachTimeMs / 21 —— 这两处都是实测行为，别当成取整误差改掉了。
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
 * 实测中「已出现的 Wi-Fi 轨迹取半透明」的判定条件：直接把剩余时长与绝对时刻相比。
 * 两边量纲根本不一致，但实测表现就是这样——谱面开头几秒后恒成立，
 * 刚好让已出现的 Wi-Fi 轨迹停在 0.5 而不是 WIFI_TRACK_ALPHA。
 * 没有新的实测采样前，千万别自作主张把它“修”成同量纲比较。
 */
function isWifiTrackHalfAlpha(noteTimeMs: number, currentTimeMs: number): boolean {
  return noteTimeMs - currentTimeMs + TRACK_FADE_RAMP_MS <= currentTimeMs;
}

/**
 * 计算轨迹在当前时刻（currentTimeMs，ms）的透明度与淡入状态（只管轨迹本身，和星星走到哪无关）。
 * 普通轨迹淡入被限制在 [0, 0.5]，因为 Canvas 会直接忽略超出 [0, 1] 的 globalAlpha。
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
