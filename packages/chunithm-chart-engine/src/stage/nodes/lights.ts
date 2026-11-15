import {
  computeWorld,
  applyMotions,
  NODE_VISIBLE,
  sceneState,
  type NodeBehavior,
  type StageLightGroups,
  type StageNode,
  type StageScene,
} from "../runtime";
import { nthElement, type ColorElement } from "../elements";
import { sortStageLights } from "./lightSort";

const f = Math.fround;
const AMBIENT_TYPE = 6001100;
const PARALLEL_TYPE = 6001101;
const POINT_TYPE = 6001102;
const FOG_TYPE = 6001104;
const HEMISPHERE_TYPE = 6001106;
const RIM_TYPE = 6001109;
const GROUP_TYPE = 6001011;
const MASK_TYPE = 6001012;
const FOG_NORMAL_MODE = 1;
const FOG_DISTANCE_MODE = 2;
const FOG_HEIGHT_MODE = 3;
const MAX_PARALLEL = 3;
const MAX_POINT = 3;
const SCOPE_SLOTS = 10;
const POINT_FALLOFF_FLOOR = 2.938735877055719e-39;
const FLOAT_MAX = 3.4028234663852886e38;

/** The light scope a node hands to its descendants: the group its models belong to and the groups its lights reach. */
export interface StageLightScope {
  readonly group: number;
  readonly mask: number;
}

/** The base/object player's light slots after loader setup and property publication. */
export const BASE_LIGHT_GROUPS: StageLightGroups = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** The field player's light slots; group 31 is excluded from light masks. */
export const FIELD_LIGHT_GROUPS: StageLightGroups = [31, 31, 31, 31, 31, 31, 31, 31, 31, 31];

/** A scene fog's colour, distance ramp and height ramp in native shader units. */
export interface StageFog {
  readonly color: readonly number[];
  readonly mode: number;
  readonly range: readonly number[];
  readonly height: readonly number[];
}

/** One light of a scene file in shader units, with the groups it reaches as a bit mask. */
export type StageLight = { readonly mask: number } & (
  | { readonly kind: "ambient"; readonly color: readonly number[] }
  | {
      readonly kind: "hemisphere";
      readonly direction: readonly number[];
      readonly sky: readonly number[];
      readonly ground: readonly number[];
    }
  | {
      readonly kind: "parallel";
      readonly direction: readonly number[];
      readonly diffuse: readonly number[];
      readonly specular: readonly number[];
    }
  | {
      readonly kind: "point";
      /** The world position and the falloff end. */
      readonly position: readonly number[];
      /** The colour and the falloff scale `1 / (end - start)`. */
      readonly diffuse: readonly number[];
      readonly specular: readonly number[];
    }
  | ({ readonly kind: "rim" } & StageRim)
  | ({ readonly kind: "fog" } & StageFog)
);

export interface StageRim {
  readonly mode: number;
  readonly rimMask: number;
  readonly depthKey?: string;
  readonly direction: readonly number[];
  readonly colorBias: readonly number[];
  readonly offset: number;
}

interface LightEntry {
  owners: number;
  value: StageLight | null;
  rimDepth?: { readonly scene: StageScene; readonly source: string; readonly minDiff: number };
}

interface LightOwner {
  readonly key: string;
  readonly light: LightEntry;
  enabled: boolean;
}

/** Light nodes expose only parameter 0; its float value is truncated to an integer enable flag. */
export function setStageLightParameter(node: StageNode, index: number, value: number): void {
  if (index !== 0) return;
  const owner = node.extension as { enabled: boolean } | undefined;
  if (owner) owner.enabled = Math.trunc(f(value)) !== 0;
}

const LIGHTS = "lights.scene";

function sceneLights(scene: StageScene): Map<string, LightEntry> {
  return sceneState(scene, LIGHTS, () => new Map());
}

/** Shares the light environment of synchronized scenes before they are stepped or queried. */
export function bindStageLighting(scenes: readonly StageScene[]): void {
  for (const scene of scenes)
    if (scene.classState.has(LIGHTS))
      throw new Error("Stage lighting: scenes were already initialized");
  if (!scenes.length) return;
  const shared = sceneLights(scenes[0]);
  for (let i = 1; i < scenes.length; i++) scenes[i].classState.set(LIGHTS, shared);
}

/** The lights a scene file publishes at the current step. */
export interface StageLighting {
  readonly lights: readonly StageLight[];
  /** Target draw scene's pass-indexed environment vectors, separate from global light groups. */
  readonly scenePasses?: ReadonlyMap<number, readonly StageLight[]>;
}

/** The lights one group of models receives. */
export interface StageGroupLighting {
  readonly ambient: readonly number[] | null;
  readonly hemisphere: {
    readonly direction: readonly number[];
    readonly sky: readonly number[];
    readonly ground: readonly number[];
  } | null;
  readonly parallel: readonly {
    readonly direction: readonly number[];
    readonly diffuse: readonly number[];
    readonly specular: readonly number[];
  }[];
  readonly point: readonly {
    readonly position: readonly number[];
    readonly diffuse: readonly number[];
    readonly specular: readonly number[];
  }[];
  readonly rim: StageRim | null;
  readonly fog: StageFog | null;
}

/** A packed light colour as shader RGB, unpremultiplied by its alpha. */
export function lightColor(packed: number): number[] {
  const scale = f(1 / 255);
  const alpha = f((packed >>> 24) * scale);
  const inverse = f(1 / Math.max(alpha, f(0.001)));
  return [0, 8, 16].map((shift) => f(f(((packed >>> shift) & 255) * scale) * inverse));
}

/** The direction a parallel light shines along: the negated third axis of its world matrix. */
export function parallelDirection(world: Float32Array): number[] {
  return [0, 1, 2].map((row) => f(f(f(world[row] + world[4 + row]) * 0) - f(world[8 + row] * 1)));
}

/** The visibility ramp of a fog from its near and end distances, density and floor. */
export function stageFogRange(
  mode: number,
  near: number,
  end: number,
  density: number,
  floor: number,
): number[] {
  const high = f(1 - density);
  const low = f(1 - floor);
  let span = f(end - near);
  if (Math.abs(span) < f(0.001)) span = f(0.001);
  const rise = mode === FOG_DISTANCE_MODE ? f(high - low) : 1;
  return [end, f(rise / span), high, low];
}

/** The height limits, far distance and reciprocal height-distance span of a fog. */
export function stageFogHeight(top: number, bottom: number, near: number, far: number): number[] {
  let span = f(far - near);
  if (Math.abs(span) < f(0.001)) span = f(0.001);
  return [top, bottom, far, f(1 / span)];
}

/** The scale of a point light's falloff: the reciprocal of the span from its start to its end. */
export function pointFalloffScale(start: number, end: number): number {
  const span = f(end - Math.min(start, end));
  return span <= POINT_FALLOFF_FLOOR ? FLOAT_MAX : f(1 / span);
}

/** The groups a light with the given mask reaches: the bit of the group, never bit 31. */
export function lightReachesGroup(mask: number, group: number): boolean {
  return ((1 << (group & 31)) & mask & 0x7fffffff) !== 0;
}

/**
 * The light scope of a node: the nearest enclosing group node sets the group of the models beneath it, and
 * the nearest enclosing mask node sets the groups the lights beneath it reach.
 */
export function stageLightScope(node: StageNode): StageLightScope {
  const chain: StageNode[] = [];
  for (let at: StageNode | null = node; at; at = at.parent) chain.push(at);
  const groups = node.scene.options.lightGroups ?? BASE_LIGHT_GROUPS;
  let group = groups[0];
  let mask = 0;
  for (const selected of groups) mask |= (1 << selected) & 0x7fffffff;
  const graph = node.scene.graph;
  for (let i = chain.length - 1; i >= 0; i--) {
    const record = chain[i].record;
    if (!record || record.settings === null) continue;
    if (record.type === GROUP_TYPE) {
      const slot = graph.u32(record.settings);
      if (slot < SCOPE_SLOTS) group = groups[slot];
    } else if (record.type === MASK_TYPE) {
      const selected = graph.u32(record.settings);
      mask = 0;
      for (let slot = 0; slot < SCOPE_SLOTS; slot++)
        if ((selected >>> slot) & 1) mask |= (1 << groups[slot]) & 0x7fffffff;
    }
  }
  return { group, mask };
}

/** The full native light name in the player's environment. */
export function stageLightName(node: StageNode): string {
  const graph = node.scene.graph;
  const name = graph.text(graph.target(node.record!.settings!));
  const owner = node.scene.options.uniqueEnvironmentOwner;
  return owner == null ? name : `${owner}_${name}`;
}

function fogSettings(scene: StageScene, at: number | null) {
  if (at === null) return null;
  const g = scene.graph;
  return {
    mode: g.u32(at + 8),
    near: g.f32(at + 12),
    end: g.f32(at + 16),
    density: g.f32(at + 20),
    floor: g.f32(at + 24),
    top: g.f32(at + 28),
    bottom: g.f32(at + 32),
    heightNear: g.f32(at + 36),
    heightFar: g.f32(at + 40),
  };
}

function fogDrawn(mode: number): boolean {
  return mode === FOG_NORMAL_MODE || mode === FOG_DISTANCE_MODE || mode === FOG_HEIGHT_MODE;
}

function colorOf(node: StageNode, index: number): number {
  const element = nthElement<ColorElement>(node, 101, index);
  if (!element) throw new RangeError(`Stage light: colour component ${index}`);
  return element.color;
}

const lightUpdate = (node: StageNode) => {
  computeWorld(node);
  applyMotions(node);
};

const scopeNode = (type: number): NodeBehavior => ({
  type,
  construct(node) {
    node.flags |= NODE_VISIBLE;
    if (node.record!.settings === null) node.scene.missing.add(`node ${type}: no settings`);
  },
  update: lightUpdate,
});

/** The group node: its models belong to the group its settings name. */
export const lightGroupNode: NodeBehavior = scopeNode(GROUP_TYPE);
/** The mask node: its lights reach the groups its settings select. */
export const lightMaskNode: NodeBehavior = scopeNode(MASK_TYPE);
function lightNode(type: number, validate?: (node: StageNode) => boolean): NodeBehavior {
  return {
    type,
    setParameter: setStageLightParameter,
    construct(node) {
      node.flags |= NODE_VISIBLE;
      const settings = node.record!.settings;
      if (settings === null) {
        node.scene.missing.add(`node ${type}: no settings`);
        return;
      }
      if (validate && !validate(node)) return;
      const graph = node.scene.graph;
      const key = `${type}:${stageLightName(node)}`;
      const lights = sceneLights(node.scene);
      let light = lights.get(key);
      if (!light) {
        light = { owners: 0, value: null };
        lights.set(key, light);
      }
      light.owners++;
      const owner: LightOwner = { key, light, enabled: graph.u32(settings + 4) !== 0 };
      node.extension = owner;
      publishLight(node, owner);
    },
    update(node) {
      lightUpdate(node);
      const owner = node.extension as LightOwner | undefined;
      if (owner) publishLight(node, owner);
    },
    dispose(node) {
      const owner = node.extension as LightOwner | undefined;
      if (owner && --owner.light.owners === 0) sceneLights(node.scene).delete(owner.key);
    },
  };
}

export const ambientLightNode: NodeBehavior = lightNode(AMBIENT_TYPE);
export const parallelLightNode: NodeBehavior = lightNode(PARALLEL_TYPE);
export const pointLightNode: NodeBehavior = lightNode(POINT_TYPE);
export const hemisphereLightNode: NodeBehavior = lightNode(HEMISPHERE_TYPE);
export const rimLightNode: NodeBehavior = lightNode(RIM_TYPE, (node) => {
  const graph = node.scene.graph;
  const at = node.record!.settings!;
  const mode = graph.u32(at + 8);
  const mask = graph.u32(at + 20);
  if (mode <= 3 && mask <= 4) return true;
  node.scene.missing.add(`node ${RIM_TYPE}: rim mode ${mode} mask ${mask}`);
  return false;
});

/** The fog node: a world matrix and motion lists, with normal, distance or height fog. */
export const fogLightNode: NodeBehavior = lightNode(FOG_TYPE, (node) => {
  const settings = fogSettings(node.scene, node.record!.settings);
  if (settings && fogDrawn(settings.mode)) return true;
  node.scene.missing.add(`node ${FOG_TYPE}: fog mode ${settings ? settings.mode : -1}`);
  return false;
});

function publishLight(node: StageNode, owner: LightOwner): void {
  if (!owner.enabled) {
    owner.light.value = null;
    return;
  }
  const type = node.record!.type;
  const g = node.scene.graph;
  const at = node.record!.settings!;
  const mask = stageLightScope(node).mask;
  if (type === AMBIENT_TYPE) {
    owner.light.value = { kind: "ambient", mask, color: lightColor(colorOf(node, 0)) };
  } else if (type === PARALLEL_TYPE) {
    owner.light.value = {
      kind: "parallel",
      mask,
      direction: parallelDirection(node.world),
      diffuse: [...lightColor(colorOf(node, 0)), 1],
      specular: [...lightColor(colorOf(node, 1)), 1],
    };
  } else if (type === HEMISPHERE_TYPE) {
    owner.light.value = {
      kind: "hemisphere",
      mask,
      direction: parallelDirection(node.world),
      sky: lightColor(colorOf(node, 0)),
      ground: lightColor(colorOf(node, 1)),
    };
  } else if (type === POINT_TYPE) {
    const start = g.f32(at + 8);
    const end = g.f32(at + 12);
    owner.light.value = {
      kind: "point",
      mask,
      position: [node.world[12], node.world[13], node.world[14], end],
      diffuse: [...lightColor(colorOf(node, 0)), pointFalloffScale(start, end)],
      specular: [...lightColor(colorOf(node, 1)), 1],
    };
  } else if (type === RIM_TYPE) {
    const rimMask = g.u32(at + 20);
    owner.light.rimDepth =
      rimMask >= 3
        ? {
            scene: node.scene,
            source: g.text(g.target(at + 24)),
            minDiff: g.f32(at + 28),
          }
        : undefined;
    owner.light.value = {
      kind: "rim",
      mask,
      mode: g.u32(at + 8),
      rimMask,
      depthKey: rimMask >= 3 ? owner.key : undefined,
      direction: parallelDirection(node.world),
      colorBias: [...lightColor(colorOf(node, 0)), g.f32(at + 16)],
      offset: g.f32(at + 12),
    };
  } else {
    const settings = fogSettings(node.scene, at)!;
    owner.light.value = {
      kind: "fog",
      mask,
      color: lightColor(colorOf(node, 0)),
      mode: settings.mode,
      range: stageFogRange(
        settings.mode,
        settings.near,
        settings.end,
        settings.density,
        settings.floor,
      ),
      height: stageFogHeight(
        settings.top,
        settings.bottom,
        settings.heightNear,
        settings.heightFar,
      ),
    };
  }
}

/**
 * The lights of a scene file at its current step, each with the groups it reaches.
 *
 */
export function stageLighting(scene: StageScene): StageLighting {
  const lights: StageLight[] = [];
  for (const light of sceneLights(scene).values()) if (light.value) lights.push(light.value);
  // TODO: Publish pass-scoped lights when a Stage has a known external light source.
  return { lights };
}

/** Active rim-owned depth scenes; source names resolve against the player's draw scenes. */
export function stageRimDepthScenes(scene: StageScene) {
  const scenes: {
    readonly key: string;
    readonly light: StageLight & { readonly kind: "rim" };
    readonly scene: StageScene;
    readonly source: string;
    readonly minDiff: number;
  }[] = [];
  for (const [key, entry] of sceneLights(scene))
    if (entry.value?.kind === "rim" && entry.rimDepth)
      scenes.push({ key, light: entry.value, ...entry.rimDepth });
  return scenes;
}

/**
 * The lights a model of `group` receives in `pass`. Global group and target-scene pass entries precede material
 * extras; extras are already selected by the material and are not filtered by the group mask.
 * Repeated objects consume separate publication slots. Sorting happens after all three sources merge.
 * Ambient and hemisphere use the last published light for odd counts and are disabled for even counts,
 * following the default shader's one-bit feature mappings. Fog uses the greatest mode and the last
 * published parameters, which are independent. Rim uses the greatest mode and rim mask and the last
 * published parameters.
 */
export function lightingForGroup(
  lighting: StageLighting,
  group: number,
  pass = 0,
  materialLights: readonly StageLight[] = [],
): StageGroupLighting {
  let ambient: readonly number[] | null = null;
  let hemisphere: StageGroupLighting["hemisphere"] = null;
  let ambientCount = 0;
  let hemisphereCount = 0;
  let rim: StageGroupLighting["rim"] = null;
  let fog: StageFog | null = null;
  const parallel: {
    direction: readonly number[];
    diffuse: readonly number[];
    specular: readonly number[];
  }[] = [];
  const point: {
    position: readonly number[];
    diffuse: readonly number[];
    specular: readonly number[];
  }[] = [];
  const ordered = lighting.lights.filter((light) => lightReachesGroup(light.mask, group));
  const scene = lighting.scenePasses?.get(pass);
  if (scene) ordered.push(...scene);
  ordered.push(...materialLights);
  sortStageLights(ordered);
  for (const light of ordered) {
    switch (light.kind) {
      case "ambient":
        ambientCount++;
        ambient = light.color;
        break;
      case "hemisphere":
        hemisphereCount++;
        hemisphere = light;
        break;
      case "rim":
        rim = rim
          ? {
              ...light,
              mode: Math.max(rim.mode, light.mode),
              rimMask: Math.max(rim.rimMask, light.rimMask),
              depthKey: light.depthKey ?? rim.depthKey,
            }
          : light;
        break;
      case "fog":
        fog = fog ? { ...light, mode: Math.max(fog.mode, light.mode) } : light;
        break;
      case "parallel":
        if (parallel.length < MAX_PARALLEL) parallel.push(light);
        break;
      case "point":
        if (point.length < MAX_POINT) point.push(light);
        break;
    }
  }
  return {
    ambient: ambientCount % 2 ? ambient : null,
    hemisphere: hemisphereCount % 2 ? hemisphere : null,
    parallel,
    point,
    rim,
    fog,
  };
}
