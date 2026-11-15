import type { BoundScore } from "../bind/bindScore";
import { TimelineWriter } from "../timeline/writer";
import type { BakeEvent } from "./events";

/** Chart identity a source may need but the bound score does not carry. */
export interface BakeContext {
  musicId: number;
  /** Speed row the placeholder `appear` column is computed for; defaults to row 0. */
  defaultSpeedRow?: number;
  measureTimesMs?: number[];
}

export type EventSource = (bound: BoundScore, context: BakeContext) => BakeEvent[];

/** Placeholder lead time before the judge time at which a note becomes visible. */
const APPEAR_LEAD_SECONDS = 10;

/**
 * Writes the source's events into a Timeline buffer, sorted by time with equal times kept in
 * source order. `rng` events are not stored. The `note` segment lists every record with a head
 * judgment, typed from the bound record.
 */
export function bake(bound: BoundScore, source: EventSource, context: BakeContext): ArrayBuffer {
  const events = source(bound, context)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.time - b.e.time || a.i - b.i)
    .map((x) => x.e);
  const w = new TimelineWriter();
  const judgeTimes = new Map<number, number>();
  /** Longest time among the events actually stored; discarded kinds do not extend the timeline. */
  let duration = 0;
  for (const e of events) {
    switch (e.kind) {
      case "judge":
        w.push("judge", {
          time: e.time,
          note: e.note,
          result: e.result,
          kind: e.phase,
          part: e.part ?? 0,
        });
        duration = Math.max(duration, e.time);
        if (e.phase === 0 && e.part !== 2 && !judgeTimes.has(e.note))
          judgeTimes.set(e.note, e.time);
        break;
      case "score":
        w.push("score", {
          time: e.time,
          score: e.score,
          combo: e.combo,
          gauge: e.gauge,
          judgeCounts0: e.counts[0],
          judgeCounts1: e.counts[1],
          judgeCounts2: e.counts[2],
          judgeCounts3: e.counts[3],
        });
        duration = Math.max(duration, e.time);
        break;
      case "effect":
        w.push("effect", {
          time: e.time,
          resource: e.resource,
          note: e.note,
          lane: e.lane,
          width: e.width,
          rngLow: e.rngLow,
          rngHigh: e.rngHigh,
          crt: e.crt,
        });
        duration = Math.max(duration, e.time);
        break;
      case "band":
        w.push("band", { time: e.time, note: e.note, state: e.state });
        duration = Math.max(duration, e.time);
        break;
      case "slide":
        w.push("slide", { time: e.time, note: e.note, mode: e.mode });
        duration = Math.max(duration, e.time);
        break;
      case "airband":
        w.push("airband", { time: e.time, note: e.note, mode: e.mode });
        duration = Math.max(duration, e.time);
        break;
      case "motion":
        w.push("motion", {
          time: e.time,
          note: e.note,
          part: e.part,
          model: e.model,
          frame: e.frame,
        });
        duration = Math.max(duration, e.time);
        break;
      case "airmodel":
        w.push("airmodel", { time: e.time, note: e.note, part: e.part, shown: e.shown });
        duration = Math.max(duration, e.time);
        break;
      case "cue":
        w.push("cue", { time: e.time, cue: e.cue, channel: e.channel, gain: e.gain });
        duration = Math.max(duration, e.time);
        break;
      case "cuestop":
        w.push("cuestop", { time: e.time, row: e.row, reason: e.reason });
        duration = Math.max(duration, e.time);
        break;
      case "rng":
        break;
      default: {
        const unknown: never = e;
        throw new RangeError(`Unknown bake event ${(unknown as { kind: string }).kind}`);
      }
    }
  }
  bound.records
    .map((rec, record) => ({ record, type: rec.getInt32(0x10, true), t: judgeTimes.get(record) }))
    .filter((n): n is { record: number; type: number; t: number } => n.t !== undefined)
    .sort((a, b) => a.t - b.t || a.record - b.record)
    .forEach((n) =>
      w.push("note", {
        appear: n.t - APPEAR_LEAD_SECONDS,
        judgeTime: n.t,
        end: n.t,
        record: n.record,
        type: n.type,
      }),
    );
  return w.finish({
    durationSeconds: duration,
    measureTimesMs: context.measureTimesMs?.filter((time) => time <= duration * 1000),
    noteCount: bound.records.length,
    unsupported: bound.unsupported,
    defaultSpeedRow: context.defaultSpeedRow ?? 0,
    // The `appear` column is a fixed lead, not the real visibility; the runtime reads the
    // side table from `appearTable.ts` instead.
    appearIsPlaceholder: true,
  });
}
