import { nthElement, type ColorElement } from "../elements";
import {
  applyMotions,
  computeWorld,
  sceneState,
  type NodeBehavior,
  type StageNode,
  type StageScene,
} from "../runtime";
import {
  lightColor,
  lightReachesGroup,
  setStageLightParameter,
  stageLightName,
  stageLightScope,
} from "./lights";
import { reflectionPlane } from "./reflectionMath";

export const REFLECTION_TYPE = 6001107;
const REFLECTION_STATE = "reflection";

export interface StageReflection {
  readonly key: string;
  readonly sourceDrawIndex: number;
  readonly drawIndex: number;
  readonly plane: Float32Array;
  readonly color: readonly number[];
  readonly mask: number;
  readonly sizeMode: number;
  readonly width: number;
  readonly height: number;
  readonly refractive: number;
  readonly requestHdr: boolean;
  readonly clipPlane: boolean;
}

interface ReflectionLight {
  owners: number;
  value: StageReflection | null;
}

interface ReflectionOwner {
  readonly name: string;
  readonly light: ReflectionLight;
  enabled: boolean;
  readonly localContext: boolean;
}

function reflections(scene: StageScene): Map<string, ReflectionLight> {
  return sceneState(scene, REFLECTION_STATE, () => new Map());
}

/** Shares reflection-light ownership between synchronized scenes before either is stepped. */
export function bindStageReflections(scenes: readonly StageScene[]): void {
  for (const scene of scenes)
    if (scene.classState.has(REFLECTION_STATE))
      throw new Error("Stage reflection: scenes were already initialized");
  if (!scenes.length) return;
  const shared = reflections(scenes[0]);
  for (let i = 1; i < scenes.length; i++) scenes[i].classState.set(REFLECTION_STATE, shared);
}

function publish(node: StageNode, owner: ReflectionOwner): void {
  const graph = node.scene.graph;
  const settings = node.record!.settings!;
  const color = nthElement<ColorElement>(node, 101, 0)!;
  const sourceDrawIndex = node.scene.options.drawIndex ?? 0;
  const drawIndex = graph.i32(settings + 8);
  owner.light.value = !owner.enabled
    ? null
    : {
        key: owner.name,
        sourceDrawIndex,
        drawIndex: drawIndex < 0 ? sourceDrawIndex : drawIndex,
        plane: reflectionPlane(node.world),
        color: lightColor(color.color),
        mask: stageLightScope(node).mask,
        sizeMode: graph.u32(settings + 12),
        width: graph.i32(settings + 16),
        height: graph.i32(settings + 20),
        refractive: graph.f32(settings + 24),
        requestHdr: graph.u32(settings + 28) !== 0,
        clipPlane: graph.u32(settings + 36) !== 0,
      };
}

/** The source forms supported by the local reflection preview. */
export function reflectionSettingsError(
  graph: { u32(at: number): number; f32(at: number): number },
  at: number | null,
): string | null {
  if (at === null) return "missing settings";
  const sizeMode = graph.u32(at + 12);
  if ((sizeMode | 0) < 0 || !Number.isFinite(graph.f32(at + 24))) return "reflection settings";
  return null;
}

export const reflectionNode: NodeBehavior = {
  type: REFLECTION_TYPE,
  setParameter: setStageLightParameter,
  construct(node) {
    const error = reflectionSettingsError(node.scene.graph, node.record!.settings);
    if (error) node.scene.missing.add(`node ${REFLECTION_TYPE}: ${error}`);
    const color = nthElement<ColorElement>(node, 101, 0);
    if (!color) node.scene.missing.add(`node ${REFLECTION_TYPE}: missing colour`);
    if (error || !color) return;
    const graph = node.scene.graph;
    const settings = node.record!.settings!;
    const name = stageLightName(node);
    const lights = reflections(node.scene);
    let light = lights.get(name);
    if (!light) {
      light = { owners: 0, value: null };
      lights.set(name, light);
    }
    light.owners++;
    const localContext = graph.u32(settings + 32) !== 0;
    if (localContext) node.flags &= ~0xa00;
    const owner: ReflectionOwner = {
      name,
      light,
      enabled: graph.u32(settings + 4) !== 0,
      localContext,
    };
    node.extension = owner;
    publish(node, owner);
  },
  update(node) {
    computeWorld(node);
    applyMotions(node);
    const owner = node.extension as ReflectionOwner | undefined;
    if (owner) publish(node, owner);
  },
  dispose(node) {
    const owner = node.extension as ReflectionOwner | undefined;
    if (owner && --owner.light.owners === 0) reflections(node.scene).delete(owner.name);
  },
};

/** Child playback contexts select this reflection scene without changing the inherited draw mask. */
export function stageReflectionContext(node: StageNode): string | null {
  if (node.record?.type !== REFLECTION_TYPE) return null;
  const owner = node.extension as ReflectionOwner | undefined;
  return owner?.localContext ? owner.name : null;
}

/** Enabled reflections in shared environment registration order. */
export function stageReflections(scene: StageScene): readonly StageReflection[] {
  const selected: StageReflection[] = [];
  for (const { value } of reflections(scene).values()) {
    if (!value) continue;
    selected.push(value);
  }
  return selected;
}

/** Native reflection publication leaves the last admitted light in the shared shader slots. */
export function stageReflection(scene: StageScene, group?: number): StageReflection | null {
  let selected: StageReflection | null = null;
  for (const light of stageReflections(scene))
    if (group === undefined || lightReachesGroup(light.mask, group)) selected = light;
  return selected;
}

/** Registered owners, including disabled lights whose render targets remain reusable. */
export function stageReflectionKeys(scene: StageScene): readonly string[] {
  return [...reflections(scene).keys()];
}

/** Keeps the named camera source independent from the reflection scene's draw-index selection. */
export function stageReflectionScenes(
  light: StageReflection,
  scenes: readonly StageScene[],
): { source: StageScene; casters: StageScene } {
  const resolve = (index: number) => {
    const scene = scenes.find((scene) => (scene.options.drawIndex ?? 0) === index);
    if (!scene) throw new RangeError(`Stage reflection: unavailable draw index ${index}`);
    return scene;
  };
  return { source: resolve(light.sourceDrawIndex), casters: resolve(light.drawIndex) };
}
