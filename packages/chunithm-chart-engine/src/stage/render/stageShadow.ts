import {
  createPostProgram,
  createPostSurface,
  disposePostSurface,
  type PostSurface,
} from "./post/postKit";
import { rimMaskWeights } from "./stageRimMask";

export const SHADOW_GAUSS_SHADER = `
uniform vec2 direction;
uniform float weights[6];
vec4 shadowPixel(vec2 p){
  vec2 size=textureSize0.xy;
  return texture(texture0,clamp(p,vec2(1.5)/size,(size-1.5)/size));
}
void main(){
  vec2 offset=direction/textureSize0.xy;
  vec4 color=vec4(0.0);
  for(int i=5;i>=1;i--)color+=shadowPixel(uv+offset*float(i))*weights[i];
  color+=shadowPixel(uv)*weights[0];
  for(int i=1;i<=5;i++)color+=shadowPixel(uv-offset*float(i))*weights[i];
  outputColor=color;
}`;

/** Depth comparison targets and native full-float moment targets, owned per shadow light. */
export function createStageShadowTargets(gl: WebGL2RenderingContext) {
  const targets: {
    texture: WebGLTexture;
    framebuffer: WebGLFramebuffer;
    mode: number;
    color?: PostSurface;
    scratch?: PostSurface;
  }[] = [];
  let blur: ReturnType<typeof createPostProgram> | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let direction: WebGLUniformLocation | null = null;
  let weights: WebGLUniformLocation | null = null;
  const kernel = rimMaskWeights();
  const releaseTarget = (target: (typeof targets)[number]) => {
    gl.deleteFramebuffer(target.framebuffer);
    gl.deleteTexture(target.texture);
    disposePostSurface(gl, target.color ?? null);
    disposePostSurface(gl, target.scratch ?? null);
  };
  let moments: WebGLTexture | null = null;
  let momentMode = 0;
  let width = 0;
  let height = 0;
  const release = () => {
    for (const target of targets) {
      if (!target) continue;
      releaseTarget(target);
    }
    targets.length = 0;
    gl.deleteTexture(moments);
    moments = null;
    momentMode = 0;
    width = height = 0;
  };
  return {
    resize(count: number) {
      for (const target of targets.splice(count)) {
        if (!target) continue;
        releaseTarget(target);
      }
    },
    begin(index: number, w: number, h: number, mode = 0): WebGLTexture {
      if (w !== width || h !== height || (mode >= 3 ? mode : 0) !== momentMode) {
        release();
        width = w;
        height = h;
        momentMode = mode >= 3 ? mode : 0;
      }
      let target: (typeof targets)[number] | undefined = targets[index];
      if (target && target.mode !== mode) {
        releaseTarget(target);
        delete targets[index];
        target = undefined;
      }
      if (!target) {
        const texture = gl.createTexture();
        const framebuffer = gl.createFramebuffer();
        if (!texture || !framebuffer) {
          gl.deleteTexture(texture);
          gl.deleteFramebuffer(framebuffer);
          release();
          throw new Error("Stage shadow: target allocation failed");
        }
        target = { texture, framebuffer, mode };
        targets[index] = target;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT16, w + 2, h + 2);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
        gl.bindTexture(gl.TEXTURE_2D, null);
        if (mode >= 3) {
          if (
            !gl.getExtension("EXT_color_buffer_float") ||
            !gl.getExtension("OES_texture_float_linear")
          ) {
            release();
            throw new Error("Stage shadow: filtered full-float targets are unavailable");
          }
          try {
            if (!moments) {
              moments = gl.createTexture();
              if (!moments) throw new Error("Stage shadow: moment array allocation failed");
              gl.activeTexture(gl.TEXTURE0 + 15);
              gl.bindTexture(gl.TEXTURE_2D_ARRAY, moments);
              gl.texStorage3D(
                gl.TEXTURE_2D_ARRAY,
                1,
                mode === 3 ? gl.RG32F : gl.R32F,
                w + 2,
                h + 2,
                3,
              );
              gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
              gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
              gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
              gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
              gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
            }
            target.color = createPostSurface(gl, w + 2, h + 2, mode === 3 ? gl.RG32F : gl.R32F);
            target.scratch = createPostSurface(gl, w + 2, h + 2, mode === 3 ? gl.RG32F : gl.R32F);
            for (const surface of [target.color, target.scratch]) {
              gl.bindTexture(gl.TEXTURE_2D, surface.texture);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            }
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(
              gl.FRAMEBUFFER,
              gl.COLOR_ATTACHMENT0,
              gl.TEXTURE_2D,
              target.color.texture,
              0,
            );
            gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
            gl.readBuffer(gl.COLOR_ATTACHMENT0);
          } catch (error) {
            release();
            throw error;
          }
        } else {
          gl.drawBuffers([gl.NONE]);
          gl.readBuffer(gl.NONE);
        }
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          release();
          throw new Error("Stage shadow: target is incomplete");
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.depthMask(true);
      gl.clearDepth(1);
      gl.disable(gl.SCISSOR_TEST);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      if (target.color) {
        gl.colorMask(true, true, true, true);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(1, 1, w, h);
        gl.clearBufferfv(gl.COLOR, 0, [
          Math.fround(1e30),
          mode === 3 ? Math.fround(1e30) : 0,
          0,
          0,
        ]);
        gl.disable(gl.SCISSOR_TEST);
      }
      gl.viewport(1, 1, w, h);
      return target.texture;
    },
    finish(index: number): WebGLTexture | undefined {
      const target = targets[index];
      if (!target.color) return undefined;
      if (!blur) {
        blur = createPostProgram(gl, SHADOW_GAUSS_SHADER);
        direction = gl.getUniformLocation(blur.program, "direction");
        weights = gl.getUniformLocation(blur.program, "weights");
        vao = gl.createVertexArray();
      }
      gl.bindVertexArray(vao);
      gl.useProgram(blur.program);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.depthMask(false);
      gl.colorMask(true, true, true, true);
      gl.uniform4f(blur.uniforms.textureSize0, width + 2, height + 2, 1 / width, 1 / height);
      gl.uniform1fv(weights, kernel);
      for (let pass = 0; pass < 2; pass++) {
        const source = pass === 0 ? target.color : target.scratch!;
        const destination = pass === 0 ? target.scratch! : target.color;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer);
        gl.viewport(0, 0, width + 2, height + 2);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(1, 1, width, height);
        gl.bindTexture(gl.TEXTURE_2D, source.texture);
        gl.bindSampler(0, null);
        gl.uniform2f(direction, pass === 0 ? 1 : 0, pass === 1 ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.color.framebuffer);
      gl.activeTexture(gl.TEXTURE0 + 15);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, moments);
      gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, index, 0, 0, width + 2, height + 2);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
      return moments!;
    },
    dispose() {
      release();
      if (blur) gl.deleteProgram(blur.program);
      gl.deleteVertexArray(vao);
      blur = null;
      vao = null;
    },
  };
}
