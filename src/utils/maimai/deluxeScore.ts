import { MaimaiNotesProps } from "@/utils/api/song/maimai.ts";

/**
 * 获取谱面总物量（音符总数）。
 *
 * 契约与边界：
 * - 单人标准谱面直接读取顶层 `notes.total`。
 * - 伙伴双人谱面（Buddy 谱面 / 宴会场双人分轨）中顶层 `total` 可能为空或 0，自动回退累加左右两轨物量（`left.total + right.total`）。
 *
 * @param notes 谱面音符物量信息对象
 * @returns 谱面总物量（单位：个）
 */
export function getTotalNotes(notes: MaimaiNotesProps) {
  if (notes.total) {
    return notes.total;
  }
  return (notes.left?.total || 0) + (notes.right?.total || 0);
}

/**
 * 计算 DX 分数（Deluxe Score）对应的星数与星级颜色档位。
 *
 * 契约与规则（与后端 CalculateDeluxeStar 判定规则一致）：
 * - DX 分数满分依据：每个 Note 在判定为 Critical Perfect 时获得最高 3 分 DX 分数（Perfect 为 2 分，
 *   Great 为 1 分，Good/Miss 为 0 分），因此理论最大 DX 分数为 `totalNotes * 3`。
 * - 完成百分比计算：采用向下截断整数百分比 `Math.floor((deluxeScore / (totalNotes * 3)) * 100)`。
 * - 星数 (`count`) 与星级颜色档位 (`rate`) 映射阈值：
 *   - `percentage >= 97%`: 5 星 (`count = 5`)，金星档位 (`rate = 3`)
 *   - `percentage >= 95%`: 4 星 (`count = 4`)，银星/橙星档位 (`rate = 2`)
 *   - `percentage >= 93%`: 3 星 (`count = 3`)，银星/橙星档位 (`rate = 2`)
 *   - `percentage >= 90%`: 2 星 (`count = 2`)，绿星档位 (`rate = 1`)
 *   - `percentage >= 85%`: 1 星 (`count = 1`)，绿星档位 (`rate = 1`)
 *   - `percentage < 85%`: 0 星 (`count = 0`)，默认档位 (`rate = 1`)
 * - 素材映射关系：`rate` 数值（1、2、3）直接对应 DX 星级图标资源路径 `/assets/maimai/dx_score/${rate}.webp`。
 *
 * @param deluxeScore 结算 DX 分数（单位：分，范围 0 ~ totalNotes * 3）
 * @param notes 谱面音符物量信息对象
 * @returns 星级信息对象，包含星数 count (0 ~ 5) 与颜色档位 rate (1 | 2 | 3)
 */
export function getDeluxeScoreStars(deluxeScore: number, notes: MaimaiNotesProps) {
  const totalNotes = getTotalNotes(notes);
  const percentage = Math.floor((deluxeScore / (totalNotes * 3)) * 100);

  let count = 0;
  let rate: 1 | 2 | 3 = 1;

  if (percentage >= 97) {
    count = 5;
    rate = 3;
  } else if (percentage >= 95) {
    count = 4;
    rate = 2;
  } else if (percentage >= 93) {
    count = 3;
    rate = 2;
  } else if (percentage >= 90) {
    count = 2;
  } else if (percentage >= 85) {
    count = 1;
  }

  return { count, rate };
}
