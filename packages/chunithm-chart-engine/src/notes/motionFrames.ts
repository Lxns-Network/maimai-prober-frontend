import type { Timeline } from "../chart/timeline/reader";
import { stepForSeconds } from "../loop/audioClock";
import { assertBakedSpeed, BakedSpeedMismatchError } from "./bakedSpeed";
import type { MotionTracks } from "../chart/lifecycle/motion";

/** Frame lookups of one display speed's animated parts. */
export interface MotionFrames {
  has(record: number, part: number): boolean;
  /** @throws RangeError when the part is not advanced at the step or binds another model. */
  at(record: number, part: number, model: number, step: number): number;
}

/** Frames of computed motion tracks, scoped to their display speed and model binding. */
export function motionFramesOf(tracks: MotionTracks, speedRow: number): MotionFrames {
  if (tracks.speedRow !== speedRow) throw new BakedSpeedMismatchError(tracks.speedRow, speedRow);
  const index = new Map<number, number>();
  for (let t = 0; t < tracks.records.length; t++) {
    const key = tracks.records[t] * 0x10000 + tracks.parts[t];
    if (index.has(key))
      throw new RangeError(`Two motion tracks for ${tracks.records[t]}/${tracks.parts[t]}`);
    index.set(key, t);
  }
  return {
    has: (record, part) => index.has(record * 0x10000 + part),
    at(record, part, model, step) {
      const t = index.get(record * 0x10000 + part);
      if (t === undefined) throw new RangeError(`No motion track for ${record}/${part}`);
      if (tracks.models[t] !== model) throw new RangeError("Motion track model binding differs");
      const at = tracks.offsets[t] + step - tracks.firsts[t];
      const frame = at >= tracks.offsets[t] && at < tracks.offsets[t + 1] ? tracks.frames[at] : NaN;
      if (Number.isNaN(frame))
        throw new RangeError(`Motion of ${record}/${part} is not advanced at step ${step}`);
      return frame;
    },
  };
}

/** Exact post-update frames, scoped to the baked display speed and model binding. */
export function createMotionFrames(timeline: Timeline, speedRow: number): MotionFrames {
  const times = timeline.column("motion", "time") as Float64Array;
  assertBakedSpeed(timeline, speedRow);
  const notes = timeline.column("motion", "note") as Uint32Array;
  const parts = timeline.column("motion", "part") as Uint16Array;
  const models = timeline.column("motion", "model") as Uint16Array;
  const frames = timeline.column("motion", "frame") as Float32Array;
  const indexed = new Map<number, { steps: number[]; models: number[]; frames: number[] }>();
  for (let i = 0; i < times.length; i++) {
    const key = notes[i] * 0x10000 + parts[i];
    let entry = indexed.get(key);
    if (!entry) indexed.set(key, (entry = { steps: [], models: [], frames: [] }));
    const step = stepForSeconds(times[i]);
    if (
      !Number.isFinite(frames[i]) ||
      frames[i] < 0 ||
      (entry.steps.length && step <= entry.steps[entry.steps.length - 1])
    )
      throw new RangeError("Invalid recorded motion frame order");
    entry.steps.push(step);
    entry.models.push(models[i]);
    entry.frames.push(frames[i]);
  }
  return {
    has(record: number, part: number) {
      return indexed.has(record * 0x10000 + part);
    },
    at(record: number, part: number, model: number, step: number): number {
      const entry = indexed.get(record * 0x10000 + part);
      if (!entry) throw new RangeError(`Motion frame not recorded for ${record}/${part}`);
      let lo = 0,
        hi = entry.steps.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (entry.steps[mid] < step) lo = mid + 1;
        else hi = mid;
      }
      if (entry.steps[lo] !== step)
        throw new RangeError(`Motion frame not recorded at step ${step} for ${record}/${part}`);
      if (entry.models[lo] !== model) throw new RangeError("Recorded motion model binding differs");
      return entry.frames[lo];
    },
  };
}
