import { describe, expect, it } from "vitest";
import { planAirSlide } from "./airSlideParts";
import type { ModelPlan } from "./evaluate";
import type { NoteScore } from "./score";

const DEF = 0;
const GRN = 1;
const PNK = 2;

function airSlide(colour: number) {
  const record = new DataView(new ArrayBuffer(0x164));
  record.setFloat32(8, 1000, true);
  record.setInt32(0x10, 0, true);
  record.setInt32(0x28, 2, true);
  record.setInt32(0x2c, 3, true);
  record.setInt32(0x94, colour, true);
  record.setInt32(0x9c, 10, true);
  const joint = new DataView(new ArrayBuffer(36));
  joint.setFloat32(8, 1500, true);
  joint.setInt32(0x10, 2, true);
  joint.setInt32(0x18, 20, true);
  joint.setInt32(0x20, 3, true);
  const score = { records: [record], airSlides: new Map([[0, [joint]]]) } as unknown as NoteScore;
  const model = (id: number): ModelPlan => ({
    id,
    layer: 0,
    pass: 0,
    widthBase: 0,
    initialKey: 0x8580,
    widthStepI32: 0,
    units: null,
    modelScaleZ: 1,
    meshes: [],
  });
  return () => planAirSlide(record, 0, score, [], { model });
}

describe("AIR slide colour", () => {
  it("plans the default and green variants with their own band resources", () => {
    expect(airSlide(DEF)().band.resources).toEqual([11, 4, 12]);
    expect(airSlide(GRN)().band.resources).toEqual([7, 4, 8]);
  });

  it("refuses a pink AIR slide by name", () => {
    expect(airSlide(PNK)).toThrow(/AIR slide record 0 colour PNK is not supported/);
  });
});
