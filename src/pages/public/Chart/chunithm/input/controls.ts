import {
  LANE_COUNT,
  type ControlChange,
} from "@lxns-network/chunithm-chart-engine/chart/play/input";

/** Ground lanes and AIR sensor one key or touch holds. */
export interface Hold {
  lanes: number;
  air: boolean;
}

export const NO_HOLD: Hold = { lanes: 0, air: false };

/**
 * Merges overlapping keys and touches. A lane or AIR is released only when its last holder lets go.
 */
export function createControls() {
  const holds = new Map<string, Hold>();
  const laneHolders = new Uint8Array(LANE_COUNT);
  let airHolders = 0;
  return {
    /**
     * Sets what `holder` holds and returns the changes that makes, presses before releases, so a
     * touch moving across lanes never lets go of the ground between them.
     */
    hold(holder: string, next: Hold): ControlChange[] {
      const previous = holds.get(holder) ?? NO_HOLD;
      if (next.lanes || next.air) holds.set(holder, next);
      else holds.delete(holder);
      let pressed = 0;
      let released = 0;
      for (let lane = 0; lane < LANE_COUNT; lane++) {
        const bit = 1 << lane;
        const holding = (next.lanes & bit) !== 0;
        if (holding === ((previous.lanes & bit) !== 0)) continue;
        laneHolders[lane] += holding ? 1 : -1;
        if (holding && laneHolders[lane] === 1) pressed |= bit;
        if (!holding && laneHolders[lane] === 0) released |= bit;
      }
      const changes: ControlChange[] = [];
      if (pressed) changes.push({ lanes: pressed, air: false, down: true });
      if (next.air !== previous.air) {
        airHolders += next.air ? 1 : -1;
        if (next.air ? airHolders === 1 : airHolders === 0)
          changes.push({ lanes: 0, air: true, down: next.air });
      }
      if (released) changes.push({ lanes: released, air: false, down: false });
      return changes;
    },
    /** Lets go of everything held, returning the changes that makes. */
    releaseAll(): ControlChange[] {
      const changes: ControlChange[] = [];
      let lanes = 0;
      laneHolders.forEach((count, lane) => {
        if (count) lanes |= 1 << lane;
      });
      if (lanes) changes.push({ lanes, air: false, down: false });
      if (airHolders) changes.push({ lanes: 0, air: true, down: false });
      holds.clear();
      laneHolders.fill(0);
      airHolders = 0;
      return changes;
    },
  };
}
