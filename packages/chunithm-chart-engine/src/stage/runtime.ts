import type { StageModel } from "./pack";
import type { StageGraph, StageMotionRecord, StageNodeRecord, StageStateRecord } from "./graph";
import { setIdentity, multiplyAffine } from "../math/matrix";
import { floorF32, type StageRandom } from "./random";
import { createElements, type StageElement } from "./elements";
import { runCollisionQueries } from "./collision";

const f = Math.fround;

/** Node flag bits. */
export const NODE_KILLED = 0x1;
export const NODE_HAS_CHILDREN = 0x2;
export const NODE_VISIBLE = 0x400;
export const NODE_IN_MOTIONS = 0x8000;
export const NODE_FIXED_WORLD = 0x4000;
export const NODE_COORDINATE_TARGET = 0x10000;
export const NODE_UPDATED = 0x80000;
export const NODE_PREPARED = 0x40000;
const NODE_INITIAL_FLAGS = 0x1a80;
const NODE_DEAD = 0x1f80;
const RECORD_HALF_RATE = 0x800;

/** A motion slot of a node: its record, lifetime window and live instance. */
export interface MotionSlot {
  record: StageMotionRecord;
  instance: MotionInstance | null;
  initialized: boolean;
  finished: boolean;
  start: number;
  length: number;
}

/** A live motion: the behavior that built it and its own state. */
export interface MotionInstance {
  readonly behavior: MotionBehavior;
  readonly record: StageMotionRecord;
  /** Advances one step; writes a transform into `scratch` unless accumulation is disabled, and returns true when it produced one. */
  update(node: StageNode, scratch: Float32Array, accumulate?: boolean): boolean;
  /** Releases the motion on state exit, expiry, node retirement or an unsupported update being skipped. */
  dispose?(node: StageNode): void;
  /** Receives a float parameter sent to this initialized motion. */
  setParameter?(index: number, value: number): void;
}

export interface MotionBehavior {
  readonly type: number;
  create(scene: StageScene, node: StageNode, record: StageMotionRecord): MotionInstance;
}

/** A deferred state request: on the queuing node itself, or a search from `target` for nodes whose record id is `id`. */
export interface PendingCommand {
  readonly target: StageNode | null;
  readonly id: number;
  readonly state: number;
  /** Searches `target` and its descendants instead of `target`, its following siblings and their descendants. */
  readonly subtree: boolean;
  readonly match: number;
}

/** A scheduled child of a node: when, how many and how often its instances appear. */
export interface ScheduleEntry {
  readonly child: StageNodeRecord;
  readonly parameters: number;
  readonly id: number;
  readonly stateRequest: number;
  age: number;
  flags: number;
  start: number;
  end: number;
  batch: number;
  repeat: number;
  next: number;
  remaining: number;
  interval: number;
  spawned: number;
  createdAtPass: number;
}

export interface Controller {
  readonly type: number;
  readonly parameters: number;
  age: number;
  stateAge: number;
  flags: number;
  passes: number;
  life: number;
  readonly schedule: ScheduleEntry[];
  readonly killWhenChildrenDone: boolean;
}

/** One live scene-graph node. Matrices keep the executable's memory order (translation at 12..14). */
export interface StageNode {
  readonly scene: StageScene;
  readonly record: StageNodeRecord | null;
  readonly parent: StageNode | null;
  coordinateParent: StageNode | null;
  /** How the world matrix follows the coordinate parent; starts as the record's setting. */
  coordinateMode: number;
  translationOnly: number;
  readonly children: StageNode[];
  readonly id: number;
  readonly ordinal: number;
  readonly count: number;
  readonly spawnIndex: number;
  readonly birth: number;
  readonly end: number;
  stateIndex: number;
  flags: number;
  delta: number;
  readonly halfRatePhase: number;
  readonly world: Float32Array;
  readonly local: Float32Array;
  carry: Float32Array | null;
  offset: Float32Array | null;
  fixedWorld: Float32Array | null;
  readonly controller: Controller | null;
  before: MotionSlot[];
  stateMotions: MotionSlot[];
  after: MotionSlot[];
  pending: PendingCommand[];
  /** Motions of states the node left, destroyed when the step ends. */
  graveyard: MotionInstance[];
  elements: (StageElement | null)[];
  /** The node's colour carries transparency. */
  translucent: boolean;
  /** Per-type data of the node's class, created by its behavior. */
  extension: unknown;
}

/** Class-specific behavior of a node type. */
export interface NodeBehavior {
  readonly type: number;
  /** Runs once after the generic construction. */
  construct?(node: StageNode): void;
  /** The update step; defaults to computing the world matrix and running the motion lists. */
  update?(node: StageNode): void;
  /** Receives a node parameter from a send track before the next property publication. */
  setParameter?(node: StageNode, index: number, value: number): void;
  /** Runs after the node's children have been updated. */
  post?(node: StageNode): void;
  /** Restores traversal state after the children, even when the node suppresses its post hook. */
  afterChildren?(node: StageNode): void;
  /** Runs in the draw-prepare pass. */
  prepare?(node: StageNode): void;
  /** Releases scene-wide state owned by the node when it leaves the tree. */
  dispose?(node: StageNode): void;
  /** Publishes scene-wide work after every synchronized scene has stepped. */
  finishStep?(scene: StageScene): void;
  /** Applies the indexed or named joint to `world`, returning false if it is unavailable. */
  joint?(node: StageNode, world: Float32Array, index: number, name: number): boolean;
  /** Resolves a graph string offset to the node's joint ordinal, or -1 when absent. */
  jointIndex?(node: StageNode, name: number): number;
}

/** The player's ten light-group slots, each a group index from 0 through 31. */
export type StageLightGroups = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface StageSceneOptions {
  readonly graph: StageGraph;
  readonly random: StageRandom;
  readonly motions: ReadonlyMap<number, MotionBehavior>;
  readonly nodes: ReadonlyMap<number, NodeBehavior>;
  /** Capacity of the particle pool; it must match the Stage particle renderer. */
  readonly maximumParticles?: number;
  /** Hosts every record below the file root with the generic transform behavior. */
  readonly genericNodes?: boolean;
  /**
   * Skips motions and nodes of unregistered types, and motions whose record uses an unsupported mode,
   * listing them in `missing`, instead of failing.
   */
  readonly skipUnregistered?: boolean;
  /** The model behind a resource ordinal of the scene file. */
  readonly model?: (ordinal: number) => StageModel | null;
  /** The animation container behind a resource ordinal of the scene file. */
  readonly animation?: (ordinal: number) => Uint8Array | null;
  /** Display dimensions used to initialize parallel-camera bounds. */
  readonly viewport?: readonly [number, number];
  /** Native target-scene draw index; generic standalone scenes use index zero. */
  readonly drawIndex?: number;
  /** Named target scene published by the owning player; omitted for the standalone context. */
  readonly targetScene?: string;
  /** States held by record id: a node created with a held record id starts in its state. */
  readonly heldStates?: ReadonlyMap<number, StageHeldState>;
  /** The player's light-group slots; omitted for the default identity mapping. */
  readonly lightGroups?: StageLightGroups;
  /** The name of the player owning a unique environment, or null when no owner is available. */
  readonly uniqueEnvironmentOwner?: string | null;
  /** Shared by scene files constructed and advanced by the same player. */
  readonly traversalClock?: StageTraversalClock;
}

export interface StageTraversalClock {
  constructionPhase: number;
  framePhase: number;
}

export function createStageTraversalClock(): StageTraversalClock {
  return { constructionPhase: 0, framePhase: 0 };
}

/** A state request kept for nodes created later; `match` -1 selects every node of the record id. */
export interface StageHeldState {
  readonly state: number;
  readonly match: number;
}

export interface StageScene {
  readonly graph: StageGraph;
  readonly random: StageRandom;
  readonly top: StageNode;
  readonly root: StageNode;
  tick: number;
  readonly traversalClock: StageTraversalClock;
  /** A failed step can leave partial state; the scene must not be stepped again. */
  failure: string | null;
  /** The scene-wide colour a colour track can publish. */
  globalColor: number;
  /** Types skipped because no evaluator is registered. */
  readonly missing: Set<string>;
  readonly options: StageSceneOptions;
  /** State motion and node classes keep for the whole scene, by class; see {@link sceneState}. */
  readonly classState: Map<string, unknown>;
}

/** The state a motion or node class keeps for the whole scene, created on first use. */
export function sceneState<T>(scene: StageScene, key: string, create: () => T): T {
  let state = scene.classState.get(key) as T | undefined;
  if (state === undefined) scene.classState.set(key, (state = create()));
  return state;
}

function fail(message: string): never {
  throw new RangeError(`Stage scene: ${message}`);
}

const identity = new Float32Array(16);
setIdentity(identity);
const scratch = new Float32Array(16);
const product = new Float32Array(16);

/** Index of the state with id `id`, preferring one entered from the current state; -1 when none matches. */
function findState(node: StageNode, id: number): number {
  const states = node.record!.states;
  const current = node.stateIndex;
  const preferred = (state: StageStateRecord) =>
    state.from === -1 || (current > 0 && state.from === states[current].id);
  if (
    id < states.length &&
    states[id].id === id &&
    (states[id].from === -1 || preferred(states[id]))
  )
    return id;
  let found = -1;
  for (let i = 0; i < states.length; i++)
    if (states[i].id === id) {
      found = i;
      if (preferred(states[i])) break;
    }
  return found;
}

/** The state a request selects: -1 is the default state, -2 the current state's successor. */
export function resolveState(node: StageNode, request: number, missingIsNone: boolean): number {
  const record = node.record;
  if (!record) return 0;
  let id = request;
  if (id === -1) id = record.defaultState;
  if (id === -1) return 0;
  if (id === -2) {
    const next = record.states[node.stateIndex]?.next ?? -1;
    if (next >= 0) {
      const found = record.states.findIndex((s) => s.id === next);
      if (found >= 0) return found;
    }
    id = record.defaultState;
    if (id === -1) return 0;
  }
  let found = findState(node, id);
  if (found === -1 && record.defaultState !== -1) found = findState(node, record.defaultState);
  if (found === -1) return missingIsNone ? -1 : 0;
  return found;
}

function slots(list: readonly StageMotionRecord[] | null): MotionSlot[] {
  return (list ?? []).map((record) => ({
    record,
    instance: null,
    initialized: false,
    finished: false,
    start: 0,
    length: -1,
  }));
}

/** Switches the node to state `index`, rebuilding its motion list; `keepCarry` skips the carried matrix. */
export function setState(node: StageNode, index: number, keepCarry: boolean): void {
  const record = node.record;
  if (!record || index < 0 || index >= record.states.length) return;
  const previous = record.states[node.stateIndex];
  const state = record.states[index];
  node.stateIndex = index;
  if (state.flags & 1 && node.controller) node.controller.stateAge = 0;
  for (const slot of node.stateMotions) if (slot.instance) node.graveyard.push(slot.instance);
  node.stateMotions = slots(state.motions);
  for (const slot of node.stateMotions) prepareSlot(node.scene, node, slot);
  if (keepCarry) return;
  if (state.carry !== 0) {
    if (node.carry) {
      if (previous && previous.flags & 2) node.carry.set(node.local);
      else {
        multiplyAffine(node.carry, node.local, product);
        node.carry.set(product);
      }
    } else node.carry = Float32Array.from(node.local);
    if (state.carry === 1) {
      const t0 = node.carry[12];
      const t1 = node.carry[13];
      const t2 = node.carry[14];
      setIdentity(node.carry);
      node.carry[12] = t0;
      node.carry[13] = t1;
      node.carry[14] = t2;
    }
  } else node.carry = null;
}

/** Creates the slot's motion once the node's state age reaches its start. */
function prepareSlot(scene: StageScene, node: StageNode, slot: MotionSlot): void {
  if (!slot.initialized) {
    slot.initialized = true;
    slot.start = slot.record.start;
    slot.length = slot.record.length;
    if (slot.record.startRange > 0)
      slot.start = randomUpTo(scene.random, slot.record.start, slot.record.startRange);
    if (slot.record.lengthRange > 0)
      slot.length = randomUpTo(scene.random, slot.record.length, slot.record.lengthRange);
  }
  const controller = node.controller;
  if (!controller || slot.start > controller.stateAge) return;
  const behavior = scene.options.motions.get(slot.record.type);
  if (!behavior) {
    if (!scene.options.skipUnregistered) fail(`no evaluator for motion type ${slot.record.type}`);
    scene.missing.add(`motion ${slot.record.type}`);
    slot.finished = true;
    return;
  }
  try {
    slot.instance = behavior.create(scene, node, slot.record);
  } catch (error) {
    skipMotion(node, slot, error);
  }
}

function skipMotion(node: StageNode, slot: MotionSlot, error: unknown): void {
  const scene = node.scene;
  if (!scene.options.skipUnregistered || !(error instanceof RangeError)) throw error;
  scene.missing.add(`motion ${slot.record.type}: ${error.message}`);
  slot.instance?.dispose?.(node);
  slot.instance = null;
  slot.finished = true;
}

function prepareMotions(scene: StageScene, node: StageNode): void {
  for (const list of [node.before, node.stateMotions, node.after])
    for (const slot of list) if (!slot.instance && !slot.finished) prepareSlot(scene, node, slot);
}

function retireMotions(node: StageNode): void {
  const controller = node.controller;
  if (!controller) return;
  for (const list of [node.before, node.stateMotions, node.after])
    for (const slot of list)
      if (
        slot.instance &&
        slot.record.length >= 0 &&
        controller.stateAge >= f(f(slot.length + slot.start) - 1)
      ) {
        slot.instance.dispose?.(node);
        slot.instance = null;
        slot.finished = true;
      }
}

function runList(node: StageNode, list: MotionSlot[], accumulate: boolean): void {
  const transform = stageTransformRequired(node);
  for (const slot of list) {
    if (!slot.instance) continue;
    if (transform) setIdentity(scratch);
    let produced: boolean;
    try {
      produced = slot.instance.update(node, scratch, accumulate);
    } catch (error) {
      skipMotion(node, slot, error);
      continue;
    }
    if (transform && accumulate && produced) {
      multiplyAffine(node.local, scratch, product);
      node.local.set(product);
    }
  }
}

function defer(owner: StageNode, command: PendingCommand): void {
  if (!owner.record) fail("deferred state request on the scene top");
  owner.pending.push(command);
}

function selects(node: StageNode, id: number, match: number): boolean {
  const recordId = node.record!.id;
  if (match === -1) return recordId === id || id === -1;
  return (recordId === id || id === -1) && node.id === match;
}

/** Moves the node to the state `request` selects; deferred while the node runs its motions. */
export function requestState(node: StageNode, request: number): void {
  const index = resolveState(node, request, true);
  if (index < 0) return;
  if (node.flags & NODE_IN_MOTIONS)
    defer(node, { target: null, id: 0, state: request, subtree: false, match: -1 });
  else setState(node, index, false);
}

function searchSiblings(first: StageNode, id: number, state: number, match: number): void {
  const siblings = first.parent ? first.parent.children : [first];
  for (let i = siblings.indexOf(first); i < siblings.length; i++) {
    const node = siblings[i];
    if (node.record && !(node.flags & NODE_KILLED) && selects(node, id, match)) {
      const index = resolveState(node, state, true);
      if (index >= 0) {
        if (node.flags & NODE_IN_MOTIONS)
          defer(first, { target: node, id, state, subtree: false, match: -1 });
        else setState(node, index, false);
      }
    }
    const child = node.children[0];
    if (child && !(child.flags & NODE_KILLED)) searchSiblings(child, id, state, match);
  }
}

function searchSubtree(node: StageNode, id: number, state: number, match: number): void {
  if (node.record && !(node.flags & NODE_KILLED) && selects(node, id, match)) {
    const index = resolveState(node, state, true);
    if (index >= 0) {
      if (node.flags & NODE_IN_MOTIONS)
        defer(node, { target: null, id, state, subtree: true, match: -1 });
      else setState(node, index, false);
    }
  }
  const first = node.children[0];
  if (first && !(first.flags & NODE_KILLED))
    for (const child of node.children) searchSubtree(child, id, state, match);
}

/** Requests `state` on `target`, its following siblings and all their descendants whose record id is `id` (-1: any). */
export function requestTreeState(
  caller: StageNode,
  target: StageNode,
  id: number,
  state: number,
  match: number,
): void {
  if (caller.flags & NODE_IN_MOTIONS) defer(caller, { target, id, state, subtree: false, match });
  else searchSiblings(target, id, state, match);
}

/** Requests `state` on `target` and its descendants whose record id is `id` (-1: any). */
export function requestSubtreeState(
  caller: StageNode,
  target: StageNode,
  id: number,
  state: number,
  match: number,
): void {
  if (caller.flags & NODE_IN_MOTIONS) defer(caller, { target, id, state, subtree: true, match });
  else searchSubtree(target, id, state, -1);
}

function runPending(node: StageNode): void {
  const pending = node.pending;
  node.pending = [];
  for (const command of pending) {
    if (!command.target) requestState(node, command.state);
    else if (command.subtree)
      requestSubtreeState(node, command.target, command.id, command.state, command.match);
    else requestTreeState(node, command.target, command.id, command.state, command.match);
  }
}

/** Runs the node's motion lists: the node's own lists around its state list, whose transforms accumulate into the local matrix. */
export function applyMotions(node: StageNode): void {
  node.flags |= NODE_IN_MOTIONS;
  runList(node, node.before, false);
  node.flags &= ~NODE_IN_MOTIONS;
  runPending(node);
  node.flags |= NODE_IN_MOTIONS;
  if (node.stateMotions.length) {
    node.local.set(identity);
    runList(node, node.stateMotions, true);
  }
  runList(node, node.after, false);
  node.flags &= ~NODE_IN_MOTIONS;
  runPending(node);
}

/** The world matrix from the coordinate parent, then the offset and carried matrices. */
export function computeWorld(node: StageNode): void {
  const world = node.world;
  if (node.flags & NODE_FIXED_WORLD) {
    if (node.fixedWorld) world.set(node.fixedWorld);
    return;
  }
  world.set(identity);
  const record = node.record;
  const parent = node.coordinateParent;
  if (!record) {
    if (parent) world.set(parent.world);
  } else {
    if (node.coordinateMode === 0) {
      if (parent) world.set(parent.world);
    } else if (node.coordinateMode === 2 && parent) {
      world.set(parent.world);
      const name = node.scene.graph.pointer(record.offset + 0x20);
      behaviorOf(node.scene, parent)?.joint?.(parent, world, record.jointIndex, name ?? -1);
    }
    if (node.coordinateMode !== 1 && parent && node.translationOnly === 1) {
      const t0 = world[12];
      const t1 = world[13];
      const t2 = world[14];
      world.set(identity);
      world[12] = t0;
      world[13] = t1;
      world[14] = t2;
    }
  }
  if (node.offset) {
    multiplyAffine(world, node.offset, product);
    world.set(product);
  }
  if (node.carry) {
    multiplyAffine(world, node.carry, product);
    world.set(product);
  }
}

function defaultUpdate(node: StageNode): void {
  computeWorld(node);
  applyMotions(node);
}

function behaviorOf(scene: StageScene, node: StageNode): NodeBehavior | undefined {
  if (!node.record) return undefined;
  if (scene.options.genericNodes && node !== scene.root) return undefined;
  return scene.options.nodes.get(node.record.type);
}

// ---- controllers ----------------------------------------------------------

/** A value drawn from `base` up to `limit`, rounded down. */
function randomUpTo(random: StageRandom, base: number, limit: number): number {
  return floorF32(random.floatRange(base, f(limit + 1)));
}

function nextEmission(scene: StageScene, controller: Controller, entry: ScheduleEntry): number {
  const graph = scene.graph;
  const interval = graph.f32(entry.parameters + 40);
  if (interval < 0) return -1;
  const limit = graph.f32(entry.parameters + 44);
  const value =
    limit <= 0
      ? f(interval + controller.age)
      : floorF32(f(scene.random.floatRange(interval, f(limit + 1)) + controller.age));
  if (!(entry.flags & 1) && graph.f32(entry.parameters + 8) > 0) return f(entry.start + interval);
  return value;
}

function createSchedule(
  scene: StageScene,
  controller: Controller,
  record: StageNodeRecord,
  stateRequest: number,
  id: number,
): void {
  const graph = scene.graph;
  for (const child of record.children) {
    if (!(child.flags & 1)) continue;
    const parameters = child.controller.parameters;
    const entry: ScheduleEntry = {
      child,
      parameters,
      id,
      stateRequest,
      age: 0,
      flags: 0,
      start: graph.f32(parameters + 8),
      end: -1,
      batch: 1,
      repeat: 1,
      next: -1,
      remaining: -1,
      interval: -1,
      spawned: 0,
      createdAtPass: controller.passes,
    };
    if (graph.f32(parameters + 12) > 0)
      entry.start = randomUpTo(scene.random, entry.start, graph.f32(parameters + 12));
    entry.start = f(controller.age + entry.start);
    const end = graph.f32(parameters + 24);
    if (end > 0) {
      let value = end;
      if (graph.f32(parameters + 28) > 0)
        value = randomUpTo(scene.random, end, graph.f32(parameters + 28));
      value = f(value - entry.start);
      if (value < 0) entry.flags |= 2;
      entry.end = f(value + controller.age);
    }
    entry.next = nextEmission(scene, controller, entry);
    const emissions = graph.i32(parameters + 52);
    if (emissions > 0) {
      const high = graph.i32(parameters + 56);
      entry.remaining = high > emissions ? scene.random.intRange(emissions, high) : emissions;
    }
    const span = graph.f32(parameters + 60);
    if (span > 0) {
      const limit = graph.f32(parameters + 64);
      entry.interval = limit > 0 ? randomUpTo(scene.random, span, limit) : span;
    }
    controller.schedule.push(entry);
  }
}

/** How many batches the entry spawns this step; zero while it waits. */
function due(scene: StageScene, controller: Controller, entry: ScheduleEntry): number {
  const graph = scene.graph;
  if (entry.flags & 2) return 0;
  const age = controller.age;
  if (entry.start > age) {
    controller.flags |= 1;
    return 0;
  }
  if (entry.end > 0 && entry.age > entry.end) return 0;
  let pending: boolean;
  if (entry.remaining === -1 && entry.interval < 0) pending = entry.next >= 0;
  else if (entry.interval >= 0) pending = !(entry.interval <= entry.age);
  else pending = entry.remaining >= 1 && !(entry.next <= 0);
  if (pending) controller.flags |= 1;
  let batches = 1;
  if (entry.flags & 1) {
    if (entry.next < 0 || age <= entry.next) return 0;
    if (entry.interval > 0 && entry.age > entry.interval) return 0;
    if (entry.remaining !== -1 && entry.remaining <= 0) return 0;
    const interval = graph.f32(entry.parameters + 40);
    batches = interval > 0 ? Math.trunc(f(f(age - entry.next) / interval)) >>> 0 : 0;
    if (batches === 0) batches = 1;
    if (entry.remaining > 0) {
      if (batches > entry.remaining) batches = entry.remaining;
      entry.remaining -= batches;
    }
    if (entry.remaining > 0) controller.flags |= 1;
    entry.next = nextEmission(scene, controller, entry);
    if (entry.flags & 4) return 0;
  } else {
    entry.flags |= 1;
    if (entry.remaining > 0) {
      entry.remaining -= 1;
      if (entry.remaining > 0) controller.flags |= 1;
    }
    if (graph.u32(entry.parameters + 4) & 0x10) return batches;
  }
  if (graph.u32(entry.parameters + 48) < scene.random.intBelow(99)) return 0;
  return batches;
}

function spawn(scene: StageScene, parent: StageNode, entry: ScheduleEntry, batches: number): void {
  const graph = scene.graph;
  for (let b = 0; b < batches; b++) {
    let count = 1;
    const low = graph.i32(entry.parameters + 32);
    if (low > 0) {
      count = low;
      const high = graph.i32(entry.parameters + 36);
      if (high > low) count = scene.random.intRange(low, high);
    }
    if (entry.batch > 1) count *= entry.batch;
    for (let i = 0; i < count; i++) {
      createNode(scene, parent, entry.child, {
        id: entry.id,
        count,
        ordinal: i,
        birth: entry.age,
        end: entry.end,
        spawnIndex: entry.spawned,
        stateRequest: entry.stateRequest,
      });
      entry.spawned++;
    }
  }
}

function controllerPre(scene: StageScene, node: StageNode): void {
  const controller = node.controller!;
  controller.passes++;
  if (controller.flags & 2) return;
  controller.flags &= ~1;
  if (controller.flags & 4) {
    controller.flags &= ~4;
    return;
  }
  for (const entry of controller.schedule) {
    const batches = due(scene, controller, entry);
    if (batches === 0) continue;
    if (entry.flags & 8) entry.flags &= ~8;
    else spawn(scene, node, entry, batches);
  }
}

function controllerAge(node: StageNode): void {
  const controller = node.controller!;
  if (!(controller.flags & 2)) {
    controller.age = f(controller.age + node.delta);
    controller.stateAge = f(node.delta + controller.stateAge);
    for (const entry of controller.schedule)
      if (entry.flags & 1) entry.age = f(node.delta + entry.age);
  }
  if (controller.type === 2 && controllerExpired(node)) node.flags |= NODE_KILLED;
}

function controllerExpired(node: StageNode): boolean {
  const controller = node.controller!;
  const graph = node.scene.graph;
  const parameters = controller.parameters;
  const end = graph.f32(parameters + 24);
  if (
    controller.flags & 2 ||
    (graph.f32(parameters + 16) >= 0 && controller.age >= controller.life) ||
    (end >= 0 && f(node.birth + controller.age) >= node.end)
  ) {
    controller.flags |= 2;
    node.flags |= NODE_DEAD;
    return !(node.record!.flags & 0x40) || node.children.length === 0;
  }
  return false;
}

// ---- construction ---------------------------------------------------------

interface Creation {
  readonly id: number;
  readonly count: number;
  readonly ordinal: number;
  readonly birth: number;
  readonly end: number;
  readonly spawnIndex: number;
  readonly stateRequest: number;
}

function createController(
  scene: StageScene,
  node: StageNode,
  record: StageNodeRecord,
  creation: Creation,
): Controller {
  const graph = scene.graph;
  const type = record.controller.type;
  if (type !== 2 && type !== 4) fail(`controller type ${type}`);
  const parameters = record.controller.parameters;
  const controller: Controller = {
    type,
    parameters,
    age: 0,
    stateAge: 0,
    flags: 1,
    passes: 0,
    life: -1,
    schedule: [],
    killWhenChildrenDone: type === 4 && graph.u32(parameters + 8) === 2,
  };
  if (type === 2) {
    const life = graph.f32(parameters + 16);
    if (life > 0) {
      controller.life = life;
      const range = graph.f32(parameters + 20);
      if (range > 0) controller.life = randomUpTo(scene.random, life, range);
    }
    if (graph.u32(parameters + 84) !== 0) fail("controller sound cue");
  }
  (node as { controller: Controller }).controller = controller;
  createSchedule(scene, controller, record, creation.stateRequest, creation.id);
  return controller;
}

function createNode(
  scene: StageScene,
  parent: StageNode | null,
  record: StageNodeRecord | null,
  creation: Creation,
  constructed = true,
): StageNode {
  const clock = scene.traversalClock;
  clock.constructionPhase ^= 1;
  const node: StageNode = {
    scene,
    record,
    parent,
    coordinateParent: parent,
    coordinateMode: record ? record.coordinateMode : 0,
    translationOnly: record ? record.translationOnly : 0,
    children: [],
    id: creation.id,
    ordinal: creation.ordinal,
    count: creation.count,
    spawnIndex: creation.spawnIndex,
    birth: creation.birth,
    end: creation.end,
    stateIndex: 0,
    flags: NODE_INITIAL_FLAGS,
    delta: 1,
    halfRatePhase: clock.constructionPhase,
    world: Float32Array.from(identity),
    local: Float32Array.from(identity),
    carry: null,
    offset: null,
    fixedWorld: null,
    controller: null,
    before: [],
    stateMotions: [],
    after: [],
    pending: [],
    graveyard: [],
    elements: [],
    translucent: false,
    extension: undefined,
  };
  if (record) {
    const held = scene.options.heldStates?.get(record.id);
    const request =
      held && (held.match === -1 || held.match === creation.id)
        ? held.state
        : creation.stateRequest;
    node.stateIndex = resolveState(node, request, false);
  }
  if (parent) {
    parent.children.push(node);
    parent.flags |= NODE_HAS_CHILDREN;
  }
  if (record && record.flags & 8) node.flags |= NODE_VISIBLE;
  if (record) createController(scene, node, record, creation);
  if (record && constructed) {
    node.elements = createElements(node);
    setState(node, node.stateIndex, true);
    node.before = slots(record.before);
    for (const slot of node.before) prepareSlot(scene, node, slot);
    node.after = slots(record.after);
    for (const slot of node.after) prepareSlot(scene, node, slot);
  }
  const behavior = behaviorOf(scene, node);
  if (record && !behavior && !scene.options.genericNodes && node !== scene.root)
    scene.missing.add(`node ${record.type}`);
  if (behavior?.construct) behavior.construct(node);
  else node.flags |= NODE_VISIBLE;
  return node;
}

/** Builds the scene of a graph: a top node, then the file's root beneath it. */
export function createStageScene(options: StageSceneOptions): StageScene {
  if (
    options.lightGroups &&
    (options.lightGroups.length !== 10 ||
      options.lightGroups.some((group) => !Number.isInteger(group) || group < 0 || group > 31))
  )
    fail("invalid player light-group slots");
  const scene = {
    graph: options.graph,
    random: options.random,
    tick: 0,
    traversalClock: options.traversalClock ?? createStageTraversalClock(),
    failure: null,
    globalColor: 0,
    missing: new Set<string>(),
    options,
    classState: new Map<string, unknown>(),
  } as StageScene & { top: StageNode; root: StageNode };
  const creation: Creation = {
    id: -1,
    count: 1,
    ordinal: 0,
    birth: -1,
    end: -1,
    spawnIndex: 0,
    stateRequest: -1,
  };
  scene.top = createNode(scene, null, null, creation);
  scene.root = createNode(scene, scene.top, options.graph.root, creation, false);
  return scene;
}

// ---- passes ---------------------------------------------------------------

function prePass(scene: StageScene, node: StageNode): void {
  if (!(node.flags & NODE_KILLED)) prepareMotions(scene, node);
  if (!(node.flags & 0xd)) {
    if (node.controller) controllerPre(scene, node);
    if (!(node.flags & 0x80)) node.flags |= NODE_PREPARED;
    for (let i = 0; i < node.children.length; i++) prePass(scene, node.children[i]);
  }
}

function updatePass(
  scene: StageScene,
  node: StageNode,
  parent: StageNode | null,
  leaves?: ReadonlySet<StageNodeRecord>,
): void {
  if (node.flags & 0x15) return;
  if (parent) {
    node.delta = parent.delta;
    if (node.flags & NODE_UPDATED && node.record && node.record.flags & RECORD_HALF_RATE) {
      node.delta = f(parent.delta + parent.delta);
      if (scene.traversalClock.framePhase === node.halfRatePhase) return;
    }
  }
  if (node.flags & 0x200100) {
    for (const child of node.children) updatePass(scene, child, node, leaves);
    return;
  }
  const behavior = behaviorOf(scene, node);
  if (
    node.record &&
    leaves?.has(node.record) &&
    node.flags & NODE_UPDATED &&
    !(node.flags & (NODE_COORDINATE_TARGET | NODE_FIXED_WORLD))
  )
    deferredTransform = node;
  try {
    if (behavior?.update) behavior.update(node);
    else defaultUpdate(node);
  } finally {
    deferredTransform = null;
  }
  node.flags |= NODE_UPDATED;
  for (let i = 0; i < node.children.length; i++) updatePass(scene, node.children[i], node, leaves);
  behavior?.afterChildren?.(node);
  if (!(node.flags & 0x200300)) behavior?.post?.(node);
}

let deferredTransform: StageNode | null = null;

/** False only for independent leaf instances during undisplayed seek steps. */
export function stageTransformRequired(node: StageNode): boolean {
  return deferredTransform !== node;
}

const seekLeaves = new WeakMap<StageGraph, ReadonlySet<StageNodeRecord>>();
/** Leaf transforms can be deferred only when no graph consumer reads them and each motion can restore its output from its clock. */
function independentSeekLeaves(graph: StageGraph): ReadonlySet<StageNodeRecord> {
  const cached = seekLeaves.get(graph);
  if (cached) return cached;
  const eligible = new Set<StageNodeRecord>();
  seekLeaves.set(graph, eligible);
  for (const record of graph.nodes) {
    if (
      ![
        2, 3, 6000001, 6001001, 6001010, 6001011, 6001012, 6001100, 6001101, 6001102, 6001104,
        6001106, 6001109, 6001203, 6001205,
      ].includes(record.type)
    )
      return eligible;
    if (record.elements.some((element) => element.type === 1001)) return eligible;
    for (const motion of [
      ...(record.before ?? []),
      ...(record.after ?? []),
      ...record.states.flatMap((state) => state.motions),
    ]) {
      if (![100, 106, 250, 300, 403, 751].includes(motion.type)) return eligible;
      if (motion.data === null) return eligible;
      if (motion.type === 106 && graph.i32(motion.data + 4) > 0) {
        const head = graph.target(motion.data);
        for (let i = 0; i < graph.i32(motion.data + 4); i++)
          if (graph.u32(head + i * 92 + 0x40)) return eligible;
      }
      if (motion.type === 250 && graph.i32(motion.data) > 0) {
        const head = graph.target(motion.data + 4);
        for (let i = 0; i < graph.i32(motion.data); i++)
          if (graph.i32(head + i * 20) === 0 && graph.i32(head + i * 20 + 4) === -1)
            return eligible;
      }
    }
  }
  for (const record of graph.nodes)
    if (
      record.type === 6001010 &&
      record.id === -1 &&
      !(record.flags & RECORD_HALF_RATE) &&
      !record.children.length &&
      record.states.every(
        (state) => state.carry === 0 && state.motions.some((motion) => motion.type === 106),
      ) &&
      record.elements.every((element) => {
        if (element.type !== 400 && element.type !== 402) return true;
        return graph.u32(element.offset + 12) === 0;
      }) &&
      [
        ...(record.before ?? []),
        ...(record.after ?? []),
        ...record.states.flatMap((state) => state.motions),
      ].every((motion) => {
        if (
          (motion.type === 100 || motion.type === 106) &&
          (motion.start !== 0 ||
            motion.startRange > 0 ||
            motion.length >= 0 ||
            motion.lengthRange > 0)
        )
          return false;
        if (motion.type === 100) {
          const data = motion.data!;
          const head = graph.target(data + 8);
          if (motion.ordinal >= 0 || graph.u32(data) !== 0) return false;
          for (let i = 0; i < graph.u32(data + 4); i++) {
            const at = head + i * 116;
            if (
              ![0, 1, 4].includes(graph.u32(at)) ||
              graph.u32(at + 4) > 2 ||
              (graph.u32(at + 4) === 0 && graph.u32(at + 8) > 2) ||
              graph.u32(at + 12) === 3 ||
              graph.f32(at + 24) !== 0 ||
              graph.f32(at + 28) >= 0
            )
              return false;
          }
          return true;
        }
        if (motion.type === 106) {
          const data = motion.data!;
          if (graph.u32(data + 12) !== 0 || graph.i32(data + 8) >= 0 || graph.f32(data + 36) >= 0)
            return false;
          if (graph.i32(data + 4) === 0) return true;
          const head = graph.target(data);
          for (let i = 0; i < graph.i32(data + 4); i++)
            if (graph.u32(head + i * 92 + 36) !== 2 || graph.u32(head + i * 92 + 40) !== 0)
              return false;
          return true;
        }
        return motion.type === 300 || motion.type === 751;
      })
    )
      eligible.add(record);
  return eligible;
}

function drawPass(scene: StageScene, node: StageNode): void {
  if (
    node.flags & NODE_UPDATED &&
    node.record &&
    node.record.flags & RECORD_HALF_RATE &&
    scene.traversalClock.framePhase === node.halfRatePhase
  )
    return;
  if (!(node.flags & NODE_KILLED)) retireMotions(node);
  if (node.flags & 0x45) return;
  if (node.controller) controllerAge(node);
  if (!(node.flags & 0x1000)) behaviorOf(scene, node)?.prepare?.(node);
  for (let i = 0; i < node.children.length; i++) drawPass(scene, node.children[i]);
}

function releaseCoordinateTarget(target: StageNode): void {
  let root = target;
  while (root.parent) root = root.parent;
  const visit = (node: StageNode) => {
    if (node.coordinateParent === target) node.coordinateParent = node.parent;
    for (const child of node.children) visit(child);
  };
  visit(root);
}

function retireSubtree(node: StageNode): void {
  if (node.flags & NODE_COORDINATE_TARGET) releaseCoordinateTarget(node);
  behaviorOf(node.scene, node)?.dispose?.(node);
  for (const list of [node.before, node.stateMotions, node.after])
    for (const slot of list) slot.instance?.dispose?.(node);
  for (const motion of node.graveyard) motion.dispose?.(node);
  for (const element of node.elements) element?.dispose?.();
  for (const child of node.children) retireSubtree(child);
}

function retirePass(node: StageNode): void {
  if (node.graveyard.length) {
    const dead = node.graveyard;
    node.graveyard = [];
    for (const motion of dead) motion.dispose?.(node);
  }
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i];
    if (child.flags & NODE_KILLED) {
      retireSubtree(child);
      node.children.splice(i, 1);
    } else retirePass(child);
  }
}

/** Advances synchronized scenes. Seek deferral requires the built-in behaviors and two full steps before drawing or saving a checkpoint. A failed step invalidates the group. */
export function stepStageScenes(scenes: readonly StageScene[], delta = 1, seek = false): void {
  for (const scene of scenes)
    if (scene.failure !== null) throw new Error(`Stage scene: failed step: ${scene.failure}`);
  try {
    for (const scene of scenes) runCollisionQueries(scene);
    for (const scene of scenes) {
      if (scene.tick !== 0) drawPass(scene, scene.top);
      retirePass(scene.top);
    }
    for (const clock of new Set(scenes.map((scene) => scene.traversalClock))) clock.framePhase ^= 1;
    for (const scene of scenes) {
      scene.top.delta = delta;
      prePass(scene, scene.top);
      updatePass(
        scene,
        scene.top,
        null,
        seek && scene.graph && !scene.options.genericNodes
          ? independentSeekLeaves(scene.graph)
          : undefined,
      );
    }
    for (const scene of scenes) scene.tick++;
  } catch (error) {
    for (const scene of scenes)
      scene.failure = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

/** Advances one independent scene by `delta` stage frames. */
export function stepStageScene(scene: StageScene, delta = 1): void {
  stepStageScenes([scene], delta);
}

/** Completes scene-wide work after the synchronized update and draw-prepare passes. */
export function finishStageScenes(scenes: readonly StageScene[]): void {
  for (const scene of scenes)
    for (const behavior of scene.options.nodes.values()) behavior.finishStep?.(scene);
}

/** Own visibility requires an update; stopped ancestors suppress all descendant draws. */
export function stageNodeDrawable(node: StageNode): boolean {
  if ((node.flags & 0xc00425) !== 0 || (node.flags & NODE_UPDATED) === 0) return false;
  for (let parent = node.parent; parent; parent = parent.parent)
    if (parent.flags & 0x25) return false;
  return true;
}

/** Live nodes in depth-first order, the file root first. */
export function liveNodes(scene: StageScene): StageNode[] {
  const out: StageNode[] = [];
  const visit = (node: StageNode) => {
    out.push(node);
    for (const child of node.children) visit(child);
  };
  visit(scene.root);
  return out;
}
