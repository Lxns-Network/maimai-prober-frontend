import { describe, expect, it } from "vitest";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { compareScores, formatScoreGap, scoreGap } from "@/utils/scoreCompare.ts";

const maimai = (
  id: number,
  type: string,
  achievements: number,
  dx_rating = 0,
  level_index = 3,
): MaimaiScoreProps => ({
  id,
  type,
  level_index,
  achievements,
  dx_rating,
  song_name: `song ${id}`,
  level: "13",
  fc: "",
  fs: "",
  dx_score: 0,
  dx_star: 0,
  rate: "sss",
  upload_time: "2026-01-01T00:00:00Z",
});

const chunithm = (id: number, score: number): ChunithmScoreProps => ({
  id,
  score,
  level_index: 3,
  song_name: `song ${id}`,
  level: "13",
  rating: 0,
  over_power: 0,
  clear: "clear",
  full_combo: "",
  full_chain: "",
  rank: "sss",
  upload_time: "2026-01-01T00:00:00Z",
});

describe("compareScores", () => {
  it("pairs charts by id, chart type and difficulty", () => {
    const mine = [maimai(1, "dx", 100.5), maimai(1, "standard", 99), maimai(2, "dx", 97)];
    const theirs = [
      maimai(1, "dx", 100.1),
      maimai(1, "standard", 99.5),
      maimai(2, "dx", 97, 0, 2),
      maimai(3, "dx", 98, 250),
      maimai(4, "dx", 99, 300),
    ];

    const result = compareScores(mine, theirs);

    expect(result.ahead.map((pair) => pair.theirs.type)).toEqual(["dx"]);
    expect(result.ahead[0].gap).toBe(0.4);
    expect(result.behind.map((pair) => pair.theirs.type)).toEqual(["standard"]);
    expect(result.tied).toEqual([]);
    expect(result.onlyTheirs.map((score) => [score.id, score.level_index])).toEqual([
      [4, 3],
      [3, 3],
      [2, 2],
    ]);
    expect(result.onlyMineCount).toBe(1);
  });

  it("treats float noise in achievements as a tie", () => {
    const result = compareScores([maimai(1, "dx", 100.1 + 0.2)], [maimai(1, "dx", 100.3)]);
    expect(result.tied).toHaveLength(1);
    expect(result.ahead).toHaveLength(0);
  });

  it("orders the largest deficits and leads first", () => {
    const mine = [chunithm(1, 1_000_000), chunithm(2, 990_000), chunithm(3, 1_009_000)];
    const theirs = [chunithm(1, 1_005_000), chunithm(2, 1_000_000), chunithm(3, 1_001_000)];

    const result = compareScores(mine, theirs);

    expect(result.behind.map((pair) => pair.gap)).toEqual([-10_000, -5_000]);
    expect(result.ahead.map((pair) => pair.gap)).toEqual([8_000]);
  });

  it("ignores unplayed placeholder scores", () => {
    const result = compareScores([maimai(1, "dx", -1)], [maimai(1, "dx", 99), maimai(2, "dx", -1)]);
    expect(result.onlyTheirs.map((score) => score.id)).toEqual([1]);
    expect(result.onlyMineCount).toBe(0);
  });
});

describe("score gap formatting", () => {
  it("formats from the current player's point of view", () => {
    expect(scoreGap(maimai(1, "dx", 99.5), maimai(1, "dx", 100.25))).toBe(-0.75);
    expect(formatScoreGap("maimai", -0.75)).toBe("-0.7500%");
    expect(formatScoreGap("chunithm", 12_345)).toBe("+12,345");
    expect(formatScoreGap("chunithm", 0)).toBe("");
  });
});
