import type { NoteScore } from "../notes/score";
import { depthAt } from "../notes/space";
import { speedForRowIndex } from "../notes/tables";
import { timelineIntegral, toFrames, toMs, windowPredicate } from "../notes/timing";
import { DEPTH_SCALE } from "../notes/recordPlans";

const f = Math.fround;
export const BAR_CAPACITY = 512;

/** Reuses its output until the next call; positions follow SFL channel zero without DCM scaling. */
export function createBarlinePositions() {
  const state = new DataView(new ArrayBuffer(0x3b0));
  const positions = new Float32Array(BAR_CAPACITY);
  state.setFloat32(0x358, DEPTH_SCALE, true);
  return (score: NoteScore, seconds: number, speedRow: number, multiplier: number) => {
    const now = f(seconds * 60);
    const nowMs = toMs(now);
    state.setFloat32(0x300, now, true);
    state.setFloat32(0x354, speedForRowIndex(speedRow) * multiplier, true);
    const times = score.barTimes!;
    let low = 0;
    let high = times.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (times[mid] <= nowMs) low = mid + 1;
      else high = mid;
    }
    let count = 0;
    for (let i = Math.max(1, low); i < times.length && count < BAR_CAPACITY; i++) {
      const time = times[i];
      if (!windowPredicate(state, score, 0, toFrames(time), 1, 0)) continue;
      const delta = toFrames(f(timelineIntegral(score, 0, nowMs, time) - nowMs));
      const z = depthAt(state, delta, 1, 0, score.scroll);
      if (z >= -550 && z <= 40) positions[count++] = z;
    }
    return positions.subarray(0, count);
  };
}

/** Ground-plane span of ten pixels in the 1080-line game viewport, independent of canvas resolution. */
export function barlineScale(viewProjection: ArrayLike<number>, z: number): number {
  const m = viewProjection;
  const y = (m[6] * z + m[7]) / (m[14] * z + m[15]);
  const offset = 10 / 1080;
  const groundZ = (screenY: number) => (m[7] - screenY * m[15]) / (screenY * m[14] - m[6]);
  return f((groundZ(y - offset) - groundZ(y + offset)) * 0.3448275625705719);
}
