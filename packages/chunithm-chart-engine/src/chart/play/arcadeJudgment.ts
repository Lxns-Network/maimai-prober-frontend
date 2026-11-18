import { AIR_BEAM_COUNT, LANE_COUNT, type SurfaceSample } from "./input";

// JP 2.50 C521C0: leaving the sensor stack above or below it retains the side of exit.
function handHeight(mask: number, previous: number) {
  if (!mask) return previous >= 140 ? 215 : 65;
  if ((mask & 5) === 1 && !(mask & 0x38)) return mask & 2 ? 95 : 75;
  if (!(mask & 15) && mask & 32) return mask & 16 ? 185 : 205;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < AIR_BEAM_COUNT; i++)
    if (mask & (1 << i)) {
      sum += i;
      count++;
    }
  return 90 + Math.floor((sum / count) * 20);
}

/** One history entry per game input step, independent of the controller's report rate. */
export function createAirSensor(config: DataView) {
  const integer = (index: number) => config.getInt32(4 * (1 + index), true);
  const rows = Array.from({ length: 7 }, (_, i) => {
    const index = 18 + i * 4;
    return {
      log: integer(index),
      abs: integer(index + 1),
      up: integer(index + 2),
      down: integer(index + 3),
    };
  });
  const changes = new Int16Array(Math.max(1, ...rows.map((row) => row.log)));
  const history = new Uint8Array(Math.max(1, integer(14)));
  const counts = new Uint16Array(AIR_BEAM_COUNT);
  let stale = 0;
  let height = 65;
  let cursor = 0;
  let position = 0;
  let lastBeam = 0;
  let gap = 0;
  return ({ beams, blockedBeams = 0 }: SurfaceSample, airInUse: boolean) => {
    // Suppress a beam which was continuously obstructed in the recent samples.
    for (let i = 0; i < AIR_BEAM_COUNT; i++) {
      const bit = 1 << i;
      if (counts[i] < integer(15)) stale &= ~bit;
      else if (!airInUse) stale |= bit;
      counts[i] += Number(!!(beams & bit)) - Number(!!(history[position] & bit));
    }
    history[position] = beams;
    position = (position + 1) % history.length;
    const active = beams & ~stale;
    let sample = active;
    if (active) {
      const lower = Math.min(lastBeam, active);
      const upper = Math.max(lastBeam, active);
      // A quick sweep across a continuously blocked channel passes its height between reports.
      if (
        lower !== 0 &&
        !(lower & (lower - 1)) &&
        upper === lower << 2 &&
        blockedBeams & (lower << 1) &&
        gap < changes.length
      )
        sample = lower << 1;
      lastBeam = active;
      gap = 0;
    } else gap++;
    const next = handHeight(sample, height);
    const delta = next - height;
    changes[cursor] = Math.abs(delta) > 50 ? 0 : delta;
    height = next;
    let actions = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let up = 0;
      let down = 0;
      for (let n = 0; n < row.log; n++) {
        const d = changes[(cursor + changes.length - n) % changes.length];
        if (d > 0) up += d;
        else down -= d;
      }
      if (up + down >= row.abs || up >= row.up || down >= row.down) actions |= 1 << i;
    }
    cursor = (cursor + 1) % changes.length;
    const inStack = height >= integer(17) && height <= integer(16);
    return actions | (inStack ? 128 : 0);
  };
}

/** C444B0 tracks extrema of the combined contact centre and each electrode row separately. */
export function createSlash(lane: number, width: number, config: DataView) {
  const row = LANE_COUNT - width;
  const reach = config.getInt32(4 * (47 + row), true);
  const move = config.getFloat32(0x4d0 + 4 * row, true);
  const first = Math.max(0, lane);
  const end = Math.min(LANE_COUNT, lane + width);
  const pad = Math.trunc((reach - (end - first) + 1) / 2);
  const lo = Math.max(0, first - pad);
  const hi = Math.min(LANE_COUNT, end + pad);
  const tracks = Array.from({ length: 3 }, () => ({ min: Infinity, max: -Infinity, edge: 0 }));
  return (front: number, rear: number) => {
    let moved = false;
    for (let i = 0; i < 3; i++) {
      const mask = i === 0 ? front | rear : i === 1 ? front : rear;
      const track = tracks[i];
      let sum = 0,
        count = 0;
      for (let l = lo; l < hi; l++)
        if (mask & (1 << l)) {
          sum += l;
          count++;
        }
      let centre: number;
      if (count) {
        centre = sum / count + 0.5;
        track.edge =
          !first && (front | rear) & 1 ? -1 : end === LANE_COUNT && (front | rear) & 0x8000 ? 1 : 0;
      } else if (track.edge) {
        centre = track.edge === -1 ? -0.5 : LANE_COUNT + 0.5;
        track.edge = 0;
      } else continue;
      track.min = Math.min(track.min, centre);
      track.max = Math.max(track.max, centre);
      if (track.max - track.min >= move) moved = true;
    }
    return moved;
  };
}

/** KEEP grades the longest break since the preceding scoring tick, including one spanning ticks. */
export function createKeep(start: number) {
  let lastContact = start,
    worst = 0,
    gap = 0,
    contacted = false;
  return {
    sample(now: number, down: boolean) {
      if (down) {
        lastContact = now;
        contacted = true;
      }
      gap = now - lastContact;
      worst = Math.max(worst, gap);
      return contacted ? worst : Infinity;
    },
    commit() {
      worst = gap;
    },
  };
}
/** B3E1A0 prepares TRIG/AREA intervals per segment and lane; crossing times follow the expanded edges. */
export function createSlideAreas(
  record: DataView,
  joints: readonly DataView[],
  config: DataView,
  offset: number,
  framesPerMs: number,
) {
  const point = (time: number, lane: number, width: number) => {
    const at = 0x730 + 20 * (LANE_COUNT - width);
    return {
      time,
      lane,
      end: lane + width,
      pad: (config.getFloat32(at, true) - width) / 2,
      windows: Array.from(
        { length: 4 },
        (_, i) => config.getFloat32(at + 4 + i * 4, true) + offset,
      ),
    };
  };
  let a = point(
    record.getFloat32(8, true) * framesPerMs,
    record.getInt32(0x28, true),
    record.getInt32(0x2c, true) + 1,
  );
  const areas: { lane: number; enter: number; open: number; close: number; leave: number }[] = [];
  for (const joint of joints) {
    const b = point(
      joint.getFloat32(8, true) * framesPerMs,
      joint.getInt32(0x10, true),
      joint.getInt32(0x20, true) + 1,
    );
    for (
      let lane = Math.max(0, Math.min(a.lane, b.lane));
      lane < Math.min(LANE_COUNT, Math.max(a.end, b.end));
      lane++
    ) {
      const crossing = (left: boolean) => {
        const x = lane + 0.5;
        const d1 = Math.abs(x - (left ? a.lane - a.pad : a.end + a.pad));
        const d2 = Math.abs(x - (left ? b.lane - b.pad : b.end + b.pad));
        return d1 / (d1 + d2);
      };
      const entry = lane >= a.lane && lane < a.end ? 0 : crossing(lane < a.lane);
      const exit = lane >= b.lane && lane < b.end ? 1 : crossing(lane < b.lane);
      const bound = (i: number, t: number) =>
        (a.time + a.windows[i]) * (1 - t) + (b.time + b.windows[i]) * t;
      areas.push({
        lane,
        enter: bound(0, entry),
        open: bound(1, entry),
        close: bound(2, exit),
        leave: bound(3, exit),
      });
    }
    a = b;
  }
  return (time: number) => {
    let active = 0,
      trigger = 0;
    for (const area of areas) {
      if (time < area.enter || time > area.leave) continue;
      trigger |= 1 << area.lane;
      if (time >= area.open && time <= area.close) active |= 1 << area.lane;
    }
    return { active, trigger };
  };
}

export interface GroundContacts {
  front: number;
  rear: number;
  previousFront: number;
  previousRear: number;
  usedFront: number;
  usedRear: number;
}

/** A long can inherit an electrode another long used on the preceding step. */
export function createContactGate() {
  let eligibleFront = 0,
    eligibleRear = 0;
  return (s: GroundContacts, trigger: number, active: number) => {
    const inherited = (s.front & s.previousFront) | (s.rear & s.previousRear);
    eligibleFront = trigger & (eligibleFront | (~s.front & ~inherited) | (s.front & inherited));
    eligibleRear = trigger & (eligibleRear | (~s.rear & ~inherited) | (s.rear & inherited));
    const f = active & s.front & eligibleFront,
      r = active & s.rear & eligibleRear;
    s.usedFront |= f;
    s.usedRear |= r;
    return !!(f | r);
  };
}
