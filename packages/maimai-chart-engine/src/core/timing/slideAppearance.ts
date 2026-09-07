interface SlideAppearanceTiming {
  noteTimeMs: number;
  approachTimeMs: number;
  slideDelay: number;
}

interface SlideTrackAppearance {
  alpha: number;
  isFading: boolean;
}

const SLIDE_JUDGE_ADJUST_MS = 50;
// SDGB 1.55 SlideFan._laneColor stores this alpha for ordinary, simultaneous and BREAK tracks.
const WIFI_TRACK_ALPHA = 120 / 255;

/**
 * Maps slideDelay (-1 to 1 in 0.1 steps) to the arcade's 21 appearance positions.
 * The engine's approachTimeMs already spans the arcade's DefaultMsec * 2 window;
 * zero selects position index 10, slightly before half of that window has elapsed.
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
 * Ports the `num3 + 200f <= currentMsec` branch of SlideFan.UpdateAlpha (SDGB
 * 1.55 SlideFan.cs:181), where num3 is the time remaining until note time.
 * Comparing that remaining time against an absolute timestamp mixes units, but
 * the quirk is the arcade's own: it holds from a few seconds into any chart
 * onwards, which is what keeps visible Wi-Fi tracks at 0.5 instead of their
 * default alpha. Do not normalize the units without re-checking the arcade.
 */
function isArcadeWifiHalfAlpha(noteTimeMs: number, currentTimeMs: number): boolean {
  return noteTimeMs - currentTimeMs + 200 <= currentTimeMs;
}

/**
 * Returns track opacity in chart milliseconds, independently of star movement.
 * Short ordinary fades are clamped for Canvas, which ignores out-of-range alpha.
 * The arcade's JudgeAdjustMs makes ordinary tracks opaque 50 ms before note time;
 * visible Wi-Fi tracks restore their default alpha at the same threshold.
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

  if (isWifi && elapsed > 200) {
    return {
      alpha: isArcadeWifiHalfAlpha(timing.noteTimeMs, currentTimeMs) ? 0.5 : WIFI_TRACK_ALPHA,
      isFading: false,
    };
  }

  const fadeWindow = timing.noteTimeMs - appearanceStart;
  const alpha =
    isWifi || fadeWindow >= 200
      ? Math.min(0.5, (0.5 * elapsed) / 200)
      : Math.max(0, Math.min(0.5, 0.5 * (1 - (timing.noteTimeMs - currentTimeMs) / elapsed)));

  return { alpha, isFading: alpha > 0 && alpha < 0.5 };
}
