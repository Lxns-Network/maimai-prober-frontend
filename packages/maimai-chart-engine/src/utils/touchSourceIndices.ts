import type { Note } from "../types";

/** 优先使用原始记录编号，否则保留输入顺序；合成的 Hold 尾不占序号，非 Touch 音符只推进计数不入表。 */
export function prepareTouchSourceIndices(notes: readonly Note[]): Map<Note, number> {
  const result = new Map<Note, number>();
  const reserved = new Set<number>();
  for (const note of notes) {
    if (note.sourceNoteIndex !== undefined) reserved.add(note.sourceNoteIndex);
  }
  let index = 0;
  for (const note of notes) {
    if (
      note.type === "hold-end" ||
      note.type === "hold-end-simultaneous" ||
      note.type === "touch-hold-end"
    )
      continue;
    const isTouch = note.type === "touch" || note.type === "touch-hold-start";
    if (note.sourceNoteIndex !== undefined) {
      if (isTouch) result.set(note, note.sourceNoteIndex);
      index = Math.max(index, note.sourceNoteIndex + 1);
    } else {
      while (reserved.has(index)) index++;
      if (isTouch) result.set(note, index);
      index++;
    }
  }
  return result;
}
