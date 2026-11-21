import { LANE_COUNT } from "./input";

const HIDDEN = -1;
const EMPTY_TOUCH = 3;
const GRADE_DISPLAY = [HIDDEN, 2, 1, 0, 0];

/** Emits animation 100's display state when a lane changes; null stops its beam. */
export type KeyBeamOutput = (lane: number, displayState: number | null, step: number) => void;

/** Current screen beams and the judgment step at which each selected animation started. */
export interface KeyBeamFrame {
  active: number;
  display: Uint8Array;
  started: Int32Array;
}

/** A judged note shares one beam state across its width until its last touched lane is released. */
export function createKeyBeams(write: KeyBeamOutput) {
  const groups: { lanes: number; display: number }[] = [];
  const shown = new Int8Array(LANE_COUNT).fill(HIDDEN);
  const next = new Int8Array(LANE_COUNT);

  return {
    hit(lanes: number, grade: number) {
      for (let i = groups.length - 1; i >= 0; i--) {
        if (groups[i].lanes & lanes) groups.splice(i, 1);
      }
      groups.push({ lanes, display: GRADE_DISPLAY[grade] });
    },
    update(step: number, touched: number, hidden: number) {
      next.fill(HIDDEN);
      for (let bits = touched; bits; bits &= bits - 1) {
        next[31 - Math.clz32(bits & -bits)] = EMPTY_TOUCH;
      }
      for (let i = groups.length - 1; i >= 0; i--) {
        const group = groups[i];
        if (!(group.lanes & touched)) {
          groups.splice(i, 1);
          continue;
        }
        for (let bits = group.lanes; bits; bits &= bits - 1) {
          next[31 - Math.clz32(bits & -bits)] = group.display;
        }
      }
      for (let lane = 0; lane < LANE_COUNT; lane++) {
        const display = hidden & (1 << lane) ? HIDDEN : next[lane];
        if (display === shown[lane]) continue;
        shown[lane] = display;
        write(lane, display === HIDDEN ? null : display, step);
      }
    },
  };
}
