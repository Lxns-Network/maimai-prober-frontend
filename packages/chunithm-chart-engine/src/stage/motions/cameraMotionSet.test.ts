import { describe, expect, it } from "vitest";
import type { StageGraph, StageMotionRecord } from "../graph";
import type { StageNode, StageScene } from "../runtime";
import { createElements } from "../elements";
import { CameraElement } from "../model/cameraElement";
import { AnimationElement } from "../model/animationElement";
import { StageRandom } from "../random";
import { cameraMotionSetMotion, motionSetMotion, ordinalMotionSetMotion } from "./motionSet";
const DATA = 128;
const RECORD = 256;
function fixture(changes: Partial<Record<string, number>> = {}, cameraCount = 0) {
  const bytes = new DataView(new ArrayBuffer(512));
  const int = (at: number, value: number) => bytes.setInt32(at, value, true);
  const float = (at: number, value: number) => bytes.setFloat32(at, value, true);
  int(12, cameraCount);
  int(DATA, 1);
  int(DATA + 24, -1);
  int(DATA + 28, 1);
  int(DATA + 32, RECORD);
  int(RECORD + 4, -1);
  float(RECORD + 8, 1);
  float(RECORD + 16, -1);
  for (const [offset, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    const at = Number(offset);
    if ([0, 4, 20].includes(at)) int(RECORD + at, value);
    else float(RECORD + at, value);
  }
  const graph = {
    u32: (at: number) => bytes.getUint32(at, true),
    i32: (at: number) => bytes.getInt32(at, true),
    f32: (at: number) => bytes.getFloat32(at, true),
    pointer: (at: number) => bytes.getUint32(at, true) || null,
    target: (at: number) => bytes.getUint32(at, true),
  } as StageGraph;
  const scene = { graph, random: new StageRandom(0, 0), options: {} } as StageScene;
  const node = {
    scene,
    delta: 1,
    world: Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1),
    ordinal: 0,
    record: {
      elements: [
        { offset: 0, type: 600 },
        { offset: 32, type: 400 },
      ],
    },
    elements: [],
  } as unknown as StageNode;
  node.elements = createElements(node);
  const record = { type: 6000002, data: DATA, ordinal: -1 } as StageMotionRecord;
  return { scene, node, record, bytes };
}
describe("camera motion set native state captures", () => {
  it("keeps populated resource selectors and exposes a missing resource", () => {
    const { node } = fixture({}, 1);
    const camera = node.elements[0] as CameraElement;
    expect(camera.ordinals).toEqual([0]);
    expect(() => camera.animation()).toThrow("missing animation resource 0");
  });
  it("does not dereference a nonnull list pointer when its count is zero", () => {
    const { node, bytes } = fixture();
    bytes.setUint32(8, 0xfffffffc, true);
    expect(() => createElements(node)).not.toThrow();
  });
  it("rejects unsupported receivers and invalid record transforms", () => {
    for (const [at, value] of [
      [DATA, 2],
      [RECORD + 44, 8],
      [RECORD + 60, 7],
    ]) {
      const { scene, node, record, bytes } = fixture();
      bytes.setInt32(at, value, true);
      expect(() => cameraMotionSetMotion.create(scene, node, record)).toThrow(RangeError);
    }
  });
  it("keeps the existing primary and UV receiver paths", () => {
    for (const behavior of [motionSetMotion, ordinalMotionSetMotion, cameraMotionSetMotion]) {
      for (const kind of [0, 3]) {
        const { scene, node, record, bytes } = fixture();
        const uv = new AnimationElement(402, { offset: 64, type: 402 }, node);
        node.elements.push(uv);
        bytes.setInt32(DATA, kind, true);
        const motion = behavior.create(scene, node, { ...record, type: behavior.type });
        motion.update(node, new Float32Array(16));
        expect((node.elements[1] as AnimationElement).flags).toBe(0x10);
        expect((node.elements[0] as CameraElement).flags).toBe(0x10);
        expect(uv.flags).toBe(0);
      }
    }
  });
});
