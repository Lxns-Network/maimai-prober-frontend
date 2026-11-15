import {
  ARRAY,
  BYTES,
  SEGMENTS,
  SEGMENT_SINCE,
  TIMELINE_MAGIC,
  TIMELINE_MIN_VERSION,
  TIMELINE_VERSION,
  type ColumnType,
  type SegmentName,
  type TypedColumn,
} from "./layout";
import type { TimelineMeta } from "./writer";

export class Timeline {
  private constructor(
    readonly buffer: ArrayBuffer,
    readonly meta: TimelineMeta,
    private readonly counts: Map<SegmentName, number>,
    private readonly columns: Map<string, TypedColumn>,
  ) {}

  /** Validates every header range against the buffer before creating any view. */
  static from(buffer: ArrayBuffer): Timeline {
    if (buffer.byteLength < 16) throw new RangeError("Timeline header out of range");
    const v = new DataView(buffer);
    if (v.getUint32(0, true) !== TIMELINE_MAGIC) throw new RangeError("Not a timeline buffer");
    const version = v.getUint32(4, true);
    if (version < TIMELINE_MIN_VERSION || version > TIMELINE_VERSION)
      throw new RangeError("Unsupported timeline version");
    const metaLength = v.getUint32(8, true);
    const all = Object.keys(SEGMENTS) as SegmentName[];
    const segs = all.filter((s) => (SEGMENT_SINCE[s] ?? 0) <= version);
    if (v.getUint32(12, true) !== segs.length)
      throw new RangeError("Timeline segment table mismatch");
    const tableEnd =
      16 + segs.reduce((a, s) => a + 4 + 4 * Object.keys(SEGMENTS[s].columns).length, 0);
    if (tableEnd > buffer.byteLength) throw new RangeError("Timeline header out of range");
    const counts = new Map<SegmentName, number>();
    const columns = new Map<string, TypedColumn>();
    let h = 16;
    for (const s of segs) {
      const count = v.getUint32(h, true);
      h += 4;
      counts.set(s, count);
      for (const [name, type] of Object.entries(SEGMENTS[s].columns) as [string, ColumnType][]) {
        const at = v.getUint32(h, true);
        h += 4;
        if (at % BYTES[type] !== 0 || at + count * BYTES[type] > buffer.byteLength)
          throw new RangeError(`Timeline column ${s}.${name} out of range`);
        columns.set(`${s}.${name}`, new ARRAY[type](buffer, at, count));
      }
    }
    for (const s of all.filter((name) => !segs.includes(name))) {
      counts.set(s, 0);
      for (const [name, type] of Object.entries(SEGMENTS[s].columns) as [string, ColumnType][])
        columns.set(`${s}.${name}`, new ARRAY[type](new ArrayBuffer(0), 0, 0));
    }
    const headerSize = (h + 7) & ~7;
    if (headerSize + metaLength > buffer.byteLength)
      throw new RangeError("Timeline metadata out of range");
    const meta = JSON.parse(
      new TextDecoder().decode(new Uint8Array(buffer, headerSize, metaLength)),
    ) as TimelineMeta;
    return new Timeline(buffer, meta, counts, columns);
  }

  get duration(): number {
    return this.meta.durationSeconds;
  }

  count(segment: SegmentName): number {
    return this.counts.get(segment) ?? 0;
  }

  column(segment: SegmentName, name: string): TypedColumn {
    const c = this.columns.get(`${segment}.${name}`);
    if (!c) throw new RangeError(`Unknown column ${segment}.${name}`);
    return c;
  }

  /**
   * First row index whose value in `name` is not less than `t`; the column must be sorted.
   * `t` must be a number; NaN returns 0.
   */
  lowerBound(segment: SegmentName, name: string, t: number): number {
    const c = this.column(segment, name);
    let lo = 0;
    let hi = c.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (c[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Half-open row range `[start, end)` whose values lie in `[t0, t1)`; `end >= start` always.
   * A NaN bound yields the empty range `[0, 0]`.
   */
  range(segment: SegmentName, name: string, t0: number, t1: number): [number, number] {
    if (Number.isNaN(t0) || Number.isNaN(t1)) return [0, 0];
    const start = this.lowerBound(segment, name, t0);
    return [start, Math.max(start, this.lowerBound(segment, name, t1))];
  }
}
