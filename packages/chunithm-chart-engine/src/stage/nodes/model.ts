import {
  computeWorld,
  applyMotions,
  stageNodeDrawable,
  stageTransformRequired,
  sceneState,
  type NodeBehavior,
  type StageNode,
  type StageScene,
} from "../runtime";
import { ModelElement, nthElement, type ColorElement, type TextureElement } from "../elements";
import { multiplyAffine } from "../../math/matrix";
import type { StageModel } from "../pack";
import { restPose } from "../model/skin";
import { stageProviderNodes } from "../model/providers";
import {
  buildInstanceMotionSamples,
  instanceBoneLayout,
  sampleInstanceMotion,
  blendInstanceMotion,
  type InstanceBoneLayout,
  type InstanceMotionSamples,
} from "../model/instanceMotion";
import {
  createStageModelProvider,
  stageAnimation,
  updateStageModelProvider,
  type StageModelPose,
  type StageModelProvider,
} from "../model/animation";
import { AnimationElement } from "../model/animationElement";
import { applyModelUv } from "../model/uvAnimation";
import type { StageMaterialUvState, StageUvBinding } from "../model/materialUv";
import { stageNodeBlend, type StageBlend } from "../blend";
import { retainSharedStageResource } from "../snapshot";
import type { StageInstanceBounds } from "../model/instanceBounds";
import { stageLightScope } from "./lights";
import { stageReflectionContext } from "./reflection";

const MODEL_TYPE = 6001001;
const INSTANCED_TYPE = 6001010;
const MODEL_ELEMENT = 200;
const INSTANCED_ELEMENT = 6003013;
const COLOR_ELEMENT = 101;
const TEXTURE_ELEMENT = 300;
const OFFSET_SLOTS = 14;
const INSTANCE_GROUPS = "model.instance-groups";

interface InstanceGroup {
  readonly model: StageModel;
  readonly flags: number;
  readonly order: number;
  readonly registeredSources: Uint8Array[];
  sources: readonly Uint8Array[];
  ready: boolean;
  fallbackProvider: StageModelProvider | null;
  uvFeatures: Uint8Array | null;
  readonly batchDrawBounds: Map<number, StageInstanceBounds>;
  targetScene: string;
  drawMask: number;
  lightGroup: number;
}

interface InstanceAnimation {
  readonly ordinal: number;
  readonly frame: number;
  readonly previousOrdinal?: number;
  readonly previousFrame?: number;
  readonly weight?: number;
}

interface InstanceGroupState {
  readonly scenes: readonly StageScene[];
  readonly groups: InstanceGroup[];
  readonly pending: Set<InstanceGroup>;
}

export function bindStageInstanceGroups(scenes: readonly StageScene[]): void {
  const shared: InstanceGroupState = { scenes: [...scenes], groups: [], pending: new Set() };
  for (const scene of scenes) {
    const previous = scene.classState.get(INSTANCE_GROUPS) as InstanceGroupState | undefined;
    if (previous && previous !== shared)
      throw new Error("Stage instance groups: scenes were already updated");
    scene.classState.set(INSTANCE_GROUPS, shared);
  }
}

/** Scene owners feeding the same instance manager, in player traversal order. */
export function stageInstanceScenes(scene: StageScene): readonly StageScene[] {
  return (
    (scene.classState.get(INSTANCE_GROUPS) as InstanceGroupState | undefined)?.scenes ?? [scene]
  );
}

interface InstanceOwner {
  readonly layout: InstanceBoneLayout;
  readonly clips: ReadonlyMap<Uint8Array, InstanceMotionSamples>;
  readonly sources: readonly Uint8Array[];
}

const instanceOwners = new WeakMap<StageModel, InstanceOwner[]>();

/** The last pose published by the model's update, or null while it keeps its rest pose. */
export function stageModelPose(node: StageNode, model: StageModel): StageModelPose | null {
  const state = node.extension as StageModelState;
  if (state.poseError) throw new RangeError(state.poseError);
  if (!state.provider) return null;
  if (state.resources.length !== 1 || node.scene.options.model?.(state.resources[0]) !== model)
    throw new RangeError("Stage animation: provider model does not match the draw");
  return state.provider.pose;
}

/** What a model node draws at the current step. */
export interface StageModelState {
  /** Selected model resources; ordinary model lists publish one entry. */
  readonly resources: readonly number[];
  modelSelection: number;
  /** Material parameters 8 and 9 as packed colours once published, else null. */
  diffuse: number | null;
  specular: number | null;
  /** The blend and depth state the node forces onto its shapes, or null for each shape's own. */
  readonly blend: StageBlend | null;
  /** Why the node's blend row cannot be drawn, or null. */
  readonly blendError: string | null;
  /** Textures the node's motions swapped into its model: the named texture is read from the resource at `ordinal`. */
  readonly textureSwaps: StageTextureSwap[];
  /** Mutable material cells in the model's packed draw-vector order. */
  materialUv: StageModelMaterialUv | null;
  /** Per-slot offsets published by an ordinary model's texture motion. */
  uvOffsets: Float32Array | null;
  /** UV resolution failure that prevents this node from drawing, or null after a successful update. */
  materialUvError: string | null;
  /** Packed instance UV record; shared by every draw submitted for this node. */
  instanceUv: Float32Array | null;
  /** Provider state owned by this model instance, not the shared model resource. */
  provider: StageModelProvider | null;
  /** Provider resource ordinals once its initial state has been created. */
  providerResource: number | null;
  providerAnimation: number | null;
  /** Current instance animation handoff; the renderer owns its shared motion texture. */
  instanceAnimation: InstanceAnimation | null;
  /** Animation snapshot consumed by joint queries during this update pass. */
  instanceJointAnimation: InstanceAnimation | null;
  instanceGroup: InstanceGroup | null;
  instanceRegistered: boolean;
  /** Blocks drawing after failure; ordinary models retry on a different model or animation selection. */
  poseError: string | null;
  poseFailureAnimation: number | null;
}

export interface StageModelMaterialUv {
  readonly resources: readonly number[];
  readonly cells: StageMaterialUvState;
  selected: number | null;
  binding: StageUvBinding | null;
  /** Frame handed off on the preceding instance update. */
  instanceFrame?: number;
}

export interface StageTextureSwap {
  readonly record: number;
  readonly name: string;
  readonly ordinal: number;
}

function resourceOrdinals(node: StageNode, elementType: number): number[] {
  const g = node.scene.graph;
  const element = node.record!.elements.find((e) => e.type === elementType);
  if (!element) return [];
  const pairs = g.pointer(element.offset + 8);
  const count = g.u32(element.offset + 12);
  const out: number[] = [];
  for (let i = 0; i < count && pairs !== null; i++) out.push(g.u32(pairs + i * 8));
  return out;
}

function registerInstanceGroup(node: StageNode, state: StageModelState): void {
  if (state.instanceRegistered || state.resources.length === 0) return;
  const element = nthElement<AnimationElement>(node, 400, 0);
  const settings = node.record!.settings!;
  const flags =
    (node.scene.graph.u32(settings) & 0xe1ff) |
    ((node.scene.graph.u32(settings + 12) << 9) & 0x1e00);
  const groups = sceneState<InstanceGroupState>(node.scene, INSTANCE_GROUPS, () => ({
    scenes: [node.scene],
    groups: [],
    pending: new Set(),
  }));
  const resolve = node.scene.options.model!;
  const model = resolve(state.resources[0]);
  if (!model) throw new RangeError(`Stage animation: missing model ${state.resources[0]}`);
  retainSharedStageResource(node.scene, model);
  let group = groups.groups.find((entry) => entry.model === model && entry.flags === flags);
  if (!group) {
    group = {
      model,
      flags,
      order: groups.groups.length,
      registeredSources: [],
      sources: [],
      ready: false,
      fallbackProvider: null,
      uvFeatures: (flags & 0x20) !== 0 ? new Uint8Array(model.shapes.length).fill(1) : null,
      batchDrawBounds: new Map(),
      targetScene: "",
      drawMask: 0,
      lightGroup: 0,
    };
    groups.groups.push(group);
  }
  for (const ordinal of element?.ordinals ?? []) {
    const source = node.scene.options.animation?.(ordinal);
    if (!source) throw new RangeError(`Stage animation: missing instance resource ${ordinal}`);
    retainSharedStageResource(node.scene, source);
    if (!group.registeredSources.includes(source)) {
      group.registeredSources.push(source);
      if (group.flags & 4) groups.pending.add(group);
    }
  }
  state.instanceGroup = group;
  state.instanceRegistered = true;
}

function instanceOwner(model: StageModel, group: InstanceGroup): InstanceOwner {
  const sources = group.sources;
  let owners = instanceOwners.get(model);
  if (!owners) instanceOwners.set(model, (owners = []));
  const cached = owners.find(
    (entry) =>
      entry.sources.length === sources.length &&
      entry.sources.every((source, index) => source === sources[index]),
  );
  if (cached) return cached;
  const layout = instanceBoneLayout(model);
  const provider = createStageModelProvider(model);
  const clips = new Map<Uint8Array, InstanceMotionSamples>();
  for (const bytes of sources) {
    const frames = stageAnimation(bytes).cvu.frameCount + 1;
    clips.set(bytes, buildInstanceMotionSamples(model, bytes, layout, frames, provider));
  }
  const owner = { layout, clips, sources };
  owners.push(owner);
  return owner;
}

function updateModelProvider(node: StageNode, state: StageModelState): void {
  const element = nthElement<AnimationElement>(node, 400, 0);
  if (!(element instanceof AnimationElement) || element.count === 0) {
    if (state.provider || state.instanceAnimation)
      throw new RangeError("Stage animation: removing an active animation is not supported");
    return;
  }
  const resolveModel = node.scene.options.model;
  const resolveAnimation = node.scene.options.animation;
  if (!resolveModel) throw new RangeError("Stage animation: model resolver is missing");
  if (!resolveAnimation) throw new RangeError("Stage animation: animation resolver is missing");
  if (node.record?.type === INSTANCED_TYPE) {
    if (state.resources.length !== 1)
      throw new RangeError("Stage animation: instanced resource selection is not supported");
    if (node.record.settings === null || (node.scene.graph.u32(node.record.settings) & 2) === 0)
      throw new RangeError("Stage animation: instanced motion is disabled");
    if ((node.scene.graph.u32(node.record.settings) & 0x1c) !== 0x1c)
      throw new RangeError("Stage animation: instanced group layout is not supported");
    const ordinal = element.ordinals[element.index % element.count];
    if (state.instanceAnimation && state.providerResource !== state.resources[0])
      throw new RangeError("Stage animation: instanced model switching is not supported");
    if (!resolveModel(state.resources[0]))
      throw new RangeError(`Stage animation: missing model ${state.resources[0]}`);
    if (!resolveAnimation(ordinal))
      throw new RangeError(`Stage animation: missing animation ${ordinal}`);
    if (!Number.isFinite(element.frame)) throw new RangeError("Stage animation: non-finite frame");
    const previous = state.instanceAnimation;
    const switched =
      !previous ||
      previous.ordinal !== ordinal ||
      (element.blending && previous.weight === Math.fround(1.01));
    const previousFrame =
      switched && previous
        ? Math.max(
            0,
            Math.min(
              Math.fround(previous.frame + node.delta),
              stageAnimation(resolveAnimation(previous.ordinal)!).cvu.frameCount - 1,
            ),
          )
        : (previous?.previousFrame ?? 0);
    state.instanceAnimation = {
      ordinal,
      frame: element.frame,
      previousOrdinal: switched ? previous?.ordinal : previous.previousOrdinal,
      previousFrame,
      weight: element.blending ? element.blendWeight : 1,
    };
    state.providerResource = state.resources[0];
    return;
  }
  if (state.resources.length !== 1)
    throw new RangeError(
      "Stage animation: shared provider across model resources is not supported",
    );
  const modelOrdinal = state.resources[0];
  const animationOrdinal = element.ordinals[element.index % element.count];
  if (state.provider && state.providerResource !== modelOrdinal)
    throw new RangeError("Stage animation: model resource switching is not supported");
  const model = resolveModel(modelOrdinal);
  if (!model) throw new RangeError(`Stage animation: missing model ${modelOrdinal}`);
  const bytes = resolveAnimation(animationOrdinal);
  if (!bytes) throw new RangeError(`Stage animation: missing animation ${animationOrdinal}`);
  retainSharedStageResource(node.scene, bytes);
  const provider = state.provider ?? createStageModelProvider(model);
  updateStageModelProvider(
    model,
    bytes,
    element.frame,
    provider,
    element.blending ? element.blendWeight : 1,
  );
  state.provider = provider;
  state.providerResource = modelOrdinal;
  state.providerAnimation = animationOrdinal;
}

/** A model node: a world matrix and motion lists, then its colour components published to its materials. */
function modelBehavior(type: number, elementType: number, settled: boolean): NodeBehavior {
  return {
    type,
    construct(node) {
      if (settled) node.flags &= ~0x200;
      let blend: StageBlend | null = null;
      let blendError: string | null = null;
      try {
        blend = stageNodeBlend(node.record!.flags, node.scene.graph.u32(node.record!.offset + 12));
      } catch (error) {
        blendError = (error as Error).message;
      }
      const texture = nthElement<TextureElement>(node, TEXTURE_ELEMENT, 0);
      const uv = nthElement<AnimationElement>(node, 402, 0);
      const model = nthElement<ModelElement>(node, MODEL_ELEMENT, 0);
      const resources = resourceOrdinals(node, elementType);
      const state: StageModelState = {
        resources: type === MODEL_TYPE && model?.count ? [model.ordinals[model.index]] : resources,
        modelSelection: model?.index ?? 0,
        diffuse: null,
        specular: null,
        blend,
        blendError,
        textureSwaps: [],
        materialUv: null,
        uvOffsets: null,
        materialUvError:
          uv && (uv.count > 0 || texture?.offsetChanged) ? "UV animation: not updated" : null,
        instanceUv: null,
        provider: null,
        providerResource: null,
        providerAnimation: null,
        instanceAnimation: null,
        instanceJointAnimation: null,
        instanceGroup: null,
        instanceRegistered: false,
        poseError: null,
        poseFailureAnimation: null,
      };
      node.extension = state;
      if (type === INSTANCED_TYPE && node.scene.options.model) {
        try {
          registerInstanceGroup(node, state);
        } catch (error) {
          if (!(error instanceof RangeError)) throw error;
          state.poseError = error.message;
          node.scene.missing.add(`model animation: ${state.poseError}`);
        }
      }
      if (texture && !texture.slots) texture.slots = new Float32Array(OFFSET_SLOTS * 2);
    },
    update(node) {
      const state = node.extension as StageModelState;
      if (type === INSTANCED_TYPE) state.instanceJointAnimation = state.instanceAnimation;
      if (stageTransformRequired(node)) computeWorld(node);
      applyMotions(node);
      if (!stageTransformRequired(node)) return;
      if (state.instanceGroup) {
        let target = node.scene.options.targetScene;
        for (let parent = node.parent; parent; parent = parent.parent) {
          const reflection = stageReflectionContext(parent);
          if (reflection !== null) {
            target = reflection;
            break;
          }
        }
        if (target !== undefined) state.instanceGroup.targetScene = target;
        state.instanceGroup.drawMask = (1 << (node.scene.options.drawIndex ?? 0)) & 0x7fffffff;
        state.instanceGroup.lightGroup = stageLightScope(node).group;
      }
      if (type === MODEL_TYPE) {
        const element = nthElement<ModelElement>(node, MODEL_ELEMENT, 0);
        if (element && element.index !== state.modelSelection) {
          state.modelSelection = element.index;
          (state.resources as number[]).splice(
            0,
            state.resources.length,
            element.ordinals[element.index],
          );
          state.provider = null;
          state.providerResource = null;
          state.providerAnimation = null;
          state.poseError = null;
          state.poseFailureAnimation = null;
          state.materialUv = null;
          state.materialUvError = null;
          state.textureSwaps.length = 0;
        }
      }
      const animation = nthElement<AnimationElement>(node, 400, 0);
      const selectedAnimation = animation?.count
        ? animation.ordinals[animation.index % animation.count]
        : null;
      if (
        !state.poseError ||
        (type === MODEL_TYPE && selectedAnimation !== state.poseFailureAnimation)
      ) {
        try {
          updateModelProvider(node, state);
          if (type === INSTANCED_TYPE) registerInstanceGroup(node, state);
          state.poseError = null;
          state.poseFailureAnimation = null;
        } catch (error) {
          if (!(error instanceof RangeError)) throw error;
          state.poseError = error.message;
          state.poseFailureAnimation = selectedAnimation;
          node.scene.missing.add(`model animation: ${state.poseError}`);
        }
      }
      try {
        applyModelUv(node, state);
        state.materialUvError = null;
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        state.materialUv = null;
        state.materialUvError = error.message;
        node.scene.missing.add(`model UV animation: ${state.materialUvError}`);
      }
      const diffuse = nthElement<ColorElement>(node, COLOR_ELEMENT, 0);
      const specular = nthElement<ColorElement>(node, COLOR_ELEMENT, 1);
      if (diffuse?.changed) state.diffuse = diffuse.color;
      if (specular?.changed) state.specular = specular.color;
    },
    finishStep(scene) {
      if (type !== INSTANCED_TYPE) return;
      const state = scene.classState.get(INSTANCE_GROUPS) as InstanceGroupState | undefined;
      if (state) {
        for (const group of state.pending) {
          group.sources = [...group.registeredSources];
          group.ready = true;
          group.fallbackProvider = null;
        }
        state.pending.clear();
      }
    },
    jointIndex(node, name) {
      if (type === INSTANCED_TYPE) return -1;
      const state = node.extension as StageModelState;
      const model = state.resources.length ? node.scene.options.model?.(state.resources[0]) : null;
      if (!model || name < 0) return -1;
      const wanted = node.scene.graph.text(name);
      return stageProviderNodes(model).findIndex(
        (index) => model.nodes[index].fields._name === wanted,
      );
    },
    joint(node, world, index, name) {
      const state = node.extension as StageModelState;
      const resolve = node.scene.options.model;
      const model = state.resources.length && resolve ? resolve(state.resources[0]) : null;
      if (!model) throw new RangeError("Stage model: joint of a node without a model");
      const pose = type === INSTANCED_TYPE ? null : stageModelPose(node, model);
      const providers = stageProviderNodes(model);
      let joint = providers[index] ?? -1;
      if (joint < 0) {
        if (type === INSTANCED_TYPE) return false;
        if (index >= 0) return false;
        const wanted = name < 0 ? "" : node.scene.graph.text(name);
        joint = providers.find((i) => model.nodes[i].fields._name === wanted) ?? -1;
      }
      if (joint < 0) return false;
      let rows: Float32Array;
      if (type === INSTANCED_TYPE) {
        const group = state.instanceGroup;
        if (!group || !group.ready) {
          rows = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0);
        } else {
          const owner = (group.flags & 0x100) !== 0 ? instanceOwner(model, group) : null;
          const bone = owner ? owner.layout.bones.lastIndexOf(joint) : -1;
          if (bone >= 0) {
            rows = new Float32Array(12);
            const animation = state.instanceJointAnimation;
            const source = animation && node.scene.options.animation!(animation.ordinal);
            const clip = source && owner!.clips.get(source);
            if (clip) {
              sampleInstanceMotion(clip, bone, animation.frame, rows);
              if (
                animation.previousOrdinal !== undefined &&
                animation.previousOrdinal !== animation.ordinal
              ) {
                const previousSource = node.scene.options.animation!(animation.previousOrdinal);
                const previousClip = previousSource && owner!.clips.get(previousSource);
                if (previousClip) {
                  const previousRows = new Float32Array(12);
                  sampleInstanceMotion(previousClip, bone, animation.previousFrame!, previousRows);
                  blendInstanceMotion(rows, previousRows, animation.weight ?? 1, rows);
                }
              }
            } else rows.set(owner!.layout.binds[bone]);
          } else {
            const animation = state.instanceJointAnimation;
            if (!animation)
              throw new RangeError("Stage animation: instanced joint is not initialized");
            const source = node.scene.options.animation!(animation.ordinal);
            if (!source)
              throw new RangeError(
                `Stage animation: missing instance resource ${animation.ordinal}`,
              );
            const provider = group.fallbackProvider ?? createStageModelProvider(model);
            updateStageModelProvider(model, source, animation.frame, provider);
            group.fallbackProvider = provider;
            rows = provider.pose.worlds[joint];
          }
        }
      } else rows = pose?.worlds[joint] ?? restWorld(model, joint);
      const columns = Float32Array.of(
        rows[0],
        rows[4],
        rows[8],
        0,
        rows[1],
        rows[5],
        rows[9],
        0,
        rows[2],
        rows[6],
        rows[10],
        0,
        rows[3],
        rows[7],
        rows[11],
        1,
      );
      const out = new Float32Array(16);
      multiplyAffine(world, columns, out);
      world.set(out);
      return true;
    },
  };
}

const poses = new WeakMap<StageModel, Float32Array[]>();

function restWorld(model: StageModel, index: number): Float32Array {
  let worlds = poses.get(model);
  if (!worlds) poses.set(model, (worlds = restPose(model)));
  return worlds[index];
}

export const modelNode = modelBehavior(MODEL_TYPE, MODEL_ELEMENT, true);

/** The instanced model node: the model list sits in its own element, and construction leaves the deferred-update bit set. */
export const instancedModelNode = modelBehavior(INSTANCED_TYPE, INSTANCED_ELEMENT, false);

/** The model state of a node, when it is a model node. */
export function stageModelState(node: StageNode): StageModelState | null {
  return (node.record?.type === MODEL_TYPE || node.record?.type === INSTANCED_TYPE) &&
    node.extension
    ? (node.extension as StageModelState)
    : null;
}

/** Draw visibility follows the node gate; stopped ancestors suppress their entire subtree. */
export function stageModelLive(node: StageNode): boolean {
  return stageNodeDrawable(node);
}
