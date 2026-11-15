import type { DeviceStateSet } from "../gpu/deviceState";
import type { EffectFrame } from "./render";
import type { EffectResource } from "./afb";
import {
  advanceAnimation,
  createAnimation,
  type AnimationState,
  type EffectStreams,
} from "./eval/animation";
export type { EffectStreams } from "./eval/animation";
export type { EffectCamera } from "../math/matrix";
import {
  createDrawPrograms,
  type EffectDrawPrograms,
  type ParticleDraw,
  type ParticleDrawState,
  type PrimitiveDraw,
  type TextureBinding,
} from "./eval/draw";
import {
  inverseAffine,
  multiplyAffine,
  requestMatrix,
  setIdentity,
  type EffectCamera,
  type Matrix,
} from "../math/matrix";
import {
  advanceParticle,
  createParticleState,
  particleDrawRange,
  particleFrameParameters,
  particleRingIndex,
  readParticleProgram,
  DEFAULT_MAXIMUM_PARTICLES,
  PARTICLE_PARAMETER_COUNT,
  type ParticleProgram,
  type ParticleRange,
  type ParticleState,
} from "./eval/particle";
import { advanceEffectRandom } from "./eval/random";
import {
  readEffectProgram,
  type AnimationProgram,
  type DisplayProgram,
  type EffectProgram,
  type NodeProgram,
} from "./eval/program";

const f = Math.fround;

const KILLED = 1;
const UPDATED = 2;
const PENDING_CHILDREN = 4;
const COMMAND_EMITTED = 8;
const HAS_VERTICES = 16;

/** Settings of one effect resource's player. */
export interface EffectPlayerOptions {
  /** The layer the player publishes for ordering; null orders nodes by their authored layers. */
  layerParameter?: number | null;
  /** Capacity of the particle rings the draws index into. */
  maximumParticles?: number;
  /** Bit mask of the scene the effects draw in. */
  sceneMask?: number;
}

/** A resource's static programs and its player settings; shared by every instance of the resource. */
export interface EffectPlayer {
  readonly resource: EffectResource;
  readonly program: EffectProgram;
  readonly draws: EffectDrawPrograms;
  readonly layerParameter: number | null;
  readonly maximumParticles: number;
  readonly sceneMask: number;
  particleProgram(node: NodeProgram): ParticleProgram;
}

export function createEffectPlayer(
  resource: EffectResource,
  options: EffectPlayerOptions = {},
): EffectPlayer {
  const program = readEffectProgram(resource);
  const particles = new Map<number, ParticleProgram>();
  return {
    resource,
    program,
    draws: createDrawPrograms(program),
    layerParameter: options.layerParameter ?? null,
    maximumParticles: options.maximumParticles ?? DEFAULT_MAXIMUM_PARTICLES,
    sceneMask: options.sceneMask ?? 1,
    particleProgram(node) {
      let value = particles.get(node.offset);
      if (!value) {
        const settings = resource.nodes.find((n) => n.offset === node.offset)!.settings!;
        value = readParticleProgram(resource, settings);
        particles.set(node.offset, value);
      }
      return value;
    },
  };
}

/** What an instance is created from. */
export interface EffectCreation {
  instanceId: number;
  displayState: number;
  animation: number;
  position: readonly [number, number, number];
  scale: readonly [number, number, number];
  mirror: boolean;
}

/** The static draw fields a primitive packet needs. */
export type PrimitiveDrawShape = Pick<
  PrimitiveDraw,
  "material" | "layout" | "strip" | "vertexCount" | "sortDistanceOffset"
>;

/** A parallel light's shader direction and diffuse colour. */
export interface SimpleParallelLight {
  readonly direction: readonly number[];
  readonly diffuse: readonly number[];
}

/** One drawn primitive or geometry, valid only during the sink call that receives it. */
export interface PrimitivePacket {
  frame?: EffectFrame;
  shadow?: boolean;
  instanceId: number;
  interpolationKey?: string;
  resourceId: number;
  draw: PrimitiveDraw;
  /** The node matrix transposed: element `column * 4 + row` is matrix element `row * 4 + column`. */
  worldMatrix: Float32Array;
  /** Sort position when it differs from the geometry's world-matrix translation. */
  sortPosition?: ArrayLike<number>;
  vertices: Float32Array;
  /** Lights used by a normal-bearing primitive, in publication order. */
  normalLights?: readonly SimpleParallelLight[];
  /** X and Y texture offsets of the first three texture units. */
  textureOffsets: Float32Array;
  /** Second texture coordinate set (twelve floats) of a two-texture primitive. */
  secondaryUv: Float32Array;
  /** The selected texture reference of each unit. */
  bindings: TextureBinding[];
  bindingCount: number;
  /** Device state overriding the class of the draw's material. */
  state?: DeviceStateSet;
  layer: number;
  priority: number;
  orderKey: number;
}

/** One drawn particle ring slice, valid only during the sink call that receives it. */
export interface ParticlePacket<D extends ParticleDrawState = ParticleDraw> {
  frame?: EffectFrame;
  shadow?: boolean;
  instanceId: number;
  interpolationKey?: string;
  resourceId: number;
  draw: D;
  /** Device state overriding the effect class of the draw's source flags. */
  state?: DeviceStateSet;
  worldMatrix: Float32Array;
  parameters: Float32Array;
  /** Birth transforms in native draw-ring order, or null for particles following the emitter. */
  births: Float32Array | null;
  /** The ring the slice is drawn from: box shapes first, then small rings, then reversed rings. */
  ringIndex: number;
  /** First particle and particle count of the slice. */
  start: number;
  count: number;
  layer: number;
  priority: number;
  orderKey: number;
}

export interface EffectDrawSink {
  primitive(packet: PrimitivePacket): void;
  particle(packet: ParticlePacket): void;
}

/** A live effect instance: its node tree in flat arrays, and its external controls. */
export interface EffectInstance {
  readonly player: EffectPlayer;
  readonly instanceId: number;
  readonly animation: number;
  /** True until the first build creates the root node. */
  pending: boolean;
  /** A hidden tree neither builds, animates, draws nor ages. */
  treeHidden: boolean;
  /** The transform from the player's root to the effect, replaced by a position update. */
  readonly boundMatrix: Float32Array;
  readonly rootMatrix: Float32Array;
  display: DisplayProgram;
  requestedDisplayState: number;
  root: number;
  // node pool
  capacity: number;
  nodeCount: number;
  freeHead: number;
  programs: (NodeProgram | null)[];
  animationPrograms: (AnimationProgram | null)[];
  animations: (AnimationState | null)[];
  particlePrograms: (ParticleProgram | null)[];
  particleStates: (ParticleState | null)[];
  matrices: Float32Array[];
  vertices: (Float32Array | null)[];
  ages: Float64Array;
  colors: Uint32Array;
  flags: Uint8Array;
  ordinals: Int32Array;
  parents: Int32Array;
  firstChild: Int32Array;
  lastChild: Int32Array;
  nextSibling: Int32Array;
  scheduleStride: number;
  scheduleStarted: Uint8Array;
  scheduleRemaining: Int32Array;
  scheduleNextTime: Float64Array;
  scheduleOrdinal: Int32Array;
  stack: Int32Array;
  matrixStack: Float32Array;
  primitive: PrimitivePacket;
  particle: ParticlePacket;
  range: ParticleRange;
  order: { layer: number; priority: number; key: number };
}

const IDENTITY = new Float32Array(16);
setIdentity(IDENTITY);
const inverted = new Float64Array(16);
const request = new Float64Array(16);

/**
 * Creates an instance from its request. The bound matrix is the request's transform seen from the
 * player's root, which is the identity unless `rootMatrix` says otherwise.
 */
export function createEffectInstance(
  player: EffectPlayer,
  creation: EffectCreation,
  rootMatrix: Matrix = IDENTITY,
): EffectInstance {
  const bound = new Float32Array(16);
  inverseAffine(rootMatrix, inverted);
  requestMatrix(creation.position, creation.scale, creation.mirror, request);
  multiplyAffine(inverted, request, bound);
  const capacity = 16;
  const stride = Math.max(player.program.maxSchedules, 1);
  const instance: EffectInstance = {
    player,
    instanceId: creation.instanceId,
    animation: creation.animation,
    pending: true,
    treeHidden: false,
    boundMatrix: bound,
    rootMatrix: new Float32Array(16),
    display: player.program.display(creation.animation, creation.displayState),
    requestedDisplayState: creation.displayState,
    root: -1,
    capacity: 0,
    nodeCount: 0,
    freeHead: -1,
    programs: [],
    animationPrograms: [],
    animations: [],
    particlePrograms: [],
    particleStates: [],
    matrices: [],
    vertices: [],
    ages: new Float64Array(0),
    colors: new Uint32Array(0),
    flags: new Uint8Array(0),
    ordinals: new Int32Array(0),
    parents: new Int32Array(0),
    firstChild: new Int32Array(0),
    lastChild: new Int32Array(0),
    nextSibling: new Int32Array(0),
    scheduleStride: stride,
    scheduleStarted: new Uint8Array(0),
    scheduleRemaining: new Int32Array(0),
    scheduleNextTime: new Float64Array(0),
    scheduleOrdinal: new Int32Array(0),
    stack: new Int32Array(0),
    matrixStack: new Float32Array(0),
    primitive: {
      instanceId: creation.instanceId,
      resourceId: player.resource.id,
      draw: undefined as unknown as PrimitiveDraw,
      worldMatrix: new Float32Array(16),
      vertices: new Float32Array(0),
      textureOffsets: new Float32Array(6),
      secondaryUv: new Float32Array(12),
      bindings: [],
      bindingCount: 0,
      layer: 0,
      priority: 0,
      orderKey: 0,
    },
    particle: {
      instanceId: creation.instanceId,
      resourceId: player.resource.id,
      draw: undefined as unknown as ParticleDraw,
      worldMatrix: new Float32Array(16),
      parameters: new Float32Array(PARTICLE_PARAMETER_COUNT),
      births: null,
      ringIndex: 0,
      start: 0,
      count: 0,
      layer: 0,
      priority: 0,
      orderKey: 0,
    },
    range: { small: false, start: 0, count: 0, shaderTime: 0 },
    order: { layer: 0, priority: 0, key: 0 },
  };
  grow(instance, capacity);
  return instance;
}

function grow(inst: EffectInstance, capacity: number): void {
  const old = inst.capacity;
  const widen = <T extends Float64Array | Int32Array | Uint8Array | Uint32Array>(
    array: T,
    size: number,
    fill?: number,
  ): T => {
    const next = new (array.constructor as new (n: number) => T)(size);
    next.set(array);
    if (fill !== undefined) next.fill(fill, array.length);
    return next;
  };
  inst.ages = widen(inst.ages, capacity);
  inst.colors = widen(inst.colors, capacity);
  inst.flags = widen(inst.flags, capacity);
  inst.ordinals = widen(inst.ordinals, capacity);
  inst.parents = widen(inst.parents, capacity, -1);
  inst.firstChild = widen(inst.firstChild, capacity, -1);
  inst.lastChild = widen(inst.lastChild, capacity, -1);
  inst.nextSibling = widen(inst.nextSibling, capacity, -1);
  inst.scheduleStarted = widen(inst.scheduleStarted, capacity * inst.scheduleStride);
  inst.scheduleRemaining = widen(inst.scheduleRemaining, capacity * inst.scheduleStride);
  inst.scheduleNextTime = widen(inst.scheduleNextTime, capacity * inst.scheduleStride);
  inst.scheduleOrdinal = widen(inst.scheduleOrdinal, capacity * inst.scheduleStride);
  inst.stack = widen(inst.stack, capacity * 2);
  inst.matrixStack = (() => {
    const next = new Float32Array(capacity * 16);
    next.set(inst.matrixStack);
    return next;
  })();
  for (let i = old; i < capacity; i++) {
    inst.programs.push(null);
    inst.animationPrograms.push(null);
    inst.animations.push(null);
    inst.particlePrograms.push(null);
    inst.particleStates.push(null);
    inst.matrices.push(new Float32Array(16));
    inst.vertices.push(null);
  }
  inst.capacity = capacity;
}

function allocate(inst: EffectInstance): number {
  let slot: number;
  if (inst.freeHead >= 0) {
    slot = inst.freeHead;
    inst.freeHead = inst.nextSibling[slot];
  } else {
    if (inst.nodeCount === inst.capacity) grow(inst, inst.capacity * 2);
    slot = inst.nodeCount++;
  }
  inst.parents[slot] = -1;
  inst.firstChild[slot] = -1;
  inst.lastChild[slot] = -1;
  inst.nextSibling[slot] = -1;
  return slot;
}

function release(inst: EffectInstance, slot: number): void {
  inst.programs[slot] = null;
  inst.animationPrograms[slot] = null;
  inst.animations[slot] = null;
  inst.particlePrograms[slot] = null;
  inst.particleStates[slot] = null;
  inst.nextSibling[slot] = inst.freeHead;
  inst.freeHead = slot;
}

function createNode(
  inst: EffectInstance,
  streams: EffectStreams,
  definition: NodeProgram,
  delta: number,
  ordinal: number,
): number {
  const player = inst.player;
  const slot = allocate(inst);
  inst.programs[slot] = definition;
  inst.ordinals[slot] = ordinal;
  inst.ages[slot] = 0;
  inst.flags[slot] = definition.autoChildren.length > 0 ? PENDING_CHILDREN : 0;
  inst.colors[slot] = definition.hasColor ? definition.color : 0;
  setIdentity(inst.matrices[slot]);
  if (definition.animated) {
    const animation = player.program.animation(definition);
    inst.animationPrograms[slot] = animation;
    inst.animations[slot] = createAnimation(animation, streams, delta);
    if (definition.type === 100 || definition.type === 204) {
      const size = definition.type === 100 ? 36 : animation.geometry!.count * 6;
      const existing = inst.vertices[slot];
      if (!existing || existing.length !== size) inst.vertices[slot] = new Float32Array(size);
    }
  }
  if (definition.type === 6001008) {
    const program = player.particleProgram(definition);
    const [state, crt] = createParticleState(program, streams.crt, player.maximumParticles);
    streams.crt = crt;
    inst.particlePrograms[slot] = program;
    inst.particleStates[slot] = state;
  }
  const stride = inst.scheduleStride;
  const auto = definition.autoChildren;
  for (let i = 0; i < auto.length; i++) {
    const at = slot * stride + i;
    inst.scheduleStarted[at] = 0;
    inst.scheduleRemaining[at] = auto[i].emissions;
    inst.scheduleNextTime[at] = 0;
    inst.scheduleOrdinal[at] = 0;
  }
  return slot;
}

function appendChild(inst: EffectInstance, parent: number, child: number): void {
  inst.parents[child] = parent;
  const last = inst.lastChild[parent];
  if (last < 0) inst.firstChild[parent] = child;
  else inst.nextSibling[last] = child;
  inst.lastChild[parent] = child;
}

/** Pushes the children of `n` so the first child pops first; returns the new stack top. */
function pushChildren(inst: EffectInstance, n: number, top: number): number {
  let count = 0;
  for (let c = inst.firstChild[n]; c >= 0; c = inst.nextSibling[c]) count++;
  if (top + count > inst.stack.length) {
    const next = new Int32Array(Math.max(inst.stack.length * 2, top + count));
    next.set(inst.stack);
    inst.stack = next;
  }
  const stack = inst.stack;
  let at = top + count;
  for (let c = inst.firstChild[n]; c >= 0; c = inst.nextSibling[c]) stack[--at] = c;
  return top + count;
}

/** Creates the root if the instance is pending, then lets each live node start the children whose time has come. */
export function buildInstance(inst: EffectInstance, streams: EffectStreams, delta: number): void {
  if (inst.pending) {
    inst.root = createNode(inst, streams, inst.display.root, delta, 0);
    inst.pending = false;
    inst.treeHidden = false;
  }
  if (inst.root < 0 || inst.treeHidden) return;
  let top = 0;
  inst.stack[top++] = inst.root;
  while (top > 0) {
    const n = inst.stack[--top];
    if (inst.flags[n] & KILLED) continue;
    if (inst.flags[n] & PENDING_CHILDREN) startChildren(inst, streams, n, delta);
    top = pushChildren(inst, n, top);
  }
}

function startChildren(inst: EffectInstance, streams: EffectStreams, n: number, delta: number) {
  const definition = inst.programs[n]!;
  const display = inst.display;
  const commanded =
    definition.offset === display.root.offset &&
    (inst.flags[n] & COMMAND_EMITTED) !== 0 &&
    display.child !== null;
  const definitions = commanded ? [display.child!] : definition.autoChildren;
  const stride = inst.scheduleStride;
  const age = inst.ages[n];
  let deferred = false;
  for (let di = 0; di < definitions.length; di++) {
    const child = definitions[di];
    const interval = child.interval;
    const at = n * stride + di;
    let emissions = 1;
    if (!commanded && inst.scheduleStarted[at]) {
      if (inst.scheduleRemaining[at] === 0 || interval < 0) continue;
      if (age <= inst.scheduleNextTime[at]) {
        deferred = true;
        continue;
      }
      emissions = Math.min(
        inst.scheduleRemaining[at],
        Math.max(
          1,
          interval > 0 ? Math.trunc(f(f(age - inst.scheduleNextTime[at]) / interval)) : 1,
        ),
      );
      advanceEffectRandom(streams, streams);
    }
    if (!commanded && age < child.start) {
      deferred = true;
      continue;
    }
    const count = commanded ? 1 : child.count;
    for (let i = 0; i < count * emissions; i++) {
      const ordinal = commanded ? i : inst.scheduleOrdinal[at]++;
      const slot = createNode(inst, streams, child, delta, ordinal);
      appendChild(inst, n, slot);
    }
    if (!commanded) {
      inst.scheduleNextTime[at] = f(
        (!inst.scheduleStarted[at] && child.start > 0 ? child.start : age) + interval,
      );
      inst.scheduleStarted[at] = 1;
      inst.scheduleRemaining[at] -= emissions;
      if (inst.scheduleRemaining[at] > 0 && interval >= 0) deferred = true;
    }
  }
  if (deferred) inst.flags[n] |= PENDING_CHILDREN;
  else inst.flags[n] &= ~PENDING_CHILDREN;
}

const parentScratch = new Float32Array(16);

/** Computes every live node's matrix, color, vertices and particle state for this step. */
export function animateInstance(
  inst: EffectInstance,
  streams: EffectStreams,
  delta: number,
  camera: EffectCamera,
  rootMatrix: Matrix = IDENTITY,
): void {
  if (inst.root < 0 || inst.treeHidden) return;
  multiplyAffine(rootMatrix, inst.boundMatrix, inst.rootMatrix);
  const display = inst.display;
  let top = 0;
  inst.stack[top++] = inst.root;
  while (top > 0) {
    const n = inst.stack[--top];
    if (inst.flags[n] & KILLED) continue;
    const definition = inst.programs[n]!;
    const parent = inst.parents[n];
    const source = parent < 0 ? inst.rootMatrix : inst.matrices[parent];
    let parentMatrix: Matrix = source;
    if (definition.translationOnly) {
      setIdentity(parentScratch);
      parentScratch[12] = source[12];
      parentScratch[13] = source[13];
      parentScratch[14] = source[14];
      parentMatrix = parentScratch;
    }
    if (
      definition.offset === display.root.offset &&
      display.child !== null &&
      !(inst.flags[n] & COMMAND_EMITTED)
    )
      inst.flags[n] |= COMMAND_EMITTED | PENDING_CHILDREN;
    const matrix = inst.matrices[n];
    const animation = inst.animations[n];
    if (animation) {
      const parentColor =
        parent >= 0 && inst.programs[parent]!.hasColor ? inst.colors[parent] : 0xffffffff;
      const vertices = inst.vertices[n];
      const next = advanceAnimation(
        inst.animationPrograms[n]!,
        animation,
        {
          delta,
          parentMatrix,
          parentColor,
          camera,
          instanceOrdinal: inst.ordinals[n],
          rng: streams,
          vertices,
        },
        matrix,
      );
      inst.animations[n] = next;
      if (definition.hasColor) inst.colors[n] = next.color;
      if (vertices) inst.flags[n] |= HAS_VERTICES;
    } else for (let i = 0; i < 16; i++) matrix[i] = parentMatrix[i];
    const particle = inst.particleStates[n];
    if (particle) advanceParticle(inst.particlePrograms[n]!, particle, inst.ages[n], matrix);
    inst.flags[n] |= UPDATED;
    top = pushChildren(inst, n, top);
  }
}

function selectedOrdinal(inst: EffectInstance, n: number, elementOffset: number): number {
  const animation = inst.animationPrograms[n];
  if (!animation) return 0;
  const motions = animation.motions;
  const states = inst.animations[n]!.motions;
  for (let i = motions.length - 1; i >= 0; i--) {
    const motion = motions[i];
    if (motion.type === 700 && motion.elementOffset === elementOffset) return states[i].selection;
  }
  return 0;
}

/** Emits the instance's draws in tree order. A hidden instance, or one without a tree, draws nothing. */
export function collectInstanceDraws(inst: EffectInstance, sink: EffectDrawSink): void {
  if (inst.root < 0 || inst.treeHidden) return;
  const layerParameter = inst.player.layerParameter;
  let top = 0;
  inst.stack[top++] = inst.root;
  while (top > 0) {
    const n = inst.stack[--top];
    if (inst.flags[n] & KILLED) continue;
    const definition = inst.programs[n]!;
    const vertices = inst.vertices[n];
    const particle = inst.particleStates[n];
    if (inst.flags[n] & UPDATED && !(definition.flags & 8)) {
      if (vertices && inst.flags[n] & HAS_VERTICES) emitPrimitive(inst, n, vertices, sink);
      if (particle) emitParticle(inst, n, particle, layerParameter, sink);
    }
    top = pushChildren(inst, n, top);
  }
}

function emitPrimitive(
  inst: EffectInstance,
  n: number,
  vertices: Float32Array,
  sink: EffectDrawSink,
): void {
  const player = inst.player;
  const definition = inst.programs[n]!;
  const draw = player.draws.primitive(definition);
  const packet = inst.primitive;
  const matrix = inst.matrices[n];
  packet.interpolationKey = `${inst.instanceId}/${n}/${inst.ordinals[n]}/${definition.offset}`;
  packet.draw = draw;
  packet.vertices = vertices;
  for (let row = 0; row < 4; row++)
    for (let column = 0; column < 4; column++)
      packet.worldMatrix[column * 4 + row] = matrix[row * 4 + column];
  const animation = inst.animationPrograms[n];
  const state = inst.animations[n];
  const elements = animation ? animation.elements300 : [];
  packet.textureOffsets.fill(0);
  packet.bindingCount = draw.elementOffsets.length;
  for (let unit = 0; unit < draw.elementOffsets.length; unit++) {
    const elementOffset = draw.elementOffsets[unit];
    packet.bindings[unit] = draw.slots[unit][selectedOrdinal(inst, n, elementOffset)];
    const index = elements.indexOf(elementOffset);
    if (state?.textureOffsets && index >= 0) {
      packet.textureOffsets[unit * 2] = state.textureOffsets[index * 2];
      packet.textureOffsets[unit * 2 + 1] = state.textureOffsets[index * 2 + 1];
    }
  }
  if (draw.layout === 5) {
    const index = elements.indexOf(draw.elementOffsets[1]);
    const rect = state?.textureUvs;
    if (!rect || index < 0) throw new RangeError("Second texture rectangle required");
    const u0 = rect[index * 4];
    const v0 = rect[index * 4 + 1];
    const u1 = rect[index * 4 + 2];
    const v1 = rect[index * 4 + 3];
    packet.secondaryUv.set([u0, v0, u0, v1, u1, v0, u1, v0, u0, v1, u1, v1]);
  }
  player.draws.order(definition, player.layerParameter, inst.order);
  packet.layer = inst.order.layer;
  packet.priority = inst.order.priority;
  packet.orderKey = inst.order.key;
  sink.primitive(packet);
}

function emitParticle(
  inst: EffectInstance,
  n: number,
  state: ParticleState,
  layerParameter: number | null,
  sink: EffectDrawSink,
): void {
  const player = inst.player;
  const definition = inst.programs[n]!;
  const program = inst.particlePrograms[n]!;
  const draw = player.draws.particle(definition);
  particleDrawRange(program, state.time, player.maximumParticles, inst.range);
  if (inst.range.count === 0) return;
  const packet = inst.particle;
  packet.interpolationKey = `${inst.instanceId}/${n}/${inst.ordinals[n]}/${definition.offset}`;
  packet.draw = draw;
  for (let i = 0; i < 16; i++)
    packet.worldMatrix[i] = state.matrix[(i % 4) * 4 + Math.floor(i / 4)];
  particleFrameParameters(program, state, inst.range.shaderTime, inst.colors[n], packet.parameters);
  packet.births = state.births;
  packet.ringIndex = particleRingIndex(program, inst.range);
  packet.start = inst.range.start;
  packet.count = inst.range.count;
  player.draws.order(definition, layerParameter, inst.order);
  packet.layer = inst.order.layer;
  packet.priority = inst.order.priority;
  packet.orderKey = inst.order.key;
  sink.particle(packet);
}

/** Ages every live node by `delta`, kills those past their life and removes the killed. A hidden tree does not age but is still pruned. */
export function finishInstance(inst: EffectInstance, delta: number): void {
  if (inst.root < 0) return;
  let top = 0;
  if (!inst.treeHidden) {
    inst.stack[top++] = inst.root;
    while (top > 0) {
      const n = inst.stack[--top];
      if (inst.flags[n] & KILLED) continue;
      inst.ages[n] = f(inst.ages[n] + delta);
      const life = inst.programs[n]!.life;
      if (life >= 0 && inst.ages[n] >= life) inst.flags[n] |= KILLED;
      top = pushChildren(inst, n, top);
    }
  }
  if (inst.flags[inst.root] & KILLED) {
    freeSubtree(inst, inst.root);
    inst.root = -1;
    return;
  }
  inst.stack[top++] = inst.root;
  while (top > 0) {
    const n = inst.stack[--top];
    let previous = -1;
    let c = inst.firstChild[n];
    while (c >= 0) {
      const next = inst.nextSibling[c];
      if (inst.flags[c] & KILLED) {
        if (previous < 0) inst.firstChild[n] = next;
        else inst.nextSibling[previous] = next;
        if (inst.lastChild[n] === c) inst.lastChild[n] = previous;
        freeSubtree(inst, c);
      } else previous = c;
      c = next;
    }
    top = pushChildren(inst, n, top);
  }
}

function freeSubtree(inst: EffectInstance, root: number): void {
  let n = root;
  for (;;) {
    const child = inst.firstChild[n];
    if (child >= 0) {
      n = child;
      continue;
    }
    const parent = inst.parents[n];
    const next = inst.nextSibling[n];
    release(inst, n);
    if (n === root) return;
    if (next >= 0) n = next;
    else {
      inst.firstChild[parent] = -1;
      n = parent;
    }
  }
}

/** Whether the instance still has a tree, or is yet to build one. */
export function isInstanceLive(inst: EffectInstance): boolean {
  return inst.pending || inst.root >= 0;
}

/** Cancels an instance that has not built its tree; otherwise marks the root killed, so its draws stop at once and the next finish removes the tree. */
export function killInstance(inst: EffectInstance): void {
  if (inst.pending) inst.pending = false;
  else if (inst.root >= 0) inst.flags[inst.root] |= KILLED;
}

/** Replaces the bound transform of a live tree with a translation. */
export function setInstancePosition(
  inst: EffectInstance,
  position: readonly [number, number, number],
): void {
  if (inst.root < 0 || inst.flags[inst.root] & KILLED) return;
  setIdentity(inst.boundMatrix);
  inst.boundMatrix[12] = position[0];
  inst.boundMatrix[13] = position[1];
  inst.boundMatrix[14] = position[2];
}

/** Reselects the root's display state of a live tree; children already started continue, and the root may start its command child again. */
export function setInstanceDisplayState(inst: EffectInstance, requested: number): void {
  if (inst.root < 0 || inst.flags[inst.root] & KILLED) return;
  const rootSource = inst.player.resource.nodes.find((n) => n.id === inst.animation)!;
  const selected =
    (requested === -1 ? undefined : rootSource.states.find((s) => s.id === requested)) ??
    rootSource.states.find((s) => s.id === rootSource.defaultState);
  if (!selected) return;
  inst.display = inst.player.program.display(inst.animation, selected.id);
  inst.flags[inst.root] &= ~COMMAND_EMITTED;
}

/** One Graph step for an instance that owns the random cursors: build, animate, collect, finish. */
export function stepInstance(
  inst: EffectInstance,
  streams: EffectStreams,
  delta: number,
  camera: EffectCamera,
  sink: EffectDrawSink,
  rootMatrix: Matrix = IDENTITY,
): void {
  buildInstance(inst, streams, delta);
  animateInstance(inst, streams, delta, camera, rootMatrix);
  collectInstanceDraws(inst, sink);
  finishInstance(inst, delta);
}
