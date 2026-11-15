import { selectHitDepth } from "./space";
import { stepForSeconds, secondsForStep } from "../loop/audioClock";
import type { BandBuffer } from "./render/bandBuffer";
import { sortKey } from "./render/drawGroups";
import type { Timeline } from "../chart/timeline/reader";
import {
  createAirBand,
  type AirBandInput,
  type AirGeneratorState,
  type AirPoint,
  type AirStatics,
} from "./airBand";
import type { BandInstance, BandStateColumns } from "./bandAssembler";
import { HOLD_VERTEX_BYTES } from "./holdBand";
import type { NoteScore } from "./score";
import { effectiveTime } from "./timing";

const f = Math.fround;

export function airBandColumnsOf(timeline: Timeline): BandStateColumns {
  return {
    time: timeline.column("airband", "time") as Float64Array,
    note: timeline.column("airband", "note") as Uint32Array,
    state: timeline.column("airband", "mode") as Uint8Array,
  };
}

/** One record band: its points, the timeline key and own time (frames) of each, and its layer bindings. */
export interface AirBandPlan {
  times: number[];
  keys: number[];
  elements: AirPoint[];
  narrow: number;
  generator: AirGeneratorState;
  /** Pack profile each layer draws with; null disables the layer. */
  profiles: readonly [string | null, string | null, string | null];
  layers: readonly [number, number, number];
  initialKeys: readonly [number, number, number];
  priority: number;
}

interface PlanState {
  plan: AirBandPlan;
  scratch: DataView;
  events: { time: number; mode: number }[];
  times: number[];
  depthArgs: number[];
  joints: AirBandInput["joints"];
}

/**
 * Appends the AIR bands of one family to the shared buffer without clearing other families. The
 * family shares one zero-depth reference, set by the first band it generates anywhere in the chart.
 */
export function createAirBandAssembler(input: {
  score: NoteScore;
  manager: DataView;
  timeline: Timeline;
  plans: ReadonlyMap<number, AirBandPlan>;
}) {
  const { score, manager } = input;
  const columns = airBandColumnsOf(input.timeline);
  const writer = createAirBand();
  const states = new Map<number, PlanState>();
  for (const [record, plan] of input.plans)
    states.set(record, {
      plan,
      scratch: new DataView(new ArrayBuffer((plan.times.length + 2) * 12 * 3 * HOLD_VERTEX_BYTES)),
      events: [],
      times: new Array<number>(plan.times.length).fill(0),
      depthArgs: new Array<number>(plan.times.length).fill(0),
      joints: plan.profiles.map((name) => ({
        enabled: name !== null,
      })) as unknown as AirBandInput["joints"],
    });
  if (columns.time.length !== columns.note.length || columns.time.length !== columns.state.length)
    throw new RangeError("AIR band timeline columns must be parallel");
  let earliest = Infinity;
  for (let i = 0; i < columns.time.length; i++) {
    const owner = states.get(columns.note[i]);
    if (!owner) continue;
    if (
      !Number.isFinite(columns.time[i]) ||
      columns.state[i] > 3 ||
      (i > 0 && columns.time[i] < columns.time[i - 1])
    )
      throw new RangeError(`Invalid AIR band event ${i}`);
    owner.events.push({ time: columns.time[i], mode: columns.state[i] });
    if (columns.time[i] < earliest) earliest = columns.time[i];
  }
  let statics: AirStatics | null = null;
  const bandInput = (
    owner: PlanState,
    now: number,
    mode: number,
    shared: AirStatics,
  ): AirBandInput => {
    const { plan, times, depthArgs } = owner;
    for (let i = 0; i < times.length; i++) {
      const time = plan.times[i];
      depthArgs[i] = f(effectiveTime(manager, score, plan.keys[i], time) - now);
      times[i] = f(time - now);
    }
    return {
      mode,
      depthArgs,
      times,
      narrow: plan.narrow,
      generator: plan.generator,
      elements: plan.elements,
      joints: owner.joints,
      manager,
      score,
      statics: shared,
      x87: "extended",
    };
  };
  return {
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
        const owner = states.get(records[i]);
        if (!owner) continue;
        const { plan } = owner;
        let low = 0;
        let high = owner.events.length;
        const nowSeconds = secondsForStep(step);
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (owner.events[middle].time <= nowSeconds) low = middle + 1;
          else high = middle;
        }
        if (!low || owner.events[low - 1].mode === 3) continue;
        if (!statics) {
          const firstFrames = f(stepForSeconds(earliest) * 0.5);
          manager.setFloat32(0x300, firstFrames, true);
          statics = writer.writeAirBand(
            owner.scratch,
            0,
            bandInput(owner, firstFrames, owner.events[0].mode, {
              zeroDepth: { initialized: false },
            }),
          ).statics;
        }
        manager.setFloat32(0x300, nowFrames, true);
        const result = writer.writeAirBand(
          owner.scratch,
          0,
          bandInput(owner, nowFrames, owner.events[low - 1].mode, statics),
        );
        if (result.early) continue;
        let source = 0;
        for (let layer = 0; layer < 3; layer++) {
          const joint = result.joints[layer];
          const vertices = joint.untouched ? 0 : joint.count;
          const profile = plan.profiles[layer];
          if (profile && vertices) {
            const first = buffer.commit(vertices);
            new Uint8Array(
              buffer.bytes().buffer,
              buffer.bytes().byteOffset + first * HOLD_VERTEX_BYTES,
              vertices * HOLD_VERTEX_BYTES,
            ).set(
              new Uint8Array(
                owner.scratch.buffer,
                source * HOLD_VERTEX_BYTES,
                vertices * HOLD_VERTEX_BYTES,
              ),
            );
            out.push({
              record: records[i],
              profile,
              first,
              vertices,
              key: sortKey(plan.initialKeys[layer], plan.layers[layer], plan.priority),
              scalar: 1,
            });
          }
          source += vertices;
        }
      }
    },
  };
}
