import type { Timeline } from "@lxns-network/chunithm-chart-engine/chart/timeline/reader";
import {
  bandColumnsOf,
  createBandStates,
  type BandStateColumns,
  type BandStates,
} from "@lxns-network/chunithm-chart-engine/notes/bandAssembler";
import { airBandColumnsOf } from "@lxns-network/chunithm-chart-engine/notes/airBandAssembler";
import {
  createModelStates,
  type ModelStates,
} from "@lxns-network/chunithm-chart-engine/notes/modelStates";
import type {
  LiveBandSink,
  NoteLayerLive,
} from "@lxns-network/chunithm-chart-engine/notes/noteLayer";
import { slideColumnsOf } from "@lxns-network/chunithm-chart-engine/notes/slideAssembler";
import { computeJudgeVisibility } from "@lxns-network/chunithm-chart-engine/notes/visibility";

/** Band families a note can frame; `band` is the HOLD band. */
export type BandKind = "band" | "slide" | "airband";

const BAND_ENDED = 3;
const HIDDEN_BEFORE_FIRST = 0;

/** States of one key, each from its step on, in step order. */
class History {
  steps: number[] = [];
  values: number[] = [];

  push(step: number, value: number) {
    const last = this.values.length - 1;
    if (last >= 0 && this.values[last] === value) return;
    if (last >= 0 && this.steps[last] === step) this.values[last] = value;
    else {
      this.steps.push(step);
      this.values.push(value);
    }
  }

  /** The value at `step`, or `before` ahead of the first. */
  at(step: number, before: number): number {
    let low = 0;
    let high = this.steps.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.steps[middle] <= step) low = middle + 1;
      else high = middle;
    }
    return low > 0 ? this.values[low - 1] : before;
  }
}

const historyOf = (map: Map<number, History>, key: number) => {
  let history = map.get(key);
  if (!history) map.set(key, (history = new History()));
  return history;
};

/**
 * Note states for the note layer. While a player plays they come from the player's judgments as
 * they happen; otherwise they are the automatic play the timeline records, so the same layer serves
 * both. The timeline always decides which parts and bands a record has.
 */
export function createPlayStates(timeline: Timeline, records: readonly DataView[]) {
  const recordCount = records.length;
  const recorded = {
    models: createModelStates(timeline, recordCount),
    bands: createBandStates(bandColumnsOf(timeline), recordCount),
    visibility: computeJudgeVisibility({
      records,
      times: timeline.column("judge", "time") as Float64Array,
      notes: timeline.column("judge", "note") as Uint32Array,
      phases: timeline.column("judge", "kind") as Uint8Array,
      parts: timeline.column("judge", "part") as Uint8Array,
    }),
  };
  const columns: [BandKind, BandStateColumns][] = [
    ["slide", slideColumnsOf(timeline)],
    ["airband", airBandColumnsOf(timeline)],
  ];
  let playing = false;
  const models = new Map<number, History>();
  const holdBands = new Map<number, History>();
  const airBands = new Map<number, History>();
  const visibility = {
    head: new Float64Array(recordCount),
    air: new Float64Array(recordCount),
  };
  const sinks = new Set<LiveBandSink>();
  /** Every SLIDE and AIR band state so far, replayed into a band family that joins later. */
  const bandLog: { kind: BandKind; record: number; step: number; state: number }[] = [];
  /** Latest state of each SLIDE band (even keys) and AIR band (odd keys). */
  const lastBand = new Map<number, number>();

  const replay = (sink: LiveBandSink) => {
    sink.clear();
    if (!playing) {
      for (const [kind, column] of columns)
        if (kind === sink.kind)
          for (let i = 0; i < column.time.length; i++)
            sink.append(column.note[i], column.time[i], column.state[i]);
    } else
      for (const entry of bandLog)
        if (entry.kind === sink.kind) sink.append(entry.record, entry.step / 120, entry.state);
  };
  const bands = new (class extends Set<LiveBandSink> {
    add(sink: LiveBandSink) {
      sinks.add(sink);
      replay(sink);
      return super.add(sink);
    }
    delete(sink: LiveBandSink) {
      sinks.delete(sink);
      return super.delete(sink);
    }
  })();

  const modelStates: ModelStates = {
    has: (record, part) => recorded.models.has(record, part),
    shownAt(record, part, step) {
      if (!playing) return recorded.models.shownAt(record, part, step);
      return models.get(record * 0x10000 + part)?.at(step, HIDDEN_BEFORE_FIRST) === 1;
    },
    modeAt(record, step) {
      if (!playing) return recorded.models.modeAt(record, step);
      return airBands.get(record)?.at(step, BAND_ENDED) ?? BAND_ENDED;
    },
  };
  const bandStates: BandStates = {
    has: (record) => recorded.bands.has(record),
    stateAt(record, step) {
      if (!playing) return recorded.bands.stateAt(record, step);
      return holdBands.get(record)?.at(step, 0) ?? 0;
    },
  };

  const reset = () => {
    models.clear();
    holdBands.clear();
    airBands.clear();
    bandLog.length = 0;
    lastBand.clear();
    if (playing) {
      visibility.head.fill(Infinity);
      visibility.air.fill(Infinity);
    } else {
      visibility.head.set(recorded.visibility.head);
      visibility.air.set(recorded.visibility.air);
    }
    for (const sink of sinks) replay(sink);
  };
  reset();

  const live: NoteLayerLive = { modelStates, bandStates, visibility, bands };
  return {
    live,
    get playing() {
      return playing;
    },
    /** Switches between a player's states, starting empty, and the recorded automatic play. */
    setPlaying(value: boolean) {
      playing = value;
      reset();
    },
    /** Drops every state a player produced. */
    reset,
    model(record: number, part: number, step: number, shown: 0 | 1) {
      historyOf(models, record * 0x10000 + part).push(step, shown);
    },
    band(kind: BandKind, record: number, step: number, state: number) {
      if (kind === "band") {
        historyOf(holdBands, record).push(step, state);
        return;
      }
      const key = record * 2 + Number(kind === "airband");
      if (lastBand.get(key) === state) return;
      lastBand.set(key, state);
      if (kind === "airband") historyOf(airBands, record).push(step, state);
      bandLog.push({ kind, record, step, state });
      for (const sink of sinks) if (sink.kind === kind) sink.append(record, step / 120, state);
    },
    /** Hides the record's head or attached AIR from `step` on, as its first result does. */
    judged(record: number, air: boolean, step: number) {
      const column = air ? visibility.air : visibility.head;
      column[record] = Math.min(column[record], step / 120);
    },
  };
}
