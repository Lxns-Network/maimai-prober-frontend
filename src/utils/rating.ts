// maimai DX 评分系数（按达成率档取，与 DX Rating 计算器一致）。
export const maimaiCoefficientDict: Record<number, number> = {
  10.0: 0.0,
  20.0: 1.6,
  30.0: 3.2,
  40.0: 4.8,
  50.0: 6.4,
  60.0: 8.0,
  70.0: 9.6,
  75.0: 11.2,
  79.9999: 12.0,
  80.0: 12.8,
  90.0: 13.6,
  94.0: 15.2,
  96.9999: 16.8,
  97.0: 17.6,
  98.0: 20.0,
  98.9999: 20.3,
  99.0: 20.6,
  99.5: 20.8,
  99.9999: 21.1,
  100.0: 21.4,
  100.4999: 21.6,
  100.5: 22.2,
};

// maimai DX Rating = (min(达成率, 100.5) / 100) × 系数 × 定数（未取整）。
export function calculateMaimaiRating(chartConstant: number, achievementRate: number): number {
  let levelCoefficient = 22.4;
  for (const rate of Object.keys(maimaiCoefficientDict)
    .map(Number)
    .sort((a, b) => a - b)) {
    if (achievementRate < rate) {
      levelCoefficient = maimaiCoefficientDict[rate];
      break;
    }
  }
  const clamped = Math.min(achievementRate, 100.5);
  return (clamped / 100) * levelCoefficient * chartConstant;
}

function ceilTo01(value: number): number {
  return Math.ceil(value * 10) / 10;
}

// 反推：在给定达成率下达到 targetRating 所需的最低定数（向上取整到 0.1）。
export function requiredMaimaiConstant(targetRating: number, achievementRate: number): number {
  const perUnit = calculateMaimaiRating(1, achievementRate);
  if (perUnit <= 0) return 0;
  return ceilTo01(targetRating / perUnit);
}

// chunithm：Rating = 定数 + 分数档加成（达 SS 及以上时为正）。反推：定数 = rating − 加成。
export function requiredChunithmConstant(targetRating: number, offset: number): number {
  return Math.max(0, ceilTo01(targetRating - offset));
}
