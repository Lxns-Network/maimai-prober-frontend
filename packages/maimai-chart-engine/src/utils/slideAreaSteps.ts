import { ButtonPosition, SlidePathType } from "../types";

/**
 * 滑条分段消失（chunky disappearance）的形状判定与步进数据。
 */

const MIRROR_KEYS: readonly number[] = [-1, 1, 8, 7, 6, 5, 4, 3, 2];
const UPPER_HALF: ReadonlySet<number> = new Set([1, 2, 7, 8]);

/** 按 1-5 对角轴翻转按键编号（1↔1, 2↔8, 3↔7, 4↔6, 5↔5）。 */
export function mirrorKey(key: number): number {
  return MIRROR_KEYS[key] ?? key;
}

export function isUpperHalf(key: number): boolean {
  return UPPER_HALF.has(key);
}

/**
 * 计算从起点顺时针到终点的相对步长（返回 1..8）。
 * 注意重合时返回 1（非 0），顺时针隔 1 步返回 2，逆时针 1 步返回 8。
 */
export function relativeEnd(startPos: ButtonPosition, endPos: ButtonPosition): number {
  const d = (((endPos - startPos) % 8) + 8) % 8;
  return d + 1;
}

export interface SlideShape {
  /** 对应 SLIDE_AREA_STEP_MAP 的形状 key */
  shape: string;
  /** 是否沿 1-5 轴做镜像翻转 */
  mirror: boolean;
}

/**
 * 把滑条路径和起止键位匹配到基础形状模板与镜像标记（对应 SLIDE_AREA_STEP_MAP）。
 * 折线（V）必须传入拐点 midPos。非法滑条或不支持的类型返回 null。
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
      // 对称两端的分区步进和箭头数完全一致，镜像复用跨度较小的模板（line6→line4, line7→line3）
      const normRel = rel > 5 ? 10 - rel : rel;
      const mirror = normRel !== rel;
      return { shape: `line${normRel}`, mirror };
    }

    case ">":
      // 基础模板默认向上外凸，下半区起点沿 1-5 轴镜像以保持外凸朝向
      return isUpperHalf(startPos)
        ? { shape: `circle${rel}`, mirror: false }
        : { shape: `circle${mirrorKey(rel)}`, mirror: true };

    case "<":
      return !isUpperHalf(startPos)
        ? { shape: `circle${rel}`, mirror: false }
        : { shape: `circle${mirrorKey(rel)}`, mirror: true };

    case "^":
      if (rel === 1 || rel === 5) return null;
      // 短弧走较短一侧：跨度超半圆（rel > 5）时逆时针更短，镜像复用顺时针模板
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
      // 拐点必须在起点左右两键（start ± 2）；右侧拐点镜像复用 L 模板
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
 * 各形状分段消失（chunky disappearance）的已隐藏箭头累积步进表。
 * 数组首项为 0，末项为总箭头数。步长不均匀，对应滑条穿过的各个触摸判定区。
 * 注意 wifi 滑条为包含性判定（步进值 + 1），普通滑条则按进度所在区间整批隐藏。
 */
export const SLIDE_AREA_STEP_MAP: { readonly [shape: string]: readonly number[] } = {
  line3: [0, 2, 8, 13],
  line4: [0, 3, 8, 12, 18],
  line5: [0, 3, 6, 11, 15, 19],
  // line6 / line7 镜像复用 line4 / line3

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

  // pp / qq 互为镜像，共用 ppqq 模板（qq 标记 mirror: true）
  ppqq1: [0, 3, 7, 13, 17, 26, 32, 35],
  ppqq2: [0, 3, 7, 12, 16, 25, 28],
  ppqq3: [0, 3, 6, 12, 15, 22],
  ppqq4: [0, 3, 7, 12, 16, 25, 29, 35, 40, 44, 49],
  ppqq5: [0, 3, 7, 12, 16, 25, 29, 35, 40, 44, 49],
  ppqq6: [0, 3, 7, 12, 16, 25, 28, 34, 38, 41, 48],
  ppqq7: [0, 3, 7, 13, 17, 27, 31, 37, 41, 46],
  ppqq8: [0, 3, 7, 12, 16, 25, 29, 35, 41],

  // p / q 互为镜像，共用 pq 模板（q 标记 mirror: true）
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
