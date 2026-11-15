/**
 * Band drawing: the HOLD and SLIDE band strips, drawn from the shared band vertex buffer.
 *
 * A band is not instanced. Its geometry is written per record per frame as world-space vertices, so
 * one draw covers the vertices of one band, and what varies between bands is the image it samples and
 * the fixed-function state it draws with. The pack carries one profile per band kind
 * (`note/band/hold`, `note/band/slide/<row>/<texture>`); each becomes a ready-to-draw binding at load
 * time, so a frame only binds, uploads and draws.
 */

import { HOLD_VERTEX_BYTES } from "../holdBand";
import type { Pack } from "../../assets/packFormat";
import {
  assertDeviceUniforms,
  compileDeviceState,
  DEVICE_UNIFORMS,
  type DeviceState,
  type DeviceStateSet,
  type PackedStateCommand,
} from "../../gpu/deviceState";
import { splitShader } from "./notePrograms";
import {
  applyPackedTextures,
  applyProgramUniforms,
  createUniformScratch,
  resolveUniforms,
  type PackedUniform,
  type AppliedUniforms,
  type UniformLocations,
} from "../../gpu/uniforms";
import { createSamplerCache, samplerParameters } from "../../gpu/samplers";

const POSITION_OFFSET = 0;
const COLOUR_OFFSET = 12;
const UV_OFFSET = 16;
/** Uniform the band's fragment stage multiplies its colour by. */
const SCALAR_UNIFORM = "uScalar1d4";

/** One band kind, ready to draw. */
export interface BandBinding {
  /** Pack entry name, e.g. `note/band/hold`. */
  readonly name: string;
  /** Draw pass the band belongs to. */
  readonly pass: number;
  /** Layer the band's sort key carries. */
  readonly layer: number;
  readonly program: WebGLProgram;
  readonly locations: UniformLocations;
  readonly uniforms: Readonly<Record<string, PackedUniform>>;
  readonly state: DeviceStateSet;
  /** The image the band samples, by name. */
  readonly image: string;
  /** The sampler the band's image is read through. */
  readonly sampler: WebGLSampler;
}

export interface BandRenderer {
  /** Every band kind in the pack, by entry name. */
  readonly bindings: ReadonlyMap<string, BandBinding>;
  /**
   * Draws `vertices` vertices of the band buffer starting at vertex `first`, with the program, state
   * and image of the band kind `name`.
   *
   * @throws RangeError when `name` is not a band kind the pack carries.
   */
  draw(
    name: string,
    first: number,
    vertices: number,
    scalar: number,
    viewProjection: Float32Array | null,
  ): void;
  dispose(): void;
}

export interface BandRendererInput {
  gl: WebGL2RenderingContext;
  pack: Pack;
  state: DeviceState;
  /** Buffer the band vertices live in. */
  vertexBuffer: WebGLBuffer;
  texturesByName?: ReadonlyMap<string, WebGLTexture>;
  /** Compiles and links one program. */
  compile(vertex: string, fragment: string): WebGLProgram;
  /** Uploads the view-projection matrix to `program`, whose uniform `locations` are given. */
  uploadViewProjection(
    program: WebGLProgram,
    locations: UniformLocations,
    matrix: Float32Array,
  ): void;
  /** The packed block each program last received, shared with every other user of them. */
  programUniforms: AppliedUniforms;
}

/** The band entry fields this module reads; the rest of `meta` belongs to the packer. */
interface BandMeta {
  program?: unknown;
  texture?: unknown;
  uniforms?: unknown;
  commands?: unknown;
  layer?: unknown;
  pass?: unknown;
  sampler?: unknown;
}

/**
 * Builds the band renderer.
 *
 * All band kinds share one program layout, so one vertex array serves them; every program's
 * attribute slots are checked against the first, because a program that placed an attribute
 * elsewhere would read its neighbour's bytes.
 *
 * The colour attribute reads the vertex's colour word as four normalised bytes. The word is ARGB, so
 * its bytes in memory are B, G, R, A and the shader receives red and blue swapped. The two band
 * colours are white and grey, where the swap changes nothing; a colour with unequal red and blue
 * would need the vertices converted when they are written.
 *
 * Bands whose recorded sampler states are equal share one sampler object. A draw binds its band's
 * sampler for the draw only, so no later draw on unit 0 inherits it.
 *
 * @throws RangeError when a band entry lacks a program, an image, a sampler state the renderer can
 *   reproduce or compiled state, or a program lost a vertex attribute.
 */
export function createBandRenderer(input: BandRendererInput): BandRenderer {
  const { gl, pack, state, programUniforms } = input;
  const bindings = new Map<string, BandBinding>();
  const programs = new Map<string, WebGLProgram>();
  const scratch = createUniformScratch();
  const samplers = createSamplerCache(gl);
  const imageUnits: readonly number[] = [0];
  const noTextures: ReadonlyMap<number, WebGLTexture> = new Map();
  const imageNames = new Map<string, readonly string[]>();
  const imageSamplers = new Map<WebGLSampler | null, readonly (WebGLSampler | null)[]>();
  const vertexArray = gl.createVertexArray();
  if (!vertexArray) throw new Error("A vertex array object is required for the band renderer");

  try {
    const programFor = (programName: string): WebGLProgram => {
      const known = programs.get(programName);
      if (known) return known;
      const entry = pack.entries.get(`shader/${programName}`);
      if (!entry || entry.kind !== "shader")
        throw new RangeError(`Band program ${programName} is not in the pack`);
      const { vertex, fragment } = splitShader(
        pack.bytes.subarray(entry.offset, entry.offset + entry.length),
      );
      const program = input.compile(vertex, fragment);
      programs.set(programName, program);
      return program;
    };

    for (const [name, entry] of pack.entries) {
      if (entry.kind !== "table" || !name.startsWith("note/band/")) continue;
      const meta = entry.meta as BandMeta;
      if (typeof meta.program !== "string") throw new RangeError(`Band ${name} names no program`);
      if (typeof meta.texture !== "string") throw new RangeError(`Band ${name} names no image`);
      if (!Array.isArray(meta.commands))
        throw new RangeError(`Band ${name} carries no compiled render state; rebuild the pack`);
      const program = programFor(meta.program);
      const uniforms = (meta.uniforms ?? {}) as Record<string, PackedUniform>;
      const locations = resolveUniforms(gl, program, uniforms, [
        "uViewProjection",
        SCALAR_UNIFORM,
        ...DEVICE_UNIFORMS,
      ]);
      const compiled = compileDeviceState(meta.commands as readonly PackedStateCommand[], name);
      assertDeviceUniforms(compiled, locations, name);
      if (!Number.isInteger(meta.pass) || !Number.isInteger(meta.layer))
        throw new RangeError(`Band ${name} records no draw pass or layer; rebuild the pack`);
      const sampler = samplers.samplerFor(samplerParameters(gl, meta.sampler, `Band ${name}`));
      bindings.set(name, {
        name,
        pass: meta.pass as number,
        layer: meta.layer as number,
        program,
        locations,
        uniforms,
        state: compiled,
        image: meta.texture,
        sampler,
      });
    }

    let slots: readonly number[] | null = null;
    for (const [programName, program] of programs) {
      const found = (["aPosition", "aColor", "aUv0"] as const).map((attribute) =>
        gl.getAttribLocation(program, attribute),
      );
      if (found.some((slot) => slot < 0))
        throw new RangeError(`Band program ${programName} lost a vertex attribute`);
      if (slots && found.some((slot, i) => slot !== slots![i]))
        throw new RangeError(`Band program ${programName} places its attributes differently`);
      slots ??= found;
    }
    if (slots) {
      gl.bindVertexArray(vertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, input.vertexBuffer);
      gl.enableVertexAttribArray(slots[0]);
      gl.vertexAttribPointer(slots[0], 3, gl.FLOAT, false, HOLD_VERTEX_BYTES, POSITION_OFFSET);
      gl.enableVertexAttribArray(slots[1]);
      gl.vertexAttribPointer(slots[1], 4, gl.UNSIGNED_BYTE, true, HOLD_VERTEX_BYTES, COLOUR_OFFSET);
      gl.enableVertexAttribArray(slots[2]);
      gl.vertexAttribPointer(slots[2], 2, gl.FLOAT, false, HOLD_VERTEX_BYTES, UV_OFFSET);
      gl.bindVertexArray(null);
    }

    return {
      bindings,
      draw(name, first, vertices, scalar, viewProjection) {
        const binding = bindings.get(name);
        if (!binding) throw new RangeError(`The pack carries no band ${name}`);
        if (vertices === 0) return;
        gl.useProgram(binding.program);
        state.apply(binding.state, binding.program, binding.locations);
        if (viewProjection)
          input.uploadViewProjection(binding.program, binding.locations, viewProjection);
        const scalarLocation = binding.locations.get(SCALAR_UNIFORM) ?? null;
        if (scalarLocation !== null) gl.uniform1f(scalarLocation, scalar);
        applyProgramUniforms(
          gl,
          programUniforms,
          binding.program,
          binding.locations,
          binding.uniforms,
          scratch,
        );
        let names = imageNames.get(binding.image);
        if (!names) imageNames.set(binding.image, (names = [binding.image]));
        let slotSamplers = imageSamplers.get(binding.sampler);
        if (!slotSamplers) imageSamplers.set(binding.sampler, (slotSamplers = [binding.sampler]));
        applyPackedTextures(
          gl,
          binding.program,
          imageUnits,
          noTextures,
          names,
          input.texturesByName,
          slotSamplers,
        );
        gl.bindVertexArray(vertexArray);
        gl.drawArrays(gl.TRIANGLES, first, vertices);
        gl.bindSampler(0, null);
      },
      dispose() {
        gl.deleteVertexArray(vertexArray);
        samplers.dispose();
      },
    };
  } catch (error) {
    gl.deleteVertexArray(vertexArray);
    samplers.dispose();
    gl.bindVertexArray(null);
    throw error;
  }
}
