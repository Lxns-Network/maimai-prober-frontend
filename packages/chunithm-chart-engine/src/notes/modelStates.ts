import { secondsForStep } from "../loop/audioClock";
import type { Timeline } from "../chart/timeline/reader";
import { isGroundPart } from "../chart/bake/events";

/** Shown/hidden state of the model parts the bake observed, by record and part. */
export interface ModelStates {
  /**
   * Whether the bake observed the named part of the record or, with no part named, any of its AIR
   * parts. Ground parts are counted only when named.
   */
  has(record: number, part?: number): boolean;
  /** The part's state at grid step `step`: the latest event at or before it, hidden before the first. */
  shownAt(record: number, part: number, step: number): boolean;
  /** The band mode at grid step `step`: the latest `airband` event at or before it, 3 (ended) before the first. */
  modeAt(record: number, step: number): number;
}

const BAND_ENDED = 3;

/**
 * Indexes the `airmodel` events by record and part, and the `airband` events by record.
 *
 * @throws RangeError when the columns are not parallel, an event names a record outside the score,
 *   or the events are out of time order.
 */
export function createModelStates(timeline: Timeline, recordCount: number): ModelStates {
  const time = timeline.column("airmodel", "time") as Float64Array;
  const note = timeline.column("airmodel", "note") as Uint32Array;
  const part = timeline.column("airmodel", "part") as Uint16Array;
  const shown = timeline.column("airmodel", "shown") as Uint8Array;
  const parts = new Map<number, { times: number[]; shown: number[] }>();
  const records = new Set<number>();
  for (let i = 0; i < time.length; i++) {
    if (note[i] >= recordCount)
      throw new RangeError(`Model event ${i} names record ${note[i]} of ${recordCount}`);
    if (i > 0 && time[i] < time[i - 1])
      throw new RangeError(`Model event ${i} is out of time order`);
    if (shown[i] > 1) throw new RangeError(`Model event ${i} has invalid state ${shown[i]}`);
    const key = note[i] * 0x10000 + part[i];
    let entry = parts.get(key);
    if (!entry) parts.set(key, (entry = { times: [], shown: [] }));
    entry.times.push(time[i]);
    entry.shown.push(shown[i]);
    if (!isGroundPart(part[i])) records.add(note[i]);
  }
  const bandTime = timeline.column("airband", "time") as Float64Array;
  const bandNote = timeline.column("airband", "note") as Uint32Array;
  const bandMode = timeline.column("airband", "mode") as Uint8Array;
  const bands = new Map<number, { times: number[]; modes: number[] }>();
  for (let i = 0; i < bandTime.length; i++) {
    if (bandNote[i] >= recordCount)
      throw new RangeError(
        "Band event " + i + " names record " + bandNote[i] + " of " + recordCount,
      );
    if (i > 0 && bandTime[i] < bandTime[i - 1])
      throw new RangeError("Band event " + i + " is out of time order");
    if (bandMode[i] > BAND_ENDED)
      throw new RangeError("Band event " + i + " has invalid mode " + bandMode[i]);
    let entry = bands.get(bandNote[i]);
    if (!entry) bands.set(bandNote[i], (entry = { times: [], modes: [] }));
    entry.times.push(bandTime[i]);
    entry.modes.push(bandMode[i]);
  }
  return {
    has: (record, partIndex) =>
      partIndex === undefined ? records.has(record) : parts.has(record * 0x10000 + partIndex),
    modeAt(record, step) {
      const entry = bands.get(record);
      if (!entry) return BAND_ENDED;
      const now = secondsForStep(step);
      let low = 0;
      let high = entry.times.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (entry.times[middle] <= now) low = middle + 1;
        else high = middle;
      }
      return low > 0 ? entry.modes[low - 1] : BAND_ENDED;
    },
    shownAt(record, partIndex, step) {
      const entry = parts.get(record * 0x10000 + partIndex);
      if (!entry) return false;
      const now = secondsForStep(step);
      let low = 0;
      let high = entry.times.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (entry.times[middle] <= now) low = middle + 1;
        else high = middle;
      }
      return low > 0 && entry.shown[low - 1] === 1;
    },
  };
}
