import { describe, expect, it } from "vitest";
import { bitsOf } from "./matrix";
import { IDENTITY } from "./worldMatrix";
import { computePlacement } from "./placement";
import {
  createEvaluateStore,
  depthArgument,
  evaluateInstances,
  planRecord,
  widthPriorityFor,
  type ModelPlan,
  type RecordPlan,
} from "./evaluate";
import { depthAt, registerImmutableScroll } from "./space";
import {
  effectiveTime,
  extendedDepthArgument,
  registerImmutableTimeline,
  type NoteTimelineScore,
} from "./timing";
import { sortKey } from "./render/drawGroups";
import { speedForRowIndex } from "./tables";
import type { ModelStates } from "./modelStates";
import { AIR_SLIDE_HEAD_PART } from "./airSlideParts";
import { GROUND_MAIN_PART, MINE_PART, PLAIN_AIR_PART } from "../chart/bake/events";
/**
 * A state view and a score whose scroll row is flat at one speed.
 *
 * The evaluator's depth reads the note state, so the test supplies the same fields the oracle's
 * driver set — the frame time at 0x300 and the speed at 0x308 — and a single scroll row.
 */
function stateAt(nowFrames: number, row: number): DataView {
  // Mirrors the oracle's driver exactly: the frame time at 0x300 and the speed row at 0x354. The
  // depth scale is the driver's 1.5. 0x308 is written by the note's own path, not the driver, so it
  // stays zero here as it did in the reference run.
  const state = new DataView(new ArrayBuffer(0x3b0));
  state.setFloat32(0x300, Math.fround(nowFrames), true);
  state.setFloat32(0x354, speedForRow(row), true);
  state.setFloat32(0x358, 1.5, true);
  state.setFloat32(0x3a4, 0, true);
  return state;
}
/** A scroll row covering the whole chart at a constant value. */
function scoreWith(scrollValue: number): NoteTimelineScore {
  const row = new DataView(new ArrayBuffer(32));
  row.setFloat32(8, -1e9, true);
  row.setFloat32(16, Math.fround(scrollValue), true);
  row.setFloat32(28, 1e9, true);
  const score: NoteTimelineScore = { records: [], timeline: new Map(), scroll: row };
  registerImmutableScroll(score.scroll);
  registerImmutableTimeline(score);
  return score;
}
describe("widthPriorityFor", () => {
  it("clamps to a byte, as the reference does", () => {
    expect(widthPriorityFor(8, 31, -2)).toBe(17);
    expect(widthPriorityFor(1, 31, -2)).toBe(31);
    expect(widthPriorityFor(16, 31, -2)).toBe(1);
    // Both ends clamp rather than wrapping, which is what makes the low byte a valid sort field.
    expect(widthPriorityFor(999, 31, -2)).toBe(0);
    expect(widthPriorityFor(999, 31, 200)).toBe(255);
  });
  it("agrees with a plain multiply over the reachable width domain", () => {
    // The reference uses an int32 multiply. Bit width stays below 2^53 for every width the width
    // table holds (1..16) and every operand the pack carries, so an ordinary multiply is the same
    // operation here; this pins that so a future change to a wider domain cannot pass silently.
    const i32 = (v: number) => v | 0;
    for (const width of [1, 2, 3, 8, 16])
      for (const base of [0, 31, -31, 255, -255])
        for (const step of [-2, -1, 0, 1, 2, 200, -200])
          expect({ width, base, step, got: widthPriorityFor(width, base, step) }).toEqual({
            width,
            base,
            step,
            got: Math.max(0, Math.min(255, i32(base + (width - 1) * step))),
          });
  });
});
describe("createEvaluateStore", () => {
  it("slices one twelve-float view per slot", () => {
    const store = createEvaluateStore(4);
    expect(store.worlds.length).toBe(48);
    // Every slot must point at its own region; sharing one would make the last write win.
    const seen = new Set<number>();
    for (const instance of store.instances) {
      seen.add(instance.world.byteOffset);
      expect(instance.world.length).toBe(12);
    }
    expect(seen.size).toBe(4);
  });
  it("gives every slot a sort joint of its own, apart from its world", () => {
    const store = createEvaluateStore(4);
    store.instances.forEach((instance, slot) => instance.sortJoint.fill(slot + 1));
    expect(store.instances.map((instance) => instance.sortJoint.length)).toEqual([12, 12, 12, 12]);
    expect(store.instances.map((instance) => [...new Set(instance.sortJoint)])).toEqual([
      [1],
      [2],
      [3],
      [4],
    ]);
    expect(store.worlds.every((value) => value === 0)).toBe(true);
  });
  it("rejects a non-positive capacity", () => {
    expect(() => createEvaluateStore(0)).toThrow(/positive integer/);
    expect(() => createEvaluateStore(1.5)).toThrow(/positive integer/);
  });
});
describe("evaluateInstances", () => {
  /** One record with a model entry that references two meshes. */
  const model: ModelPlan = {
    id: 12,
    layer: 20,
    pass: 2,
    widthBase: 31,
    initialKey: 0x8580,
    widthStepI32: -2,
    units: 16,
    modelScaleZ: 1,
    meshes: ["mesh/a", "mesh/b"],
  };
  it("hides a flat head on its result tick while its record is still retained", () => {
    const record = new DataView(new ArrayBuffer(356));
    record.setFloat32(8, 6217.61669921875, true);
    const plan = planRecord(record, { ...model, meshes: ["mesh/a"] }, 1.5, 0);
    const store = createEvaluateStore(4);
    const score = scoreWith(1.5);
    const drawn: number[] = [];
    for (const step of [745, 746, 747]) {
      drawn.push(
        evaluateInstances(
          {
            state: stateAt(step * 0.5, 0),
            score,
            meshMatrices: new Map(),
            plans: [plan],
            records: Int32Array.of(0),
            count: 1,
            nowFrames: step * 0.5,
            visibility: {
              head: Float64Array.of(6.216666666666667),
              air: Float64Array.of(Infinity),
            },
          },
          store,
        ),
      );
    }
    expect(drawn).toEqual([1, 0, 0]);
  });
  it("keeps an attached AIR after the head hides, until the AIR's own result", () => {
    const record = new DataView(new ArrayBuffer(356));
    record.setFloat32(8, 6217.61669921875, true);
    record.setInt32(0x14, 3, true);
    const air = {
      model: { ...model, id: 158, meshes: ["mesh/air"] },
      plan: {
        modelId: 158,
        direction: 0,
        colourFlag: 0,
        lane: 0,
        width: 1,
        timeFrames: 373.5,
        timelineKey: 0,
        position: [0, 0, -640] as const,
        scale: [1, 1, 1] as const,
      },
    };
    const plan = planRecord(record, { ...model, meshes: ["mesh/a"] }, 1.5, 0, null, air);
    const store = createEvaluateStore(4);
    const score = scoreWith(1.5);
    const drawn: string[][] = [];
    for (const step of [745, 746, 747, 745]) {
      const count = evaluateInstances(
        {
          state: stateAt(step * 0.5, 0),
          score,
          meshMatrices: new Map(),
          plans: [plan],
          records: Int32Array.of(0),
          count: 1,
          nowFrames: step * 0.5,
          visibility: { head: Float64Array.of(6.216666666666667), air: Float64Array.of(6.225) },
        },
        store,
      );
      drawn.push(store.instances.slice(0, count).map((instance) => instance.mesh));
    }
    expect(drawn).toEqual([["mesh/a", "mesh/air"], ["mesh/air"], [], ["mesh/a", "mesh/air"]]);
  });
  it("produces one instance per mesh the model references", () => {
    const record = new DataView(new ArrayBuffer(356));
    record.setInt32(0x2c, 7, true);
    const score = scoreWith(1.5);
    const plans: RecordPlan[] = [planRecord(record, model, 1.5, 0)];
    const store = createEvaluateStore(8);
    const count = evaluateInstances(
      {
        state: stateAt(100, 0),
        score,
        // The second mesh carries a translation of its own, so the composition must actually change
        // its matrix; an identity here would make both instances identical and the assertion vacuous.
        meshMatrices: new Map([
          ["mesh/a", null],
          ["mesh/b", [1, 0, 0, 7, 0, 1, 0, 0, 0, 0, 1, 0]],
        ]),
        plans,
        records: Int32Array.from([0]),
        count: 1,
        nowFrames: 100,
      },
      store,
    );
    expect(count).toBe(2);
    expect(store.instances[0].record).toBe(0);
    expect(store.instances[1].record).toBe(0);
    expect(store.instances[0].mesh).toBe("mesh/a");
    expect(store.instances[1].mesh).toBe("mesh/b");
    expect(store.instances[0].model).toBe("note/model/12");
    // Both meshes share the record's key and depth; only the matrix differs.
    expect(store.instances[0].key).toBe(store.instances[1].key);
    expect(store.instances[0].depth).toBe(store.instances[1].depth);
    expect([...store.instances[0].world]).not.toEqual([...store.instances[1].world]);
  });
  it("sorts every part a record draws as an instance of its model by that part's mesh matrix", () => {
    // Each mesh carries a matrix of its own, so a sort joint taken from the placement would differ.
    const meshMatrices = new Map<string, number[] | null>([
      ["mesh/a", null],
      ["mesh/b", [1, 0, 0, 7, 0, 1, 0, 0, 0, 0, 1, 0]],
      ["mesh/tail", [1, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1, 0]],
      ["mesh/joint", [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 3]],
    ]);
    const record = (milliseconds: number) => {
      const view = new DataView(new ArrayBuffer(356));
      view.setFloat32(8, milliseconds, true);
      view.setInt32(0x2c, 7, true);
      return view;
    };
    const plans: RecordPlan[] = [
      planRecord(record(2000), model, 1.5, 0),
      planRecord(record(3000), model, 1.5, 0),
      planRecord(record(2500), model, 1.5, 0, {
        model: { ...model, id: 13, meshes: ["mesh/tail"] },
        timelineKey: 0,
        timeFrames: 240,
      }),
      planRecord(record(2200), { ...model, meshes: ["mesh/a"] }, 1.5, 0, null, null, {
        headEndFrames: 600,
        joints: [
          {
            model: { ...model, id: 14, meshes: ["mesh/joint"] },
            x: 2,
            sx: 1,
            width: 4,
            timelineKey: 0,
            timeFrames: 300,
            index: 0,
          },
        ],
      }),
    ];
    const store = createEvaluateStore(16);
    const count = evaluateInstances(
      {
        state: stateAt(100, 0),
        score: scoreWith(1.5),
        meshMatrices,
        plans,
        records: Int32Array.of(0, 1, 2, 3),
        count: 4,
        nowFrames: 100,
      },
      store,
    );
    const drawn = store.instances.slice(0, count);
    expect(drawn.map((instance) => instance.mesh)).toEqual([
      "mesh/a",
      "mesh/b",
      "mesh/a",
      "mesh/b",
      "mesh/a",
      "mesh/b",
      "mesh/tail",
      "mesh/a",
      "mesh/joint",
    ]);
    for (const instance of drawn) {
      expect([...instance.sortJoint]).toEqual(meshMatrices.get(instance.mesh) ?? [...IDENTITY]);
      expect([...instance.world]).not.toEqual([...instance.sortJoint]);
    }
  });
  it("sorts the parts AIR notes draw by their own world", () => {
    const record = new DataView(new ArrayBuffer(356));
    record.setFloat32(8, 6217.61669921875, true);
    record.setInt32(0x14, 3, true);
    const meshMatrices = new Map([
      ["mesh/air", [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0]],
      ["mesh/slide-head", [1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0]],
    ]);
    const plans: RecordPlan[] = [
      planRecord(record, { ...model, meshes: ["mesh/a"] }, 1.5, 0, null, {
        model: { ...model, id: 158, meshes: ["mesh/air"] },
        plan: {
          modelId: 158,
          direction: 0,
          colourFlag: 0,
          lane: 0,
          width: 1,
          timeFrames: 373.5,
          timelineKey: 0,
          position: [0, 0, -640] as const,
          scale: [1, 1, 1] as const,
        },
      }),
      planRecord(new DataView(new ArrayBuffer(356)), null, 1.5, 0, null, null, null, null, {
        head: {
          model: { ...model, id: 600, meshes: ["mesh/slide-head"] },
          x: 4,
          sx: 1,
          sy: 1,
          width: 4,
          timelineKey: 0,
          timeFrames: 600,
        },
        nodes: [],
        band: { points: [], times: [], keys: [], resources: [0, 0, 0], width: 4 },
      }),
    ];
    const store = createEvaluateStore(8);
    const count = evaluateInstances(
      {
        state: stateAt(372.5, 0),
        score: scoreWith(1.5),
        meshMatrices,
        plans,
        records: Int32Array.of(0, 1),
        count: 2,
        nowFrames: 372.5,
        modelStates: {
          has: () => true,
          shownAt: (index, part) =>
            part === GROUND_MAIN_PART ||
            (index === 0 ? part === PLAIN_AIR_PART : part === AIR_SLIDE_HEAD_PART),
          modeAt: () => 0,
        },
      },
      store,
    );
    const drawn = store.instances.slice(0, count);
    expect(drawn.map((instance) => instance.mesh)).toEqual([
      "mesh/a",
      "mesh/air",
      "mesh/slide-head",
    ]);
    expect([...drawn[0].sortJoint]).toEqual([...IDENTITY]);
    for (const instance of drawn.slice(1)) {
      expect([...instance.sortJoint]).toEqual([...instance.world]);
      expect([...instance.world]).not.toEqual(meshMatrices.get(instance.mesh));
    }
  });
  it("skips a record whose model is not covered", () => {
    // A family this evaluator does not handle contributes nothing rather than a placeholder, so an
    // uncovered note cannot be drawn at the wrong place.
    const record = new DataView(new ArrayBuffer(356));
    const plans: RecordPlan[] = [planRecord(record, null, 1.5, 0)];
    const store = createEvaluateStore(4);
    const count = evaluateInstances(
      {
        state: stateAt(0, 0),
        score: scoreWith(1.5),
        meshMatrices: new Map(),
        plans,
        records: Int32Array.from([0]),
        count: 1,
        nowFrames: 0,
      },
      store,
    );
    expect(count).toBe(0);
  });
  it("throws rather than overflowing the caller's capacity", () => {
    const record = new DataView(new ArrayBuffer(356));
    const score = scoreWith(1.5);
    const store = createEvaluateStore(1);
    expect(() =>
      evaluateInstances(
        {
          state: stateAt(0, 0),
          score,
          meshMatrices: new Map(),
          plans: [planRecord(record, model, 1.5, 0)],
          records: Int32Array.from([0]),
          count: 1,
          nowFrames: 0,
        },
        store,
      ),
    ).toThrow(/capacity is a load-time decision/);
  });
  it("builds the sort key from the model's layer and the width priority", () => {
    const record = new DataView(new ArrayBuffer(356));
    record.setInt32(0x2c, 15, true); // width index 15 -> 16 lane units
    const score = scoreWith(1.5);
    const store = createEvaluateStore(4);
    evaluateInstances(
      {
        state: stateAt(0, 0),
        score,
        meshMatrices: new Map(),
        plans: [planRecord(record, model, 1.5, 0)],
        records: Int32Array.from([0]),
        count: 1,
        nowFrames: 0,
      },
      store,
    );
    // width 16, base 31, step -2 -> 31 + 15 * -2 = 1; layer 20 -> 0x1400 | 1
    expect(store.instances[0].key).toBe(sortKey(0x8580, 20, 1));
  });
  it("puts the model's own Z scale in the matrix, not the x scale", () => {
    // The two scales coincide at 1 whenever a model set's units equal its width, which is the
    // common case — so this uses a set whose Z scale is distinct and a width that makes sx differ.
    const scaled: ModelPlan = { ...model, units: 16, modelScaleZ: 2.5 };
    const record = new DataView(new ArrayBuffer(356));
    record.setInt32(0x2c, 7, true); // width index 7 -> 8 lane units -> sx = 8/16 = 0.5
    const store = createEvaluateStore(4);
    evaluateInstances(
      {
        state: stateAt(0, 0),
        score: scoreWith(1.5),
        meshMatrices: new Map(),
        plans: [planRecord(record, scaled, 1.5, 0)],
        records: Int32Array.from([0]),
        count: 1,
        nowFrames: 0,
      },
      store,
    );
    const world = [...store.instances[0].world];
    expect(world[0]).toBe(0.5); // sx
    expect(world[10]).toBe(2.5); // sz, the model's Z scale
  });
});
/**
 * The scroll speed for a settings row, taken from the port's own table.
 *
 * Delegating rather than duplicating a literal matters here: the oracle's driver called the legacy
 * `speedForRowIndex`, and the port's is the same table — a hand-copied constant would let this test
 * agree with itself while disagreeing with the reference.
 */
const speedForRow = (row: number): number => speedForRowIndex(row);
describe("depthArgument", () => {
  it("is the effective time less the frame time, in float32", () => {
    expect(depthArgument(223.137603759765625, 221.0478973388672)).toBe(2.0897064208984375);
    expect(depthArgument(1, 4)).toBe(-3);
  });
  it("agrees with an unrounded subtraction for its whole domain", () => {
    // Both operands are float32 — they are read out of float32 state — and the query rounds its
    // argument again internally, so the outer rounding is redundant rather than load-bearing. This
    // pins that so a wider domain (a float64 effective time) cannot slip through unnoticed.
    let s = 99;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 20000; i++) {
      const te = Math.fround(rnd() * 400);
      const now = Math.fround(rnd() * 400);
      expect(bitsOf(depthArgument(te, now))).toBe(bitsOf(Math.fround(te - now)));
    }
  });
});
it("rejects an AIR phase outside its synchronization window when strict clocks are requested", () => {
  const record = new DataView(new ArrayBuffer(356));
  record.setFloat32(8, 10000, true);
  record.setInt32(0x14, 3, true);
  const parent = {
    id: 66,
    layer: 20,
    pass: 2,
    widthBase: 1,
    initialKey: 0x8580,
    widthStepI32: 0,
    units: 16,
    modelScaleZ: 1,
    meshes: ["mesh/a"],
  };
  const plan = planRecord(record, parent, 1.5, 0, null, {
    model: { ...parent, id: 146 },
    plan: {
      modelId: 146,
      direction: 0,
      colourFlag: 0,
      lane: 0,
      width: 16,
      timeFrames: 600,
      timelineKey: 0,
      position: [0, 0, 0],
      scale: [1, 1, 1],
    },
  });
  const state = stateAt(0, 0);
  expect(() =>
    evaluateInstances(
      {
        state,
        score: scoreWith(1.5),
        meshMatrices: new Map(),
        plans: [plan],
        records: Int32Array.of(0),
        count: 1,
        nowFrames: 0,
        strictClocks: true,
        modelStates: { has: () => true, shownAt: () => true, modeAt: () => 3 },
      },
      createEvaluateStore(8),
    ),
  ).toThrow(/clock history/i);
});
describe("records whose effective time stays in extended precision", () => {
  const plain: ModelPlan = {
    id: 12,
    layer: 20,
    pass: 2,
    widthBase: 31,
    initialKey: 0x8580,
    widthStepI32: -2,
    units: 16,
    modelScaleZ: 1,
    meshes: ["mesh/a"],
  };
  const nowFrames = 7680.5;
  const recordOf = (type: number): DataView => {
    const record = new DataView(new ArrayBuffer(356));
    record.setFloat32(8, 128022.84, true);
    record.setInt32(0x10, type, true);
    return record;
  };
  const drawnDepth = (type: number): number => {
    const store = createEvaluateStore(4);
    evaluateInstances(
      {
        state: stateAt(nowFrames, 0),
        score: scoreWith(1.5),
        meshMatrices: new Map(),
        plans: [planRecord(recordOf(type), plain, 1.5, 0)],
        records: Int32Array.of(0),
        count: 1,
        nowFrames,
      },
      store,
    );
    return store.instances[0].depth;
  };
  it("draws a MINE and a FLICK at the depth of their extended difference and a TAP at its float32 one", () => {
    const state = stateAt(nowFrames, 0);
    const score = scoreWith(1.5);
    const { timelineKey, timeFrames } = computePlacement(recordOf(0), plain.units);
    const single = depthAt(
      state,
      depthArgument(effectiveTime(state, score, timelineKey, timeFrames), nowFrames),
      1,
      1,
      score.scroll,
    );
    const extended = depthAt(
      state,
      extendedDepthArgument(state, score, timelineKey, timeFrames),
      1,
      1,
      score.scroll,
    );
    expect(extended).not.toBe(single);
    expect([0, 4, 6, 11].map(drawnDepth)).toEqual([single, single, extended, extended]);
  });
});
describe("recorded animation frames", () => {
  const airPlan = () => {
    const record = new DataView(new ArrayBuffer(356));
    record.setFloat32(8, 10000, true);
    record.setInt32(0x14, 3, true);
    const parent = {
      id: 66,
      layer: 20,
      pass: 2,
      widthBase: 1,
      initialKey: 0x8580,
      widthStepI32: 0,
      units: 16,
      modelScaleZ: 1,
      meshes: ["mesh/a"],
    };
    return planRecord(record, parent, 1.5, 0, null, {
      model: { ...parent, id: 146 },
      plan: {
        modelId: 146,
        direction: 0,
        colourFlag: 0,
        lane: 0,
        width: 16,
        timeFrames: 600,
        timelineKey: 0,
        position: [0, 0, 0],
        scale: [1, 1, 1],
      },
    });
  };
  const observed = (shown: boolean, has = true): ModelStates => ({
    has: (_record, part) => part === GROUND_MAIN_PART || has,
    shownAt: (record, part) =>
      record === 0 && (part === GROUND_MAIN_PART || (shown && part === 0xfffa)),
    modeAt: () => 3,
  });
  const run = (
    motionFrames: Parameters<typeof evaluateInstances>[0]["motionFrames"],
    modelStates: ModelStates = observed(true),
  ) => {
    const store = createEvaluateStore(8);
    const written = evaluateInstances(
      {
        state: stateAt(0, 0),
        score: scoreWith(1.5),
        meshMatrices: new Map(),
        plans: [airPlan()],
        records: Int32Array.of(0),
        count: 1,
        nowFrames: 0,
        step: 7,
        strictClocks: true,
        motionFrames,
        modelStates,
      },
      store,
    );
    return { written, store };
  };
  it("draws a part outside its synchronization window with the frame the bake recorded", () => {
    const calls: unknown[][] = [];
    const { written, store } = run({
      animated: () => true,
      has: (record, part) => record === 0 && part === 0xfffa,
      at: (...args) => (calls.push(args), 7.25),
    });
    expect(written).toBeGreaterThan(0);
    const air = store.instances.slice(0, written).filter((i) => i.model === "note/model/146");
    expect(air.map((i) => i.frame)).toEqual([7.25]);
    expect(
      store.instances
        .slice(0, written)
        .filter((i) => i.model !== "note/model/146")
        .map((i) => i.frame),
    ).toEqual([undefined]);
    expect(calls).toEqual([[0, 0xfffa, 146, 7]]);
  });
  it("does not draw a plain AIR the bake has not yet observed shown", () => {
    const calls: unknown[][] = [];
    const { written, store } = run(
      { animated: () => true, has: () => true, at: (...args) => (calls.push(args), 1) },
      observed(false),
    );
    expect(store.instances.slice(0, written).map((i) => i.model)).toEqual(["note/model/66"]);
    expect(calls).toEqual([]);
  });
  it("refuses a strict plain AIR whose display state was never observed", () => {
    expect(() =>
      run({ animated: () => true, has: () => true, at: () => 1 }, observed(false, false)),
    ).toThrow(/observed display state/);
  });
  it("refuses an animated part whose clock was never recorded", () => {
    expect(() => run({ animated: () => true, has: () => false, at: () => 0 })).toThrow(/recorded/i);
  });
  it("clears the frame of a reused slot that has no recorded clock", () => {
    const store = createEvaluateStore(8);
    store.instances.forEach((i) => (i.frame = 99));
    const written = evaluateInstances(
      {
        state: stateAt(0, 0),
        score: scoreWith(1.5),
        meshMatrices: new Map(),
        plans: [airPlan()],
        records: Int32Array.of(0),
        count: 1,
        nowFrames: 600,
        step: 7,
        motionFrames: { animated: () => false, has: () => false, at: () => 0 },
      },
      store,
    );
    expect(written).toBeGreaterThan(0);
    expect(store.instances.slice(0, written).map((i) => i.frame)).toEqual(
      Array(written).fill(undefined),
    );
  });
});
describe("recorded MINE frames", () => {
  const minePlan = () => {
    const record = new DataView(new ArrayBuffer(356));
    record.setFloat32(8, 10000, true);
    record.setInt32(0x10, 11, true);
    return planRecord(
      record,
      {
        id: 133,
        layer: 20,
        pass: 2,
        widthBase: 1,
        initialKey: 0x8580,
        widthStepI32: 0,
        units: 16,
        modelScaleZ: 1,
        meshes: ["mesh/a", "mesh/b"],
      },
      1.5,
      0,
    );
  };
  const run = (motionFrames: Parameters<typeof evaluateInstances>[0]["motionFrames"]) => {
    const store = createEvaluateStore(8);
    const written = evaluateInstances(
      {
        state: stateAt(0, 0),
        score: scoreWith(1.5),
        meshMatrices: new Map(),
        plans: [minePlan()],
        records: Int32Array.of(0),
        count: 1,
        nowFrames: 0,
        step: 7,
        strictClocks: true,
        motionFrames,
      },
      store,
    );
    return store.instances.slice(0, written);
  };
  it("draws every mesh of a MINE with the frame the bake recorded for its model", () => {
    const calls: unknown[][] = [];
    const drawn = run({
      animated: () => true,
      has: (record, part) => record === 0 && part === MINE_PART,
      at: (...args) => (calls.push(args), 12),
    });
    expect(drawn.map((instance) => instance.frame)).toEqual([12, 12]);
    expect(calls).toEqual([[0, MINE_PART, 133, 7]]);
  });
  it("refuses a strict MINE whose clock was never recorded", () => {
    expect(() => run({ animated: () => true, has: () => false, at: () => 0 })).toThrow(/recorded/i);
  });
});
describe("draw order keys", () => {
  const planWithKey = (initialKey: number) => {
    const record = new DataView(new ArrayBuffer(356));
    record.setFloat32(8, 10000, true);
    return planRecord(
      record,
      {
        id: 7,
        layer: 20,
        pass: 2,
        widthBase: 1,
        initialKey,
        widthStepI32: 0,
        units: 16,
        modelScaleZ: 1,
        meshes: ["mesh/a"],
      },
      1.5,
      0,
    );
  };
  const keyOf = (initialKey: number) => {
    const store = createEvaluateStore(4);
    const written = evaluateInstances(
      {
        state: stateAt(0, 0),
        score: scoreWith(1.5),
        meshMatrices: new Map(),
        plans: [planWithKey(initialKey)],
        records: Int32Array.of(0),
        count: 1,
        nowFrames: 0,
      },
      store,
    );
    expect(written).toBe(1);
    return store.instances[0].key;
  };
  it("keeps bit 15 of the model's initial sort key", () => {
    expect(keyOf(0x8580) & 0xff00).toBe(0x9400);
    expect(keyOf(0x0580) & 0xff00).toBe(0x1400);
  });
});
describe("instanced groups", () => {
  const plain: ModelPlan = {
    id: 12,
    layer: 20,
    pass: 2,
    widthBase: 31,
    initialKey: 0x8580,
    widthStepI32: -2,
    units: 16,
    modelScaleZ: 1,
    meshes: ["mesh/c"],
  };
  const grouped: ModelPlan = {
    ...plain,
    id: 144,
    meshes: ["mesh/a", "mesh/b"],
    instanceGroup: { sphere: [0, 0, 0, 0], capacity: 2 },
  };
  const record = (milliseconds: number, lane: number, type = 0) => {
    const view = new DataView(new ArrayBuffer(356));
    view.setFloat32(8, milliseconds, true);
    view.setInt32(0x10, type, true);
    view.setInt32(0x28, lane, true);
    view.setInt32(0x2c, 3, true);
    return view;
  };
  const evaluate = (
    plans: RecordPlan[],
    cameraPosition?: readonly number[],
    motionFrames?: Parameters<typeof evaluateInstances>[0]["motionFrames"],
  ) => {
    const store = createEvaluateStore(16);
    const count = evaluateInstances(
      {
        state: stateAt(100, 0),
        score: scoreWith(1.5),
        meshMatrices: new Map(),
        plans,
        records: Int32Array.from(plans.keys()),
        count: plans.length,
        nowFrames: 100,
        cameraPosition,
        motionFrames,
      },
      store,
    );
    return store.instances.slice(0, count).map((instance) => ({ ...instance }));
  };
  it("submits a group's members after the other records, part by part and nearest first per batch", () => {
    const drawn = evaluate(
      [
        planRecord(record(3000, 4), grouped, 1.5, 0),
        planRecord(record(2000, 4), plain, 1.5, 0),
        planRecord(record(2500, 4), grouped, 1.5, 0),
        planRecord(record(2200, 4), grouped, 1.5, 0),
      ],
      [0, 0, 100],
    );
    expect(drawn.map((instance) => [instance.record, instance.mesh])).toEqual([
      [1, "mesh/c"],
      [2, "mesh/a"],
      [0, "mesh/a"],
      [2, "mesh/b"],
      [0, "mesh/b"],
      [3, "mesh/a"],
      [3, "mesh/b"],
    ]);
  });
  it("keeps admission order between members at the same distance", () => {
    const drawn = evaluate(
      [planRecord(record(2500, 12), grouped, 1.5, 0), planRecord(record(2500, 0), grouped, 1.5, 0)],
      [0, 0, 100],
    );
    expect(drawn[0].world[3]).toBe(-drawn[1].world[3]);
    expect(drawn.map((instance) => instance.record)).toEqual([0, 1, 0, 1]);
  });
  it("carries each member's recorded animation frame", () => {
    const drawn = evaluate(
      [
        planRecord(record(3000, 4, 11), grouped, 1.5, 0),
        planRecord(record(2200, 4, 11), grouped, 1.5, 0),
      ],
      [0, 0, 100],
      { animated: () => true, has: () => true, at: (index) => 10 + index },
    );
    expect(drawn.map((instance) => [instance.record, instance.frame])).toEqual([
      [1, 11],
      [0, 10],
      [1, 11],
      [0, 10],
    ]);
  });
  it("refuses a camera position that cannot order a batch", () => {
    for (const camera of [
      [0, 0],
      [0, Number.NaN, 0],
    ])
      expect(() => evaluate([planRecord(record(3000, 4), grouped, 1.5, 0)], camera)).toThrow(
        /camera position/i,
      );
  });
  it("keeps record order when no camera position orders the batches", () => {
    const drawn = evaluate([
      planRecord(record(3000, 4), grouped, 1.5, 0),
      planRecord(record(2200, 4), grouped, 1.5, 0),
    ]);
    expect(drawn.map((instance) => [instance.record, instance.mesh])).toEqual([
      [0, "mesh/a"],
      [0, "mesh/b"],
      [1, "mesh/a"],
      [1, "mesh/b"],
    ]);
  });
});
