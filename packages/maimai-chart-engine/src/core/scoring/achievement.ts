export type MaimaiAchievementNoteType = "tap" | "hold" | "slide" | "touch" | "break";

export type MaimaiAchievementNoteCounts = Record<MaimaiAchievementNoteType, number>;

export const MAIMAI_ACHIEVEMENT_BASIC = {
  perfect: {
    tap: 1,
    hold: 2,
    slide: 3,
    touch: 1,
    break: 5,
  },
  great: {
    tap: 0.8,
    hold: 1.6,
    slide: 2.4,
    touch: 0.8,
    break: [4, 3, 2.5],
  },
  good: {
    tap: 0.5,
    hold: 1,
    slide: 1.5,
    touch: 0.5,
    break: 2,
  },
  miss: {
    tap: 0,
    hold: 0,
    slide: 0,
    touch: 0,
    break: 0,
  },
};

export const MAIMAI_ACHIEVEMENT_BREAK_BONUS = {
  critical_perfect: 1,
  perfect: [0.75, 0.5],
  great: 0.4,
  good: 0.3,
  miss: 0,
};

export function calculateMaimaiAchievementBaseTotal(notes: MaimaiAchievementNoteCounts): number {
  const weights = MAIMAI_ACHIEVEMENT_BASIC.perfect;
  return (
    notes.tap * weights.tap +
    notes.hold * weights.hold +
    notes.slide * weights.slide +
    notes.touch * weights.touch +
    notes.break * weights.break
  );
}

export function calculateMaimaiAchievementProgress(
  completed: MaimaiAchievementNoteCounts,
  total: MaimaiAchievementNoteCounts,
): number {
  const baseTotal = calculateMaimaiAchievementBaseTotal(total);
  if (baseTotal <= 0) return 0;

  const baseProgress = (calculateMaimaiAchievementBaseTotal(completed) / baseTotal) * 100;
  const breakBonus =
    total.break > 0
      ? (completed.break * MAIMAI_ACHIEVEMENT_BREAK_BONUS.critical_perfect) / total.break
      : 0;

  return baseProgress + breakBonus;
}
