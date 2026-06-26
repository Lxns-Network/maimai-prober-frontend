import { ButtonPosition, SlidePathType } from "../types";

/**
 * Slide 分区消失（chunky disappearance）的数据驱动表。
 *
 * 每种 slide 形状路径上的箭头总数 + progress 分位上的累积消失到第几个 bar。
 *
 * 用法：
 *   1. `detectSlideShape(slideType, startPos, endPos)` → `{ shape, mirror }`
 *   2. `SLIDE_AREA_STEP_MAP[shape]` → `number[]`，N+1 个值（含起始 0 和终点）。
 *   3. 非 wifi 渲染：`hiddenCount = steps[floor(progress * (steps.length - 1))]`
 *   4. wifi 渲染（chunky 隐藏 inclusive）：`hiddenCount = steps[i] + 1`
 */

const MIRROR_KEYS: readonly number[] = [-1, 1, 8, 7, 6, 5, 4, 3, 2];
const UPPER_HALF: ReadonlySet<number> = new Set([1, 2, 7, 8]);

/** 沿 button 1-5 对角轴的反射：1↔1, 2↔8, 3↔7, 4↔6, 5↔5。 */
export function mirrorKey(key: number): number {
  return MIRROR_KEYS[key] ?? key;
}

/** 起点在上半盘（button 1/2/7/8）。用于 `>` / `<` 方向消歧。 */
export function isUpperHalf(key: number): boolean {
  return UPPER_HALF.has(key);
}

/**
 * 起点 → 终点的 CW 相对距离（1..8）。结果 1 表示原地（少数 slide 允许），
 * 2 表示 CW 一步，以此类推；7 表示 CW 七步 = CCW 一步。
 */
export function relativeEnd(startPos: ButtonPosition, endPos: ButtonPosition): number {
  const d = (((endPos - startPos) % 8) + 8) % 8;
  return d + 1;
}

export interface SlideShape {
  /** SLIDE_AREA_STEP_MAP 的键。 */
  shape: string;
  /** 是否需要沿 button 1-5 对角轴反射（左右卷互换）。 */
  mirror: boolean;
}

/**
 * simai 字符 + 起止按钮 → 形状模板名 + 是否镜像。
 * 返回 null 表示 slide 不合法（如 `1-2` 太近、`1v5` 穿心、`1^1` 同点）。
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
      // 必须至少隔一键：rel ∈ [3, 7]
      if (rel < 3 || rel > 7) return null;
      // 归一化到短弧方向：line6→line4, line7→line3，bar 数和 area step 完全一致。
      const normRel = rel > 5 ? 10 - rel : rel;
      const mirror = normRel !== rel;
      return { shape: `line${normRel}`, mirror };
    }

    case ">":
      // 顺时针弧；起点在上半盘走原版，否则走镜像版本（保证视觉永远偏外侧）
      return isUpperHalf(startPos)
        ? { shape: `circle${rel}`, mirror: false }
        : { shape: `circle${mirrorKey(rel)}`, mirror: true };

    case "<":
      return !isUpperHalf(startPos)
        ? { shape: `circle${rel}`, mirror: false }
        : { shape: `circle${mirrorKey(rel)}`, mirror: true };

    case "^":
      // 取短边方向。rel<5 走 CW 短边 = circle 原版；rel>5 走 CCW 短边 = 镜像。
      if (rel === 1 || rel === 5) return null;
      return rel < 5
        ? { shape: `circle${rel}`, mirror: false }
        : { shape: `circle${mirrorKey(rel)}`, mirror: true };

    case "v":
      // 穿心 V，不能终点 = 起点对称（rel = 5）
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
      // s 必须穿心
      if (rel !== 5) return null;
      return { shape: "s", mirror: false };

    case "z":
      if (rel !== 5) return null;
      return { shape: "s", mirror: true };

    case "V": {
      if (midPos === undefined) return null;
      const leftCorner = (((startPos + 5) % 8) + 1) as ButtonPosition; // start-2
      const rightCorner = (((startPos + 1) % 8) + 1) as ButtonPosition; // start+2
      if (midPos === leftCorner && rel >= 2 && rel <= 5) {
        return { shape: `L${rel}`, mirror: false };
      }
      const mirrorRel = ((8 - (rel - 1)) % 8) + 1; // 镜像侧相对距
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
 * 每个形状的 bar 累积索引序列 `[s0, s1, ..., sN]`：sN 是箭头总数，progress 区间
 * [i/N, (i+1)/N) 内已消失的箭头数 = s_i，跨区间时差 `s_{i+1} - s_i` 一次性消失
 * （chunk 大小非均匀，跟 slide 横穿的触摸 zone 挂钩）。
 */
export const SLIDE_AREA_STEP_MAP: { readonly [shape: string]: readonly number[] } = {
  line3: [0, 2, 8, 13],
  line4: [0, 3, 8, 12, 18],
  line5: [0, 3, 6, 11, 15, 19],
  // line6/line7 已归一化到 line4/line3

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

  // ppqq = 长卷（pp / qq 共用，qq 在 detectSlideShape 处用 mirror=true 转出）
  ppqq1: [0, 3, 7, 13, 17, 26, 32, 35],
  ppqq2: [0, 3, 7, 12, 16, 25, 28],
  ppqq3: [0, 3, 6, 12, 15, 22],
  ppqq4: [0, 3, 7, 12, 16, 25, 29, 35, 40, 44, 49],
  ppqq5: [0, 3, 7, 12, 16, 25, 29, 35, 40, 44, 49],
  ppqq6: [0, 3, 7, 12, 16, 25, 28, 34, 38, 41, 48],
  ppqq7: [0, 3, 7, 13, 17, 27, 31, 37, 41, 46],
  ppqq8: [0, 3, 7, 12, 16, 25, 29, 35, 41],

  // pq = 短卷（p / q 共用，q 用 mirror=true）
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
