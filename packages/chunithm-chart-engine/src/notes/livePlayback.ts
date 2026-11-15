import type { ObjectRun } from "../chart/lifecycle/emissions";
import { ACTIVE_AFTER } from "../chart/lifecycle/emissions";
import { motionParts } from "../chart/lifecycle/motion";
import { spawnSteps } from "../chart/lifecycle/spawnStep";
import { createActiveSet } from "./active";
import { TIMELINE_ORIGIN, timelineFramesAt, timelineFrameDisplacement } from "./extapClock";
import { advanceMotionFrame, motionSeed } from "./motionClock";
import type { NoteScore } from "./score";
import { effectiveTime, spawnPredicate, windowPredicate } from "./timing";
import { NOTE_FIELDS, speedForRowIndex } from "./tables";

/** Display lifecycles covering every selectable speed, computed once in the chart Worker. */
export interface LivePlaybackData {
  timeline: ArrayBuffer;
  runs: ObjectRun[];
}

/** Advances only candidate records and their clocks; changing speed never rebuilds a chart. */
export function createLivePlayback(score: NoteScore, runs: readonly ObjectRun[], state: DataView) {
  const count = score.records.length;
  const starts = new Int32Array(count).fill(-1);
  const ends = new Int32Array(count);
  for (const run of runs) {
    const record = run.object.record;
    starts[record] = run.object.spawn;
    ends[record] = Math.max(ends[record], run.removal);
  }
  const intervalCounts = new Uint32Array(count);
  const intervals: number[] = [];
  let steps = 0;
  for (let record = 0; record < count; record++) {
    if (starts[record] < 0) continue;
    intervalCounts[record] = 1;
    intervals.push(starts[record], ends[record]);
    steps = Math.max(steps, ends[record]);
  }
  const candidates = createActiveSet(
    { row: 0, steps, intervals: Int32Array.from(intervals), intervalCounts },
    new Float64Array(count).fill(Infinity),
  );
  const spawned = new Int32Array(count).fill(-1);
  const visible = new Int32Array(count);
  const parts = motionParts(score, runs, 0);
  const byRecord = new Map<number, typeof parts>();
  const byPart = new Map<number, (typeof parts)[number]>();
  const clocks = new Map<
    (typeof parts)[number],
    { frame: number; step: number; seeded: boolean }
  >();
  const pools = new Map<string, { frame: number; busy: boolean }[]>();
  for (const part of parts) {
    const record = part.run.object.record;
    let list = byRecord.get(record);
    if (!list) byRecord.set(record, (list = []));
    list.push(part);
    byPart.set(record * 0x10000 + part.part, part);
  }
  let previous = -1;
  let speedRow = -1;
  let speedMultiplier = 1;
  let spawnTable: { row: number; multiplier: number; values: Int32Array } | null = null;
  let written = 0;
  let sampledStep = NaN;
  let sampledTimeline = 0;
  const reset = () => {
    spawned.fill(-1);
    clocks.clear();
    pools.clear();
    for (const part of parts) part.slot = null;
  };
  const advance = (part: (typeof parts)[number], step: number) => {
    const record = part.run.object.record;
    let clock = clocks.get(part);
    if (!clock) {
      let inherited = 0;
      if (part.pool !== null) {
        let pool = pools.get(part.pool);
        if (!pool) pools.set(part.pool, (pool = []));
        let slot = pool.find((entry) => !entry.busy);
        if (!slot) pool.push((slot = { frame: 0, busy: false }));
        slot.busy = true;
        part.slot = slot;
        inherited = slot.frame;
      }
      clock = { frame: part.initial ?? inherited, step: spawned[record] - 1, seeded: false };
      clocks.set(part, clock);
    }
    const end = Math.min(step, part.release - 1);
    for (let k = clock.step + 1; k <= end; k++) {
      let lo = 0;
      let hi = part.shownSteps.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (part.shownSteps[mid] <= k) lo = mid + 1;
        else hi = mid;
      }
      const shown = lo > 0 && part.shownValues[lo - 1] !== 0;
      const active = k >= spawned[record] + ACTIVE_AFTER;
      state.setFloat32(NOTE_FIELDS.now, Math.fround(k * 0.5), true);
      const window = part.window;
      const inWindow =
        window !== null &&
        (k * 0.5 >= window.timeFrames ||
          windowPredicate(
            state,
            score,
            -1,
            effectiveTime(state, score, window.key, window.timeFrames),
            0,
            1,
          ));
      clock.seeded = false;
      if (!shown || (!active && part.pool !== null)) {
        if (active && inWindow && part.seed !== null && part.seed !== "displayed-in-window")
          clock.frame = motionSeed(timelineFramesAt(state, score), part.seedScale);
      } else if (part.seed !== null && (part.seed === "displayed-or-in-window" || inWindow)) {
        clock.seeded = true;
        clock.frame = advanceMotionFrame(
          motionSeed(timelineFramesAt(state, score), part.seedScale),
          part.clock,
          part.tick,
        );
      } else clock.frame = advanceMotionFrame(clock.frame, part.clock, part.tick);
    }
    clock.step = end;
    if (part.slot) {
      part.slot.frame = clock.frame;
      if (step >= part.release) part.slot.busy = false;
    }
  };
  return {
    records: visible,
    update(step: number, row: number, multiplier: number) {
      const changed = row !== speedRow || multiplier !== speedMultiplier;
      if (step === previous && !changed) return written;
      if (previous < 0 || step < previous || step - previous > 120) {
        reset();
        if (step === 0) spawned.set(spawnSteps(score, row, 1, multiplier));
        else {
          if (spawnTable?.row !== row || spawnTable.multiplier !== multiplier)
            spawnTable = { row, multiplier, values: spawnSteps(score, row, steps + 1, multiplier) };
          for (let record = 0; record < count; record++) {
            const birth = spawnTable.values[record];
            if (birth <= step) spawned[record] = birth;
          }
        }
      }
      state.setFloat32(NOTE_FIELDS.speed, speedForRowIndex(row) * multiplier, true);
      for (const [part] of clocks)
        if (part.release <= step) {
          advance(part, step);
          clocks.delete(part);
        }
      candidates.advanceTo(step);
      const ids = candidates.records();
      written = 0;
      for (let i = 0; i < candidates.count(); i++) {
        const record = ids[i];
        state.setFloat32(NOTE_FIELDS.now, Math.fround(step * 0.5), true);
        if (spawned[record] < 0) {
          if (!spawnPredicate(state, score, score.records[record])) continue;
          spawned[record] = Math.max(0, step - ACTIVE_AFTER);
        }
        for (const part of byRecord.get(record) ?? []) if (step < part.release) advance(part, step);
        visible[written++] = record;
      }
      state.setFloat32(NOTE_FIELDS.now, Math.fround(step * 0.5), true);
      previous = step;
      speedRow = row;
      speedMultiplier = multiplier;
      return written;
    },
    has(record: number, part: number) {
      return byPart.has(record * 0x10000 + part);
    },
    at(record: number, part: number, model: number, presentationStep: number) {
      const descriptor = byPart.get(record * 0x10000 + part);
      if (!descriptor || descriptor.model !== model)
        throw new RangeError("Live animation model binding differs");
      const clock = clocks.get(descriptor);
      if (!clock) throw new RangeError(`Live animation is inactive for ${record}/${part}`);
      const fraction = presentationStep - previous;
      if (clock.seeded) {
        if (sampledStep !== presentationStep) {
          sampledStep = presentationStep;
          sampledTimeline =
            TIMELINE_ORIGIN + timelineFrameDisplacement(score, 0, presentationStep * 0.5);
        }
        const seed = sampledTimeline * descriptor.seedScale;
        const frame =
          descriptor.clock.loop && descriptor.clock.upper > 0
            ? seed % descriptor.clock.upper
            : seed;
        return advanceMotionFrame(frame, descriptor.clock, descriptor.tick);
      }
      return fraction > 0
        ? advanceMotionFrame(clock.frame, descriptor.clock, descriptor.tick * fraction)
        : clock.frame;
    },
  };
}
