import { describe, expect, it } from "vitest";
import type { Pack, PackEntry } from "../assets/packFormat";
import { buildRecordPlans } from "./recordPlans";
import type { NoteScore } from "./score";

function tapWithAir() {
  const record = new DataView(new ArrayBuffer(0x164));
  record.setFloat32(8, 1000, true);
  record.setInt32(0x10, 0, true);
  record.setInt32(0x14, 3, true);
  record.setInt32(0x28, 4, true);
  record.setInt32(0x2c, 3, true);
  return record;
}

function packWithModels(models: readonly [number, number | null][]): Pack {
  const entries = new Map<string, PackEntry>();
  for (const [id, units] of models) {
    const name = `note/model/${id}`;
    entries.set(name, {
      name,
      kind: "table",
      offset: 0,
      length: 0,
      meta: {
        units,
        meshes: [`mesh/${id}`],
        layer: 20,
        pass: 2,
        widthBase: 15,
        initialKey: 0x8580,
        widthStepI32: -1,
      },
    });
  }
  return { version: 1, engine: "chunithm", bytes: new Uint8Array(), entries };
}

function scoreWith(record: DataView): NoteScore {
  return { records: [record], timeline: new Map(), scroll: new DataView(new ArrayBuffer(0)) };
}

describe("buildRecordPlans model availability", () => {
  it("rejects AIR solid records rather than constructing an empty plan", () => {
    const record = tapWithAir();
    record.setInt32(0x10, 10, true);
    record.setInt32(0x14, -1, true);
    expect(() => buildRecordPlans(packWithModels([]), scoreWith(record))).toThrow(
      /record 0.*AIR solid.*not supported/,
    );
  });

  it("keeps non-displayed region records as model-free plans", () => {
    const record = tapWithAir();
    record.setInt32(0x10, 12, true);
    record.setInt32(0x14, -1, true);
    expect(buildRecordPlans(packWithModels([]), scoreWith(record)).plans[0].model).toBeNull();
  });

  it("rejects an AIR HOLD whose element vector was not carried into the score", () => {
    const record = tapWithAir();
    record.setInt32(0x14, 5, true);
    expect(() => buildRecordPlans(packWithModels([[78, 16]]), scoreWith(record))).toThrow(
      /record 0.*AIR HOLD.*element vector/,
    );
  });

  it("rejects a missing selected AIR model instead of silently dropping the attachment", () => {
    expect(() => buildRecordPlans(packWithModels([[78, 16]]), scoreWith(tapWithAir()))).toThrow(
      /record 0.*AIR.*158/,
    );
  });

  it("does not substitute a different AIR model", () => {
    expect(() =>
      buildRecordPlans(
        packWithModels([
          [78, 16],
          [161, 16],
        ]),
        scoreWith(tapWithAir()),
      ),
    ).toThrow(/record 0.*AIR.*158/);
  });

  it("rejects a missing primary model even when its attachment is available", () => {
    expect(() => buildRecordPlans(packWithModels([[158, 16]]), scoreWith(tapWithAir()))).toThrow(
      /record 0.*78/,
    );
  });

  it("rejects a missing HOLD tail without erasing the entire note", () => {
    const record = tapWithAir();
    record.setInt32(0x10, 1, true);
    record.setInt32(0x14, -1, true);
    expect(() =>
      buildRecordPlans(
        packWithModels(Array.from({ length: 16 }, (_, i) => [i + 34, 16] as [number, number])),
        scoreWith(record),
      ),
    ).toThrow(/record 0.*tail/);
  });

  it("uses the selected AIR model's actual units when it is present", () => {
    const { plans } = buildRecordPlans(
      packWithModels([
        [78, 16],
        [158, 8],
      ]),
      scoreWith(tapWithAir()),
    );
    expect(plans[0].model?.id).toBe(78);
    expect(plans[0].air?.model.id).toBe(158);
    expect(plans[0].air?.plan.scale[0]).toBe(0.5);
  });

  it.each([
    [0x90, 6, /direction/],
    [0x94, 3, /colour/],
    [0x28, 33, /lane/],
    [0x2c, 16, /lane/],
  ] as const)(
    "rejects malformed AIR field %i even when the AIR model is absent",
    (field, value, error) => {
      const record = tapWithAir();
      record.setInt32(field, value, true);
      expect(() => buildRecordPlans(packWithModels([[78, 16]]), scoreWith(record))).toThrow(error);
    },
  );

  it.each([null, 1.5, Number.NaN])("rejects invalid units %s on a present AIR model", (units) => {
    expect(() =>
      buildRecordPlans(
        packWithModels([
          [78, 16],
          [158, units],
        ]),
        scoreWith(tapWithAir()),
      ),
    ).toThrow(/Model units/);
  });
  it("places attached AIR from the final SLIDE joint, not from the parent's head", () => {
    const record = tapWithAir();
    record.setInt32(0x10, 2, true);
    const joint = new DataView(new ArrayBuffer(36));
    joint.setFloat32(8, 5000, true);
    joint.setInt32(0x10, 8, true);
    joint.setInt32(0x20, 7, true);
    const score = scoreWith(record);
    score.slideJoints = new Map([[0, [joint]]]);
    const pack = packWithModels(Array.from({ length: 400 }, (_, i) => [i, 16] as [number, number]));
    const { plans } = buildRecordPlans(pack, score);
    expect(plans[0].air?.plan.timeFrames).toBe(300);
    expect(plans[0].air?.plan.lane).toBe(8);
    expect(plans[0].air?.plan.width).toBe(8);
    expect(plans[0].air?.model.id).toBe(154);
  });
});

it("rejects unknown primary or secondary note families rather than creating empty plans", () => {
  const record = tapWithAir();
  record.setInt32(0x10, 99, true);
  record.setInt32(0x14, -1, true);
  expect(() => buildRecordPlans(packWithModels([]), scoreWith(record))).toThrow(
    /unsupported.*primary/i,
  );
  record.setInt32(0x10, 0, true);
  record.setInt32(0x14, 99, true);
  expect(() => buildRecordPlans(packWithModels([[78, 16]]), scoreWith(record))).toThrow(
    /unsupported.*secondary/i,
  );
});

describe("draw order of planned models", () => {
  it("carries each model's initial sort key and refuses a model entry without one", () => {
    const pack = packWithModels([
      [78, 16],
      [158, 16],
    ]);
    const { plans } = buildRecordPlans(pack, scoreWith(tapWithAir()));
    expect(plans[0].model?.initialKey).toBe(0x8580);
    expect(plans[0].air?.model.initialKey).toBe(0x8580);
    const entry = pack.entries.get("note/model/78")!;
    const meta = { ...(entry.meta as Record<string, unknown>) };
    delete meta.initialKey;
    (pack.entries as Map<string, PackEntry>).set(entry.name, { ...entry, meta });
    expect(() => buildRecordPlans(pack, scoreWith(tapWithAir()))).toThrow(
      /note\/model\/78.*initial sort key/,
    );
  });

  it("carries a model's instanced group and refuses a malformed one", () => {
    const pack = packWithModels([
      [78, 16],
      [158, 16],
    ]);
    const entry = pack.entries.get("note/model/78")!;
    const withGroup = (instanceGroup: unknown) =>
      (pack.entries as Map<string, PackEntry>).set(entry.name, {
        ...entry,
        meta: { ...(entry.meta as Record<string, unknown>), instanceGroup },
      });
    expect(
      buildRecordPlans(pack, scoreWith(tapWithAir())).plans[0].model?.instanceGroup,
    ).toBeNull();
    withGroup({ sphere: [0, 2.5, 3, 56.5], capacity: 2048 });
    const { plans } = buildRecordPlans(pack, scoreWith(tapWithAir()));
    expect(plans[0].model?.instanceGroup).toEqual({ sphere: [0, 2.5, 3, 56.5], capacity: 2048 });
    expect(plans[0].air?.model.instanceGroup).toBeNull();
    for (const malformed of [
      { sphere: [0, 1, 2], capacity: 4 },
      { sphere: [0, 1, 2, Number.NaN], capacity: 4 },
      { sphere: [0, 1, 2, 0.1], capacity: 4 },
      { sphere: [0, 1, 2, 3], capacity: 0 },
      null,
    ]) {
      withGroup(malformed);
      expect(() => buildRecordPlans(pack, scoreWith(tapWithAir()))).toThrow(
        /note\/model\/78.*instance group/,
      );
    }
  });
});
