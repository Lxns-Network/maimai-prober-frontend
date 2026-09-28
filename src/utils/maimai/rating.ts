/**
 * maimai DX 单曲 Rating 达成率档位系数映射表。
 *
 * 结构与匹配规则：
 * - 字典键（`rate`）为该档位达成率的开区间上界（严格小于，`achievementRate < rate`），量纲：百分比（%）。
 * - 字典值（`coefficient`）为该达成率区间所适用的评级档位系数。
 * - 算法采用升序比较命中首个满足 `achievementRate < rate` 的项；若达到或超过 100.5000%（最高键），
 *   因未命中字典提前中断，将回退使用默认最高系数 `22.4`（SSS+ 档位）。
 *
 * 达成率档位与评级系数对照表（与后端 CalculateRating 及 DX Rating 计算器一致；
 * 低分段的系数档位按 10% 步进划分，与评级边界（D < 50% ≤ C < 60% ≤ B）并不一一对应）：
 * - `[0.0%, 10.0%)` (D): 0.0
 * - `[10.0%, 20.0%)` (D): 1.6
 * - `[20.0%, 30.0%)` (D): 3.2
 * - `[30.0%, 40.0%)` (D): 4.8
 * - `[40.0%, 50.0%)` (D): 6.4
 * - `[50.0%, 60.0%)` (C): 8.0
 * - `[60.0%, 70.0%)` (B): 9.6
 * - `[70.0%, 75.0%)` (BB): 11.2
 * - `[75.0%, 79.9999%)` (BBB): 12.0
 * - `[79.9999%, 80.0%)` (BBB 临界档): 12.8
 * - `[80.0%, 90.0%)` (A): 13.6
 * - `[90.0%, 94.0%)` (AA): 15.2
 * - `[94.0%, 96.9999%)` (AAA): 16.8
 * - `[96.9999%, 97.0%)` (AAA 临界档): 17.6
 * - `[97.0%, 98.0%)` (S): 20.0
 * - `[98.0%, 98.9999%)` (S+): 20.3
 * - `[98.9999%, 99.0%)` (S+ 临界档): 20.6
 * - `[99.0%, 99.5%)` (SS): 20.8
 * - `[99.5%, 99.9999%)` (SS+): 21.1
 * - `[99.9999%, 100.0%)` (SS+ 临界档): 21.4
 * - `[100.0%, 100.4999%)` (SSS): 21.6
 * - `[100.4999%, 100.5%)` (SSS 临界档): 22.2
 * - `>= 100.5%` (SSS+): 22.4（封顶最高系数，由算法默认值兜底）
 *
 * 临界档位说明：
 * - 游戏达成率最小分度为 0.0001%。官方系数表在 80.0%、97.0%、99.0%、100.0%、100.5% 等评级跃迁
 *   界限的前 0.0001% 处设有独立系数档位（如 `99.9999%` 对应 `21.4`，高于本评级基准 `21.1`）。
 * - 键集合同时供 DX Rating 计算器前端作为标准达成率采样点渲染。
 */
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

/**
 * 计算单曲结算 DX Rating（未截断浮点值）。
 *
 * 契约与规则（与后端 CalculateRating 一致）：
 * - 计算公式：`DX Rating = (min(achievementRate, 100.5) / 100) * levelCoefficient * chartConstant`。
 * - 达成率封顶：有效达成率上限截断为 100.5000%（`Math.min(achievementRate, 100.5)`），即使取得 101.0000%
 *   理论值（All Perfect+），参与乘算的达成率最高仍为 1.005，系数维持最高档 `22.4`。
 * - 档位系数匹配：升序遍历 {@link maimaiCoefficientDict} 查找首个满足 `achievementRate < rate` 的档位；
 *   若达成率达到或超过 100.5000%，保留默认封顶系数 `22.4`。
 * - 截断与精度：返回未向下取整的原始浮点 DX Rating。游戏内单曲结算及底分展示由调用方或后端按需向下截断取整（`Math.floor`）。
 *
 * @param chartConstant 谱面定数（单位：定数）
 * @param achievementRate 达成率百分比（单位：%，范围 0 ~ 101.0000）
 * @returns 单曲 DX Rating（单位：Rating，未截断浮点数）
 */
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

/**
 * 反查在指定达成率下达到目标 DX Rating 所需的最低谱面定数。
 *
 * 契约与边界：
 * - 依据单曲 DX Rating 公式与定数的严格线性正比例关系，通过 `calculateMaimaiRating(1, achievementRate)`
 *   计算 1.0 单位定数在该达成率下的基准贡献度 (`perUnit`)。
 * - 当 `perUnit <= 0` 时（如达成率 < 10.0% 时评级为 D，档位系数为 0），无法通过提升定数获得 Rating，直接返回 0。
 * - 输出结果按游戏定数最小分度向上取整至 0.1 精度。
 *
 * @param targetRating 目标 DX Rating
 * @param achievementRate 达成率百分比（单位：%，范围 0 ~ 101.0000）
 * @returns 满足目标 Rating 的最低谱面定数（单位：定数，向上取整至 0.1 精度）；若该达成率下无法获得 Rating 则返回 0
 */
export function requiredMaimaiConstant(targetRating: number, achievementRate: number): number {
  const perUnit = calculateMaimaiRating(1, achievementRate);
  if (perUnit <= 0) return 0;
  return ceilTo01(targetRating / perUnit);
}
