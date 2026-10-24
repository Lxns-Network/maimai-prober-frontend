import type { MaimaiDifficultyProps, MaimaiSongProps } from "@/utils/api/song/maimai.ts";

export type ReleaseChartType = "standard" | "dx" | "utage";

export interface ReleaseChart {
  type: ReleaseChartType;
  difficulty: MaimaiDifficultyProps;
}

export interface ReleaseEntry {
  song: MaimaiSongProps;
  charts: ReleaseChart[];
}

export interface ReleaseDay {
  date: string;
  upcoming: boolean;
  songs: ReleaseEntry[];
  charts: ReleaseEntry[];
}

const CHART_TYPES: ReleaseChartType[] = ["standard", "dx", "utage"];
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const BEIJING_OFFSET_MS = 8 * HOUR_MS;
const RELEASE_HOUR = 7;
const WEEKDAYS = "日一二三四五六";

const dateValue = (date: string) => Date.parse(`${date}T00:00:00Z`);

const beijingToday = (now: Date) =>
  new Date(now.getTime() + BEIJING_OFFSET_MS).toISOString().slice(0, 10);

const isUpcoming = (date: string, now: Date) =>
  now.getTime() < dateValue(date) + RELEASE_HOUR * HOUR_MS - BEIJING_OFFSET_MS;

const dayOffset = (date: string, now: Date) =>
  Math.round((dateValue(date) - dateValue(beijingToday(now))) / DAY_MS);

/** 按配信日期分组，最新的在前；后补的谱面列在其配信日的 charts 中。 */
export function buildReleaseTimeline(songs: MaimaiSongProps[], now: Date): ReleaseDay[] {
  const days = new Map<string, ReleaseDay>();
  const dayFor = (date: string) => {
    let day = days.get(date);
    if (!day) {
      day = { date, upcoming: isUpcoming(date, now), songs: [], charts: [] };
      days.set(date, day);
    }
    return day;
  };

  for (const song of [...songs].sort((a, b) => a.id - b.id)) {
    const songDate = song.release_date;
    if (song.disabled || !songDate) continue;

    const chartsByDate = new Map<string, ReleaseChart[]>();
    for (const type of CHART_TYPES) {
      const difficulties = [...(song.difficulties[type] ?? [])].sort(
        (a, b) => a.difficulty - b.difficulty,
      );
      for (const difficulty of difficulties) {
        const date = difficulty.release_date ?? songDate;
        const list = chartsByDate.get(date) ?? [];
        list.push({ type, difficulty });
        chartsByDate.set(date, list);
      }
    }

    dayFor(songDate).songs.push({ song, charts: chartsByDate.get(songDate) ?? [] });
    for (const [date, charts] of chartsByDate) {
      if (date !== songDate) dayFor(date).charts.push({ song, charts });
    }
  }

  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function formatReleaseDate(date: string, now: Date): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(dateValue(date)).getUTCDay()];
  const yearPrefix = String(year) === beijingToday(now).slice(0, 4) ? "" : `${year}年`;
  return `${yearPrefix}${month}月${day}日 周${weekday}`;
}

export function formatReleaseOffset(date: string, now: Date): string {
  const offset = dayOffset(date, now);
  if (offset === 0) return "今天";
  const days = Math.abs(offset);
  const suffix = offset > 0 ? "后" : "前";
  if (days < 30) return `${days} 天${suffix}`;
  if (days < 365) return `${Math.floor(days / 30)} 个月${suffix}`;
  return `${Math.floor(days / 365)} 年${suffix}`;
}
