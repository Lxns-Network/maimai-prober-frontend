import { compileProgram } from "../../assets/shaderCompile";
import { liveNodes, type StageNode, type StageScene } from "../runtime";
import { nthElement, type TextureElement } from "../elements";
import {
  fillPositions,
  stagePrimitive,
  stagePrimitiveLive,
  type StagePrimitive,
} from "../nodes/primitive";
import {
  SCREEN_PARTICLE_TYPE,
  screenParticleInstances,
  starParticleDrawable,
  starParticleState,
} from "../nodes/starParticle";
import { stageDrawKey } from "../order";
import type { StagePack } from "../pack";
import type { StageDrawCamera } from "../camera/scopes";
import { stageViewportRegion, withStageViewport } from "./stageViewport";

const f = Math.fround;
const ROLES = ["base", "field"] as const;
const TEXTURE_ELEMENT = 300;
const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const BACK_PASS = 4;
const FRONT_PASS = 24;
const FRONT_KEY = 0x8000;
const FLOATS_PER_VERTEX = 9;
const COLOR = Array.from({ length: 256 }, (_, byte) => f(byte * f(1 / 255)));

/** Blend rows a node selects: enable, source factor, destination factor, operation, separate alpha. */
const BLEND_ROWS: readonly (readonly number[])[] = [
  [0, 4, 5, 0, 0],
  [0, 4, 5, 0, 1],
  [1, 4, 5, 0, 1],
  [1, 4, 5, 0, 0],
  [1, 4, 1, 0, 0],
  [1, 4, 1, 2, 0],
  [1, 0, 2, 0, 0],
  [1, 7, 0, 0, 0],
];

export const STAGE_PRIMITIVE_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec4 uv;
layout(location=2) in vec4 color;
layout(location=3) in vec4 extent;
uniform bool screenInstance;
uniform vec2 screenSize;
uniform vec2 screenOffset;
uniform vec2 uvOffset;
out vec2 vUv;
out vec4 vColor;
void main(){
  vec2 p=position.xy;
  vec2 tc=uv.xy;
  if(screenInstance){
    const int corners[6]=int[6](0,1,2,1,3,2);
    int corner=corners[gl_VertexID];
    vec2 offsets[4]=vec2[4](vec2(-extent.x,-extent.w),vec2(-extent.y,extent.z),
      vec2(extent.y,-extent.z),vec2(extent.x,extent.w));
    p+=offsets[corner];
    tc=vec2(corner<2?uv.x:uv.z,(corner&1)==0?uv.y:uv.w);
  }
  p+=screenOffset;
  gl_Position=vec4(p.x*2.0/screenSize.x-1.0,1.0-p.y*2.0/screenSize.y,-1.0,1.0);
  vUv=tc+uvOffset;
  vColor=color;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D image;
uniform bool hasImage;
in vec2 vUv;
in vec4 vColor;
out vec4 outputColor;
void main(){
  vec4 c=(hasImage?texture(image,vUv):vec4(1.0))*vColor;
  if(any(greaterThan(c,vec4(999.9))))c=vec4(0.0);
  outputColor=c;
}`;

/** One prepared 2D draw, ordered with the scene's other draws by pass, key and depth. */
export interface StagePrimitiveEntry {
  readonly node: StageNode;
  readonly pass: number;
  readonly key: number;
  readonly depth: number;
  draw(): number;
}

export interface StagePrimitiveFrame {
  readonly cameraScopes?: ReadonlyMap<StageNode, StageDrawCamera>;
  readonly scene: StageScene;
  readonly role: (typeof ROLES)[number];
}

export interface StagePrimitives {
  /** Prepares the frame's 2D primitive and fill draws; nodes that cannot be drawn are listed in `skipped`. */
  prepare(
    frame: StagePrimitiveFrame,
    viewport: { readonly width: number; readonly height: number },
    skipped: Map<string, string>,
    nodes?: readonly StageNode[],
  ): readonly StagePrimitiveEntry[];
  dispose(): void;
}

/** The blend factors, operation and write masks a node's record flags and blend row select. */
export interface StagePrimitiveState {
  readonly blend: boolean;
  readonly source: number;
  readonly destination: number;
  readonly operation: number;
  readonly depthTest: boolean;
  readonly depthWrite: boolean;
  readonly colorMask: number;
}

/**
 * The draw state of a 2D node from its header flags and blend row.
 *
 * @throws RangeError for a row that uses separate alpha factors.
 */
export function stagePrimitiveState(flags: number, row: number): StagePrimitiveState {
  const entry = BLEND_ROWS[Math.min(Math.max(row, 0), 7)];
  if (entry[4] !== 0) throw new RangeError(`blend row ${row} uses separate alpha factors`);
  let write = 0xf;
  if (flags & 4) write = 7;
  else if (flags & 0x80) write = 8;
  if ((flags & 0x84) === 0x84) write = 0;
  return {
    blend: entry[0] !== 0,
    source: entry[1],
    destination: entry[2],
    operation: entry[3],
    depthTest: (flags & 0x20) === 0,
    depthWrite: (flags & 0x10) === 0,
    colorMask: write,
  };
}

/** The pass and 16-bit order key of a 2D node's draw: back before the filters below the 2D key bit, front above it. */
export function stagePrimitiveOrder(node: StageNode): { pass: number; key: number } {
  const key = stageDrawKey(node);
  return { pass: key < FRONT_KEY ? BACK_PASS : FRONT_PASS, key };
}

/** The texture resource ordinal a texture element currently selects, or null. */
function selectedOrdinal(node: StageNode, element: TextureElement): number | null {
  const g = node.scene.graph;
  const pairs = g.pointer(element.record.offset + 8);
  if (pairs === null || element.texture >= element.textures) return null;
  return g.u32(pairs + element.texture * 8);
}

export function createStagePrimitives(
  gl: WebGL2RenderingContext,
  pack: StagePack,
  textures: ReadonlyMap<string, WebGLTexture>,
): StagePrimitives {
  const program = compileProgram(gl, {
    name: "Stage primitive",
    vertex: STAGE_PRIMITIVE_VERTEX,
    fragment: FRAGMENT,
  });
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const screenSize = uniform("screenSize");
  const screenOffset = uniform("screenOffset");
  const uvOffset = uniform("uvOffset");
  const image = uniform("image");
  const hasImage = uniform("hasImage");
  const screenInstance = uniform("screenInstance");
  const vao = gl.createVertexArray()!;
  const buffer = gl.createBuffer()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const stride = FLOATS_PER_VERTEX * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 20);
  const particleVao = gl.createVertexArray()!;
  gl.bindVertexArray(particleVao);
  for (const [location, count, offset] of [
    [0, 3, 0],
    [1, 4, 44],
    [2, 4, 12],
    [3, 4, 28],
  ]) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, count, gl.FLOAT, false, 60, offset);
    gl.vertexAttribDivisor(location, 1);
  }
  gl.bindVertexArray(null);
  const samplers = new Map<number, WebGLSampler>();
  const samplerFor = (wrapU: number, wrapV: number, min: number, mag: number) => {
    const key = (wrapU << 3) | (wrapV << 2) | (min << 1) | mag;
    let sampler = samplers.get(key);
    if (!sampler) {
      sampler = gl.createSampler()!;
      gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, wrapU ? gl.CLAMP_TO_EDGE : gl.REPEAT);
      gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, wrapV ? gl.CLAMP_TO_EDGE : gl.REPEAT);
      gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, min ? gl.LINEAR : gl.NEAREST);
      gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, mag ? gl.LINEAR : gl.NEAREST);
      samplers.set(key, sampler);
    }
    return sampler;
  };
  const factors = [
    gl.ZERO,
    gl.ONE,
    gl.SRC_COLOR,
    gl.ONE_MINUS_SRC_COLOR,
    gl.SRC_ALPHA,
    gl.ONE_MINUS_SRC_ALPHA,
    gl.DST_COLOR,
    gl.ONE_MINUS_DST_COLOR,
  ];
  const operations = [gl.FUNC_ADD, gl.FUNC_SUBTRACT, gl.FUNC_REVERSE_SUBTRACT];
  const data = new Float32Array(6 * FLOATS_PER_VERTEX);
  const fillGeometry = new Float32Array(18);

  return {
    prepare(frame, viewport, skipped, nodes = liveNodes(frame.scene)) {
      const out: StagePrimitiveEntry[] = [];
      const role = frame.role;
      for (const node of nodes) {
        if (frame.cameraScopes && !frame.cameraScopes.has(node)) continue;
        const primitive = stagePrimitive(node);
        const particles =
          node.record?.type === SCREEN_PARTICLE_TYPE && starParticleDrawable(node)
            ? starParticleState(node)
            : null;
        if (primitive ? !stagePrimitiveLive(node) : !particles || particles.liveHead < 0) continue;
        const where = `${particles ? "particle" : "primitive"}@${node.record!.offset}`;
        const texture = nthElement<TextureElement>(node, TEXTURE_ELEMENT, 0)!;
        let handle: WebGLTexture | null = null;
        if (texture.textures !== 0) {
          const ordinal = selectedOrdinal(node, texture);
          const id = ordinal === null ? null : pack.texture(role, ordinal);
          const loaded = id === null ? undefined : textures.get(id);
          if (!loaded) {
            skipped.set(where, `texture resource ${ordinal} is not loaded`);
            continue;
          }
          handle = loaded;
        }
        let state: StagePrimitiveState;
        try {
          state = stagePrimitiveState(
            node.record!.flags,
            Math.min(Math.max(node.scene.graph.i32(node.record!.offset + 12), 0), 7),
          );
        } catch (error) {
          skipped.set(where, (error as Error).message);
          continue;
        }
        const g = node.scene.graph;
        const parameters = g.pointer(texture.record.offset + 0x14);
        if (parameters === null) {
          skipped.set(where, "texture element without parameters");
          continue;
        }
        const sampler = samplerFor(
          g.u32(parameters) !== 0 ? 1 : 0,
          g.u32(parameters + 4) !== 0 ? 1 : 0,
          g.u32(parameters + 12) !== 0 ? 1 : 0,
          g.u32(parameters + 20) !== 0 ? 1 : 0,
        );
        const order = stagePrimitiveOrder(node);
        const fill = primitive?.kind === "fill";
        const instances = particles ? screenParticleInstances(node, particles) : null;
        const camera = frame.cameraScopes?.get(node);
        const [, , width, height] = stageViewportRegion(
          camera?.viewport,
          frame.scene.options.viewport,
          viewport.width,
          viewport.height,
        );
        const drawViewport = { width, height };
        out.push({
          node,
          ...order,
          depth: 0,
          draw: () =>
            withStageViewport(gl, camera?.viewport, frame.scene.options.viewport, () =>
              instances
                ? submit(
                    instances,
                    handle,
                    sampler,
                    state,
                    [DESIGN_WIDTH, DESIGN_HEIGHT],
                    texture.offset,
                    // Two wrapper/shader half-pixel shifts precede the target raster-center conversion.
                    [-1 + 960 / width, -1 + 540 / height],
                    true,
                  )
                : drawPrimitive(
                    primitive!,
                    handle,
                    sampler,
                    state,
                    fill ? [width, height] : [DESIGN_WIDTH, DESIGN_HEIGHT],
                    [texture.offset[0], texture.offset[1]],
                    fill ? fillPositions(width, height, fillGeometry) : primitive!.positions,
                    drawViewport,
                  ),
            ),
        });
      }
      return out;
    },
    dispose() {
      for (const sampler of samplers.values()) gl.deleteSampler(sampler);
      samplers.clear();
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteVertexArray(particleVao);
      gl.deleteProgram(program);
    },
  };

  function drawPrimitive(
    primitive: StagePrimitive,
    handle: WebGLTexture | null,
    sampler: WebGLSampler,
    state: StagePrimitiveState,
    size: readonly number[],
    offset: readonly number[],
    positions: Float32Array,
    viewport: { readonly width: number; readonly height: number },
  ): number {
    const c = primitive.colour;
    const color = [
      COLOR[(c >>> 16) & 255],
      COLOR[(c >>> 8) & 255],
      COLOR[c & 255],
      COLOR[c >>> 24],
    ];
    for (let k = 0; k < 6; k++) {
      const at = k * FLOATS_PER_VERTEX;
      data[at] = positions[k * 3];
      data[at + 1] = positions[k * 3 + 1];
      data[at + 2] = positions[k * 3 + 2];
      data[at + 3] = primitive.uvs[k * 2];
      data[at + 4] = primitive.uvs[k * 2 + 1];
      data.set(color, at + 5);
    }
    // These vertex writers omit the particle wrapper's extra half-pixel shift.
    return submit(data, handle, sampler, state, size, offset, [
      -0.5 + (size[0] * 0.5) / viewport.width,
      -0.5 + (size[1] * 0.5) / viewport.height,
    ]);
  }

  function submit(
    data: Float32Array,
    handle: WebGLTexture | null,
    sampler: WebGLSampler,
    state: StagePrimitiveState,
    size: readonly number[],
    offset: ArrayLike<number>,
    pixelOffset: readonly number[] = [0, 0],
    instanced = false,
  ): number {
    gl.useProgram(program);
    gl.bindVertexArray(instanced ? particleVao : vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.uniform2f(screenSize, size[0], size[1]);
    gl.uniform2f(screenOffset, pixelOffset[0], pixelOffset[1]);
    gl.uniform2f(uvOffset, offset[0], offset[1]);
    gl.uniform1i(image, 0);
    gl.uniform1i(hasImage, handle === null ? 0 : 1);
    gl.uniform1i(screenInstance, instanced ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, handle);
    gl.bindSampler(0, handle === null ? null : sampler);
    gl.disable(gl.CULL_FACE);
    if (state.blend) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(
        factors[state.source],
        factors[state.destination],
        factors[state.source],
        factors[state.destination],
      );
      gl.blendEquation(operations[state.operation]);
    } else gl.disable(gl.BLEND);
    if (state.depthTest) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
    } else gl.disable(gl.DEPTH_TEST);
    gl.depthMask(state.depthWrite);
    gl.colorMask(
      !!(state.colorMask & 1),
      !!(state.colorMask & 2),
      !!(state.colorMask & 4),
      !!(state.colorMask & 8),
    );
    if (instanced) gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, data.length / 15);
    else gl.drawArrays(gl.TRIANGLES, 0, data.length / FLOATS_PER_VERTEX);
    gl.colorMask(true, true, true, true);
    gl.depthMask(true);
    gl.bindSampler(0, null);
    gl.bindVertexArray(null);
    return 1;
  }
}
