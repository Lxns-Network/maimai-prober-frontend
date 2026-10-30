import { Game } from "@/types/game";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";

type AnyScore = MaimaiScoreProps | ChunithmScoreProps;

/** 同一张谱面的键；舞萌 DX 的标准谱与 DX 谱是不同谱面。 */
export const chartKey = (score: AnyScore) =>
  `${score.id}:${"type" in score ? score.type : ""}:${score.level_index}`;

/** 舞萌 DX 取达成率，中二节奏取分数；曲目页用 -1 表示未游玩。 */
export const scoreValue = (score: AnyScore) =>
  "achievements" in score ? score.achievements : score.score;

const ratingOf = (score: AnyScore) => ("dx_rating" in score ? score.dx_rating : score.rating);

/**
 * 以当前账号视角计算的差值：正数表示领先。
 * 达成率按 4 位小数取整，避免浮点误差把相同成绩算成微小差距。
 */
export const scoreGap = (mine: AnyScore, theirs: AnyScore) => {
  const gap = scoreValue(mine) - scoreValue(theirs);
  return "achievements" in mine ? Math.round(gap * 10000) / 10000 : gap;
};

export const formatScoreValue = (score: AnyScore) =>
  "achievements" in score
    ? `${score.achievements.toFixed(4)}%`
    : score.score.toLocaleString("en-US");

/** 带正负号的差值；0 返回空字符串。 */
export const formatScoreGap = (game: Game, gap: number) => {
  if (gap === 0) return "";
  const sign = gap > 0 ? "+" : "-";
  const magnitude = Math.abs(gap);
  return game === "maimai"
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
  /** 差距从大到小。 */
  ahead: ScorePair<T>[];
  /** 落后最多的在前。 */
  behind: ScorePair<T>[];
  tied: ScorePair<T>[];
  /** 对方玩过、当前账号未游玩的谱面，按单曲 Rating 从高到低。 */
  onlyTheirs: T[];
  onlyMineCount: number;
}

/** 按谱面配对双方成绩；忽略未游玩的占位成绩。 */
export function compareScores<T extends AnyScore>(mine: T[], theirs: T[]): ScoreComparison<T> {
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
    const pair = { mine: my, theirs: their, gap: scoreGap(my, their) };
    if (pair.gap > 0) result.ahead.push(pair);
    else if (pair.gap < 0) result.behind.push(pair);
    else result.tied.push(pair);
  }

  result.ahead.sort((a, b) => b.gap - a.gap);
  result.behind.sort((a, b) => a.gap - b.gap);
  result.onlyTheirs.sort((a, b) => ratingOf(b) - ratingOf(a));
  result.onlyMineCount = myIndex.size - matched.size;
  return result;
}
