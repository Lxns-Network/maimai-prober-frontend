import { describe, expect, it } from "vitest";
import {
  createEvaluateStore,
  evaluateInstances,
  planRecord,
  type ModelPlan,
  type RecordPlan,
} from "./evaluate";
import type { ModelStates } from "./modelStates";
import { registerImmutableScroll } from "./space";
import { registerImmutableTimeline, type NoteTimelineScore } from "./timing";
import { speedForRowIndex } from "./tables";
import { GROUND_MAIN_PART, GROUND_TAIL_PART, slideJointPart } from "../chart/bake/events";

const model = (id: number, mesh: string): ModelPlan => ({
  id,
  layer: 20,
  pass: 2,
  widthBase: 31,
  initialKey: 0x8580,
  widthStepI32: -2,
  units: 16,
  modelScaleZ: 1,
  meshes: [mesh],
});

function stateAt(nowFrames: number): DataView {
  const state = new DataView(new ArrayBuffer(0x3b0));
  state.setFloat32(0x300, Math.fround(nowFrames), true);
  state.setFloat32(0x354, speedForRowIndex(0), true);
  state.setFloat32(0x358, 1.5, true);
  return state;
}

function flatScore(): NoteTimelineScore {
  const row = new DataView(new ArrayBuffer(32));
  row.setFloat32(8, -1e9, true);
  row.setFloat32(16, 1.5, true);
  row.setFloat32(28, 1e9, true);
  const score: NoteTimelineScore = { records: [], timeline: new Map(), scroll: row };
  registerImmutableScroll(score.scroll);
  registerImmutableTimeline(score);
  return score;
}

const record = (milliseconds: number) => {
  const view = new DataView(new ArrayBuffer(356));
  view.setFloat32(8, milliseconds, true);
  view.setInt32(0x10, 1, true);
  view.setInt32(0x2c, 7, true);
  return view;
};

/** States in which the bake observed record 0's listed parts, shown at the listed steps only. */
const observed = (shown: Record<number, number[]>): ModelStates => ({
  has: (index, part) => index === 0 && (part === undefined || part in shown),
  shownAt: (index, part, step) => index === 0 && (shown[part] ?? []).includes(step),
  modeAt: () => 3,
});

const score = flatScore();
const drawnAt = (plan: RecordPlan, step: number, modelStates?: ModelStates, strict = false) => {
  const store = createEvaluateStore(8);
  const count = evaluateInstances(
    {
      state: stateAt(step * 0.5),
      score,
      meshMatrices: new Map(),
      plans: [plan],
      records: Int32Array.of(0),
      count: 1,
      nowFrames: Math.fround(step * 0.5),
      step,
      modelStates,
      strictClocks: strict,
    },
    store,
  );
  return store.instances.slice(0, count).map((instance) => instance.mesh);
};

describe("ground parts drawn by their observed display", () => {
  it("draws a ground note's main model at exactly the steps the bake observed it shown", () => {
    const plan = planRecord(record(5000), model(66, "mesh/tap"), 1.5, 0);
    const states = observed({ [GROUND_MAIN_PART]: [12, 13] });
    expect([11, 12, 13, 14].map((step) => drawnAt(plan, step, states))).toEqual([
      [],
      ["mesh/tap"],
      ["mesh/tap"],
      [],
    ]);
  });

  it("draws a HOLD head and tail each while the bake observed that part shown", () => {
    const plan = planRecord(record(5000), model(2, "mesh/head"), 1.5, 0, {
      model: model(3, "mesh/tail"),
      timelineKey: 0,
      timeFrames: 400,
    });
    const states = observed({ [GROUND_MAIN_PART]: [10], [GROUND_TAIL_PART]: [10, 11] });
    expect([10, 11, 12].map((step) => drawnAt(plan, step, states))).toEqual([
      ["mesh/head", "mesh/tail"],
      ["mesh/tail"],
      [],
    ]);
  });

  it("draws each SLIDE joint while the bake observed that joint shown", () => {
    const joint = (index: number, mesh: string) => ({
      model: model(5, mesh),
      x: 0,
      sx: 1,
      width: 4,
      timelineKey: 0,
      timeFrames: 300,
      index,
    });
    const plan = planRecord(record(5000), model(4, "mesh/head"), 1.5, 0, null, null, {
      headEndFrames: 600,
      joints: [joint(1, "mesh/j1"), joint(3, "mesh/j3")],
    });
    const states = observed({
      [GROUND_MAIN_PART]: [20],
      [slideJointPart(1)]: [20],
      [slideJointPart(3)]: [20, 21],
    });
    expect([20, 21].map((step) => drawnAt(plan, step, states))).toEqual([
      ["mesh/head", "mesh/j1", "mesh/j3"],
      ["mesh/j3"],
    ]);
  });

  it("refuses a strict ground note whose main model the bake never observed", () => {
    const plan = planRecord(record(5000), model(66, "mesh/tap"), 1.5, 0);
    expect(() => drawnAt(plan, 12, observed({}), true)).toThrow(/observed display/);
  });

  it("keeps the timing rules for a record whose display was not observed", () => {
    const plan = planRecord(record(5000), model(66, "mesh/tap"), 1.5, 0);
    expect(drawnAt(plan, 12)).toEqual(["mesh/tap"]);
    expect(drawnAt(plan, 12, observed({}))).toEqual(["mesh/tap"]);
  });
});
