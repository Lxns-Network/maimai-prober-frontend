import { dofDepthCoefficients } from "./post/dofPlan";
import {
  createPostProgram,
  createPostSurface,
  disposePostSurface,
  type PostSurface,
} from "./post/postKit";

export const RIM_DEPTH_EDGE_SHADER = `
uniform vec2 systemParam;
uniform bool monochrome;
float depthAt(vec2 p){return sampleImage(texture1,p).r;}
void main(){
  vec2 p=pixelUv();
  vec2 d=textureSize0.zw;
  vec4 axial=vec4(depthAt(p+vec2(d.x,0.0)),depthAt(p-vec2(d.x,0.0)),depthAt(p+vec2(0.0,d.y)),depthAt(p-vec2(0.0,d.y)));
  vec4 diagonal=vec4(depthAt(p+vec2(d.x,-d.y)),depthAt(p+vec2(-d.x,d.y)),depthAt(p+d),depthAt(p-d));
  vec4 nearest=min(axial,diagonal);
  float neighbor=min(nearest.x,max(nearest.y,max(nearest.z,nearest.w)));
  float currentDistance=systemParam.y/(depthAt(p)+systemParam.x);
  float neighborDistance=systemParam.y/(neighbor+systemParam.x);
  outputColor=vec4(min(max((currentDistance-neighborDistance)/16.0-shaderParam0.x,0.0),1.0));
  if(!monochrome)outputColor*=sampleImage(texture0,p);
}`;

export const RIM_MASK_GAUSS_SHADER = `
uniform vec2 direction;
uniform float weights[6];
void main(){
  vec2 p=pixelUv();
  vec2 offset=textureSize0.zw*direction;
  vec4 color=vec4(0.0);
  for(int i=5;i>=1;i--)color+=sampleImage(texture0,p+offset*float(i))*weights[i];
  color+=sampleImage(texture0,p)*weights[0];
  for(int i=1;i<=5;i++)color+=sampleImage(texture0,p-offset*float(i))*weights[i];
  outputColor=color;
}`;

/** The default FilterGauss kernel, including its native finite-kernel brightness correction. */
export function rimMaskWeights(): Float32Array {
  const f = Math.fround;
  const variance = f(f(3 * 3) * f(6.2831855));
  const root = f(Math.sqrt(variance));
  const weights = new Float32Array(6);
  let total = 0;
  for (let i = 0; i < 6; i++) {
    weights[i] = f(f(Math.exp(f(f(i * i) * f(1 / f(f(3 * -2) * 3))))) * f(1 / root));
    total = f(f(weights[i] + weights[i]) + total);
  }
  const correction = f(f(1 - f(total - weights[0])) * f(1 / 12));
  for (let i = 0; i < 6; i++) weights[i] = f(weights[i] + correction);
  weights[0] = f(weights[0] + correction);
  return weights;
}

/** Owns the depth-edge filter and its horizontal/vertical Gaussian targets. */
export function createStageRimMask(gl: WebGL2RenderingContext) {
  const edge = createPostProgram(gl, RIM_DEPTH_EDGE_SHADER);
  let blur: ReturnType<typeof createPostProgram>;
  try {
    blur = createPostProgram(gl, RIM_MASK_GAUSS_SHADER);
  } catch (error) {
    gl.deleteProgram(edge.program);
    throw error;
  }
  const system = gl.getUniformLocation(edge.program, "systemParam");
  const monochrome = gl.getUniformLocation(edge.program, "monochrome");
  const direction = gl.getUniformLocation(blur.program, "direction");
  const weights = gl.getUniformLocation(blur.program, "weights");
  const vao = gl.createVertexArray();
  const nearest = gl.createSampler();
  const linear = gl.createSampler();
  if (!vao || !nearest || !linear) {
    gl.deleteVertexArray(vao);
    gl.deleteSampler(nearest);
    gl.deleteSampler(linear);
    gl.deleteProgram(edge.program);
    gl.deleteProgram(blur.program);
    throw new Error("Stage rim: filter resource allocation failed");
  }
  for (const [sampler, filter] of [
    [nearest, gl.NEAREST],
    [linear, gl.LINEAR],
  ] as const) {
    gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, filter);
    gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, filter);
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  const kernel = rimMaskWeights();
  let surfaces: PostSurface[] = [];
  const release = () => {
    for (const surface of surfaces) disposePostSurface(gl, surface);
    surfaces = [];
  };
  return {
    apply(
      depth: WebGLTexture,
      width: number,
      height: number,
      projection: ArrayLike<number>,
      minDiff: number,
      color?: WebGLTexture,
    ) {
      if (surfaces[0]?.width !== width || surfaces[0]?.height !== height) {
        release();
        try {
          for (let i = 0; i < 2; i++) {
            surfaces.push(createPostSurface(gl, width, height, gl.RGBA8));
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          }
        } catch (error) {
          release();
          throw error;
        }
      }
      gl.bindVertexArray(vao);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.depthMask(false);
      gl.colorMask(true, true, true, true);
      gl.viewport(0, 0, width, height);
      for (let pass = 0; pass < 3; pass++) {
        const program = pass === 0 ? edge : blur;
        gl.bindFramebuffer(gl.FRAMEBUFFER, surfaces[pass === 1 ? 1 : 0].framebuffer);
        gl.useProgram(program.program);
        gl.uniform4f(program.uniforms.textureSize0, width, height, 1 / width, 1 / height);
        if (pass === 0) {
          gl.uniform1i(monochrome, color ? 0 : 1);
          if (color) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, color);
            gl.bindSampler(0, linear);
          }
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, depth);
          gl.bindSampler(1, nearest);
          gl.uniform2fv(system, dofDepthCoefficients(projection));
          gl.uniform4f(program.uniforms.shaderParam0, minDiff, 0, 0, 0);
        } else {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, surfaces[pass === 1 ? 0 : 1].texture);
          gl.bindSampler(0, linear);
          gl.uniform2f(direction, pass === 1 ? 1 : 0, pass === 2 ? 1 : 0);
          gl.uniform1fv(weights, kernel);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.bindSampler(0, null);
      gl.bindSampler(1, null);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
      return surfaces[0].texture;
    },
    dispose() {
      release();
      gl.deleteProgram(edge.program);
      gl.deleteProgram(blur.program);
      gl.deleteSampler(nearest);
      gl.deleteSampler(linear);
      gl.deleteVertexArray(vao);
    },
  };
}
