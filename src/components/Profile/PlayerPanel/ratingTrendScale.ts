import dayjs from "dayjs";
import { getNiceTickValues } from "recharts";

const MAX_X_TICKS = 5;
const MAX_Y_TICKS = 5;

/** Parses backend `YYYY-MM-DD` trend dates as local calendar days, not UTC midnight. */
export const parseTrendDate = (date: string | number) => dayjs(date).valueOf();

/** Returns ticks inside `[left, right]` aligned to local midnights, or month starts for long ranges. */
export const getTrendDateTicks = (left: number, right: number): number[] => {
  if (right < left) return [];
  const start = dayjs(left).startOf("day");
  const firstDay = start.valueOf() < left ? start.add(1, "day") : start;
  const days = dayjs(right).startOf("day").diff(firstDay, "day") + 1;
  if (days <= 0) return [];

  const dayStep = Math.ceil(days / MAX_X_TICKS);
  if (dayStep < 30) {
    return Array.from({ length: Math.ceil(days / dayStep) }, (_, i) =>
      firstDay.add(i * dayStep, "day").valueOf(),
    );
  }

  const monthStart = dayjs(left).startOf("month");
  const firstMonth = monthStart.valueOf() < left ? monthStart.add(1, "month") : monthStart;
  const months = dayjs(right).startOf("month").diff(firstMonth, "month") + 1;
  const monthStep = Math.ceil(months / MAX_X_TICKS);
  return Array.from({ length: Math.ceil(months / monthStep) }, (_, i) =>
    firstMonth.add(i * monthStep, "month").valueOf(),
  );
};

const interpolateAt = (points: { date: number; value: number }[], time: number) => {
  const nextIndex = points.findIndex((point) => point.date >= time);
  if (nextIndex <= 0) return undefined;
  const prev = points[nextIndex - 1];
  const next = points[nextIndex];
  return prev.value + ((next.value - prev.value) * (time - prev.date)) / (next.date - prev.date);
};

/**
 * Fits Y ticks to the visible range, including line values at range edges between records.
 * Returns `undefined` when nothing is drawn.
 */
export const getTrendValueTicks = (
  points: { date: number; value: number }[],
  left: number,
  right: number,
  allowDecimals: boolean,
): number[] | undefined => {
  const values = points
    .filter((point) => point.date >= left && point.date <= right)
    .map((point) => point.value);
  for (const edge of [left, right]) {
    const value = interpolateAt(points, edge);
    if (value !== undefined) values.push(value);
  }
  if (values.length === 0) return undefined;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = min === max ? (allowDecimals ? 0.01 : 1) : 0;
  return getNiceTickValues([min - padding, max + padding], MAX_Y_TICKS, allowDecimals);
};
