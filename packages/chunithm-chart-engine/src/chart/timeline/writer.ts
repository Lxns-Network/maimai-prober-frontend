import {
  ARRAY,
  BYTES,
  SEGMENTS,
  TIMELINE_MAGIC,
  TIMELINE_VERSION,
  type ColumnType,
  type Row,
  type SegmentName,
} from "./layout";

const INTEGER_RANGE: Partial<Record<ColumnType, [number, number]>> = {
  u8: [0, 0xff],
  u16: [0, 0xffff],
  u32: [0, 0xffffffff],
  i32: [-0x80000000, 0x7fffffff],
};

export interface TimelineMeta {
  durationSeconds: number;
  measureTimesMs?: number[];
  noteCount: number;
  unsupported: { type: number; count: number }[];
  /** Speed row the `note.appear` column was computed for; the real visibility is a side table. */
  defaultSpeedRow: number;
  /** True while `note.appear` is a fixed lead rather than computed visibility. */
  appearIsPlaceholder: boolean;
}

export class TimelineWriter {
  private rows = new Map<SegmentName, number[][]>();

  push<S extends SegmentName>(segment: S, row: Row<S>): void {
    const def = SEGMENTS[segment];
    const names = Object.keys(def.columns);
    for (const key of Object.keys(row))
      if (!names.includes(key)) throw new RangeError(`Unknown column ${segment}.${key}`);
    const types = def.columns as Record<string, ColumnType>;
    const values = names.map((n) => {
      const value = (row as Record<string, number>)[n];
      const v = segment === "judge" && n === "part" && value === undefined ? 0 : value;
      if (typeof v !== "number" || Number.isNaN(v))
        throw new RangeError(`Missing column ${segment}.${n}`);
      const range = INTEGER_RANGE[types[n]];
      if (range ? !Number.isInteger(v) || v < range[0] || v > range[1] : !Number.isFinite(v))
        throw new RangeError(`Column ${segment}.${n} value ${v} outside ${types[n]}`);
      return v;
    });
    const list = this.rows.get(segment) ?? [];
    const orderIndex = names.indexOf(def.order);
    const last = list[list.length - 1];
    if (last && values[orderIndex] < last[orderIndex])
      throw new RangeError(`${segment} rows out of order`);
    list.push(values);
    this.rows.set(segment, list);
  }

  /**
   * Layout: magic u32, version u32, metaLength u32, segmentCount u32, then per segment
   * rowCount u32 and one byte offset u32 per column; JSON meta follows the 8-aligned
   * header, and every column starts on an 8-byte boundary.
   */
  finish(meta: TimelineMeta): ArrayBuffer {
    const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
    const segs = Object.keys(SEGMENTS) as SegmentName[];
    const align8 = (n: number) => (n + 7) & ~7;
    const headerSize = align8(
      16 + segs.reduce((a, s) => a + 4 + 4 * Object.keys(SEGMENTS[s].columns).length, 0),
    );
    let cursor = align8(headerSize + metaBytes.length);
    const plan = segs.map((s) => {
      const count = this.rows.get(s)?.length ?? 0;
      const cols = (Object.entries(SEGMENTS[s].columns) as [string, ColumnType][]).map(
        ([name, type]) => {
          const at = cursor;
          cursor = align8(cursor + count * BYTES[type]);
          return { name, type, at };
        },
      );
      return { s, count, cols };
    });
    const buffer = new ArrayBuffer(cursor);
    const v = new DataView(buffer);
    v.setUint32(0, TIMELINE_MAGIC, true);
    v.setUint32(4, TIMELINE_VERSION, true);
    v.setUint32(8, metaBytes.length, true);
    v.setUint32(12, segs.length, true);
    let h = 16;
    for (const p of plan) {
      v.setUint32(h, p.count, true);
      h += 4;
      for (const c of p.cols) {
        v.setUint32(h, c.at, true);
        h += 4;
      }
    }
    new Uint8Array(buffer, headerSize, metaBytes.length).set(metaBytes);
    for (const p of plan) {
      const rows = this.rows.get(p.s) ?? [];
      p.cols.forEach((c, ci) => {
        const arr = new ARRAY[c.type](buffer, c.at, p.count);
        for (let r = 0; r < p.count; r++) arr[r] = rows[r][ci];
      });
    }
    return buffer;
  }
}
