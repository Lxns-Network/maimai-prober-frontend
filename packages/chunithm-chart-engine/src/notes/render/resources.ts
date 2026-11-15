import { createSamplerCache, type SamplerCache } from "../../gpu/samplers";
import type { BandRenderer } from "./bandRenderer";
export interface RendererResources {
  programs: WebGLProgram[];
  buffers: WebGLBuffer[];
  geometry: { buffers: WebGLBuffer[]; vertexArrays: WebGLVertexArrayObject[] };
  bandRenderer: BandRenderer | null;
  samplers: SamplerCache;
}

export function releaseResources(gl: WebGL2RenderingContext, resources: RendererResources): void {
  for (const program of resources.programs) gl.deleteProgram(program);
  for (const buffer of resources.buffers) gl.deleteBuffer(buffer);
  for (const buffer of resources.geometry.buffers) gl.deleteBuffer(buffer);
  for (const array of resources.geometry.vertexArrays) gl.deleteVertexArray(array);
  resources.bandRenderer?.dispose();
  resources.samplers.dispose();
  resources.programs.length = 0;
  resources.buffers.length = 0;
  resources.geometry.buffers.length = 0;
  resources.geometry.vertexArrays.length = 0;
  resources.bandRenderer = null;
  gl.bindVertexArray(null);
}

export function createRendererResources(gl: WebGL2RenderingContext): RendererResources {
  return {
    programs: [],
    buffers: [],
    geometry: { buffers: [], vertexArrays: [] },
    bandRenderer: null,
    samplers: createSamplerCache(gl),
  };
}
