import { i32, realWidth, setI32, widthIndex, type ScoreRun } from "./common";
import { sampleJoints, retimeSamples } from "./production";

export const LANE_MIN = -16;
export const LANE_END = 32;

export function fitLane(lane: number, width: number) {
  const laneBefore = lane;
  const widthBefore = width;
  if (lane >= LANE_MIN && ((lane + width) | 0) < LANE_END) return { lane, width, changed: false };
  const left = (LANE_MIN - lane) | 0;
  if (left > 0) {
    width = Math.max(1, (width - left) | 0);
    lane = 0;
  }
  if (((width + lane - LANE_END) | 0) > 0) {
    width = Math.max(1, (LANE_END - lane) | 0);
    lane = (LANE_END - width) | 0;
  }
  return { lane, width, changed: laneBefore !== lane || widthBefore !== width };
}

export function fitLanes(run: ScoreRun): void {
  const fitJoint = (joint: DataView) => {
    const lane = i32(joint, 0x10);
    const width = realWidth(i32(joint, 0x20));
    if (lane < LANE_MIN) setI32(joint, 0x10, LANE_MIN);
    else if (((lane + width) | 0) >= LANE_END && lane > LANE_END - width)
      setI32(joint, 0x10, LANE_END - width);
  };
  for (const note of run.notes.items) {
    const view = note.view;
    const lane = i32(view, 0x28);
    const width = realWidth(i32(view, 0x2c));
    const fitted = fitLane(lane, width);
    setI32(view, 0x28, fitted.lane);
    if (fitted.changed) {
      setI32(view, 0x2c, widthIndex(fitted.width));
      run.diagnostics.push({
        kind: "note-position-fixed",
        laneBefore: lane,
        laneAfter: fitted.lane,
        widthBefore: width,
        widthAfter: fitted.width,
      });
    }
    const type = i32(view, 0x10);
    if (type === 2 || type === 9 || type === 10) {
      for (const joint of note.vectors["64"].items) fitJoint(joint);
      if (type === 9 || type === 10) {
        sampleJoints(run, note, i32(view, 0x6c));
        retimeSamples(run, note);
      }
    }
    if (i32(view, 0x14) === 8) for (const joint of note.vectors["80"].items) fitJoint(joint);
  }
}
