import { ButtonPosition, SlidePathType } from "../types";

/**
 * 滑条分段消失（chunky disappearance）步进数据与几何形状判定工具。
 *
 * 核心调用流程：
 * 1. `detectSlideShape(slideType, startPos, endPos, midPos?)` → `{ shape, mirror } | null`
 * 2. 依据形状标识索引 `SLIDE_AREA_STEP_MAP[shape]`，按进度分位计算当前隐藏的箭头数。
 */

const MIRROR_KEYS: readonly number[] = [-1, 1, 8, 7, 6, 5, 4, 3, 2];
const UPPER_HALF: ReadonlySet<number> = new Set([1, 2, 7, 8]);

/**
 * 获取按键沿 1-5 对角轴镜像对称后的对应按键编号（1↔1, 2↔8, 3↔7, 4↔6, 5↔5）。
 * 若传入无映射关系的值则原样返回。
 */
export function mirrorKey(key: number): number {
  return MIRROR_KEYS[key] ?? key;
}

/**
 * 判断指定按键是否位于圆盘上半区域（按键 1、2、7、8）。
 */
export function isUpperHalf(key: number): boolean {
  return UPPER_HALF.has(key);
}

/**
 * 计算起点到终点沿顺时针方向的相对步距（返回值范围 1..8）。
 *
 * 返回 1 表示起止点重合，2 表示顺时针相隔 1 步，8 表示顺时针相隔 7 步（即逆时针 1 步）。
 */
export function relativeEnd(startPos: ButtonPosition, endPos: ButtonPosition): number {
  const d = (((endPos - startPos) % 8) + 8) % 8;
  return d + 1;
}

export interface SlideShape {
  /** 基础几何形状标识，对应 SLIDE_AREA_STEP_MAP 的键。 */
  shape: string;
  /** 是否需要沿按键 1-5 对角轴进行镜像翻转。 */
  mirror: boolean;
}

/**
 * 根据滑条路径类型与起止按键位置，解析对应的标准几何形状标识及镜像状态。
 * 折线滑条（`V`）必须传入拐点按键 `midPos`。
 *
 * 当几何参数不符合规范时返回 `null`：
 * - 直线（`-`）：起止点相邻或重合（相对步距不在 3..7 范围内）；
 * - 穿心 V 型（`v`）：起止点关于圆心正对（相对步距为 5）；
 * - 短弧（`^`）：起止点重合或正对（无唯一短弧）；
 * - S / Z 型（`s` / `z`）：起止点非圆心正对（相对步距不为 5）；
 * - 折线（`V`）：缺少 `midPos`、拐点不在起点 ±2 键位、或折返相对步距不在 2..5 范围内；
 * - 未知或未支持的路径类型。
 */
export function detectSlideShape(
  slideType: SlidePathType,
  startPos: ButtonPosition,
  endPos: ButtonPosition,
  midPos?: ButtonPosition,
): SlideShape | null {
  const rel = relativeEnd(startPos, endPos);

  switch (slideType) {
    case "-": {
      if (rel < 3 || rel > 7) return null;
      // 对称弦长两端的分区步进与箭头数相同，通过镜像复用跨度较小的模板（line6→line4, line7→line3）
      const normRel = rel > 5 ? 10 - rel : rel;
      const mirror = normRel !== rel;
      return { shape: `line${normRel}`, mirror };
    }

    case ">":
      // 圆弧基础模板以向上外凸为基准，下半区域起点需沿 1-5 轴镜像以保持外凸朝向
      return isUpperHalf(startPos)
        ? { shape: `circle${rel}`, mirror: false }
        : { shape: `circle${mirrorKey(rel)}`, mirror: true };

    case "<":
      return !isUpperHalf(startPos)
        ? { shape: `circle${rel}`, mirror: false }
        : { shape: `circle${mirrorKey(rel)}`, mirror: true };

    case "^":
      if (rel === 1 || rel === 5) return null;
      // 沿圆周走短弧路径：跨度超过半圆（rel > 5）时逆时针为短边，镜像复用顺时针圆弧模板
      return rel < 5
        ? { shape: `circle${rel}`, mirror: false }
        : { shape: `circle${mirrorKey(rel)}`, mirror: true };

    case "v":
      if (rel === 5) return null;
      return { shape: `v${rel}`, mirror: false };

    case "pp":
      return { shape: `ppqq${rel}`, mirror: false };

    case "qq":
      return { shape: `ppqq${mirrorKey(rel)}`, mirror: true };

    case "p":
      return { shape: `pq${rel}`, mirror: false };

    case "q":
      return { shape: `pq${mirrorKey(rel)}`, mirror: true };

    case "s":
      if (rel !== 5) return null;
      return { shape: "s", mirror: false };

    case "z":
      if (rel !== 5) return null;
      return { shape: "s", mirror: true };

    case "V": {
      if (midPos === undefined) return null;
      // 拐点必须位于起点两侧相隔 2 键处（start ± 2）；右侧拐点通过镜像映射至 L 基础模板
      const leftCorner = (((startPos + 5) % 8) + 1) as ButtonPosition;
      const rightCorner = (((startPos + 1) % 8) + 1) as ButtonPosition;
      if (midPos === leftCorner && rel >= 2 && rel <= 5) {
        return { shape: `L${rel}`, mirror: false };
      }
      const mirrorRel = ((8 - (rel - 1)) % 8) + 1;
      if (midPos === rightCorner && mirrorRel >= 2 && mirrorRel <= 5) {
        return { shape: `L${mirrorRel}`, mirror: true };
      }
      return null;
    }

    case "w":
      return { shape: "wifi", mirror: false };

    default:
      return null;
  }
}

/**
 * 各几何形状对应的箭头分段消失累积索引表。
 *
 * 键为标准形状标识（来自 `detectSlideShape`），值为累积步进数组 `[s0, s1, ..., sN]`：
 * - `s0` 为 0，末尾元素 `sN` 为该形状的总箭头数；
 * - 进度在 `[i/N, (i+1)/N)` 区间内已消失的箭头数为 `s_i`，跨区间时一次性隐藏 `s_{i+1} - s_i` 个箭头；
 * - 非 wifi 滑条：`hiddenCount = steps[Math.floor(progress * (steps.length - 1))]`；
 * - wifi 滑条：步进点采用包含性判定（`hiddenCount = steps[i] + 1`）。
 */
export const SLIDE_AREA_STEP_MAP: { readonly [shape: string]: readonly number[] } = {
  line3: [0, 2, 8, 13],
  line4: [0, 3, 8, 12, 18],
  line5: [0, 3, 6, 11, 15, 19],
  // line6 / line7 经镜像归一化复用 line4 / line3 步进序列

  circle1: [0, 3, 11, 19, 27, 35, 43, 50, 58, 63],
  circle2: [0, 3, 7],
  circle3: [0, 3, 11, 15],
  circle4: [0, 3, 11, 19, 23],
  circle5: [0, 3, 11, 19, 27, 31],
  circle6: [0, 3, 11, 19, 27, 35, 39],
  circle7: [0, 3, 11, 19, 27, 35, 43, 47],
  circle8: [0, 3, 11, 19, 27, 35, 43, 50, 55],

  v1: [0, 3, 6, 11, 15, 19],
  v2: [0, 3, 6, 11, 15, 19],
  v3: [0, 3, 6, 11, 15, 19],
  v4: [0, 3, 6, 11, 15, 19],
  v6: [0, 3, 6, 11, 15, 19],
  v7: [0, 3, 6, 11, 15, 19],
  v8: [0, 3, 6, 11, 15, 19],

  // pp 与 qq 互为镜像，共用 ppqq 基础模板步进（qq 标记 mirror: true）
  ppqq1: [0, 3, 7, 13, 17, 26, 32, 35],
  ppqq2: [0, 3, 7, 12, 16, 25, 28],
  ppqq3: [0, 3, 6, 12, 15, 22],
  ppqq4: [0, 3, 7, 12, 16, 25, 29, 35, 40, 44, 49],
  ppqq5: [0, 3, 7, 12, 16, 25, 29, 35, 40, 44, 49],
  ppqq6: [0, 3, 7, 12, 16, 25, 28, 34, 38, 41, 48],
  ppqq7: [0, 3, 7, 13, 17, 27, 31, 37, 41, 46],
  ppqq8: [0, 3, 7, 12, 16, 25, 29, 35, 41],

  // p 与 q 互为镜像，共用 pq 基础模板步进（q 标记 mirror: true）
  pq1: [0, 3, 8, 11, 14, 17, 21, 24, 27, 33],
  pq2: [0, 3, 8, 11, 14, 18, 21, 24, 30],
  pq3: [0, 3, 9, 12, 16, 19, 23, 27],
  pq4: [0, 3, 9, 13, 16, 20, 24],
  pq5: [0, 3, 9, 13, 17, 21],
  pq6: [0, 3, 8, 11, 15, 18, 21, 25, 28, 31, 35, 38, 42],
  pq7: [0, 3, 8, 12, 15, 18, 22, 25, 28, 32, 35, 39],
  pq8: [0, 3, 8, 11, 14, 17, 21, 24, 27, 30, 36],

  s: [0, 3, 8, 11, 17, 21, 24, 30],
  wifi: [0, 1, 4, 6, 11],

  L2: [0, 2, 7, 15, 21, 26, 32],
  L3: [0, 2, 8, 17, 20, 26, 29, 34],
  L4: [0, 2, 8, 17, 22, 26, 32],
  L5: [0, 2, 8, 16, 22, 28],
};
