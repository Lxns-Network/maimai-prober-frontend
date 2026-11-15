import { readUvAnimation, sampleUvTrack, type UvAnimation } from "../../assets/uvAnimation";
import { instanceUvBytes } from "../../notes/render/instanceUv";
import { nthElement } from "../elements";
import { stageUvOffsets } from "../motions/uvScroll";
import type { StageModelState } from "../nodes/model";
import type { StageNode } from "../runtime";
import { AnimationElement } from "./animationElement";
import { bindStageMaterialUv, StageMaterialUvState, type StageUvDraw } from "./materialUv";

const decoded = new WeakMap<Uint8Array, UvAnimation | string>();

/** Parses release inputs with the same UV format support as material playback. */
export function decodeStageUvAnimation(bytes: Uint8Array): UvAnimation {
  let entry = decoded.get(bytes);
  if (entry === undefined) {
    try {
      entry = readUvAnimation(bytes, true);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      entry = error.message;
    }
    decoded.set(bytes, entry);
  }
  if (typeof entry === "string") throw new RangeError(entry);
  return entry;
}

const materialAnimations = new WeakMap<
  NonNullable<StageNode["scene"]["options"]["animation"]>,
  Map<number, UvAnimation>
>();

function materialAnimation(
  resolve: NonNullable<StageNode["scene"]["options"]["animation"]>,
  ordinal: number,
): UvAnimation {
  let entries = materialAnimations.get(resolve);
  if (!entries) materialAnimations.set(resolve, (entries = new Map()));
  let animation = entries.get(ordinal);
  if (animation) return animation;
  const bytes = resolve(ordinal);
  if (!bytes) throw new RangeError("UV animation: missing resource");
  animation = readUvAnimation(bytes, true);
  entries.set(ordinal, animation);
  return animation;
}

/** Publishes the model's material UV state for the current update. */
export function applyModelUv(node: StageNode, state: StageModelState): void {
  const candidate = nthElement<AnimationElement>(node, 402, 0);
  const element = candidate instanceof AnimationElement ? candidate : null;
  const resolve = node.scene.options.animation;
  const model = node.scene.options.model;
  const offsets = stageUvOffsets(node);
  if (node.record?.type === 6001010) {
    applyInstanceUv(node, state, element, offsets);
    return;
  }
  if (!element?.count && !state.materialUv && !offsets) return;
  if (element?.count && !resolve)
    throw new RangeError("UV animation: animation resolver is missing");
  if (!model) throw new RangeError("UV animation: model resolver is missing");
  if (state.resources.length === 0)
    throw new RangeError("UV animation: model resource list is empty");
  let uv = state.materialUv;
  if (
    !uv ||
    uv.resources.length !== state.resources.length ||
    uv.resources.some((ordinal, index) => ordinal !== state.resources[index])
  ) {
    const draws: StageUvDraw[] = [];
    for (const ordinal of state.resources) {
      const resource = model(ordinal);
      if (!resource) throw new RangeError(`UV animation: missing model ${ordinal}`);
      for (const shape of resource.shapes) {
        if (shape.nodeRefs.length !== 1)
          throw new RangeError("UV animation: draw order is not a single-node shape vector");
        draws.push({ shape });
      }
    }
    uv = {
      resources: [...state.resources],
      cells: new StageMaterialUvState(draws.length),
      selected: null,
      binding: null,
    };
    state.materialUv = uv;
  }
  if (offsets) uv.cells.publishOffsets(offsets);
  if (!element?.count) return;
  const ordinal = element.ordinals[element.index % element.count];
  if (uv.selected !== ordinal) {
    uv.selected = ordinal;
    uv.binding = null;
  }
  const animation = materialAnimation(resolve!, ordinal);
  if (!uv.binding) {
    const draws: StageUvDraw[] = [];
    for (const modelOrdinal of state.resources) {
      const resource = model(modelOrdinal);
      if (!resource) throw new RangeError(`UV animation: missing model ${modelOrdinal}`);
      draws.push(...resource.shapes.map((shape) => ({ shape })));
    }
    uv.binding = animation.tracks.length
      ? bindStageMaterialUv(animation, draws)
      : { parameters: [], tracksByDraw: draws.map(() => []) };
  }
  const frame = Math.min(Math.max(element.frame, 0), animation.frameCount - 1);
  uv.cells.apply(animation, uv.binding, frame);
}

function applyInstanceUv(
  node: StageNode,
  state: StageModelState,
  element: AnimationElement | null,
  offsets: Float32Array | null,
): void {
  if (node.record!.settings === null)
    throw new RangeError("UV animation: instanced settings are missing");
  if (!element?.count && !offsets && !state.materialUv && !state.instanceUv) {
    if (state.resources.length === 1) state.instanceUv = Float32Array.of(0, 0, 1, 1);
    return;
  }
  const flags = node.scene.graph.u32(node.record!.settings);
  if (state.resources.length !== 1)
    throw new RangeError("UV animation: instanced model resource selection is not supported");
  let record = state.instanceUv;
  if (!record) state.instanceUv = record = Float32Array.of(0, 0, 1, 1);
  if (offsets) {
    for (let i = 0; i < 2; i++) {
      const value = Math.fround(offsets[26 + i] * 255);
      const truncated =
        Number.isFinite(value) && value >= -2147483648 && value < 2147483648
          ? Math.trunc(value)
          : -2147483648;
      record[i] = Math.fround((truncated & 0xff) / 255);
    }
    record[2] = 1;
    record[3] = 1;
  }
  if ((flags & 0x20) === 0) {
    if (element?.count) throw new RangeError("UV animation: instanced UV provider is disabled");
    state.materialUv = null;
    return;
  }
  if (!element?.count) {
    state.materialUv = null;
    return;
  }
  if (!node.scene.options.animation)
    throw new RangeError("UV animation: animation resolver is missing");
  if (!node.scene.options.model) throw new RangeError("UV animation: model resolver is missing");
  const model = node.scene.options.model(state.resources[0]);
  if (!model) throw new RangeError(`UV animation: missing model ${state.resources[0]}`);
  if (model.shapes.some((shape) => shape.nodeRefs.length !== 1))
    throw new RangeError("UV animation: draw order is not a single-node shape vector");
  const ordinal = element.ordinals[element.index % element.count];
  let uv = state.materialUv;
  if (uv && uv.resources[0] !== state.resources[0])
    throw new RangeError("UV animation: instanced model switching is not supported");
  if (!uv) {
    uv = {
      resources: [...state.resources],
      cells: new StageMaterialUvState(model.shapes.length),
      selected: ordinal,
      binding: null,
      instanceFrame: 0,
    };
    state.materialUv = uv;
  }
  const animation = materialAnimation(node.scene.options.animation, uv.selected!);
  const active = animation.tracks.map((track) => track.curves.some((curve) => curve !== null));
  const group = state.instanceGroup;
  if (!uv.binding) {
    uv.binding = bindStageMaterialUv(
      animation,
      model.shapes.map((shape) => ({ shape })),
    );
    if (group && model.shapes.length) {
      // Rebinding resets the shared feature bits; other bound providers do not merge them.
      group.uvFeatures = Uint8Array.from(uv.binding.tracksByDraw, (tracks) =>
        Number(tracks.some((index) => active[index] && uv.binding!.parameters[index] === 0)),
      );
    }
  }
  const frame = Math.min(Math.max(uv.instanceFrame!, 0), animation.frameCount - 1);
  if (!Number.isFinite(frame) || !Number.isFinite(element.frame))
    throw new RangeError("UV animation: non-finite instance frame");
  if (uv.selected !== ordinal) {
    uv.selected = ordinal;
    uv.binding = null;
  } else {
    const sample = new Float32Array(4);
    for (const tracks of uv.binding.tracksByDraw)
      for (const index of tracks) {
        if (!active[index] || uv.binding.parameters[index] !== 0) continue;
        sampleUvTrack(animation.tracks[index], frame, sample);
        instanceUvBytes(sample);
        record.set(sample);
      }
  }
  uv.instanceFrame = element.frame;
}
