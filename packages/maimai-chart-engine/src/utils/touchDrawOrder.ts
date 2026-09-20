import type { TouchPosition } from "../types";
import { drawGroupKey, sortDrawGroup } from "./drawGroupSort";

export type TouchPart = "gauge" | "petal-0" | "petal-1" | "petal-2" | "petal-3" | "center";
type TouchLayer = "B" | "E" | "A" | "D" | "C";

export interface TouchSortNote {
  sourceIndex: number;
  position: TouchPosition;
  isHold: boolean;
  registeredAtMs: number;
}

export interface TouchDrawCommand extends TouchSortNote {
  draw: (part: TouchPart) => void;
}

interface RankedTouchPart {
  sourceIndex: number;
  part: TouchPart;
  groupOrder: number;
}

interface TouchGroupElement {
  key: number;
  sourceIndex?: number;
  part?: TouchPart;
}

// 分区绘制顺序：靠前的分区整体压在靠后的分区之上，调整顺序会翻转跨分区 z-order。
const TOUCH_LAYERS: readonly TouchLayer[] = ["B", "E", "A", "D", "C"];

// 传感器默认占位键序列，用于在排序键相同时保持部件相对顺序。
const DEFAULT_LAUNCHER_KEYS = [
  0x800b800a, 0x800b8000, 0x800b8000, 0x80058000, 0x80058000, 0x80058002, 0x80058002, 0x80058000,
  0x80058000, 0x80058000, 0x80058002, 0x80058002, 0x80058000, 0x80058000, 0x80058000, 0x80058000,
  0x80058002, 0x80058002, 0x80058000, 0x8005800a, 0x80058000, 0x80058000, 0x80058000, 0x80058000,
  0x80058000, 0x80058000, 0x80058000, 0x8006ffff, 0x8006ffff, 0x80008000, 0x80008000,
];

function appendNoteElements(elements: TouchGroupElement[], note: TouchSortNote): void {
  const layer = note.isHold ? 4 : 3;
  const add = (offset: number, part?: TouchPart, sortingLayer = layer) => {
    elements.push({
      key: drawGroupKey(sortingLayer, -note.sourceIndex + offset),
      sourceIndex: note.sourceIndex,
      part,
    });
  };
  add(3, "center");
  add(2, "petal-0");
  // 普通 Touch 与 Hold 的花瓣 1、2 排序偏移互换。
  add(note.isHold ? 2 : 1, "petal-1");
  add(note.isHold ? 1 : 2, "petal-2");
  add(1, "petal-3");
  if (!note.isHold) add(4);
  add(2, undefined, 5);
  if (note.isHold) add(-1, "gauge");
}

/** 维护已进场 Touch 部件绘制顺序；sourceIndex 须唯一，后进场者居前。 */
export class TouchDrawOrder {
  private signature = "";
  private parts: readonly RankedTouchPart[] = [];

  resolve(notes: readonly TouchSortNote[]): readonly RankedTouchPart[] {
    const ordered = [...notes].sort(
      (a, b) =>
        (a.position[0] === "C" && b.position[0] === "C"
          ? 0
          : a.position < b.position
            ? -1
            : a.position > b.position
              ? 1
              : 0) ||
        b.registeredAtMs - a.registeredAtMs ||
        b.sourceIndex - a.sourceIndex,
    );
    const signature = ordered
      .map((note) => [note.position, note.sourceIndex, Number(note.isHold)].join(":"))
      .join("|");
    if (signature === this.signature) return this.parts;

    const parts: RankedTouchPart[] = [];
    for (const layer of TOUCH_LAYERS) {
      const group = ordered.filter((note) => note.position[0] === layer);
      if (!group.length) continue;
      const elements: TouchGroupElement[] = [{ key: 0 }, { key: 0xffffffff }];
      for (let sensor = 1; sensor <= (layer === "C" ? 1 : 8); sensor++) {
        for (const note of group) {
          if (layer === "C" || Number(note.position[1]) === sensor)
            appendNoteElements(elements, note);
        }
        for (const key of DEFAULT_LAUNCHER_KEYS) elements.push({ key });
      }
      sortDrawGroup(elements);
      for (let i = 0; i < elements.length; i++) {
        const { sourceIndex, part } = elements[i];
        if (sourceIndex !== undefined && part !== undefined)
          parts.push({ sourceIndex, part, groupOrder: i + 1 });
      }
    }
    this.signature = signature;
    this.parts = parts;
    return parts;
  }
}

/** queue 必须包含本帧所有已进场 Touch，透明的进场首帧也不能省略。 */
export function flushTouchDrawCommands(
  queue: TouchDrawCommand[],
  order = new TouchDrawOrder(),
): void {
  const commands = new Map(queue.map((command) => [command.sourceIndex, command]));
  for (const { sourceIndex, part } of order.resolve(queue)) commands.get(sourceIndex)!.draw(part);
}
