import { describe, expect, it } from "vitest";
import type { ModelPlan } from "./evaluate";
import { planAirHold } from "./airHoldParts";
import { type NoteScore } from "./score";
import { NOTE_WIDTHS } from "./tables";
const model = (id: number): ModelPlan => ({
  id,
  layer: 20,
  pass: 2,
  widthBase: 1,
  initialKey: 0x8580,
  widthStepI32: 0,
  units: 16,
  modelScaleZ: 1.2999999523162842,
  meshes: [],
});
const f = Math.fround;
const holdRecord = (fields: {
  type: number;
  lane: number;
  width: number;
  time: number;
  tail: number;
  flag: number;
}) => {
  const view = new DataView(new ArrayBuffer(0x164));
  view.setInt32(0x10, fields.type, true);
  view.setInt32(0x14, 5, true);
  view.setInt32(0x28, fields.lane, true);
  view.setInt32(0x2c, fields.width, true);
  view.setFloat32(8, fields.time, true);
  view.setFloat32(0x20, fields.tail, true);
  view.setFloat32(0x38, fields.time + 1000, true);
  view.setInt32(0x70, 11, true);
  view.setInt32(0x74, 22, true);
  view.setUint8(0x24, fields.flag);
  return view;
};
const joint = (time: number, lane = 0, width = 0) => {
  const view = new DataView(new ArrayBuffer(36));
  view.setFloat32(8, time, true);
  view.setInt32(0x10, lane, true);
  view.setInt32(0x20, width, true);
  return view;
};
const scoreOf = (
  holds: Map<number, DataView[]>,
  slideJoints?: Map<number, DataView[]>,
): NoteScore => ({
  records: [],
  timeline: new Map(),
  scroll: new DataView(new ArrayBuffer(0)),
  airHolds: holds,
  slideJoints,
});
describe("planAirHold", () => {
  it("takes the head from the record on a tap parent and from the tail position on a hold parent", () => {
    const base = { lane: 4, width: 3, time: 5000, tail: 9000, flag: 0 };
    const tap = planAirHold(holdRecord({ ...base, type: 0 }), 0, scoreOf(new Map([[0, []]])), [], {
      model,
    });
    expect([tap.headFrames, tap.headKey]).toEqual([f(f(5000) * 0.05999999865889549), 11]);
    const hold = planAirHold(holdRecord({ ...base, type: 1 }), 0, scoreOf(new Map([[0, []]])), [], {
      model,
    });
    expect([hold.headFrames, hold.headKey]).toEqual([f(f(6000) * 0.05999999865889549), 22]);
    expect(tap.tailFrames).toBe(f(f(9000) * 0.05999999865889549));
  });
  it("takes lane, width and head time from the last joint of a slide parent", () => {
    const record = holdRecord({ type: 2, lane: 1, width: 0, time: 5000, tail: 9000, flag: 0 });
    const chain = [joint(6000, 2, 1), joint(7000, 8, 3)];
    const plan = planAirHold(record, 4, scoreOf(new Map([[4, []]]), new Map([[4, chain]])), [], {
      model,
    });
    expect(plan.headFrames).toBe(f(f(7000) * 0.05999999865889549));
    expect(plan.width).toBe(NOTE_WIDTHS[3]);
    expect(plan.headKey).toBe(22);
    expect(() => planAirHold(record, 4, scoreOf(new Map([[4, []]])), [], { model })).toThrow(
      /parent joints/,
    );
  });
  it("rejects an unsupported parent type or a missing element vector", () => {
    const record = holdRecord({ type: 3, lane: 4, width: 3, time: 5000, tail: 9000, flag: 0 });
    expect(() => planAirHold(record, 0, scoreOf(new Map([[0, []]])), [], { model })).toThrow(
      /parent type 3/,
    );
    const tap = holdRecord({ type: 0, lane: 4, width: 3, time: 5000, tail: 9000, flag: 0 });
    expect(() => planAirHold(tap, 0, scoreOf(new Map()), [], { model })).toThrow(/element vector/);
  });
  it("adds a tail element to the element joints when the record asks for one", () => {
    const record = holdRecord({ type: 0, lane: 4, width: 3, time: 5000, tail: 9000, flag: 1 });
    const joints = [joint(6000), joint(7000)];
    const plan = planAirHold(record, 0, scoreOf(new Map([[0, joints]])), [], { model });
    expect(plan.elements.map((e) => e.k)).toEqual([0, 1, 2]);
    expect(plan.elements[2].timeFrames).toBe(plan.tailFrames);
    expect(plan.elements[0].timeFrames).toBe(f(f(6000) * 0.05999999865889549));
    const bare = planAirHold(
      holdRecord({ type: 0, lane: 4, width: 3, time: 5000, tail: 9000, flag: 0 }),
      0,
      scoreOf(new Map([[0, joints]])),
      [],
      { model },
    );
    expect(bare.elements).toHaveLength(2);
  });
  it("selects the model of each part by the width index", () => {
    const widths = [1, 4, 16].map((w) => NOTE_WIDTHS.indexOf(w));
    const ids = widths.map((index) => {
      const record = holdRecord({
        type: 0,
        lane: 4,
        width: index,
        time: 5000,
        tail: 9000,
        flag: 1,
      });
      const plan = planAirHold(record, 0, scoreOf(new Map([[0, []]])), [], { model });
      return [
        plan.head.id,
        plan.body.id,
        plan.elements[0].models[0].id,
        plan.elements[0].models[1].id,
        plan.plain.id,
        plan.tail.id,
      ];
    });
    expect(ids).toEqual([
      [161, 323, 357, 373, 306, 307],
      [158, 320, 354, 370, 306, 307],
      [146, 308, 342, 358, 306, 307],
    ]);
  });
});
