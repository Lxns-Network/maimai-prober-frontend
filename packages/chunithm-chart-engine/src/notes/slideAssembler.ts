import { selectHitDepth } from "./space";
import type { Pack } from "../assets/packFormat";
import { stepForSeconds, secondsForStep } from "../loop/audioClock";
import type { BandBuffer } from "./render/bandBuffer";
import { sortKey } from "./render/drawGroups";
import type { Timeline } from "../chart/timeline/reader";
import type { BandInstance, BandStateColumns } from "./bandAssembler";
import { regionKeyAt, regionRecords } from "./bandFrame";
import { bandOrderOf } from "./bandOrder";
import { HOLD_VERTEX_BYTES } from "./holdBand";
import type { NoteScore } from "./score";
import {
  createSlideBand,
  type SlideBandInput,
  type SlideElement,
  type SlideStatics,
} from "./slideBand";
import { NOTE_WIDTHS } from "./tables";
import { effectiveTime } from "./timing";
import { timelineFramesAt } from "./extapClock";

const RESOURCES = [
  [1, 2, 3],
  [0, -1, 3],
  [5, 6, 3],
] as const;
const PRIMITIVES = [4, 3, 3] as const;
const f = Math.fround;
const frames = (time: number) => f(f(time) * 0.05999999865889549);
const widthOf = (index: number) => NOTE_WIDTHS[index] ?? 0;

export function slideColumnsOf(timeline: Timeline): BandStateColumns {
  return {
    time: timeline.column("slide", "time") as Float64Array,
    note: timeline.column("slide", "note") as Uint32Array,
    state: timeline.column("slide", "mode") as Uint8Array,
  };
}

interface SlidePlan {
  record: number;
  times: number[];
  keys: number[];
  elements: SlideElement[];
  profiles: (string | null)[];
  layers: number[];
  initialKeys: number[];
  width: number;
  scratch: DataView;
  relativeTimes: number[];
  depthArgs: number[];
  joints: SlideBandInput["joints"];
  statics: SlideStatics | null;
  events: { time: number; mode: number }[];
}

/** Appends three-layer SLIDE geometry to the shared buffer without clearing other families. */
export function createSlideBandAssembler(input: {
  score: NoteScore;
  manager: DataView;
  pack: Pack;
  timeline: Timeline;
}) {
  const { score, manager, pack } = input;
  const columns = slideColumnsOf(input.timeline);
  const regions = regionRecords(score);
  const plans = new Map<number, SlidePlan>();
  const writer = createSlideBand();
  score.records.forEach((record, index) => {
    if (record.getInt32(0x10, true) !== 2) return;
    const joints = score.slideJoints?.get(index);
    if (!joints?.length) throw new RangeError(`SLIDE record ${index} has no joints`);
    const kind = Math.min(2, Math.max(0, record.getInt32(0x98, true)));
    const profiles = RESOURCES[kind].map((resource, layer) =>
      resource < 0 ? null : `note/band/slide/${PRIMITIVES[layer]}/${resource}`,
    );
    const orders = profiles.map((name) =>
      name === null ? null : bandOrderOf(pack, name, "SLIDE"),
    );
    const layers = orders.map((order) => order?.layer ?? 0);
    const initialKeys = orders.map((order) => order?.initialKey ?? 0);
    const width = widthOf(record.getInt32(0x2c, true));
    const lane = record.getInt32(0x28, true);
    const times = [frames(record.getFloat32(8, true))];
    const keys = [record.getInt32(0x70, true)];
    const elements: SlideElement[] = [{ width: f(width), lane: f(f(width * 0.5) + lane), flag: 1 }];
    joints.forEach((joint, k) => {
      const w = widthOf(joint.getInt32(0x20, true));
      const l = joint.getInt32(0x10, true);
      times.push(frames(joint.getFloat32(8, true)));
      keys.push(regionKeyAt(regions, joint, l, w));
      elements.push({
        width: f(w),
        lane: f(f(w * 0.5) + l),
        flag: k === joints.length - 1 ? 1 : joint.getUint8(0x14),
      });
    });
    plans.set(index, {
      record: index,
      times,
      keys,
      elements,
      profiles,
      layers,
      initialKeys,
      width,
      scratch: new DataView(new ArrayBuffer((times.length + 2) * 72 * HOLD_VERTEX_BYTES)),
      relativeTimes: new Array(times.length).fill(0),
      depthArgs: new Array(times.length).fill(0),
      joints: profiles.map((name) => ({
        enabled: name !== null,
        priorCount: 0,
      })) as unknown as SlideBandInput["joints"],
      statics: null,
      events: [],
    });
  });
  if (columns.time.length !== columns.note.length || columns.time.length !== columns.state.length)
    throw new RangeError("SLIDE timeline columns must be parallel");
  for (let i = 0; i < columns.time.length; i++) {
    const plan = plans.get(columns.note[i]);
    if (
      !plan ||
      !Number.isFinite(columns.time[i]) ||
      columns.state[i] > 3 ||
      (i > 0 && columns.time[i] < columns.time[i - 1])
    )
      throw new RangeError(`Invalid SLIDE event ${i}`);
    plan.events.push({ time: columns.time[i], mode: columns.state[i] });
  }
  const bandInput = (
    plan: SlidePlan,
    now: number,
    mode: number,
    statics: SlideStatics,
  ): SlideBandInput => {
    for (let i = 0; i < plan.times.length; i++) {
      const time = plan.times[i];
      plan.depthArgs[i] = f(effectiveTime(manager, score, plan.keys[i], time) - now);
      plan.relativeTimes[i] = f(time - now);
    }
    return {
      mode,
      phase: timelineFramesAt(manager, score),
      depthArgs: plan.depthArgs,
      times: plan.relativeTimes,
      elements: plan.elements,
      joints: plan.joints,
      manager,
      score,
      statics,
      x87: "extended",
    };
  };
  return {
    /** Adds a band state from `time` on, after every state the record already has. */
    append(record: number, time: number, mode: number) {
      plans.get(record)?.events.push({ time, mode });
    },
    /** Drops every band state, keeping each band's geometry. */
    clear() {
      for (const plan of plans.values()) plan.events.length = 0;
    },
    assemble(
      step: number,
      nowFrames: number,
      records: ArrayLike<number>,
      count: number,
      buffer: BandBuffer,
      out: BandInstance[],
    ) {
      for (let i = 0; i < count; i++) {
        selectHitDepth(input.manager, records[i]);
        const plan = plans.get(records[i]);
        if (!plan) continue;
        let low = 0,
          high = plan.events.length;
        const nowSeconds = secondsForStep(step);
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (plan.events[middle].time <= nowSeconds) low = middle + 1;
          else high = middle;
        }
        if (!low || plan.events[low - 1].mode === 3) continue;
        if (!plan.statics) {
          const firstFrames = f(stepForSeconds(plan.events[0].time) * 0.5);
          manager.setFloat32(0x300, firstFrames, true);
          plan.statics = writer.writeSlideBand(
            plan.scratch,
            0,
            bandInput(plan, firstFrames, plan.events[0].mode, {
              zeroDepth: { initialized: false },
              centreHalf: { initialized: false },
            }),
          ).statics;
        }
        manager.setFloat32(0x300, nowFrames, true);
        const result = writer.writeSlideBand(
          plan.scratch,
          0,
          bandInput(plan, nowFrames, plan.events[low - 1].mode, plan.statics),
        );
        if (result.early) continue;
        let source = 0;
        for (let layer = 0; layer < 3; layer++) {
          const vertices = result.counts[layer];
          const profile = plan.profiles[layer];
          if (profile && vertices) {
            const first = buffer.commit(vertices);
            new Uint8Array(
              buffer.bytes().buffer,
              buffer.bytes().byteOffset + first * HOLD_VERTEX_BYTES,
              vertices * HOLD_VERTEX_BYTES,
            ).set(
              new Uint8Array(
                plan.scratch.buffer,
                source * HOLD_VERTEX_BYTES,
                vertices * HOLD_VERTEX_BYTES,
              ),
            );
            const joint = result.joints[layer];
            out.push({
              record: records[i],
              profile,
              first,
              vertices,
              key: sortKey(plan.initialKeys[layer], plan.layers[layer], (16 - plan.width) & 255),
              scalar: joint.untouched ? 1 : (joint.scalar ?? 1),
            });
          }
          source += vertices;
        }
      }
    },
  };
}
