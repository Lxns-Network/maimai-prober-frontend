/** 谱面理论值（All Justice Critical）结算分数。量纲：分。 */
export const CHUNITHM_MAX_SCORE = 1010000;

/** 单曲 Rating 增长封顶阈值（达到 SSS+ 的最低分数）；超出后 Rating 不再增长。量纲：分。 */
export const CHUNITHM_RATING_CAP_SCORE = 1009000;

/** 谱面定数上限保护值。量纲：定数。 */
export const CHUNITHM_MAX_CONSTANT = 16;

/**
 * 计算单曲结算 Rating（未截断浮点值）。
 *
 * 契约与边界：
 * - 返回未向下截断的原始浮点 Rating，展示时需由调用方按需截断（如配合 {@link truncateChunithmValue}）。
 * - 计算结果兜底最小值为 0（低定数低分计算为负值时截断至 0）。
 * - 分数达到 {@link CHUNITHM_RATING_CAP_SCORE} (1,009,000 分) 时 Rating 封顶为 `levelValue + 2.15`，继续提分不会增加。
 *
 * 实测分段线性回归公式（与后端 CalculateRating 一致，分数单位：分）：
 * - `score >= 1,009,000` (SSS+): `levelValue + 2.15`
 * - `[1,007,500, 1,009,000)` (SSS): `levelValue + 2.0 + (score - 1,007,500) / 10,000`
 * - `[1,005,000, 1,007,500)` (SS+): `levelValue + 1.5 + (score - 1,005,000) / 5,000`
 * - `[1,000,000, 1,005,000)` (SS): `levelValue + 1.0 + (score - 1,000,000) / 10,000`
 * - `[975,000, 1,000,000)` (S): `levelValue + (score - 975,000) / 25,000`
 * - `[925,000, 975,000)` (AA): `levelValue - 3.0 + ((score - 925,000) / 50,000) * 3`
 * - `[900,000, 925,000)` (A): `levelValue - 5.0 + ((score - 900,000) / 25,000) * 2`
 * - `[800,000, 900,000)` (BBB): `((levelValue - 5.0) / 2) * (1 + (score - 800,000) / 100,000)`
 * - `[500,000, 800,000)` (C ~ BB): `((score - 500,000) / 300,000) * ((levelValue - 5.0) / 2)`
 * - `< 500,000` (D): `0`
 *
 * @param levelValue 谱面定数（单位：定数）
 * @param score 结算分数（单位：分，范围 0 ~ 1,010,000）
 * @returns 单曲 Rating（单位：Rating，未截断浮点数，最小值为 0）
 */
export function calculateChunithmRating(levelValue: number, score: number): number {
  let rating = 0;
  if (score >= 1009000) rating = levelValue + 2.15;
  else if (score >= 1007500) rating = levelValue + 2 + (score - 1007500) / 10000;
  else if (score >= 1005000) rating = levelValue + 1.5 + (score - 1005000) / 5000;
  else if (score >= 1000000) rating = levelValue + 1 + (score - 1000000) / 10000;
  else if (score >= 975000) rating = levelValue + (score - 975000) / 25000;
  else if (score >= 925000) rating = levelValue - 3 + ((score - 925000) / 50000) * 3;
  else if (score >= 900000) rating = levelValue - 5 + ((score - 900000) / 25000) * 2;
  else if (score >= 800000) rating = ((levelValue - 5) / 2) * (1 + (score - 800000) / 100000);
  else if (score >= 500000) rating = ((score - 500000) / 300000) * ((levelValue - 5) / 2);
  return Math.max(0, rating);
}

/**
 * 向下截断数值至指定小数位数（舍去末尾，非四舍五入）。
 *
 * 容差依据：
 * - 加入 `1e-8` 容差仅用于消除二进制浮点在十进制边界上的表示误差（例如 `16.7 + 0.15 = 16.849999999999998`
 *   在乘 100 后向下取整会被误截为 1684 而非 1685），同时不影响正常的非边界值（如 `16.8499` 仍为 16.84）。
 *
 * @param value 待截断的原始浮点数
 * @param digits 保留小数位数（默认 2 位）
 * @returns 截断后的浮点数值
 */
export function truncateChunithmValue(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.floor(value * scale + 1e-8) / scale;
}

/**
 * 将数值向下截断至指定位数后格式化为固定小数位的字符串（不足补 0）。
 *
 * @param value 待格式化的数值
 * @param digits 保留小数位数（默认 2 位）
 */
export function formatChunithmValue(value: number, digits = 2): string {
  return truncateChunithmValue(value, digits).toFixed(digits);
}

/**
 * 二分查找使单调不减函数 `calculate(score)` 达到 `target` 的最低整数分数。
 *
 * @param target 目标数值
 * @param maximumScore 允许检索的分数上限
 * @param calculate 分数映射函数（必须在 [0, maximumScore] 上单调不减）
 * @returns 最低整数分数；若入参非法或上限处仍无法达到目标则返回 null
 */
export function minimumScore(
  target: number,
  maximumScore: number,
  calculate: (score: number) => number,
) {
  if (!Number.isFinite(target) || target < 0 || calculate(maximumScore) + 1e-10 < target)
    return null;
  let low = 0;
  let high = maximumScore;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    // 1e-10 容差消除单调函数中的浮点舍入误差，确保二分落在满足条件的最小整数点
    if (calculate(middle) + 1e-10 >= target) high = middle;
    else low = middle + 1;
  }
  return low;
}

/**
 * 反查在该谱面定数下达到指定目标 Rating 所需的最低整数分数。
 *
 * 契约与边界：
 * - 检索上界限制为 {@link CHUNITHM_RATING_CAP_SCORE} (1,009,000 分)：因 Rating 在达到 1,009,000 分后封顶
 *   不再增长，1,009,000 分即为达到该谱面最大 Rating 的最小分数解。
 *
 * @param levelValue 谱面定数（单位：定数）
 * @param targetRating 目标 Rating
 * @returns 满足条件的最低整数分数（单位：分，范围 0 ~ 1,009,000）；若超过该定数 Rating 上限或入参非法则返回 null
 */
export function requiredChunithmScore(levelValue: number, targetRating: number): number | null {
  return minimumScore(targetRating, CHUNITHM_RATING_CAP_SCORE, (score) =>
    calculateChunithmRating(levelValue, score),
  );
}

function ceilTo01(value: number): number {
  return Math.ceil(value * 10) / 10;
}

// chunithm：Rating = 定数 + 分数档加成（达 SS 及以上时为正）。反推：定数 = rating − 加成。
export function requiredChunithmConstant(targetRating: number, offset: number): number {
  return Math.max(0, ceilTo01(targetRating - offset));
}
