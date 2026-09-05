interface SlideAppearanceTiming {
  noteTimeMs: number;
  approachTimeMs: number;
  slideDelay: number;
}

interface SlideTrackAppearance {
  alpha: number;
  isFading: boolean;
}

/**
 * Maps slideDelay (-1 to 1 in 0.1 steps) to 21 positions within the supplied
 * approach window; zero selects position index 10.
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
 * Returns track opacity in chart milliseconds, independently of star movement.
 * Short ordinary fades are clamped for Canvas, which ignores out-of-range alpha.
 * At the note time, ordinary tracks become opaque and Wi-Fi tracks use 120/255.
 */
export function getSlideTrackAppearance(
  timing: SlideAppearanceTiming,
  currentTimeMs: number,
  isWifi: boolean,
): SlideTrackAppearance {
  if (currentTimeMs >= timing.noteTimeMs) {
    return { alpha: isWifi ? 120 / 255 : 1, isFading: false };
  }

  const appearanceStart = getSlideAppearanceStartMs(timing);
  const elapsed = currentTimeMs - appearanceStart;
  if (elapsed <= 0) return { alpha: 0, isFading: false };

  const fadeWindow = timing.noteTimeMs - appearanceStart;
  const alpha =
    isWifi || fadeWindow >= 200
      ? Math.min(0.5, (0.5 * elapsed) / 200)
      : Math.max(0, Math.min(0.5, 0.5 * (1 - (timing.noteTimeMs - currentTimeMs) / elapsed)));

  return { alpha, isFading: alpha > 0 && alpha < 0.5 };
}
