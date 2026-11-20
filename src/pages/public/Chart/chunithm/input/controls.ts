import type {
  ButtonHold,
  ControlChange,
} from "@lxns-network/chunithm-chart-engine/chart/play/input";

export const NO_HOLD: ButtonHold = { lanes: 0, air: false };

export function createControls() {
  const holds = new Map<string | number, ButtonHold>();
  let lanes = 0;
  let air = false;
  const update = (airAction: boolean, fingerPress = 0, stroke?: number): ControlChange[] => {
    let nextLanes = 0;
    let nextAir = false;
    for (const hold of holds.values()) {
      nextLanes |= hold.lanes;
      nextAir ||= hold.air;
    }
    const changes: ControlChange[] = [];
    const pressed = (nextLanes & ~lanes) | fingerPress;
    const released = lanes & ~nextLanes;
    if (pressed) changes.push({ lanes: pressed, air: false, down: true, stroke });
    if (airAction) changes.push({ lanes: 0, air: true, down: true });
    if (air && !nextAir) changes.push({ lanes: 0, air: true, down: false });
    if (released) changes.push({ lanes: released, air: false, down: false });
    lanes = nextLanes;
    air = nextAir;
    return changes;
  };
  return {
    hold(holder: string | number, next: ButtonHold, stroke?: number, airAction = false) {
      const previous = holds.get(holder) ?? NO_HOLD;
      if (previous.lanes === next.lanes && previous.air === next.air && !airAction) return [];
      if (next.lanes || next.air) holds.set(holder, next);
      else holds.delete(holder);
      return update(
        airAction || (next.air && !previous.air),
        stroke === undefined ? 0 : next.lanes & ~previous.lanes,
        stroke,
      );
    },
    snapshot() {
      return { lanes, air };
    },
    releaseAll(): ControlChange[] {
      holds.clear();
      return update(false);
    },
  };
}
