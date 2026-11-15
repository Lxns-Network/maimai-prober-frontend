import { describe, expect, it, vi } from "vitest";
import { uvAnimationFixture } from "../../assets/uvAnimation.testFixture";
import { ModelElement } from "../elements";
import type { StageGraph } from "../graph";
import { modelNode, stageModelPose, stageModelState } from "../nodes/model";
import type { StageModel } from "../pack";
import type { StageNode, StageScene } from "../runtime";
import { cloneStageScene } from "../snapshot";
import { createStageModelProvider, updateStageModelProvider } from "./animation";
import { AnimationElement } from "./animationElement";

function clip(x: number): Uint8Array {
  const fixture = uvAnimationFixture();
  const bytes = new Uint8Array(fixture.bytes.length + 176);
  bytes.set(fixture.bytes);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < view.getUint32(4, true); index++) {
    const at = 0x80 + index * 0x100;
    const kind = view.getUint32(at, true);
    if (kind === 9) {
      const offset = fixture.bytes.length;
      view.setUint32(at, 1, true);
      view.setUint32(at + 8, 176, true);
      view.setUint32(at + 12, offset, true);
      view.setUint32(offset, 1, true);
      view.setInt16(offset + 4 + 0x8e, 32767, true);
      view.setFloat32(offset + 4 + 0x94, x, true);
      for (let axis = 0; axis < 3; axis++) view.setFloat32(offset + 4 + 0xa0 + axis * 4, 1, true);
    }
    if (kind === 6) {
      view.setUint32(at + 8, 5, true);
      bytes.set(new TextEncoder().encode("root\0"), view.getUint32(at + 12, true));
    }
  }
  return bytes;
}

function setup(initiallyMissing = false) {
  const data = new DataView(new ArrayBuffer(96));
  data.setUint32(8, 64, true);
  data.setUint32(12, 1, true);
  data.setUint32(64, 0, true);
  data.setUint32(24, 72, true);
  data.setUint32(28, 3, true);
  for (let index = 0; index < 3; index++) data.setUint32(72 + index * 8, 10 + index, true);
  const graph = {
    u32: (at: number) => data.getUint32(at, true),
    pointer: (at: number) => data.getUint32(at, true) || null,
  } as StageGraph;
  const words = (values: number[]) => ({
    words: Array.from(new Uint32Array(Float32Array.from(values).buffer)),
  });
  const model: StageModel = {
    name: "recovery",
    nodes: [
      {
        ref: 1,
        fields: {
          _name: "root",
          _parent: { ref: 0 },
          _child: { ref: 0 },
          _sibling: { ref: 0 },
          _translation: words([0, 0, 0]),
          _quaternion: words([0, 0, 0, 1]),
          _scale: words([1, 1, 1]),
        },
      },
    ],
    shapes: [],
  };
  const clips = new Map([
    [10, clip(2)],
    [11, clip(6)],
  ]);
  if (initiallyMissing) clips.delete(10);
  const resolve = vi.fn((ordinal: number) => clips.get(ordinal) ?? null);
  const scene = {
    graph,
    options: { model: () => model, animation: resolve },
    classState: new Map(),
    missing: new Set(),
    target: null,
  } as unknown as StageScene & { target: StageNode | null };
  const node = {
    scene,
    record: { type: 6001001, offset: 32, flags: 0, elements: [{ type: 200, offset: 0 }] },
    elements: [],
    world: new Float32Array(16),
    before: [],
    stateMotions: [],
    after: [],
    pending: [],
    flags: 0,
    coordinateMode: 1,
  } as unknown as StageNode;
  const models = new ModelElement({ type: 200, offset: 0 }, node);
  const animation = new AnimationElement(400, { type: 400, offset: 16 }, node);
  node.elements = [models, animation];
  scene.target = node;
  modelNode.construct!(node);
  const state = stageModelState(node)!;
  const update = () => modelNode.update!(node);
  return { node, scene, state, animation, models, model, clips, resolve, update };
}

describe("ordinary model animation recovery", () => {
  it("resumes a valid clip after a failed selection without replacing its provider", () => {
    const target = setup();
    target.update();
    const provider = target.state.provider!;
    const pose = provider.pose;
    target.animation.select(2, -1);
    target.update();
    expect(target.state.poseError).toMatch(/missing animation 12/);
    expect(provider.pose).toBe(pose);
    expect(() => stageModelPose(target.node, target.model)).toThrow(/missing animation 12/);
    const calls = target.resolve.mock.calls.length;
    target.update();
    expect(target.resolve).toHaveBeenCalledTimes(calls);
    target.animation.select(1, -1);
    target.update();
    expect(target.state.poseError).toBeNull();
    expect(target.state.provider).toBe(provider);
    expect(target.state.providerAnimation).toBe(11);
    expect(stageModelPose(target.node, target.model)!.worlds[0][3]).toBe(6);
    expect([...target.scene.missing]).toContain(
      "model animation: Stage animation: missing animation 12",
    );
  });

  it("recovers from an initial failure and retries each newly selected bad resource once", () => {
    const target = setup(true);
    target.update();
    expect(target.state.provider).toBeNull();
    expect(target.state.poseFailureAnimation).toBe(10);
    target.clips.set(12, Uint8Array.of(1, 2, 3, 4));
    target.animation.select(2, -1);
    target.update();
    expect(target.state.poseError).toMatch(/signature/);
    expect(target.state.poseFailureAnimation).toBe(12);
    const calls = target.resolve.mock.calls.length;
    target.update();
    expect(target.resolve).toHaveBeenCalledTimes(calls);
    target.animation.select(1, -1);
    target.update();
    expect(target.state.poseError).toBeNull();
    expect(stageModelPose(target.node, target.model)!.worlds[0][3]).toBe(6);
  });

  it("blends recovery from the last successful samples", () => {
    const target = setup();
    target.update();
    const expected = createStageModelProvider(target.model);
    updateStageModelProvider(target.model, target.clips.get(10)!, 0, expected);
    target.animation.select(2, -1);
    target.update();
    target.animation.select(1, -1);
    target.animation.blending = true;
    target.animation.blendWeight = 0.25;
    target.update();
    updateStageModelProvider(target.model, target.clips.get(11)!, 0, expected, 0.25);
    expect(target.state.poseError).toBeNull();
    expect(stageModelPose(target.node, target.model)).toEqual(expected.pose);
    expect(expected.pose.worlds[0][3]).toBe(3);
  });

  it("copies the failed selection and recovers a checkpoint independently", () => {
    const target = setup();
    target.update();
    target.animation.select(2, -1);
    target.update();
    const copy = cloneStageScene(target.scene).scene as typeof target.scene;
    const node = copy.target!;
    const state = stageModelState(node)!;
    expect(state.poseFailureAnimation).toBe(12);
    const animation = node.elements[1] as AnimationElement;
    animation.select(1, -1);
    modelNode.update!(node);
    expect(state.poseError).toBeNull();
    expect(stageModelPose(node, target.model)!.worlds[0][3]).toBe(6);
    expect(target.state.poseError).toMatch(/missing animation 12/);
    expect(target.state.provider!.pose.worlds[0][3]).toBe(2);
    target.animation.select(0, -1);
    target.update();
    expect(target.state.poseError).toBeNull();
  });

  it("keeps frame errors latched until the animation or model selection changes", () => {
    const target = setup();
    target.update();
    target.animation.setFrame(Number.NaN);
    target.update();
    target.animation.setFrame(0);
    target.update();
    expect(target.state.poseError).toMatch(/non-finite frame/);
    target.models.ordinals.push(1);
    target.models.select(1);
    target.update();
    expect(target.state.poseError).toBeNull();
    expect(target.state.poseFailureAnimation).toBeNull();
    expect(stageModelPose(target.node, target.model)!.worlds[0][3]).toBe(2);
  });
});
