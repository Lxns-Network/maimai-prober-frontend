import type { ParsedScore } from "../parse/parseChart";
import { bindRowsFromConfig } from "./config";
import { tightenJudgeWindows } from "./judgeWindows";
import { hexByte } from "./hexByte";
import { promoteExNotes } from "./promoteEx";
import { REAL_WIDTH } from "./realWidth";

const NOTE_BYTES = 0x164;

/** Note types the renderer draws; other types are reported in `BoundScore.unsupported`. */
export const SUPPORTED_NOTE_TYPES: ReadonlySet<number> = new Set([0, 1, 2, 4, 6, 9, 11, 12]);

export interface BoundScore {
  parsed: ParsedScore;
  /** Note records (0x164 bytes each) with judge windows bound. */
  records: DataView[];
  config: DataView;
  difficulty: number;
  mirror: boolean;
  unsupported: { type: number; count: number }[];
}

/** Record bytes from canonical hex; undefined (`--`) bytes become zero. */
function hexView(hex: string, size: number): DataView {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = hexByte(hex, i * 2);
  return new DataView(bytes.buffer);
}

const realWidth = (idx: number) => (idx < 0 || idx >= REAL_WIDTH.length ? 0 : REAL_WIDTH[idx]);

/** Copies the parsed note records, promotes notes stacked on EX notes, and binds their judge windows against `config`. */
export function bindScore(
  parsed: ParsedScore & { canonicalRecords?: DataView[] },
  config: DataView,
  options: { difficulty: number; mirror: boolean },
): BoundScore {
  const records =
    parsed.canonicalRecords ??
    parsed.canonical.vectors["0x15c"].items.map((item) =>
      hexView((item as { hex: string }).hex, NOTE_BYTES),
    );
  const counts = new Map<number, number>();
  for (const rec of records) {
    const type = rec.getInt32(0x10, true);
    if (!SUPPORTED_NOTE_TYPES.has(type)) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  promoteExNotes(records, parsed.run.resolution, realWidth);
  tightenJudgeWindows(records, bindRowsFromConfig(config, options.difficulty), realWidth);
  return {
    parsed,
    records,
    config,
    difficulty: options.difficulty,
    mirror: options.mirror,
    unsupported: [...counts].map(([type, count]) => ({ type, count })),
  };
}
