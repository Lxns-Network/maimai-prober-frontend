import {
  applyMotions,
  computeWorld,
  NODE_VISIBLE,
  sceneState,
  type NodeBehavior,
  type StageNode,
  type StageScene,
} from "../runtime";
import {
  lightColor,
  lightReachesGroup,
  parallelDirection,
  setStageLightParameter,
  stageLightName,
  stageLightScope,
} from "./lights";
import {
  readShadowSettings,
  shadowCascadeCount,
  SHADOW_PARALLEL_TYPE,
  type StageShadowSettings,
} from "./shadowSettings";

export interface StageShadowLight {
  readonly key: string;
  /** Last publishing player; independent of the buffer's named/default camera source. */
  readonly sourceScene?: StageScene;
  readonly settings: StageShadowSettings;
  readonly direction: readonly number[];
  readonly diffuse: readonly number[];
  readonly specular: readonly number[];
  readonly color: readonly number[];
  readonly mask: number;
}

const SHADOW_STATE = "shadow.scene";

interface ShadowEntry {
  owners: number;
  light: StageShadowLight | null;
}

interface ShadowOwner {
  readonly key: string;
  readonly entry: ShadowEntry;
  enabled: boolean;
}

function sceneShadows(scene: StageScene): Map<string, ShadowEntry> {
  return sceneState(scene, SHADOW_STATE, () => new Map());
}

/** Shares shadow-light ownership between synchronized scenes before either is stepped. */
export function bindStageShadows(scenes: readonly StageScene[]): void {
  for (const scene of scenes)
    if (scene.classState.has(SHADOW_STATE))
      throw new Error("Stage shadow: scenes were already initialized");
  if (!scenes.length) return;
  const shared = sceneShadows(scenes[0]);
  for (let i = 1; i < scenes.length; i++) scenes[i].classState.set(SHADOW_STATE, shared);
}

/** Registered shadow owners, including temporarily disabled lights whose buffers stay allocated. */
export function stageShadowKeys(scene: StageScene): ReadonlySet<string> {
  return new Set(sceneShadows(scene).keys());
}

function publishShadow(node: StageNode, owner: ShadowOwner): void {
  if (!owner.enabled) {
    owner.entry.light = null;
    return;
  }
  const settings = readShadowSettings(node, node.scene.options.drawIndex ?? 0);
  owner.entry.light = {
    key: owner.key,
    sourceScene: node.scene,
    settings: { ...settings, cascadeCount: shadowCascadeCount(settings.cascadeCount) },
    direction: parallelDirection(node.world),
    diffuse: lightColor(settings.diffuse),
    specular: lightColor(settings.specular),
    color: lightColor(settings.shadowColor),
    mask: stageLightScope(node).mask,
  };
}

export const shadowNode: NodeBehavior = {
  type: SHADOW_PARALLEL_TYPE,
  setParameter: setStageLightParameter,
  construct(node) {
    node.flags |= NODE_VISIBLE;
    const settings = node.record!.settings;
    if (settings === null) throw new RangeError("Stage shadow: no settings");
    const graph = node.scene.graph;
    const key = stageLightName(node);
    const shadows = sceneShadows(node.scene);
    let entry = shadows.get(key);
    if (!entry) {
      entry = { owners: 0, light: null };
      shadows.set(key, entry);
    }
    entry.owners++;
    const owner: ShadowOwner = { key, entry, enabled: graph.u32(settings + 4) !== 0 };
    node.extension = owner;
    publishShadow(node, owner);
  },
  update(node) {
    computeWorld(node);
    applyMotions(node);
    publishShadow(node, node.extension as ShadowOwner);
  },
  dispose(node) {
    const owner = node.extension as ShadowOwner;
    if (--owner.entry.owners === 0) sceneShadows(node.scene).delete(owner.key);
  },
};

/** Enabled shadows in environment registration order, with shared names published only once. */
export function stageShadows(scene: StageScene): readonly StageShadowLight[] {
  const lights: StageShadowLight[] = [];
  for (const entry of sceneShadows(scene).values()) {
    if (!entry.light) continue;
    const settings = entry.light.settings;
    if (
      settings.width < 16 ||
      settings.height < 16 ||
      (settings.type !== 0 && settings.type !== 1) ||
      settings.softness < 0 ||
      settings.softness > 4 ||
      settings.colorShadow < 0 ||
      settings.colorShadow > 3 ||
      ![...settings.cascadeDepths, settings.length, settings.slope].every(Number.isFinite)
    )
      throw new RangeError("Stage shadow: unsupported settings");
    lights.push(entry.light);
  }
  return lights;
}

/** The first admitted shadow owns the native shader's single shadow-light slot. */
export function stageShadow(scene: StageScene, group?: number): StageShadowLight | null {
  return (
    stageShadows(scene).find(
      (light) => group === undefined || lightReachesGroup(light.mask, group),
    ) ?? null
  );
}

/** Resolves the caster queue by draw index, independently of the source camera's scene. */
export function stageShadowCasterScene(
  light: StageShadowLight,
  scenes: readonly StageScene[],
): StageScene {
  const scene = scenes.find((scene) => (scene.options.drawIndex ?? 0) === light.settings.drawIndex);
  if (!scene)
    throw new RangeError(`Stage shadow: unavailable draw index ${light.settings.drawIndex}`);
  return scene;
}
