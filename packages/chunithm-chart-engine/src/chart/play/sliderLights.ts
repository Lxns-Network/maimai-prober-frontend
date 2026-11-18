import { LANE_COUNT } from "./input";
import type { SliderLightOutput } from "./player";

const LIGHT_COUNT = LANE_COUNT * 2 - 1;
const STEPS_PER_LIGHT_UPDATE = 4;
const PUSH_LOOP_END = 29;

interface SliderLights extends SliderLightOutput {
  selectDivider(row: number): void;
  reset(touched?: number): void;
}

/** RGB in physical order: panel, divider, panel. The writer must consume the frame synchronously. */
export function createSliderLights(
  write: (rgb: Uint8Array) => void,
  dividerRow: number,
): SliderLights {
  const rgb = new Uint8Array(LIGHT_COUNT * 3);
  const frames = new Float32Array(LANE_COUNT);
  const groups: { lanes: number; mine: boolean }[] = [];
  let white = 0;
  let success = 0;
  let mine = 0;
  let dirty = false;
  let frameReady = false;

  const setDividers = (row: number) => {
    const lanesPerDivision = LANE_COUNT >> row;
    for (let lane = 1; lane < LANE_COUNT; lane++) {
      const offset = (lane * 2 - 1) * 3;
      const divider = lane % lanesPerDivision === 0;
      rgb[offset] = 255;
      rgb[offset + 1] = divider ? 0 : 255;
      rgb[offset + 2] = divider ? 255 : 0;
    }
  };

  function sample(advance: number) {
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const bit = 1 << lane;
      const offset = lane * 6;
      if (!((white | success | mine) & bit)) {
        rgb[offset] = rgb[offset + 1] = 255;
        rgb[offset + 2] = 0;
        continue;
      }
      const frame = (frames[lane] + advance) % PUSH_LOOP_END;
      frames[lane] = frame;
      const mix = frame <= 14 ? frame / 14 : (PUSH_LOOP_END - frame) / 15;
      if (mine & bit) {
        rgb[offset] = 0;
        rgb[offset + 1] = Math.trunc(255 * mix);
        rgb[offset + 2] = 255;
      } else if (success & bit) {
        rgb[offset] = 255;
        rgb[offset + 1] = Math.trunc(164 * mix);
        rgb[offset + 2] = Math.trunc(128 + 127 * mix);
      } else {
        // The white overlay blends into the yellow base, then the LEDs scale RGB by the blended alpha.
        const alpha = Math.trunc(255 - 127 * mix);
        const blendedAlpha = Math.trunc(255 - alpha + (alpha * alpha) / 255);
        rgb[offset] = rgb[offset + 1] = blendedAlpha;
        rgb[offset + 2] = Math.trunc((alpha * blendedAlpha) / 255);
      }
    }
  }

  function reset(touched = 0) {
    groups.length = 0;
    white = touched;
    success = mine = 0;
    frames.fill(0);
    dirty = frameReady = false;
    sample(0);
    write(rgb);
  }

  setDividers(dividerRow);
  reset();
  return {
    hit(lanes, isMine) {
      // A new note supersedes each older group it overlaps, including that group's other lanes.
      for (let i = groups.length - 1; i >= 0; i--) if (groups[i].lanes & lanes) groups.splice(i, 1);
      groups.push({ lanes, mine: isMine });
    },
    step(step, touched, sustained) {
      let nextSuccess = sustained;
      let nextMine = 0;
      for (let i = groups.length - 1; i >= 0; i--) {
        const group = groups[i];
        if (!(group.lanes & touched)) groups.splice(i, 1);
        else if (group.mine) nextMine |= group.lanes;
        else nextSuccess |= group.lanes;
      }
      nextSuccess &= ~nextMine;
      const nextWhite = touched & ~(nextSuccess | nextMine);
      const changed = (nextWhite ^ white) | (nextMine ^ mine) | (nextSuccess ^ success);
      for (let bits = changed; bits; bits &= bits - 1) frames[31 - Math.clz32(bits & -bits)] = 0;
      white = nextWhite;
      success = nextSuccess;
      mine = nextMine;
      dirty ||= !!changed;
      // At 120 judgment steps/s the animation advances half a frame, then USB gets that sample two steps later.
      const phase = step % STEPS_PER_LIGHT_UPDATE;
      if (phase === 0 && (dirty || white || success || mine)) {
        sample(0.5);
        dirty = false;
        frameReady = true;
      } else if (phase === 2 && frameReady) {
        frameReady = false;
        write(rgb);
      }
    },
    selectDivider(row: number) {
      setDividers(row);
      write(rgb);
    },
    reset,
  };
}
