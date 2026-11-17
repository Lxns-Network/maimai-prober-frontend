import { LANES, type KeyBindings } from "../options/keyBindings";

/** A change of the controls a key made, before it has a chart time. */
export interface ControlChange {
  lanes: number;
  air: boolean;
  down: boolean;
}

/**
 * Turns bound key presses into lane and AIR changes. A lane is let go only once every key holding it
 * is up, and the AIR sensor once every AIR key is, so overlapping keys and controllers in keyboard
 * mode report one touch per lane.
 */
export function createKeyControls() {
  const down = new Set<string>();
  const holders = new Uint8Array(LANES);
  let airHolders = 0;
  return {
    /** Whether `code` is bound to anything. */
    bound(bindings: KeyBindings, code: string) {
      return bindings.air.includes(code) || bindings.lanes.some((keys) => keys.includes(code));
    },
    /** The change a key event makes; null for an unbound key or a key repeat. */
    change(bindings: KeyBindings, code: string, pressed: boolean): ControlChange | null {
      if (pressed === down.has(code)) return null;
      if (pressed) down.add(code);
      else down.delete(code);
      if (bindings.air.includes(code)) {
        airHolders += pressed ? 1 : -1;
        if (pressed ? airHolders !== 1 : airHolders !== 0) return null;
        return { lanes: 0, air: true, down: pressed };
      }
      let lanes = 0;
      bindings.lanes.forEach((keys, lane) => {
        if (!keys.includes(code)) return;
        holders[lane] += pressed ? 1 : -1;
        if (pressed ? holders[lane] === 1 : holders[lane] === 0) lanes |= 1 << lane;
      });
      return lanes ? { lanes, air: false, down: pressed } : null;
    },
    /** Lets go of every key, returning the changes that makes. */
    releaseAll(): ControlChange[] {
      const changes: ControlChange[] = [];
      let lanes = 0;
      holders.forEach((count, lane) => {
        if (count) lanes |= 1 << lane;
      });
      if (lanes) changes.push({ lanes, air: false, down: false });
      if (airHolders) changes.push({ lanes: 0, air: true, down: false });
      down.clear();
      holders.fill(0);
      airHolders = 0;
      return changes;
    },
  };
}
