import { Game } from "@/types/game";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import {
  ChunithmSongList,
  ChunithmSongProps,
  getDifficulty as getChunithmDifficulty,
} from "@/utils/api/song/chunithm.ts";
import {
  MaimaiSongList,
  MaimaiSongProps,
  getDifficulty as getMaimaiDifficulty,
} from "@/utils/api/song/maimai.ts";
import { isUtageOrWorldsEnd } from "@/utils/score.ts";

type AnyScore = MaimaiScoreProps | ChunithmScoreProps;

/** 对比依据：`score` 为舞萌 DX 达成率或中二节奏分数；`dx_score` 仅舞萌 DX 有效。 */
export type CompareMetric = "score" | "dx_score";

export const chartKey = (score: AnyScore) =>
  `${score.id}:${"type" in score ? score.type : ""}:${score.level_index}`;

/** 舞萌 DX 取达成率，中二节奏取分数；曲目页用 -1 表示未游玩。 */
export const scoreValue = (score: AnyScore) =>
  "achievements" in score ? score.achievements : score.score;

/** 单曲 Rating，与成绩卡片显示一致：舞萌 DX 取 `dx_rating` 的整数部分，中二节奏的 `rating` 截断到 2 位小数。 */
const scoreRating = (score: AnyScore) =>
  "dx_rating" in score ? Math.floor(score.dx_rating) : Math.floor(score.rating * 100) / 100;

/**
 * 当前账号视角的单曲 Rating 差：负数表示追上 TA 的成绩后自己这张谱面能涨多少；未游玩按 0 计。
 * 中二节奏 Rating 按 2 位小数取整，避免浮点误差。
 */
export const ratingGap = (mine: AnyScore | undefined, theirs: AnyScore) => {
  const gap = (mine ? scoreRating(mine) : 0) - scoreRating(theirs);
  return "dx_rating" in theirs ? gap : Math.round(gap * 100) / 100;
};

/** 谱面定数；宴谱、WORLD'S END 没有定数，与曲目列表里找不到的谱面一样为 `undefined`。 */
export const chartLevelValue = (songList: MaimaiSongList | ChunithmSongList, score: AnyScore) => {
  if (isUtageOrWorldsEnd(score)) return undefined;
  const song = songList.find(score.id);
  if (!song) return undefined;
  const difficulty =
    "type" in score
      ? getMaimaiDifficulty(song as MaimaiSongProps, score.type, score.level_index)
      : getChunithmDifficulty(song as ChunithmSongProps, score.level_index);
  return difficulty?.level_value;
};

export const metricValue = (score: AnyScore, metric: CompareMetric = "score") =>
  metric === "dx_score" && "dx_score" in score ? score.dx_score : scoreValue(score);

/**
 * 以当前账号视角计算的差值：正数表示领先。
 * 达成率按 4 位小数取整，避免浮点误差把相同成绩算成微小差距。
 */
export const scoreGap = (mine: AnyScore, theirs: AnyScore, metric: CompareMetric = "score") => {
  const gap = metricValue(mine, metric) - metricValue(theirs, metric);
  return metric === "score" && "achievements" in mine ? Math.round(gap * 10000) / 10000 : gap;
};

export const formatScoreValue = (score: AnyScore, metric: CompareMetric = "score") => {
  if (metric === "dx_score" && "dx_score" in score) return score.dx_score.toLocaleString("en-US");
  return "achievements" in score
    ? `${score.achievements.toFixed(4)}%`
    : score.score.toLocaleString("en-US");
};

export const formatScoreGap = (game: Game, gap: number, metric: CompareMetric = "score") => {
  if (gap === 0) return "";
  const sign = gap > 0 ? "+" : "-";
  const magnitude = Math.abs(gap);
  return game === "maimai" && metric === "score"
    ? `${sign}${magnitude.toFixed(4)}%`
    : `${sign}${magnitude.toLocaleString("en-US")}`;
};

export const indexByChart = <T extends AnyScore>(scores: T[]) =>
  new Map(scores.map((score) => [chartKey(score), score]));

export interface ScorePair<T extends AnyScore = AnyScore> {
  mine: T;
  theirs: T;
  gap: number;
}

export interface ScoreComparison<T extends AnyScore = AnyScore> {
  ahead: ScorePair<T>[];
  behind: ScorePair<T>[];
  tied: ScorePair<T>[];
  onlyTheirs: T[];
  onlyMineCount: number;
}

export function compareScores<T extends AnyScore>(
  mine: T[],
  theirs: T[],
  metric: CompareMetric = "score",
): ScoreComparison<T> {
  const played = (score: T) => scoreValue(score) >= 0;
  const myIndex = indexByChart(mine.filter(played));
  const result: ScoreComparison<T> = {
    ahead: [],
    behind: [],
    tied: [],
    onlyTheirs: [],
    onlyMineCount: 0,
  };
  const matched = new Set<string>();

  for (const their of theirs.filter(played)) {
    const key = chartKey(their);
    const my = myIndex.get(key);
    if (!my) {
      result.onlyTheirs.push(their);
      continue;
    }
    matched.add(key);
    const pair = { mine: my, theirs: their, gap: scoreGap(my, their, metric) };
    if (pair.gap > 0) result.ahead.push(pair);
    else if (pair.gap < 0) result.behind.push(pair);
    else result.tied.push(pair);
  }

  result.ahead.sort((a, b) => b.gap - a.gap);
  result.behind.sort((a, b) => a.gap - b.gap);
  result.onlyTheirs.sort((a, b) => scoreRating(b) - scoreRating(a));
  result.onlyMineCount = myIndex.size - matched.size;
  return result;
}
