import { expect, it } from "vitest";
import { readUvAnimation, sampleUvTrack } from "../../assets/uvAnimation";
import { uvAnimationFixture } from "../../assets/uvAnimation.testFixture";
import { nthElement, TextureElement } from "../elements";
import type { StageGraph } from "../graph";
import type { StageModel, StageShape } from "../pack";
import { type StageNode } from "../runtime";
import { cloneStageScene } from "../snapshot";
import { type StageModelState } from "../nodes/model";
import { AnimationElement } from "./animationElement";
import { applyModelUv } from "./uvAnimation";
const parameter = (state: StageModelState, draw: number, slot: number) => {
  const value = state.materialUv!.cells.parameter(draw, slot);
  return value && Array.from(value);
};
it("does not route offsets to material UV when the instance has no UV provider", () => {
  const node = {
    scene: { graph: { u32: () => 0x11f }, options: { model: () => null } },
    record: { type: 6001010, settings: 0 },
    extension: { resources: [0], materialUv: null },
    elements: [{ type: 300, slots: new Float32Array(28), offsetChanged: true }],
  } as unknown as StageNode;
  applyModelUv(node, node.extension as StageModelState);
  expect((node.extension as StageModelState).materialUv).toBeNull();
});
it("retains per-draw cells through resource switches, cloning and model replacement", () => {
  const a = uvAnimationFixture({ names: ["image", "UV0", "a", "image", "UV0", "unused"] }).bytes;
  const b = uvAnimationFixture({ names: ["image", "UV0", "b", "image", "UV0", "unused"] }).bytes;
  const data = new DataView(new ArrayBuffer(64));
  data.setUint32(8, 32, true);
  data.setUint32(12, 2, true);
  data.setUint32(32, 10, true);
  data.setUint32(40, 11, true);
  const graph = {
    u32: (offset: number) => data.getUint32(offset, true),
    pointer: (offset: number) => data.getUint32(offset, true) || null,
  } as StageGraph;
  const shape = (name: string) =>
    ({ state: { _name: name }, textures: [], nodeRefs: [1] }) as unknown as StageShape;
  const model = { name: "synthetic", nodes: [], shapes: [shape("a"), shape("b")] } as StageModel;
  const scene = {
    graph,
    options: {
      model: (ordinal: number) => (ordinal === 2 ? null : model),
      animation: (ordinal: number) => (ordinal === 10 ? a : ordinal === 11 ? b : null),
    },
    extension: null,
  } as unknown as StageNode["scene"] & {
    extension: StageNode | null;
  };
  const node = {
    scene,
    record: { type: 6001001 },
    extension: { resources: [0], materialUv: null },
    elements: [],
  } as unknown as StageNode;
  const uv = new AnimationElement(402, { type: 402, offset: 0 }, node);
  const texture = new TextureElement({ type: 300, offset: 0 }, node);
  texture.slots = new Float32Array(28);
  node.elements = [uv, texture];
  scene.extension = node;
  const state = node.extension as StageModelState;
  const sample = (bytes: Uint8Array) => {
    const result = new Float32Array(4);
    sampleUvTrack(readUvAnimation(bytes, true).tracks[0], 0, result);
    return Array.from(result);
  };
  applyModelUv(node, state);
  expect(parameter(state, 0, 0)).toEqual(sample(a));
  expect(parameter(state, 1, 0)).toBeNull();
  const firstBinding = state.materialUv!.binding;
  applyModelUv(node, state);
  expect(state.materialUv!.binding).toBe(firstBinding);
  uv.select(1, -1);
  applyModelUv(node, state);
  expect(state.materialUv!.binding).not.toBe(firstBinding);
  expect(parameter(state, 0, 0)).toEqual(sample(a));
  expect(parameter(state, 1, 0)).toEqual(sample(b));
  const copy = cloneStageScene(scene).scene as typeof scene;
  const copyNode = copy.extension!;
  const copyState = copyNode.extension as StageModelState;
  expect(copyState.materialUv).not.toBe(state.materialUv);
  const copyTexture = nthElement<TextureElement>(copyNode, 300, 0)!;
  copyTexture.setOffset(0.25, 0.5, 0);
  nthElement<AnimationElement>(copyNode, 402, 0)!.select(0, -1);
  applyModelUv(copyNode, copyState);
  expect(parameter(copyState, 0, 0)).toEqual(sample(a));
  expect(parameter(copyState, 1, 0)).toEqual([0.25, 0.5, 1, 1]);
  expect(parameter(state, 1, 0)).toEqual(sample(b));
  (state.resources as number[]).splice(0, 1, 1);
  applyModelUv(node, state);
  expect(parameter(state, 0, 0)).toBeNull();
  expect(parameter(state, 1, 0)).toEqual(sample(b));
  const beforeInvalid = state.materialUv;
  uv.ordinals.push(12);
  uv.select(2, -1);
  expect(() => applyModelUv(node, state)).toThrow(/missing resource/);
  expect(parameter(state, 1, 0)).toEqual(sample(b));
  uv.select(1, -1);
  applyModelUv(node, state);
  expect(state.materialUv).toBe(beforeInvalid);
  uv.ordinals.length = 0;
  texture.setOffset(0.75, 0.125, 0);
  applyModelUv(node, state);
  expect(parameter(state, 0, 0)).toEqual([0.75, 0.125, 1, 1]);
  expect(parameter(state, 1, 0)).toEqual([0.75, 0.125, 1, 1]);
  uv.ordinals.push(10);
  (state.resources as number[]).splice(0, 1, 2);
  expect(() => applyModelUv(node, state)).toThrow(/missing model 2/);
  expect(state.materialUv).toBe(beforeInvalid);
  (state.resources as number[]).splice(0, 1, 1);
  applyModelUv(node, state);
  expect(state.materialUv).toBe(beforeInvalid);
  (state.resources as number[]).splice(0, 1, 0);
  (model.shapes[0].nodeRefs as number[]).push(2);
  expect(() => applyModelUv(node, state)).toThrow(/draw order/);
  (model.shapes[0].nodeRefs as number[]).pop();
  (
    scene.options as {
      animation?: typeof scene.options.animation;
    }
  ).animation = undefined;
  expect(() => applyModelUv(node, state)).toThrow(/animation resolver is missing/);
  (
    scene.options as {
      animation?: typeof scene.options.animation;
    }
  ).animation = (ordinal) => (ordinal === 10 ? a : ordinal === 11 ? b : null);
  (
    scene.options as {
      model?: typeof scene.options.model;
    }
  ).model = undefined;
  expect(() => applyModelUv(node, state)).toThrow(/model resolver is missing/);
});
it("applies material UV with no texture component", () => {
  const bytes = uvAnimationFixture({
    names: ["image", "UV0", "a", "image", "UV0", "unused"],
  }).bytes;
  const data = new DataView(new ArrayBuffer(48));
  data.setUint32(8, 32, true);
  data.setUint32(12, 1, true);
  data.setUint32(32, 3, true);
  const graph = {
    u32: (offset: number) => data.getUint32(offset, true),
    pointer: (offset: number) => data.getUint32(offset, true) || null,
  } as StageGraph;
  const model = {
    shapes: [{ state: { _name: "a" }, textures: [], nodeRefs: [1] }],
  } as unknown as StageModel;
  const node = {
    scene: { graph, options: { model: () => model, animation: () => bytes } },
    record: { type: 6001001 },
    extension: { resources: [0], materialUv: null },
    elements: [],
  } as unknown as StageNode;
  node.elements = [new AnimationElement(402, { type: 402, offset: 0 }, node)];
  const state = node.extension as StageModelState;
  applyModelUv(node, state);
  const sampled = new Float32Array(4);
  sampleUvTrack(readUvAnimation(bytes, true).tracks[0], 0, sampled);
  expect(parameter(state, 0, 0)).toEqual(Array.from(sampled));
});
it("retains published offsets when an empty UV list follows a failure", () => {
  const data = new DataView(new ArrayBuffer(32));
  const graph = {
    u32: (offset: number) => data.getUint32(offset, true),
    pointer: (offset: number) => data.getUint32(offset, true) || null,
  } as StageGraph;
  const model = {
    shapes: [{ state: { _name: "a" }, textures: [], nodeRefs: [1] }],
  } as unknown as StageModel;
  const node = {
    scene: { graph, options: { model: () => model } },
    record: { type: 6001001 },
    extension: { resources: [0], materialUv: null },
    elements: [],
  } as unknown as StageNode;
  const uv = new AnimationElement(402, { type: 402, offset: 0 }, node);
  const texture = new TextureElement({ type: 300, offset: 0 }, node);
  texture.slots = new Float32Array(28);
  texture.setOffset(0.25, 0.5, 0);
  node.elements = [uv, texture];
  const state = node.extension as StageModelState;
  applyModelUv(node, state);
  expect(parameter(state, 0, 0)).toEqual([0.25, 0.5, 1, 1]);
});
it("publishes and retains normal-model offsets without a UV animation element", () => {
  const data = new DataView(new ArrayBuffer(32));
  const graph = {
    u32: (offset: number) => data.getUint32(offset, true),
    pointer: (offset: number) => data.getUint32(offset, true) || null,
  } as StageGraph;
  const model = {
    shapes: [{ state: { _name: "a" }, textures: [], nodeRefs: [1] }],
  } as unknown as StageModel;
  const node = {
    scene: { graph, options: { model: () => model } },
    record: { type: 6001001 },
    extension: { resources: [0], materialUv: null },
    elements: [],
  } as unknown as StageNode;
  const texture = new TextureElement({ type: 300, offset: 0 }, node);
  texture.slots = new Float32Array(28);
  node.elements = [texture];
  const state = node.extension as StageModelState;
  applyModelUv(node, state);
  expect(state.materialUv).toBeNull();
  texture.setOffset(0.25, 0.5, 0);
  applyModelUv(node, state);
  expect(state.materialUv!.cells.offsetsPublished).toBe(true);
  expect(parameter(state, 0, 0)).toEqual([0.25, 0.5, 1, 1]);
  texture.offsetChanged = false;
  texture.slots.fill(1);
  applyModelUv(node, state);
  expect(parameter(state, 0, 0)).toEqual([0.25, 0.5, 1, 1]);
  const cells = state.materialUv!.cells;
  (state.resources as number[]).splice(0, 1, 1);
  applyModelUv(node, state);
  expect(state.materialUv!.cells).not.toBe(cells);
  expect(state.materialUv!.cells.offsetsPublished).toBe(false);
  expect(parameter(state, 0, 0)).toBeNull();
});
