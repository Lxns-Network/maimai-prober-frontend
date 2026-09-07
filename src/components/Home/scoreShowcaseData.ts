import type { MaimaiScoreProps } from "@/types/score";
import type { MaimaiSongProps } from "@/utils/api/song/maimai";
import { calculateMaimaiRating } from "@/utils/rating";
import showcaseSongJson from "./scoreShowcaseSong.json";

interface ShowcaseEntry {
  id: number;
  title: string;
  type: "standard" | "dx";
  level: string;
  levelValue: number;
  notes: number;
  achievements: number;
  fc: string;
  fs: string;
}

// 条数要够铺满自适应高度的场景，否则列表下方会留空
const showcaseEntries: ShowcaseEntry[] = [
  {
    id: 834,
    title: "PANDORA PARADOXXX",
    type: "standard",
    level: "14+",
    levelValue: 14.9,
    notes: 1309,
    achievements: 100.6832,
    fc: "ap",
    fs: "fsdp",
  },
  {
    id: 456,
    title: "Glorious Crown",
    type: "standard",
    level: "14+",
    levelValue: 14.8,
    notes: 1150,
    achievements: 100.5124,
    fc: "fc",
    fs: "fsd",
  },
  {
    id: 1223,
    title: "Heavenly Blast",
    type: "dx",
    level: "14+",
    levelValue: 14.8,
    notes: 1169,
    achievements: 100.2087,
    fc: "fc",
    fs: "fs",
  },
  {
    id: 384,
    title: "VERTeX",
    type: "standard",
    level: "14+",
    levelValue: 14.7,
    notes: 888,
    achievements: 100.0341,
    fc: "fcp",
    fs: "fs",
  },
  {
    id: 833,
    title: "the EmpErroR",
    type: "standard",
    level: "14+",
    levelValue: 14.8,
    notes: 1057,
    achievements: 99.8712,
    fc: "fc",
    fs: "fsp",
  },
  {
    id: 1106,
    title: "Valsqotch",
    type: "dx",
    level: "14+",
    levelValue: 14.7,
    notes: 1194,
    achievements: 99.7245,
    fc: "",
    fs: "fs",
  },
  {
    id: 799,
    title: "QZKago Requiem",
    type: "standard",
    level: "14+",
    levelValue: 14.8,
    notes: 1105,
    achievements: 99.5108,
    fc: "fc",
    fs: "",
  },
];

const UPLOAD_TIME = "2026-08-30T12:00:00+08:00";

const rateOf = (achievements: number) =>
  achievements >= 100.5
    ? "sssp"
    : achievements >= 100
      ? "sss"
      : achievements >= 99.5
        ? "ssp"
        : "ss";

function createScore(
  entry: ShowcaseEntry,
  achievements: number,
  uploadTime: string,
  extra: Partial<MaimaiScoreProps> = {},
): MaimaiScoreProps {
  return {
    id: entry.id,
    song_name: entry.title,
    level: entry.level,
    level_index: 3,
    achievements,
    dx_rating: calculateMaimaiRating(entry.levelValue, achievements),
    fc: entry.fc,
    fs: entry.fs,
    dx_score: Math.floor(entry.notes * 3 * 0.96),
    dx_star: 3,
    rate: rateOf(achievements),
    type: entry.type,
    upload_time: uploadTime,
    ...extra,
  };
}

/** 首页「成绩列表」示例用的模拟成绩。 */
export const showcaseScores: MaimaiScoreProps[] = showcaseEntries.map((entry) =>
  createScore(entry, entry.achievements, UPLOAD_TIME),
);

const historyEntry = showcaseEntries.find((entry) => entry.id === showcaseSongJson.id)!;

const historyRecords: [string, number][] = [
  ["2026-06-03", 99.2145],
  ["2026-06-12", 99.6032],
  ["2026-06-21", 99.8541],
  ["2026-07-03", 100.1287],
  ["2026-07-12", 100.2087],
  ["2026-07-21", 100.412],
  ["2026-08-03", 100.5124],
];

/** 首页「成绩详情」示例用的同一谱面多次游玩记录，按时间升序。 */
export const showcaseHistory: MaimaiScoreProps[] = historyRecords.map(([date, achievements]) =>
  createScore(historyEntry, achievements, `${date}T20:00:00+08:00`),
);

/** 首页「成绩详情」示例用的曲目，只保留了标准谱面的难度数据。 */
export const showcaseSong = showcaseSongJson as unknown as MaimaiSongProps;

/** 首页「成绩详情」示例用的成绩，对应 showcaseSong 的 MASTER 谱面。 */
export const showcaseDetailScore: MaimaiScoreProps = {
  ...showcaseHistory[showcaseHistory.length - 1],
  last_played_time: "2026-08-03T19:42:00+08:00",
};
