import {
  calculateChunithmRating,
  CHUNITHM_MAX_SCORE,
  minimumScore,
} from "@/utils/chunithm/rating.ts";

/**
 * Full Combo 达成标记。
 * - `""`: 未达成 Full Combo
 * - `"fullcombo"`: Full Combo (FC)
 * - `"alljustice"`: All Justice (AJ)
 * - `"alljusticecritical"`: All Justice Critical (AJC)
 */
export type ChunithmCombo = "" | "fullcombo" | "alljustice" | "alljusticecritical";

/**
 * 计算单曲 Over Power (OP) 及其各组成项与完成率。
 *
 * 契约与规则（与后端 CalculateOverPower 一致）：
 * - 理论最大 OP：`maximum = (levelValue + 3) * 5`。
 * - 分数 OP (`scorePower`)：
 *   - `score > 1,007,500` (SSS 以上)：`(levelValue + 2) * 5 + (score - 1007500) * 0.0015`
 *     （突破 Rating 的 1,009,000 封顶限制，以 0.0015 OP/分的斜率持续增长至 1,010,000 理论值）。
 *   - `score <= 1,007,500`：`rating * 5`（采用未截断的单曲 Rating × 5）。
 * - Full Combo 加成 (`comboBonus`)：仅在 `score >= 975,000` (Rank S 及以上) 时生效；未达 S 或无 FC 为 0：
 *   - `fullcombo` (FC): +0.5 OP
 *   - `alljustice` (AJ) / `alljusticecritical` (AJC): +1.0 OP
 * - 理论值加成 (`theoryBonus`)：`score === 1,010,000` 时赋予 +0.25 OP。
 * - 理论值闭环：AJC 满分时 `scorePower` (`levelValue * 5 + 13.75`) + `comboBonus` (1.0) + `theoryBonus` (0.25)
 *   = `(levelValue + 3) * 5` = `maximum`，完成率恰好为 100%。
 *
 * @param levelValue 谱面定数（单位：定数）
 * @param score 结算分数（单位：分，范围 0 ~ 1,010,000）
 * @param combo Full Combo 达成标记
 * @returns Over Power 详情对象（含分数 OP、combo 加成 OP、理论值加成 OP、总 OP、理论最大 OP、完成率百分比）
 */
export function getChunithmOverPower(levelValue: number, score: number, combo: ChunithmCombo) {
  const rating = calculateChunithmRating(levelValue, score);
  const scorePower =
    score > 1007500 ? (levelValue + 2) * 5 + (score - 1007500) * 0.0015 : rating * 5;
  const comboBonus = score < 975000 || !combo ? 0 : combo === "fullcombo" ? 0.5 : 1;
  const theoryBonus = score === CHUNITHM_MAX_SCORE ? 0.25 : 0;
  const total = scorePower + comboBonus + theoryBonus;
  const maximum = (levelValue + 3) * 5;
  return {
    scorePower,
    comboBonus,
    theoryBonus,
    total,
    maximum,
    percentage: (total / maximum) * 100,
  };
}

/**
 * 反查在指定 Full Combo 状态与谱面定数下达到目标 Over Power 完成率所需的最低整数分数。
 *
 * 契约与边界约束：
 * - 未达成 Full Combo (`""`) 与普通 `fullcombo` 状态下，理论最高分数限制为 `1,009,999` 分（即 `CHUNITHM_MAX_SCORE - 1`），
 *   因 1,010,000 理论值结算必然包含 All Justice Critical，不可能在无 FC 或仅 FC 状态下取得。
 * - `alljustice` 状态下允许达到 `CHUNITHM_MAX_SCORE` (1,010,000 分)，届时自动激活 AJC 理论值加成以达到 100% 完成率。
 *
 * @param levelValue 谱面定数（单位：定数）
 * @param targetPercentage 目标 Over Power 完成率（单位：%，范围 0 ~ 100）
 * @param combo 预期的 Full Combo 达成标记
 * @returns 满足目标完成率的最低整数分数（单位：分）；若在指定 combo 条件下无法达到该完成率或入参非法则返回 null
 */
export function requiredChunithmOverPowerScore(
  levelValue: number,
  targetPercentage: number,
  combo: ChunithmCombo,
): number | null {
  if (!Number.isFinite(targetPercentage) || targetPercentage < 0 || targetPercentage > 100)
    return null;
  const maximumScore =
    combo === "" || combo === "fullcombo" ? CHUNITHM_MAX_SCORE - 1 : CHUNITHM_MAX_SCORE;
  return minimumScore(
    ((levelValue + 3) * 5 * targetPercentage) / 100,
    maximumScore,
    (score) => getChunithmOverPower(levelValue, score, combo).total,
  );
}
