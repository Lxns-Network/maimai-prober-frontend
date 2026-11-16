import { compileProgram } from "../assets/shaderCompile";
/**
 * Effect drawing: turns one frame's effect packets into entries for the scene's draw queue.
 *
 * Packets arrive in the shape the evaluators publish: primitives carry their own vertices,
 * particles a pool of births. `prepare` packs every packet's geometry into shared buffers, orders
 * nothing itself, and returns one entry per drawable packet; the scene sorts them with its other
 * draws and calls each entry's `draw` in turn. An entry that fades against scene depth asks for the
 * depth snapshot, which the scene hands to `draw`.
 */

import { createDeviceState, mirrorDeviceState, type DeviceStateSet } from "../gpu/deviceState";
import { createSamplerCache, samplerParameters } from "../gpu/samplers";
import { resolveUniforms, type UniformLocations } from "../gpu/uniforms";
import { particleEffectState, primitiveEffectState } from "./renderState";
import {
  EFFECT_ATTRIBUTES,
  EFFECT_DEPTH_UNIT,
  EFFECT_COLOR_UNIT,
  effectProgramId,
  effectShaders,
  type EffectProgramKey,
} from "./shaders";
import type { SimpleParallelLight } from "./instance";
import type { EffectTextureSource } from "./textures";

export type { EffectProgramKey } from "./shaders";

export interface EffectSamplerState {
  addressU: number;
  addressV: number;
  minFilter: number;
  magFilter: number;
  mipFilter: number;
  maxMipLevel: number;
  maxAnisotropy: number;
}

export interface EffectBinding {
  resourceIndex: number;
  sampler: EffectSamplerState;
}

interface Stream {
  size: number;
  values: ArrayLike<number>;
}

export interface EffectPass {
  passIndex: number;
}

/** Indexed triangles, lines or point sprites with per-vertex colour. */
export interface EffectPrimitivePacket {
  interpolationKey?: string;
  topology?: "lines" | "points";
  /** Diameter in framebuffer pixels for point primitives. */
  pointSize?: number;
  /** Camera publication at submission, when different from the enclosing scene frame. */
  frame?: EffectFrame;
  shadow?: boolean;
  kind: "simple";
  /** 5 uses a second coordinate set; 10 carries normal-bearing geometry. */
  layout: number;
  resourceId: number;
  sceneMask?: number;
  mesh: {
    attributes: {
      aPosition: Stream;
      aColor: Stream;
      aTexCoord: Stream;
      aTexCoord1?: Stream;
      aNormal?: Stream;
    };
    indices: ArrayLike<number>;
  };
  /** Present for normal-bearing geometry; empty preserves its vertex colour. */
  normalLights?: readonly SimpleParallelLight[];
  worldMatrix: ArrayLike<number>;
  bindings: readonly EffectBinding[];
  /** The device state to draw with; the state of the material among the effect classes when absent. */
  state?: DeviceStateSet;
  material: {
    /** The 112 material bytes: flags at 0, parameters at 28/32/36, texture offsets from 60. */
    context: ArrayLike<number>;
    fixedParam0: ArrayLike<number>;
    materialKey: ArrayLike<number>;
    environmentIndex: number;
  };
  order: {
    pass: EffectPass;
    key: number;
    sortPosition: ArrayLike<number>;
    sortDistanceOffset: number;
  };
}

/** View-space quads in draw order; `worldMatrix` maps their display view back to world space. */
export interface EffectBillboardPacket extends Omit<
  EffectPrimitivePacket,
  "kind" | "mesh" | "layout" | "topology"
> {
  kind: "billboard";
  /** View centre XYZ, RGBA, four rotated extents and UV rectangle; normalLights adds XYZ. */
  instances: Float32Array;
}

/** A particle draw: a run of births from a pool, four vertices each. */
export interface EffectParticlePacket {
  interpolationKey?: string;
  frame?: EffectFrame;
  shadow?: boolean;
  kind: "particle";
  resourceId: number;
  sceneMask?: number;
  /** Tangents are every sixteenth float group: the first four floats of each particle. */
  mesh: { attributes: { aTangent: Stream }; indices: ArrayLike<number> };
  /** Index range of the run inside `mesh`; the whole mesh when absent. */
  range?: { firstIndex: number; count: number };
  /** Birth transforms in draw order, with translation followed by quaternion. */
  births?: Float32Array | null;
  worldMatrix: ArrayLike<number>;
  bindings: readonly EffectBinding[];
  sourceFlags: number;
  /** The device state to draw with; the state of `sourceFlags` among the effect classes when absent. */
  state?: DeviceStateSet;
  /** The 59 parameter vectors. */
  parameters: ArrayLike<number>;
  material: {
    fixedParam0: ArrayLike<number>;
    softEdge?: boolean;
    refraction?: boolean;
    fog?: boolean;
  };
  order: { pass: EffectPass; key: number; sortDistanceOffset: number };
}

export type EffectPacket = EffectPrimitivePacket | EffectParticlePacket | EffectBillboardPacket;

/** Sort depth of a draw, in the units the scene's pass ordering compares. */
export interface EffectDepthOrder {
  primitive(sortPosition: ArrayLike<number>, sortDistanceOffset: number): number;
  /** `world` holds the twelve affine entries of the node's matrix. */
  model(world: ArrayLike<number>, sortDistanceOffset: number): number;
}

export interface EffectShadow {
  readonly matrices: readonly ArrayLike<number>[];
  readonly textures: readonly WebGLTexture[];
  readonly moments?: WebGLTexture;
  readonly color: readonly number[];
  readonly edgeHide?: boolean;
  readonly softness?: number;
}

export interface EffectFrame {
  fog?: {
    readonly mode: number;
    readonly range: readonly number[];
    readonly height: readonly number[];
    readonly color: readonly number[];
  };
  /** The one-to-three-cascade directional shadow shared by this frame's eligible draws. */
  shadow?: EffectShadow;
  viewport: { width: number; height: number };
  /** Maps camera-local bottom-left UVs into the enclosing immutable scene-depth snapshot. */
  depthUvTransform?: readonly [number, number, number, number];
  /** Row-major view-projection, as the scene publishes it. */
  viewProjection: ArrayLike<number>;
  /** Row-major projection; its third row positions depth in view distance. */
  projection: ArrayLike<number>;
  eyePosition: ArrayLike<number>;
  /** Draws whose mask shares no bit with this are skipped; 1 when omitted. */
  sceneMask?: number;
  /** Applies the reflection scene's cull command to each draw. */
  mirror?: boolean;
  depth: EffectDepthOrder;
}

/** What the scene supplies when it submits an entry. */
export interface EffectDrawContext {
  /** The depth the scene had drawn when the snapshot was taken, sampled by soft edges. */
  readonly depth: { readonly texture: WebGLTexture; readonly sampler: WebGLSampler } | null;
  readonly color?: { readonly texture: WebGLTexture; readonly sampler: WebGLSampler };
}

export interface EffectDraw {
  readonly source: object;
  /** Index in the scene's pass table. */
  readonly pass: number;
  readonly key: number;
  readonly depth: number;
  /** The scene must capture its depth before this entry's pass and supply it to `draw`. */
  readonly requiresDepthSnapshot: boolean;
  readonly requiresColorSnapshot: boolean;
  /** Valid until the next `prepare` or disposal. */
  draw(context?: EffectDrawContext): { draws: number };
}

export interface EffectRenderer {
  /** Packs one frame's packets and returns their entries in packet order. */
  prepare(packets: readonly EffectPacket[], frame: EffectFrame): readonly EffectDraw[];
  /** Compiles programs ahead of the frames that need them. */
  warm(keys: readonly EffectProgramKey[]): void;
  dispose(): void;
}

const VERTEX_FLOATS = 14;
const BILLBOARD_FLOATS = 15;
const POSITION_OFFSET = 0;
const COLOR_OFFSET = 3 * 4;
const UV_OFFSET = 7 * 4;
const UV1_OFFSET = 9 * 4;
const NORMAL_OFFSET = 11 * 4;
const PARTICLE_REGISTERS = 236;
const CONTEXT_BYTES = 112;
const MAX_TEXTURES = 3;
const SHADOW_UNITS = [11, 12, 14];
const ONE_DRAW = Object.freeze({ draws: 1 });
const CORNER_ALPHA = new Float32Array([0, 85 / 255, 170 / 255, 1]);
const QUAD_INDICES = new Uint8Array([0, 1, 2, 1, 2, 3]);

interface Program {
  pointSize: WebGLUniformLocation | null;
  shadow: boolean;
  shadowMatrices: (WebGLUniformLocation | null)[];
  shadowColor: WebGLUniformLocation | null;
  shadowCount: WebGLUniformLocation | null;
  shadowEdgeHide: WebGLUniformLocation | null;
  shadowSoftness: WebGLUniformLocation | null;
  shadowMomentMode: WebGLUniformLocation | null;
  program: WebGLProgram;
  locations: UniformLocations;
  world: WebGLUniformLocation | null;
  vertexParam0: WebGLUniformLocation | null;
  vertexParam1: WebGLUniformLocation | null;
  fixedParam0: WebGLUniformLocation | null;
  effectColor: WebGLUniformLocation | null;
  particles: WebGLUniformLocation | null;
  viewProjection: WebGLUniformLocation | null;
  screenParam: WebGLUniformLocation | null;
  eyePosition: WebGLUniformLocation | null;
  systemParam: WebGLUniformLocation | null;
  depthFlipY: WebGLUniformLocation | null;
  depthUvTransform: WebGLUniformLocation | null;
  parallelDirection: WebGLUniformLocation | null;
  parallelDiffuse: WebGLUniformLocation | null;
  parallelLights: number;
  fog: boolean;
  fogMode: WebGLUniformLocation | null;
  fogRange: WebGLUniformLocation | null;
  fogHeight: WebGLUniformLocation | null;
  fogColor: WebGLUniformLocation | null;
  particle: boolean;
  billboard: boolean;
  softEdge: boolean;
  refraction: boolean;
  /** Preparation whose frame uniforms the program holds. */
  frame: EffectFrame | null;
}

interface Slot {
  readonly source: object;
  lines: boolean;
  points: boolean;
  pointSize: number;
  frame: EffectFrame;
  pass: number;
  key: number;
  depth: number;
  requiresDepthSnapshot: boolean;
  requiresColorSnapshot: boolean;
  draw(context?: EffectDrawContext): { draws: number };
  stamp: number;
  program: Program | null;
  state: DeviceStateSet | null;
  textures: (WebGLTexture | null)[];
  samplers: (WebGLSampler | null)[];
  textureCount: number;
  world: Float32Array;
  vertexParam0: Float32Array;
  vertexParam1: Float32Array;
  fixedParam0: Float32Array;
  effectColor: Float32Array;
  parallelDirection: Float32Array;
  parallelDiffuse: Float32Array;
  parameters: Float32Array;
  indexOffset: number;
  indexCount: number;
  instanceOffset: number;
  instances: number;
  instanceStride: number;
  hasBirths: boolean;
}

function compile(gl: WebGL2RenderingContext, key: EffectProgramKey): WebGLProgram {
  const { vertex, fragment } = effectShaders(key);
  return compileProgram(gl, { name: "Effect " + key, vertex, fragment });
}

/** Builds the renderer over a context and its textures. `gpuEpoch` changes after external state writes. */
export function createEffectRenderer(
  gl: WebGL2RenderingContext,
  textures: EffectTextureSource,
  gpuEpoch?: () => number,
): EffectRenderer {
  const drawSource = {};
  let drawEpoch: number | undefined;
  const deviceState = createDeviceState(gl);
  const samplerCache = createSamplerCache(gl);
  const samplers = new Map<number, WebGLSampler>();
  const programs = new Map<number, Program>();

  const simpleVao = gl.createVertexArray()!;
  const particleVao = gl.createVertexArray()!;
  const billboardVao = gl.createVertexArray()!;
  const vertexBuffer = gl.createBuffer()!;
  const indexBuffer = gl.createBuffer()!;
  const instanceBuffer = gl.createBuffer()!;
  const quadBuffer = gl.createBuffer()!;
  let vertexCapacity = 0;
  let indexCapacity = 0;
  let instanceCapacity = 0;
  let vertexScratch = new Float32Array(4096 * VERTEX_FLOATS);
  let indexScratch = new Uint32Array(8192);
  let instanceScratch = new Float32Array(4096);
  let vertexFloats = 0;
  let indexCount = 0;
  let instanceFloats = 0;

  gl.bindVertexArray(simpleVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  const stride = VERTEX_FLOATS * 4;
  for (const [location, size, offset] of [
    [EFFECT_ATTRIBUTES.position, 3, POSITION_OFFSET],
    [EFFECT_ATTRIBUTES.color, 4, COLOR_OFFSET],
    [EFFECT_ATTRIBUTES.uv, 2, UV_OFFSET],
    [EFFECT_ATTRIBUTES.uv1, 2, UV1_OFFSET],
    [EFFECT_ATTRIBUTES.normal, 3, NORMAL_OFFSET],
  ] as const) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bindVertexArray(particleVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.enableVertexAttribArray(EFFECT_ATTRIBUTES.tangent);
  gl.vertexAttribPointer(EFFECT_ATTRIBUTES.tangent, 4, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(EFFECT_ATTRIBUTES.tangent, 1);
  gl.vertexAttribDivisor(EFFECT_ATTRIBUTES.birthPosition, 1);
  gl.vertexAttribDivisor(EFFECT_ATTRIBUTES.birthRotation, 1);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, QUAD_INDICES, gl.STATIC_DRAW);
  gl.bindVertexArray(billboardVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  for (const location of [0, 1, 2, 3, 4]) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribDivisor(location, 1);
  }
  gl.bindVertexArray(null);

  const viewProjection = new Float32Array(16);
  const screenParam = new Float32Array(4);
  const systemParam = new Float32Array([0, 0, 0, 0]);
  const eyePosition = new Float32Array(3);
  const context = new Uint8Array(CONTEXT_BYTES);
  const contextFloats = new Float32Array(context.buffer);
  const contextWords = new Uint32Array(context.buffer);
  const world12 = new Array<number>(12).fill(0);

  const slots: Slot[] = [];
  const entries: EffectDraw[] = [];
  let stamp = 0;
  let disposed = false;
  let frameDepth: EffectDepthOrder | null = null;
  let frameShadow: EffectShadow | undefined;
  const shadowMatrices = SHADOW_UNITS.map(() => new Float32Array(16));

  const programFor = (key: EffectProgramKey): Program => {
    const id = effectProgramId(key);
    const known = programs.get(id);
    if (known) return known;
    const program = compile(gl, key);
    const location = (name: string) => gl.getUniformLocation(program, name);
    const locations = resolveUniforms(gl, program, {}, [
      "uDepthBias",
      "uAlphaTestEnabled",
      "uAlphaFunc",
      "uAlphaRef",
    ]);
    gl.useProgram(program);
    for (let unit = 0; unit < MAX_TEXTURES; unit++) gl.uniform1i(location(`uTexture${unit}`), unit);
    gl.uniform1i(location("uSceneDepth"), EFFECT_DEPTH_UNIT);
    gl.uniform1i(location("uSceneColor"), EFFECT_COLOR_UNIT);
    if (key.shadow) {
      SHADOW_UNITS.forEach((unit, index) => gl.uniform1i(location(`uShadowImage${index}`), unit));
      gl.uniform1i(location("shadowMomentImage"), 15);
    }
    if (key.particle) gl.uniform4fv(location("uCornerAlpha"), CORNER_ALPHA);
    const created: Program = {
      shadow: key.shadow === true,
      shadowMatrices: SHADOW_UNITS.map((_, index) => location(`uShadowMatrix${index}`)),
      shadowColor: location("uShadowColor"),
      shadowCount: location("uShadowCascadeCount"),
      shadowEdgeHide: location("uShadowEdgeHide"),
      shadowSoftness: location("uShadowSoftness"),
      shadowMomentMode: location("shadowMomentMode"),
      program,
      locations,
      world: location("uWorld"),
      vertexParam0: location("uVertexParam0"),
      vertexParam1: location("uVertexParam1"),
      fixedParam0: location("uFixedParam0"),
      effectColor: location("uEffectColor"),
      particles: location("uParticles[0]"),
      viewProjection: location("uViewProjection"),
      screenParam: location("uScreenParam"),
      eyePosition: location("uEyePosition"),
      systemParam: location("uSystemParam"),
      depthFlipY: location("uDepthFlipY"),
      depthUvTransform: location("uDepthUvTransform"),
      parallelDirection: location("uParallelDirection[0]"),
      parallelDiffuse: location("uParallelDiffuse[0]"),
      parallelLights: key.parallelLights,
      fog: key.fog === true,
      fogMode: location("uFogMode"),
      fogRange: location("uFogRange"),
      fogHeight: location("uFogHeight"),
      fogColor: location("uFogColor"),
      particle: key.particle,
      pointSize: location("uPointSize"),
      billboard: key.billboard === true,
      softEdge: key.softEdge,
      refraction: key.refraction === true,
      frame: null,
    };
    programs.set(id, created);
    return created;
  };

  const samplerOf = (state: EffectSamplerState, owner: string): WebGLSampler => {
    const id =
      ((((state.addressU * 4 + state.addressV) * 4 + state.minFilter) * 4 + state.magFilter) * 4 +
        state.mipFilter) *
        65536 +
      state.maxAnisotropy;
    let sampler = samplers.get(id);
    if (!sampler) {
      sampler = samplerCache.samplerFor(samplerParameters(gl, state, owner));
      samplers.set(id, sampler);
    }
    return sampler;
  };

  const submit = (slot: Slot, supplied: EffectDrawContext | undefined): { draws: number } => {
    if (disposed) throw new Error("The effect renderer has been disposed");
    if (slot.stamp !== stamp) throw new Error("Prepared effect draw expired");
    const program = slot.program!;
    if (program.softEdge && !supplied?.depth)
      throw new Error("An effect that fades against scene depth needs the depth snapshot");
    if (program.refraction && !supplied?.color)
      throw new Error("A refractive effect needs the scene color snapshot");
    selectFrame(slot.frame);
    const epoch = gpuEpoch?.();
    if (epoch === undefined || epoch !== drawEpoch) deviceState.invalidate();
    drawEpoch = undefined;
    gl.useProgram(program.program);
    deviceState.apply(slot.state!, program.program, program.locations);
    if (program.frame !== slot.frame) {
      program.frame = slot.frame;
      gl.uniformMatrix4fv(program.viewProjection, false, viewProjection);
      gl.uniform4fv(program.screenParam, screenParam);
      if (program.particle || program.fog) gl.uniform3fv(program.eyePosition, eyePosition);
      if (program.fog) {
        const fog = slot.frame.fog!;
        gl.uniform1i(program.fogMode, fog.mode);
        gl.uniform4fv(program.fogRange, fog.range);
        gl.uniform4fv(program.fogHeight, fog.height);
        gl.uniform3fv(program.fogColor, fog.color);
      }
      if (program.softEdge || program.refraction) {
        gl.uniform4fv(program.systemParam, systemParam);
        gl.uniform1i(program.depthFlipY, 1);
        gl.uniform4fv(program.depthUvTransform, slot.frame.depthUvTransform ?? [1, 1, 0, 0]);
      }
      if (program.shadow) {
        for (let i = 0; i < SHADOW_UNITS.length; i++)
          gl.uniformMatrix4fv(program.shadowMatrices[i], false, shadowMatrices[i]);
        gl.uniform3fv(program.shadowColor, frameShadow!.color);
        gl.uniform1i(program.shadowCount, frameShadow!.matrices.length);
        gl.uniform1i(program.shadowEdgeHide, frameShadow!.edgeHide ? 1 : 0);
        gl.uniform1i(program.shadowSoftness, frameShadow!.softness ?? 0);
        gl.uniform1i(program.shadowMomentMode, frameShadow!.moments ? 1 : 0);
      }
    }
    gl.uniformMatrix4fv(program.world, false, slot.world);
    gl.uniform4fv(program.vertexParam0, slot.vertexParam0);
    gl.uniform4fv(program.vertexParam1, slot.vertexParam1);
    gl.uniform4fv(program.fixedParam0, slot.fixedParam0);
    if (slot.points) gl.uniform1f(program.pointSize, slot.pointSize);
    if (program.particle) gl.uniform4fv(program.particles, slot.parameters);
    else if (program.effectColor) gl.uniform4fv(program.effectColor, slot.effectColor);
    if (program.parallelLights) {
      gl.uniform3fv(
        program.parallelDirection,
        slot.parallelDirection.subarray(0, program.parallelLights * 3),
      );
      gl.uniform3fv(
        program.parallelDiffuse,
        slot.parallelDiffuse.subarray(0, program.parallelLights * 3),
      );
    }
    for (let unit = 0; unit < slot.textureCount; unit++) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, slot.textures[unit]);
      gl.bindSampler(unit, slot.samplers[unit]);
    }
    if (program.softEdge) {
      const depth = supplied!.depth!;
      gl.activeTexture(gl.TEXTURE0 + EFFECT_DEPTH_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, depth.texture);
      gl.bindSampler(EFFECT_DEPTH_UNIT, depth.sampler);
    }
    if (program.refraction) {
      gl.activeTexture(gl.TEXTURE0 + EFFECT_COLOR_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, supplied!.color!.texture);
      gl.bindSampler(EFFECT_COLOR_UNIT, supplied!.color!.sampler);
    }
    if (program.shadow)
      for (let i = 0; i < SHADOW_UNITS.length; i++) {
        gl.activeTexture(gl.TEXTURE0 + SHADOW_UNITS[i]);
        gl.bindTexture(
          gl.TEXTURE_2D,
          frameShadow!.textures[Math.min(i, frameShadow!.textures.length - 1)],
        );
        gl.bindSampler(SHADOW_UNITS[i], null);
      }
    if (program.shadow) {
      gl.activeTexture(gl.TEXTURE0 + 15);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, frameShadow!.moments ?? null);
      gl.bindSampler(15, null);
    }
    if (program.billboard) {
      gl.bindVertexArray(billboardVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
      if (slot.instanceStride > BILLBOARD_FLOATS) gl.enableVertexAttribArray(4);
      else gl.disableVertexAttribArray(4);
      for (const [location, size, offset] of [
        [0, 3, 0],
        [1, 4, 3],
        [2, 4, 11],
        [3, 4, 7],
        [4, 3, 15],
      ])
        if (location !== 4 || slot.instanceStride > BILLBOARD_FLOATS)
          gl.vertexAttribPointer(
            location,
            size,
            gl.FLOAT,
            false,
            slot.instanceStride * 4,
            slot.instanceOffset + offset * 4,
          );
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, slot.instances);
    } else if (program.particle) {
      gl.bindVertexArray(particleVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
      const stride = slot.hasBirths ? 11 * 4 : 0;
      gl.vertexAttribPointer(
        EFFECT_ATTRIBUTES.tangent,
        4,
        gl.FLOAT,
        false,
        stride,
        slot.instanceOffset,
      );
      if (slot.hasBirths) {
        gl.enableVertexAttribArray(EFFECT_ATTRIBUTES.birthPosition);
        gl.enableVertexAttribArray(EFFECT_ATTRIBUTES.birthRotation);
        gl.vertexAttribPointer(
          EFFECT_ATTRIBUTES.birthPosition,
          3,
          gl.FLOAT,
          false,
          stride,
          slot.instanceOffset + 16,
        );
        gl.vertexAttribPointer(
          EFFECT_ATTRIBUTES.birthRotation,
          4,
          gl.FLOAT,
          false,
          stride,
          slot.instanceOffset + 28,
        );
      } else {
        gl.disableVertexAttribArray(EFFECT_ATTRIBUTES.birthPosition);
        gl.disableVertexAttribArray(EFFECT_ATTRIBUTES.birthRotation);
      }
      gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_BYTE, 0, slot.instances);
    } else {
      gl.bindVertexArray(simpleVao);
      gl.drawElements(
        slot.points ? gl.POINTS : slot.lines ? gl.LINES : gl.TRIANGLES,
        slot.indexCount,
        gl.UNSIGNED_INT,
        slot.indexOffset,
      );
    }
    for (let unit = 0; unit < slot.textureCount; unit++) gl.bindSampler(unit, null);
    if (program.softEdge) gl.bindSampler(EFFECT_DEPTH_UNIT, null);
    if (program.refraction) gl.bindSampler(EFFECT_COLOR_UNIT, null);
    gl.bindVertexArray(null);
    drawEpoch = epoch;
    return ONE_DRAW;
  };

  const slotAt = (index: number): Slot => {
    let slot = slots[index];
    if (!slot) {
      const created: Slot = {
        source: drawSource,
        lines: false,
        points: false,
        pointSize: 1,
        frame: null as unknown as EffectFrame,
        pass: 0,
        key: 0,
        depth: 0,
        requiresDepthSnapshot: false,
        requiresColorSnapshot: false,
        draw: (supplied) => submit(created, supplied),
        stamp: 0,
        program: null,
        state: null,
        textures: [null, null, null],
        samplers: [null, null, null],
        textureCount: 0,
        world: new Float32Array(16),
        vertexParam0: new Float32Array(4),
        vertexParam1: new Float32Array(4),
        fixedParam0: new Float32Array(4),
        effectColor: new Float32Array(4),
        parallelDirection: new Float32Array(9),
        parallelDiffuse: new Float32Array(9),
        parameters: new Float32Array(PARTICLE_REGISTERS),
        indexOffset: 0,
        indexCount: 0,
        instanceOffset: 0,
        instances: 0,
        instanceStride: 0,
        hasBirths: false,
      };
      slots[index] = slot = created;
    }
    return slot;
  };

  const transposeInto = (source: ArrayLike<number>, target: Float32Array, what: string): void => {
    if (source.length !== 16) throw new RangeError(`${what} must have sixteen entries`);
    for (let i = 0; i < 16; i++) target[(i & 3) * 4 + (i >> 2)] = source[i];
  };

  const bindTextures = (slot: Slot, packet: EffectPacket): void => {
    const count = packet.bindings.length;
    if (count > MAX_TEXTURES || (packet.kind === "particle" && count === 0))
      throw new RangeError("An effect draw has an unsupported texture count");
    for (let unit = 0; unit < count; unit++) {
      const binding = packet.bindings[unit];
      const texture = textures.texture(packet.resourceId, binding.resourceIndex);
      if (!texture)
        throw new RangeError(
          `Effect texture ${packet.resourceId}:${binding.resourceIndex} is not loaded`,
        );
      if (binding.sampler.maxMipLevel !== 0)
        throw new RangeError("Effect textures are sampled from their first level");
      slot.textures[unit] = texture;
      slot.samplers[unit] = samplerOf(
        binding.sampler,
        `Effect texture ${packet.resourceId}:${binding.resourceIndex}`,
      );
    }
    slot.textureCount = count;
  };

  const growVertices = (floats: number): void => {
    if (floats <= vertexScratch.length) return;
    const next = new Float32Array(Math.max(floats, vertexScratch.length * 2));
    next.set(vertexScratch.subarray(0, vertexFloats));
    vertexScratch = next;
  };
  const growIndices = (count: number): void => {
    if (count <= indexScratch.length) return;
    const next = new Uint32Array(Math.max(count, indexScratch.length * 2));
    next.set(indexScratch.subarray(0, indexCount));
    indexScratch = next;
  };
  const growInstances = (floats: number): void => {
    if (floats <= instanceScratch.length) return;
    const next = new Float32Array(Math.max(floats, instanceScratch.length * 2));
    next.set(instanceScratch.subarray(0, instanceFloats));
    instanceScratch = next;
  };

  const preparePrimitive = (slot: Slot, packet: EffectPrimitivePacket): EffectProgramKey => {
    slot.lines = packet.topology === "lines";
    slot.points = packet.topology === "points";
    if (slot.points && !(Number.isFinite(packet.pointSize) && packet.pointSize! > 0))
      throw new RangeError("Effect points need a positive finite pixel diameter");
    slot.pointSize = slot.points ? packet.pointSize! : 1;
    const { aPosition, aColor, aTexCoord, aTexCoord1, aNormal } = packet.mesh.attributes;
    const positions = aPosition.values;
    const vertices = positions.length / 3;
    const separateUv = packet.layout === 5;
    const normal = packet.layout === 10;
    if (
      !Number.isInteger(vertices) ||
      aColor.values.length !== vertices * 4 ||
      aTexCoord.values.length !== vertices * 2 ||
      (separateUv && aTexCoord1?.values.length !== vertices * 2) ||
      (normal && (aNormal?.values.length !== vertices * 3 || !packet.normalLights))
    )
      throw new RangeError("Effect primitive streams disagree on their vertex count");
    const lights = normal ? packet.normalLights! : [];
    if (lights.length > 3)
      throw new RangeError("Effect primitive accepts at most three parallel lights");
    for (let i = 0; i < lights.length; i++) {
      slot.parallelDirection.set(lights[i].direction.slice(0, 3), i * 3);
      slot.parallelDiffuse.set(lights[i].diffuse.slice(0, 3), i * 3);
    }
    const colors = aColor.values;
    let uniformColor = vertices > 0;
    for (let i = 4; uniformColor && i < colors.length; i++)
      if (!Object.is(colors[i], colors[i & 3])) uniformColor = false;
    if (uniformColor) for (let i = 0; i < 4; i++) slot.effectColor[i] = colors[i];

    const base = vertexFloats / VERTEX_FLOATS;
    growVertices(vertexFloats + vertices * VERTEX_FLOATS);
    const uv = aTexCoord.values;
    const uv1 = separateUv ? aTexCoord1!.values : null;
    let at = vertexFloats;
    for (let i = 0; i < vertices; i++) {
      vertexScratch[at] = positions[i * 3];
      vertexScratch[at + 1] = positions[i * 3 + 1];
      vertexScratch[at + 2] = positions[i * 3 + 2];
      vertexScratch[at + 3] = colors[i * 4];
      vertexScratch[at + 4] = colors[i * 4 + 1];
      vertexScratch[at + 5] = colors[i * 4 + 2];
      vertexScratch[at + 6] = colors[i * 4 + 3];
      vertexScratch[at + 7] = uv[i * 2];
      vertexScratch[at + 8] = uv[i * 2 + 1];
      vertexScratch[at + 9] = uv1 ? uv1[i * 2] : 0;
      vertexScratch[at + 10] = uv1 ? uv1[i * 2 + 1] : 0;
      vertexScratch[at + 11] = normal ? aNormal!.values[i * 3] : 0;
      vertexScratch[at + 12] = normal ? aNormal!.values[i * 3 + 1] : 0;
      vertexScratch[at + 13] = normal ? aNormal!.values[i * 3 + 2] : 0;
      at += VERTEX_FLOATS;
    }
    vertexFloats = at;

    const indices = packet.mesh.indices;
    growIndices(indexCount + indices.length);
    slot.indexOffset = indexCount * 4;
    slot.indexCount = indices.length;
    for (let i = 0; i < indices.length; i++) indexScratch[indexCount + i] = base + indices[i];
    indexCount += indices.length;

    return preparePrimitiveMaterial(slot, packet, separateUv, uniformColor, lights.length);
  };

  const preparePrimitiveMaterial = (
    slot: Slot,
    packet: EffectPrimitivePacket | EffectBillboardPacket,
    separateUv: boolean,
    uniformColor: boolean,
    lights: number,
  ): EffectProgramKey => {
    const material = packet.material;
    if (material.context.length !== CONTEXT_BYTES)
      throw new RangeError("An effect primitive carries 112 material bytes");
    context.set(material.context as ArrayLike<number>);
    slot.state = packet.state ?? primitiveEffectState(contextWords[0], contextWords[24]);
    slot.vertexParam0[0] = contextFloats[7];
    slot.vertexParam0[1] = contextFloats[8];
    slot.vertexParam0[2] = contextFloats[15];
    slot.vertexParam0[3] = contextFloats[16];
    slot.vertexParam1[0] = contextFloats[17];
    slot.vertexParam1[1] = contextFloats[18];
    slot.vertexParam1[2] = contextFloats[19];
    slot.vertexParam1[3] = contextFloats[20];
    for (let i = 0; i < 4; i++) slot.fixedParam0[i] = material.fixedParam0[i];
    slot.depth = frameDepth!.primitive(packet.order.sortPosition, packet.order.sortDistanceOffset);
    return {
      particle: false,
      billboard: packet.kind === "billboard",
      points: packet.kind === "simple" && packet.topology === "points",
      softEdge: material.environmentIndex === 1,
      refraction: material.environmentIndex === 2 || material.environmentIndex === 3,
      textures: packet.bindings.length,
      blend0: (material.materialKey[0] >>> 26) & 15,
      blend1: material.materialKey[1] & 7,
      separateUv,
      uniformColor,
      parallelLights: lights,
      shadow: packet.shadow === true && (contextWords[24] & 8) !== 0,
      fog: !!slot.frame.fog && (contextWords[24] & 0x4000) === 0,
    };
  };

  const prepareBillboard = (slot: Slot, packet: EffectBillboardPacket): EffectProgramKey => {
    const lights = packet.normalLights ?? [];
    if (lights.length > 3)
      throw new RangeError("Effect billboard accepts at most three parallel lights");
    for (let i = 0; i < lights.length; i++) {
      slot.parallelDirection.set(lights[i].direction.slice(0, 3), i * 3);
      slot.parallelDiffuse.set(lights[i].diffuse.slice(0, 3), i * 3);
    }
    slot.instanceStride = packet.normalLights ? BILLBOARD_FLOATS + 3 : BILLBOARD_FLOATS;
    const count = packet.instances.length / slot.instanceStride;
    if (!Number.isInteger(count))
      throw new RangeError("Billboard instances disagree with their vertex layout");
    growInstances(instanceFloats + packet.instances.length);
    slot.instanceOffset = instanceFloats * 4;
    slot.instances = count;
    instanceScratch.set(packet.instances, instanceFloats);
    instanceFloats += packet.instances.length;
    return preparePrimitiveMaterial(slot, packet, false, false, lights.length);
  };

  const prepareParticle = (slot: Slot, packet: EffectParticlePacket): EffectProgramKey => {
    if (packet.parameters.length !== PARTICLE_REGISTERS)
      throw new RangeError("A particle draw carries 59 parameter vectors");
    const tangents = packet.mesh.attributes.aTangent.values;
    const range = packet.range;
    const first = range ? range.firstIndex / 6 : 0;
    const count = range ? range.count / 6 : packet.mesh.indices.length / 6;
    if (!Number.isInteger(first) || !Number.isInteger(count) || first < 0 || count < 0)
      throw new RangeError("A particle range covers whole particles");
    if ((first + count) * 16 > tangents.length)
      throw new RangeError("A particle range lies outside its pool");
    const births = packet.births;
    if (packet.parameters[2] !== 0 && !births)
      throw new RangeError("A particle draw with a fixed coordinate mode needs birth transforms");
    if (births && births.length !== count * 7)
      throw new RangeError("A particle draw needs one birth transform per instance");
    growInstances(instanceFloats + count * (births ? 11 : 4));
    slot.instanceOffset = instanceFloats * 4;
    slot.instances = count;
    slot.hasBirths = !!births;
    for (let i = 0; i < count; i++) {
      const from = (first + i) * 16;
      instanceScratch[instanceFloats] = tangents[from];
      instanceScratch[instanceFloats + 1] = tangents[from + 1];
      instanceScratch[instanceFloats + 2] = tangents[from + 2];
      instanceScratch[instanceFloats + 3] = tangents[from + 3];
      instanceFloats += 4;
      if (births) {
        for (let component = 0; component < 7; component++)
          instanceScratch[instanceFloats++] = births[i * 7 + component];
      }
    }
    slot.state = packet.state ?? particleEffectState(packet.sourceFlags);
    slot.parameters.set(packet.parameters as ArrayLike<number>);
    slot.vertexParam0.fill(0);
    slot.vertexParam1.fill(0);
    for (let i = 0; i < 4; i++) slot.fixedParam0[i] = packet.material.fixedParam0[i];
    for (let i = 0; i < 12; i++) world12[i] = packet.worldMatrix[i];
    slot.depth = frameDepth!.model(world12, packet.order.sortDistanceOffset);
    return {
      particle: true,
      softEdge: packet.material.softEdge === true,
      refraction: packet.material.refraction === true,
      textures: 1,
      blend0: 0,
      blend1: 0,
      separateUv: false,
      uniformColor: false,
      parallelLights: 0,
      shadow: packet.shadow === true,
      fog: !!slot.frame.fog && packet.material.fog === true,
    };
  };

  const upload = (): void => {
    gl.bindVertexArray(simpleVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    if (vertexFloats > vertexCapacity) {
      vertexCapacity = vertexScratch.length;
      gl.bufferData(gl.ARRAY_BUFFER, vertexCapacity * 4, gl.DYNAMIC_DRAW);
    }
    if (vertexFloats > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexScratch, 0, vertexFloats);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    if (indexCount > indexCapacity) {
      indexCapacity = indexScratch.length;
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexCapacity * 4, gl.DYNAMIC_DRAW);
    }
    if (indexCount > 0) gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indexScratch, 0, indexCount);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    if (instanceFloats > instanceCapacity) {
      instanceCapacity = instanceScratch.length;
      gl.bufferData(gl.ARRAY_BUFFER, instanceCapacity * 4, gl.DYNAMIC_DRAW);
    }
    if (instanceFloats > 0)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceScratch, 0, instanceFloats);
  };

  const selectFrame = (frame: EffectFrame): void => {
    frameDepth = frame.depth;
    frameShadow = frame.shadow;
    if (frameShadow) {
      if (
        frameShadow.matrices.length < 1 ||
        frameShadow.matrices.length > 3 ||
        frameShadow.textures.length !== frameShadow.matrices.length
      )
        throw new RangeError("A frame shadow needs one to three matching maps and matrices");
      for (let i = 0; i < SHADOW_UNITS.length; i++)
        transposeInto(
          frameShadow.matrices[Math.min(i, frameShadow.matrices.length - 1)],
          shadowMatrices[i],
          "The shadow matrix",
        );
    }
    transposeInto(frame.viewProjection, viewProjection, "The view-projection");
    screenParam[0] = frame.viewport.width * 0.5;
    screenParam[1] = frame.viewport.height * 0.5;
    if (frame.projection.length !== 16)
      throw new RangeError("The projection must have sixteen entries");
    systemParam[2] = frame.projection[10];
    systemParam[3] = frame.projection[11];
    for (let i = 0; i < 3; i++) eyePosition[i] = frame.eyePosition[i];
  };

  return {
    prepare(packets, frame) {
      if (disposed) throw new Error("The effect renderer has been disposed");
      stamp++;
      selectFrame(frame);
      for (const program of programs.values()) program.frame = null;
      const mask = frame.sceneMask ?? 1;
      vertexFloats = 0;
      indexCount = 0;
      instanceFloats = 0;
      entries.length = 0;
      for (const packet of packets) {
        if (((packet.sceneMask ?? 1) & mask) === 0) continue;
        const slot = slotAt(entries.length);
        slot.frame = packet.frame ?? frame;
        selectFrame(slot.frame);
        slot.stamp = stamp;
        slot.points = false;
        bindTextures(slot, packet);
        const key =
          packet.kind === "particle"
            ? prepareParticle(slot, packet)
            : packet.kind === "billboard"
              ? prepareBillboard(slot, packet)
              : preparePrimitive(slot, packet);
        if (key.shadow && !frameShadow)
          throw new RangeError("A shadow-receiving effect needs its frame shadow maps");
        if (slot.frame.mirror) slot.state = mirrorDeviceState(slot.state!);
        slot.program = programFor(key);
        transposeInto(packet.worldMatrix, slot.world, "A world matrix");
        const order = packet.order;
        if (!Number.isInteger(order.key) || order.key < 0 || order.key > 0xffff)
          throw new RangeError("Draw key must be a u16");
        if (!Number.isFinite(slot.depth) || Math.fround(slot.depth) !== slot.depth)
          throw new RangeError("Draw depth must be a finite float32");
        slot.pass = order.pass.passIndex;
        slot.key = order.key;
        slot.requiresDepthSnapshot = key.softEdge;
        slot.requiresColorSnapshot = key.refraction === true;
        entries.push(slot);
      }
      upload();
      return entries;
    },
    warm(keys) {
      for (const key of keys) programFor(key);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const program of programs.values()) gl.deleteProgram(program.program);
      programs.clear();
      samplerCache.dispose();
      samplers.clear();
      for (const buffer of [vertexBuffer, indexBuffer, instanceBuffer, quadBuffer])
        gl.deleteBuffer(buffer);
      gl.deleteVertexArray(simpleVao);
      gl.deleteVertexArray(particleVao);
      gl.deleteVertexArray(billboardVao);
      slots.length = 0;
      entries.length = 0;
    },
  };
}
