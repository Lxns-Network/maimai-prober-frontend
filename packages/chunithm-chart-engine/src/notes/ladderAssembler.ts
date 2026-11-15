import type { Pack } from "../assets/packFormat";
import type { Timeline } from "../chart/timeline/reader";
import type { AirPoint } from "./airBand";
import { createAirBandAssembler, type AirBandPlan } from "./airBandAssembler";
import { regionKeyAt, regionRecords } from "./bandFrame";
import { bandOrderOf } from "./bandOrder";
import type { NoteScore } from "./score";
import { NOTE_WIDTHS } from "./tables";

const LADDER_TYPE = 9;
/** The only layer a ladder draws: the edge strips, textured with the ladder line image. */
const PROFILE = "note/band/slide/2/13";
const NO_TINT = 15;
/** V coordinate of each colour row of the ladder line image, as float32 bit patterns. */
const UV_ROWS: readonly number[] = [
  1042281188, 1064829767, 1063779513, 1062730937, 1061682361, 1060633785, 1059585209, 1058538311,
  1057488057, 1055917710, 1053817202, 1051723406, 1049622898, 1036026640, 1023275968, 0,
];
const f = Math.fround;
const frames = (time: number) => f(f(time) * 0.05999999865889549);
const widthOf = (index: number) => NOTE_WIDTHS[index] ?? 0;
const scratch = new DataView(new ArrayBuffer(4));
const fromBits = (bits: number) => (
  scratch.setUint32(0, bits >>> 0, true),
  scratch.getFloat32(0, true)
);

/** The bands of every AIR ladder; a ladder without a tint draws none. */
export function ladderBandPlans(score: NoteScore, pack: Pack): Map<number, AirBandPlan> {
  const plans = new Map<number, AirBandPlan>();
  const regions = regionRecords(score);
  score.records.forEach((record, index) => {
    if (record.getInt32(0x10, true) !== LADDER_TYPE) return;
    const ladder = score.ladders?.get(index);
    if (!ladder?.joints.length) throw new RangeError(`AIR ladder record ${index} has no joints`);
    const rawColour = record.getInt32(0x94, true);
    const colour = rawColour >= 0 && rawColour <= 15 ? rawColour : 0;
    if (colour === NO_TINT) return;
    const order = bandOrderOf(pack, PROFILE, "AIR ladder");
    const width = widthOf(record.getInt32(0x2c, true));
    const point = (lane: number, w: number, height: number, flag: number): AirPoint => ({
      width: f(w),
      lane: f(f(lane) + f(w * 0.5)),
      height: f(f(height) * f(0.1)),
      flag,
    });
    const elements = [point(record.getInt32(0x28, true), width, record.getInt32(0x9c, true), 0)];
    const times = [frames(record.getFloat32(8, true))];
    const keys = [record.getInt32(0x70, true)];
    ladder.joints.forEach((joint, k) => {
      const lane = joint.getInt32(0x10, true);
      const w = widthOf(joint.getInt32(0x20, true));
      elements.push(
        point(lane, w, joint.getInt32(0x18, true), k === ladder.joints.length - 1 ? 1 : 0),
      );
      times.push(frames(joint.getFloat32(8, true)));
      keys.push(regionKeyAt(regions, joint, lane, w));
    });
    plans.set(index, {
      times,
      keys,
      elements,
      narrow: rawColour !== 0 ? 1 : 0,
      generator: {
        i10: -1,
        i1c: -1,
        i28: 13,
        vMin: fromBits(UV_ROWS[colour]),
        vMax: fromBits(UV_ROWS[colour]),
        head: 0,
      },
      profiles: [null, null, PROFILE],
      layers: [0, 0, order.layer],
      initialKeys: [0, 0, order.initialKey],
      priority: (16 - width) & 255,
    });
  });
  return plans;
}

/** Appends AIR ladder edge bands to the shared buffer without clearing other families. */
export function createLadderBandAssembler(input: {
  score: NoteScore;
  manager: DataView;
  pack: Pack;
  timeline: Timeline;
}) {
  return createAirBandAssembler({
    score: input.score,
    manager: input.manager,
    timeline: input.timeline,
    plans: ladderBandPlans(input.score, input.pack),
  });
}
