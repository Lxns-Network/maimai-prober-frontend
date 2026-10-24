import { describe, expect, it } from "vitest";
import {
  buildReleaseTimeline,
  formatReleaseDate,
  formatReleaseOffset,
  type ReleaseEntry,
} from "@/utils/releaseTimeline.ts";
import type { ChunithmDifficultyProps, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import type {
  MaimaiDifficultiesProps,
  MaimaiDifficultyProps,
  MaimaiSongProps,
} from "@/utils/api/song/maimai.ts";

const chart = (
  type: string,
  difficulty: number,
  release_date?: string,
  extra: Partial<MaimaiDifficultyProps> = {},
): MaimaiDifficultyProps => ({
  type,
  difficulty,
  level: "13",
  level_value: 13,
  note_designer: "",
  version: 25500,
  release_date,
  kanji: "",
  description: "",
  is_buddy: false,
  notes: { total: 0, tap: 0, hold: 0, slide: 0, touch: 0, break: 0 },
  ...extra,
});

const charts = (type: string, release_date: string, count = 4) =>
  Array.from({ length: count }, (_, i) => chart(type, i, release_date));

const song = (
  id: number,
  release_date: string | undefined,
  difficulties: Partial<MaimaiDifficultiesProps>,
  extra: Partial<MaimaiSongProps> = {},
): MaimaiSongProps => ({
  id,
  title: `Song ${id}`,
  artist: "Artist",
  genre: "",
  bpm: 120,
  version: 25500,
  release_date,
  difficulties: { dx: [], standard: [], utage: [], ...difficulties },
  ...extra,
});

const chunithmChart = (
  difficulty: number,
  release_date: string,
  extra: Partial<ChunithmDifficultyProps> = {},
): ChunithmDifficultyProps => ({
  difficulty,
  level: "13",
  level_value: 13,
  note_designer: "",
  origin_id: 0,
  kanji: "",
  star: 0,
  version: 24000,
  release_date,
  notes: { total: 0, tap: 0, hold: 0, slide: 0, air: 0, flick: 0 },
  ...extra,
});

const chunithmSong = (
  id: number,
  release_date: string,
  difficulties: ChunithmDifficultyProps[],
): ChunithmSongProps => ({
  id,
  title: `Song ${id}`,
  artist: "Artist",
  genre: "",
  bpm: 120,
  version: 24000,
  release_date,
  difficulties,
});

// 2026-10-24 11:00 (UTC+8)
const NOW = new Date("2026-10-24T03:00:00Z");

const summary = (days: ReturnType<typeof buildReleaseTimeline>) =>
  days.map((day) => ({
    date: day.date,
    upcoming: day.upcoming,
    songs: day.songs.map((entry) => entry.song.id),
    charts: day.charts.map((entry) => entry.song.id),
  }));

const chartKeys = (entry: ReleaseEntry) =>
  entry.charts.map(({ type, difficulty }) => `${type}:${difficulty.difficulty}`);

describe("buildReleaseTimeline", () => {
  it("groups songs by release date, newest first, and marks future days as upcoming", () => {
    const days = buildReleaseTimeline(
      [
        song(1, "2026-10-01", { dx: charts("dx", "2026-10-01") }),
        song(2, "2026-11-11", { dx: charts("dx", "2026-11-11") }),
        song(3, "2026-10-01", { standard: charts("standard", "2026-10-01") }),
      ],
      NOW,
    );

    expect(summary(days)).toEqual([
      { date: "2026-11-11", upcoming: true, songs: [2], charts: [] },
      { date: "2026-10-01", upcoming: false, songs: [1, 3], charts: [] },
    ]);
  });

  it("lists a chart added after its song under the later day, not in the song's own row", () => {
    const remaster = chart("dx", 4, "2026-10-01");
    const days = buildReleaseTimeline(
      [song(4, "2025-12-24", { dx: [...charts("dx", "2025-12-24"), remaster] })],
      NOW,
    );

    expect(summary(days)).toEqual([
      { date: "2026-10-01", upcoming: false, songs: [], charts: [4] },
      { date: "2025-12-24", upcoming: false, songs: [4], charts: [] },
    ]);
    expect(chartKeys(days[0].charts[0])).toEqual(["dx:4"]);
    expect(days[0].charts[0].charts[0].difficulty).toBe(remaster);
    expect(chartKeys(days[1].songs[0])).toEqual(["dx:0", "dx:1", "dx:2", "dx:3"]);
  });

  it("merges a song's charts added on the same later day into one entry", () => {
    const days = buildReleaseTimeline(
      [
        song(5, "2024-01-01", {
          dx: [...charts("dx", "2024-01-01"), chart("dx", 4, "2026-10-01")],
          standard: [...charts("standard", "2024-01-01"), chart("standard", 4, "2026-10-01")],
        }),
      ],
      NOW,
    );

    expect(days[0].date).toBe("2026-10-01");
    expect(days[0].charts).toHaveLength(1);
    expect(chartKeys(days[0].charts[0])).toEqual(["standard:4", "dx:4"]);
  });

  it("orders entries by song id and charts by standard, DX, utage then difficulty", () => {
    const days = buildReleaseTimeline(
      [
        song(9, "2026-10-01", { dx: charts("dx", "2026-10-01", 2) }),
        song(7, "2026-10-01", {
          dx: [chart("dx", 1, "2026-10-01"), chart("dx", 0, "2026-10-01")],
          standard: [chart("standard", 1, "2026-10-01"), chart("standard", 0, "2026-10-01")],
        }),
      ],
      NOW,
    );

    expect(days[0].songs.map((entry) => entry.song.id)).toEqual([7, 9]);
    expect(chartKeys(days[0].songs[0])).toEqual(["standard:0", "standard:1", "dx:0", "dx:1"]);
  });

  it("includes utage songs with their utage charts", () => {
    const days = buildReleaseTimeline(
      [song(100001, "2026-10-29", { utage: [chart("utage", 0, "2026-10-29", { kanji: "狂" })] })],
      NOW,
    );

    expect(summary(days)).toEqual([
      { date: "2026-10-29", upcoming: true, songs: [100001], charts: [] },
    ]);
    expect(chartKeys(days[0].songs[0])).toEqual(["utage:0"]);
  });

  it("lists a later CHUNITHM ULTIMA and WORLD'S END charts on their own release day", () => {
    const days = buildReleaseTimeline(
      [
        chunithmSong(76, "2022-09-08", [
          chunithmChart(4, "2026-09-10"),
          ...[3, 2, 1, 0].map((difficulty) => chunithmChart(difficulty, "2022-09-08")),
        ]),
        chunithmSong(8307, "2026-09-10", [
          chunithmChart(5, "2026-09-10", { kanji: "翔", star: 3 }),
        ]),
      ],
      NOW,
    );

    expect(summary(days)).toEqual([
      { date: "2026-09-10", upcoming: false, songs: [8307], charts: [76] },
      { date: "2022-09-08", upcoming: false, songs: [76], charts: [] },
    ]);
    expect(chartKeys(days[0].songs[0])).toEqual(["worldsend:5"]);
    expect(chartKeys(days[0].charts[0])).toEqual(["chunithm:4"]);
    expect(chartKeys(days[1].songs[0])).toEqual([
      "chunithm:0",
      "chunithm:1",
      "chunithm:2",
      "chunithm:3",
    ]);
  });

  it("skips disabled songs and songs without a release date", () => {
    const days = buildReleaseTimeline(
      [
        song(10, "2026-10-01", { dx: charts("dx", "2026-10-01") }, { disabled: true }),
        song(11, undefined, { dx: [chart("dx", 0, "2026-10-01")] }),
        song(12, "2026-10-01", { dx: charts("dx", "2026-10-01") }),
      ],
      NOW,
    );

    expect(summary(days)).toEqual([
      { date: "2026-10-01", upcoming: false, songs: [12], charts: [] },
    ]);
  });

  it("treats a day as upcoming until 07:00 Beijing time on that day", () => {
    const list = [song(13, "2026-10-24", { dx: charts("dx", "2026-10-24") })];

    expect(buildReleaseTimeline(list, new Date("2026-10-23T22:59:59Z"))[0].upcoming).toBe(true);
    expect(buildReleaseTimeline(list, new Date("2026-10-23T23:00:00Z"))[0].upcoming).toBe(false);
  });

  it("does not mutate the song list", () => {
    const list = [
      song(15, "2026-10-01", { dx: charts("dx", "2026-10-01") }),
      song(14, "2026-11-11", { dx: charts("dx", "2026-11-11") }),
    ];
    const snapshot = structuredClone(list);

    buildReleaseTimeline(list, NOW);

    expect(list).toEqual(snapshot);
  });
});

describe("formatReleaseDate", () => {
  it("omits the year within the current Beijing-time year", () => {
    expect(formatReleaseDate("2026-11-11", NOW)).toBe("11月11日 周三");
    expect(formatReleaseDate("2026-10-01", NOW)).toBe("10月1日 周四");
  });

  it("includes the year for other years", () => {
    expect(formatReleaseDate("2025-12-24", NOW)).toBe("2025年12月24日 周三");
  });

  it("decides the current year in Beijing time", () => {
    // 2026-01-01 01:00 (UTC+8)
    const newYear = new Date("2025-12-31T17:00:00Z");

    expect(formatReleaseDate("2025-12-24", newYear)).toBe("2025年12月24日 周三");
  });
});

describe("formatReleaseOffset", () => {
  // 2026-10-24 01:00 (UTC+8), still 2026-10-23 in UTC
  const earlyMorning = new Date("2026-10-23T17:00:00Z");

  it("counts calendar days in Beijing time", () => {
    expect(formatReleaseOffset("2026-10-24", earlyMorning)).toBe("今天");
    expect(formatReleaseOffset("2026-10-29", earlyMorning)).toBe("5 天后");
    expect(formatReleaseOffset("2026-10-01", earlyMorning)).toBe("23 天前");
  });

  it("switches to months and years for distant days", () => {
    expect(formatReleaseOffset("2026-09-24", NOW)).toBe("1 个月前");
    expect(formatReleaseOffset("2026-08-05", NOW)).toBe("2 个月前");
    expect(formatReleaseOffset("2025-09-24", NOW)).toBe("1 年前");
    expect(formatReleaseOffset("2027-01-01", NOW)).toBe("2 个月后");
  });
});
