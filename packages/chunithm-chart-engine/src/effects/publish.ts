import type { ParticleDrawState, TextureBinding } from "./eval/draw";
import { particleTangentRings } from "./eval/random";
import type { EffectDrawSink, ParticlePacket, PrimitivePacket } from "./instance";
import { particlePass, primitivePass } from "./passes";
import type {
  EffectBinding,
  EffectPacket,
  EffectParticlePacket,
  EffectPass,
  EffectPrimitivePacket,
  EffectSamplerState,
} from "./render";

/** Collects the draws an effect scheduler emits as packets the effect renderer prepares. */
export interface EffectPublisher {
  readonly sink: EffectDrawSink;
  /** Publishes a particle draw that carries only the draw state a particle packet needs. */
  readonly particle: (packet: ParticlePacket<ParticleDrawState>) => void;
  /** The packets received since the last `reset`, in arrival order; valid until the next `reset`. */
  readonly packets: readonly EffectPacket[];
  reset(): void;
}

export interface EffectPublisherOptions {
  /** The particle capacity the scheduler's players draw slices against. */
  maximumParticles: number;
}

const ADDRESS = [1, 2, 3, 4];
const FILTER = [1, 2, 3, 0];
const COLOR = Array.from({ length: 256 }, (_, byte) => Math.fround(byte * Math.fround(1 / 255)));
const NO_INDICES = new Uint32Array(0);
const PASSES = new Map<number, EffectPass>();

const filterIndex = (value: number) => (value === 1 ? 1 : value === 2 ? 2 : 0);

function passOf(index: number): EffectPass {
  let pass = PASSES.get(index);
  if (!pass) PASSES.set(index, (pass = Object.freeze({ passIndex: index })));
  return pass;
}

function samplerState(sampler: TextureBinding["sampler"]): EffectSamplerState {
  const mag = filterIndex(sampler.magFilter);
  const mip = filterIndex(sampler.mipFilter);
  if (mag === 2) throw new RangeError("A magnification filter that repeats the previous one");
  return {
    addressU: ADDRESS[sampler.wrapU <= 3 ? sampler.wrapU : 2],
    addressV: ADDRESS[sampler.wrapV <= 3 ? sampler.wrapV : 2],
    minFilter: FILTER[filterIndex(sampler.minFilter)],
    magFilter: FILTER[mag],
    mipFilter: FILTER[mip === 2 ? 1 : mip],
    maxMipLevel: 0,
    maxAnisotropy: sampler.anisoNumber,
  };
}

function primitiveIndices(strip: boolean, vertexCount: number): Uint32Array {
  if (!strip) return Uint32Array.from({ length: vertexCount }, (_, i) => i);
  const out = new Uint32Array(Math.max(0, vertexCount - 2) * 3);
  for (let i = 0; i < vertexCount - 2; i++)
    out.set(i % 2 ? [i + 1, i, i + 2] : [i, i + 1, i + 2], i * 3);
  return out;
}

/** A float arena handing out exact-length views; views stay valid after the arena grows. */
function createArena(initial: number) {
  let buffer = new Float32Array(initial);
  let used = 0;
  return {
    take(length: number): Float32Array {
      if (used + length > buffer.length) {
        buffer = new Float32Array(Math.max(buffer.length * 2, length));
        used = 0;
      }
      const view = buffer.subarray(used, used + length);
      used += length;
      return view;
    },
    reset() {
      used = 0;
    },
  };
}

interface PrimitiveSlot {
  packet: EffectPrimitivePacket;
  context: Uint8Array;
  contextView: DataView;
  worldMatrix: Float32Array;
  sortPosition: Float32Array;
  bindings: EffectBinding[];
  order: EffectPrimitivePacket["order"];
}

interface ParticleSlot {
  packet: EffectParticlePacket;
  worldMatrix: Float32Array;
  parameters: Float32Array;
  fixedParam0: Float32Array;
  bindings: EffectBinding[];
  range: { firstIndex: number; count: number };
  order: EffectParticlePacket["order"];
}

export function createEffectPublisher(options: EffectPublisherOptions): EffectPublisher {
  const packets: EffectPacket[] = [];
  const primitiveSlots: PrimitiveSlot[] = [];
  const particleSlots: ParticleSlot[] = [];
  let primitivesUsed = 0;
  let particlesUsed = 0;
  const positions = createArena(1 << 14);
  const normals = createArena(1 << 14);
  const colors = createArena(1 << 15);
  const uvs = createArena(1 << 14);
  const births = createArena(1 << 14);
  const bindingStates = new WeakMap<TextureBinding, EffectBinding>();
  const indexCache = new Map<number, Uint32Array>();
  let rings: Float32Array[] | null = null;
  const expandedRings: (Float32Array | undefined)[] = [];

  const bindingOf = (binding: TextureBinding): EffectBinding => {
    let state = bindingStates.get(binding);
    if (!state) {
      state = { resourceIndex: binding.resourceIndex, sampler: samplerState(binding.sampler) };
      bindingStates.set(binding, state);
    }
    return state;
  };

  const indicesOf = (strip: boolean, vertexCount: number): Uint32Array => {
    const key = strip ? vertexCount : -vertexCount;
    let indices = indexCache.get(key);
    if (!indices) indexCache.set(key, (indices = primitiveIndices(strip, vertexCount)));
    return indices;
  };

  const ringOf = (index: number): Float32Array => {
    let expanded = expandedRings[index];
    if (!expanded) {
      rings ??= particleTangentRings(options.maximumParticles);
      const ring = rings[index];
      expanded = new Float32Array(ring.length * 4);
      for (let i = 0; i < ring.length / 4; i++)
        expanded.set(ring.subarray(i * 4, i * 4 + 4), i * 16);
      expandedRings[index] = expanded;
    }
    return expanded;
  };

  const primitiveSlot = (): PrimitiveSlot => {
    if (primitivesUsed < primitiveSlots.length) return primitiveSlots[primitivesUsed++];
    const context = new Uint8Array(112);
    const worldMatrix = new Float32Array(16);
    const sortPosition = new Float32Array(3);
    const bindings: EffectBinding[] = [];
    const order = { pass: passOf(8), key: 0, sortPosition, sortDistanceOffset: 0 };
    const empty = new Float32Array(0);
    const slot: PrimitiveSlot = {
      packet: {
        kind: "simple",
        layout: 4,
        resourceId: 0,
        mesh: {
          attributes: {
            aPosition: { size: 3, values: empty },
            aColor: { size: 4, values: empty },
            aTexCoord: { size: 2, values: empty },
          },
          indices: NO_INDICES,
        },
        worldMatrix,
        bindings,
        material: { context, fixedParam0: [], materialKey: [], environmentIndex: 0 },
        order,
      },
      context,
      contextView: new DataView(context.buffer),
      worldMatrix,
      sortPosition,
      bindings,
      order,
    };
    primitiveSlots.push(slot);
    primitivesUsed++;
    return slot;
  };

  const particleSlot = (): ParticleSlot => {
    if (particlesUsed < particleSlots.length) return particleSlots[particlesUsed++];
    const worldMatrix = new Float32Array(16);
    const parameters = new Float32Array(236);
    const fixedParam0 = Float32Array.of(0, 0, 1, 0);
    const bindings: EffectBinding[] = [];
    const range = { firstIndex: 0, count: 0 };
    const order = { pass: passOf(16), key: 0, sortDistanceOffset: 0 };
    const slot: ParticleSlot = {
      packet: {
        kind: "particle",
        resourceId: 0,
        mesh: { attributes: { aTangent: { size: 4, values: NO_INDICES } }, indices: NO_INDICES },
        range,
        worldMatrix,
        bindings,
        sourceFlags: 0,
        parameters,
        material: { fixedParam0, softEdge: false },
        order,
      },
      worldMatrix,
      parameters,
      fixedParam0,
      bindings,
      range,
      order,
    };
    particleSlots.push(slot);
    particlesUsed++;
    return slot;
  };

  const primitive = (source: PrimitivePacket): void => {
    const draw = source.draw;
    const material = draw.material;
    const count = draw.vertexCount;
    const slot = primitiveSlot();
    const packet = slot.packet;
    const position = positions.take(count * 3);
    const color = colors.take(count * 4);
    const uv = uvs.take(count * 2);
    const vertices = source.vertices;
    const words = new Uint32Array(vertices.buffer, vertices.byteOffset, vertices.length);
    const normal = draw.layout === 10 ? normals.take(count * 3) : null;
    const stride = normal ? 9 : 6;
    const colourOffset = normal ? 6 : 3;
    for (let i = 0; i < count; i++) {
      const at = i * stride;
      position[i * 3] = vertices[at];
      position[i * 3 + 1] = vertices[at + 1];
      position[i * 3 + 2] = vertices[at + 2];
      if (normal) {
        normal[i * 3] = vertices[at + 3];
        normal[i * 3 + 1] = vertices[at + 4];
        normal[i * 3 + 2] = vertices[at + 5];
      }
      const word = words[at + colourOffset];
      color[i * 4] = COLOR[(word >>> 16) & 255];
      color[i * 4 + 1] = COLOR[(word >>> 8) & 255];
      color[i * 4 + 2] = COLOR[word & 255];
      color[i * 4 + 3] = COLOR[word >>> 24];
      uv[i * 2] = vertices[at + colourOffset + 1];
      uv[i * 2 + 1] = vertices[at + colourOffset + 2];
    }
    const attributes = packet.mesh.attributes;
    attributes.aPosition.values = position;
    attributes.aColor.values = color;
    attributes.aTexCoord.values = uv;
    if (normal) attributes.aNormal = { size: 3, values: normal };
    else delete attributes.aNormal;
    if (draw.layout === 5) {
      const second = uvs.take(12);
      second.set(source.secondaryUv);
      attributes.aTexCoord1 = { size: 2, values: second };
    } else delete attributes.aTexCoord1;
    packet.mesh.indices = indicesOf(draw.strip, count);
    packet.layout = draw.layout;
    packet.interpolationKey = source.interpolationKey;
    packet.frame = source.frame;
    packet.normalLights = normal ? source.normalLights : undefined;
    packet.shadow = source.shadow;
    packet.state = source.state;
    packet.resourceId = source.resourceId;
    slot.worldMatrix.set(source.worldMatrix);
    const sort = source.sortPosition;
    slot.sortPosition[0] = sort ? sort[0] : slot.worldMatrix[3];
    slot.sortPosition[1] = sort ? sort[1] : slot.worldMatrix[7];
    slot.sortPosition[2] = sort ? sort[2] : slot.worldMatrix[11];
    slot.bindings.length = source.bindingCount;
    for (let unit = 0; unit < source.bindingCount; unit++)
      slot.bindings[unit] = bindingOf(source.bindings[unit]);
    slot.context.set(material.context);
    for (let unit = 0; unit < source.bindingCount; unit++) {
      slot.contextView.setFloat32(60 + unit * 8, source.textureOffsets[unit * 2], true);
      slot.contextView.setFloat32(64 + unit * 8, source.textureOffsets[unit * 2 + 1], true);
    }
    const effectMaterial = packet.material;
    effectMaterial.fixedParam0 = material.fixedParam0;
    effectMaterial.materialKey = material.materialKey;
    effectMaterial.environmentIndex = material.environmentIndex;
    slot.order.pass = passOf(
      primitivePass(material.featureWord96, material.featureWord100, source.orderKey),
    );
    slot.order.key = source.orderKey;
    slot.order.sortDistanceOffset = draw.sortDistanceOffset;
    packets.push(packet);
  };

  const particle = (source: ParticlePacket<ParticleDrawState>): void => {
    const draw = source.draw;
    const slot = particleSlot();
    const packet = slot.packet;
    packet.interpolationKey = source.interpolationKey;
    packet.frame = source.frame;
    packet.resourceId = source.resourceId;
    packet.mesh.attributes.aTangent.values = ringOf(source.ringIndex);
    slot.range.firstIndex = source.start * 6;
    slot.range.count = source.count * 6;
    if (source.births) {
      const transforms = births.take(source.count * 7);
      transforms.set(source.births.subarray(source.start * 7, (source.start + source.count) * 7));
      packet.births = transforms;
    } else packet.births = null;
    slot.worldMatrix.set(source.worldMatrix);
    slot.parameters.set(source.parameters);
    slot.bindings.length = 1;
    slot.bindings[0] = bindingOf(draw.binding);
    packet.sourceFlags = draw.sourceFlags;
    packet.shadow = source.shadow;
    slot.fixedParam0[0] = draw.softEdgeDistance ?? 0;
    slot.fixedParam0[1] = draw.refractionParameter ?? 0;
    slot.fixedParam0[2] = draw.rgbScale ?? 1;
    packet.material.softEdge = draw.softEdgeDistance !== undefined;
    packet.material.refraction = draw.refractionMode !== undefined;
    packet.material.fog = (draw.featureWord144 & 0x4000) === 0;
    packet.state = source.state;
    slot.order.pass = passOf(particlePass(draw.featureWord144, source.orderKey));
    slot.order.key = source.orderKey;
    packets.push(packet);
  };

  return {
    sink: { primitive, particle },
    particle,
    packets,
    reset() {
      packets.length = 0;
      primitivesUsed = 0;
      particlesUsed = 0;
      positions.reset();
      normals.reset();
      colors.reset();
      uvs.reset();
      births.reset();
    },
  };
}
