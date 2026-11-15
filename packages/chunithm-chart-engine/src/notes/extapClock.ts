import { EVENT_STRIDE, NOTE_FIELDS, SPAWN_CONSTANTS } from "./tables";
import { motionFrame, type MotionBinding, type MotionTick } from "./motionClock";
import { registeredTimelineRows, toMs, type NoteTimelineScore } from "./timing";

export const TIMELINE_ORIGIN = 216000;
const EXTAP_BINDING: MotionBinding = { upper: 50, loop: true };
const f32 = Math.fround;

function clockValue(value: number): number {
  if (!Number.isFinite(value) || (value !== 0 && Math.abs(value) < 2 ** -126))
    throw new RangeError("Unsupported animation clock value");
  return value;
}

/** Absolute animation clock at the current note time, with no display-speed override. */
export function timelineFramesAt(state: DataView, score: NoteTimelineScore): number {
  const now = toMs(clockValue(state.getFloat32(NOTE_FIELDS.now, true)));
  let position = now;
  const rows = registeredTimelineRows(score, 0);
  if (rows) {
    for (const { start, end, value } of rows) {
      if (start >= now) break;
      const weight = f32(value - 1);
      position = clockValue(f32(position + f32(f32((now < end ? now : end) - start) * weight)));
      if (now < end) break;
    }
    return clockValue(f32(f32(position * SPAWN_CONSTANTS.framesPerMs) + TIMELINE_ORIGIN));
  }
  const events = score.timeline.get(0);
  if (events) {
    if (events.byteLength % EVENT_STRIDE !== 0) throw new RangeError("Incomplete timeline rows");
    for (let at = 0; at < events.byteLength; at += EVENT_STRIDE) {
      const start = clockValue(events.getFloat32(at + NOTE_FIELDS.eventStart, true));
      if (start >= now) break;
      const end = clockValue(events.getFloat32(at + NOTE_FIELDS.eventEnd, true));
      const weight = f32(clockValue(events.getFloat32(at + NOTE_FIELDS.eventValue, true)) - 1);
      position = clockValue(f32(position + f32(f32((now < end ? now : end) - start) * weight)));
      if (now < end) break;
    }
  }
  return clockValue(f32(f32(position * SPAWN_CONSTANTS.framesPerMs) + TIMELINE_ORIGIN));
}

/**
 * Reconstructs the unit-rate ExTAP phase after one application tick inside its synchronization window.
 * The caller supplies the manager's absolute timeline frame, not a note-relative age.
 */
export function extapFrame(absoluteFrame: number, tick: MotionTick): number {
  const absolute = f32(absoluteFrame);
  if (!Number.isFinite(absolute) || absolute < 0 || (absolute !== 0 && absolute < 2 ** -126))
    throw new RangeError("Unsupported absolute animation frame");
  return motionFrame(EXTAP_BINDING, absolute, tick);
}

/** Sub-step timeline displacement, without rounding the large absolute animation epoch to float32. */
export function timelineFrameDisplacement(
  score: NoteTimelineScore,
  fromFrames: number,
  toFrames: number,
): number {
  const from = (fromFrames / 60) * 1000;
  const to = (toFrames / 60) * 1000;
  let elapsed = to - from;
  const rows = registeredTimelineRows(score, 0);
  if (rows) {
    for (const row of rows) {
      if (row.start >= to) break;
      elapsed += Math.max(0, Math.min(to, row.end) - Math.max(from, row.start)) * (row.value - 1);
    }
  } else {
    const events = score.timeline.get(0);
    if (events)
      for (let at = 0; at < events.byteLength; at += EVENT_STRIDE) {
        const start = events.getFloat32(at + NOTE_FIELDS.eventStart, true);
        if (start >= to) break;
        const end = events.getFloat32(at + NOTE_FIELDS.eventEnd, true);
        elapsed +=
          Math.max(0, Math.min(to, end) - Math.max(from, start)) *
          (events.getFloat32(at + NOTE_FIELDS.eventValue, true) - 1);
      }
  }
  return (elapsed * 60) / 1000;
}
