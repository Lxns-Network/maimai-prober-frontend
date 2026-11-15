import { compileProgram } from "../../../assets/shaderCompile";
import type { StageColor2, StagePostFilter } from "../../nodes/filters";
import type { StageBloom } from "../../nodes/bloom";
import type { StageCameraLook } from "../../view";
import { buildBloomPlan, type BloomStep } from "./bloomPlan";
import { createStageBloomPass } from "./stageBloom";
import { createStageBloom2Pass } from "./stageBloom2";
import { createStageFxaa3Pass } from "./stageFxaa3";
import { createStageMlaaPass } from "./stageMlaa";
import { createStageDofPass } from "./stageDof";

const VERTEX = `#version 300 es
precision highp float;
out vec2 uv;
void main(){
  vec2 corner=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  uv=corner;
  gl_Position=vec4(corner*2.0-1.0,0.0,1.0);
}`;

const COLOR2_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D sourceImage;
uniform vec4 colorSaturation;
uniform bool applyCurve;
uniform vec4 brightnessContrastGammaPower;
in vec2 uv;
out vec4 outputColor;
void main(){
  vec4 base=texture(sourceImage,uv);
  if(!applyCurve){outputColor=base;return;}
  base=max(base,vec4(0.0));
  base.rgb=pow(base.rgb+1.0,vec3(brightnessContrastGammaPower.w))-1.0;
  base.rgb=pow(base.rgb,vec3(brightnessContrastGammaPower.z))+brightnessContrastGammaPower.x;
  base.rgb=max(vec3(0.0),base.rgb*brightnessContrastGammaPower.y+0.5);
  vec3 mono=dot(base.rgb,vec3(0.299,0.587,0.114))*colorSaturation.rgb;
  base.rgb=mix(mono,base.rgb,colorSaturation.a);
  outputColor=base;
}`;

/**
 * Glow filters work on a frame of this height at the scene's aspect: a taller scene is reduced to
 * it first, and the glow is added back at the scene's own size.
 */
const GLOW_HEIGHT = 1080;

/** The scene target the stage draws into, and the filters that resolve it to the destination. */
export interface StagePost {
  /** Binds the scene's half-float target with depth, cleared to opaque black. */
  begin(
    width: number,
    height: number,
    /** Temporal effects use elapsed Stage ticks; a seek starts a new exposure history. */
    frame?: { readonly tick: number; readonly reset: boolean },
  ): void;
  /** Copies the scene's depth into a separate texture for post-filter sampling. */
  snapshotDepth(): WebGLTexture;
  /** Resolves the scene target into `destination` through the filters, in order. */
  end(
    filters: readonly StagePostFilter[],
    destination: WebGLFramebuffer | null,
    /**
     * Draws into the filtered HDR image, bound as the target, before it is copied to
     * `destination`: the passes that come after the filters.
     */
    after?: () => void,
    camera?: StageCameraLook | null,
  ): void;
  dispose(): void;
}

export function createStagePost(gl: WebGL2RenderingContext): StagePost {
  if (!gl.getExtension("EXT_color_buffer_float"))
    throw new Error("Stage post: half-float render targets are unavailable");
  const program = compileProgram(gl, {
    name: "Stage post",
    vertex: VERTEX,
    fragment: COLOR2_FRAGMENT,
  });
  const uniforms = {
    image: gl.getUniformLocation(program, "sourceImage"),
    apply: gl.getUniformLocation(program, "applyCurve"),
    color: gl.getUniformLocation(program, "colorSaturation"),
    curve: gl.getUniformLocation(program, "brightnessContrastGammaPower"),
  };
  const vao = gl.createVertexArray()!;
  const sampler = gl.createSampler()!;
  gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  let bloomPass: ReturnType<typeof createStageBloomPass> | null = null;
  let bloom2Pass: ReturnType<typeof createStageBloom2Pass> | null = null;
  let mlaaPass: ReturnType<typeof createStageMlaaPass> | null = null;
  let fxaa3Pass: ReturnType<typeof createStageFxaa3Pass> | null = null;
  let dofPass: ReturnType<typeof createStageDofPass> | null = null;
  const plans = new WeakMap<StageBloom, { width: number; height: number; plan: BloomStep[] }>();
  interface Surface {
    texture: WebGLTexture;
    framebuffer: WebGLFramebuffer;
    internalFormat: number;
  }
  let scene: Surface | null = null;
  let aux: Surface | null = null;
  let glowCopy: Surface | null = null;
  let dofCopy: Surface | null = null;
  let depth: WebGLRenderbuffer | null = null;
  let depthSnapshot: { texture: WebGLTexture; framebuffer: WebGLFramebuffer } | null = null;
  let size = [0, 0];
  let previousTick: number | null = null;
  let historyFrames = 1;
  const createSurface = (width: number, height: number, withDepth: boolean): Surface => {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    try {
      if (!texture || !framebuffer) throw new Error("Stage post: cannot create a target");
      gl.bindTexture(gl.TEXTURE_2D, texture);
      // Front2D darkens HDR highlights before the final output clamps them. RGBA8 here loses that range.
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (withDepth)
        gl.framebufferRenderbuffer(
          gl.FRAMEBUFFER,
          gl.DEPTH_STENCIL_ATTACHMENT,
          gl.RENDERBUFFER,
          depth,
        );
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error("Stage post: a target is incomplete");
      return { texture, framebuffer, internalFormat: gl.RGBA16F };
    } catch (error) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw error;
    }
  };
  const releaseSurface = (surface: Surface | null) => {
    if (!surface) return;
    gl.deleteTexture(surface.texture);
    gl.deleteFramebuffer(surface.framebuffer);
  };
  const release = () => {
    releaseSurface(scene);
    releaseSurface(aux);
    releaseSurface(glowCopy);
    releaseSurface(dofCopy);
    if (depthSnapshot) {
      gl.deleteTexture(depthSnapshot.texture);
      gl.deleteFramebuffer(depthSnapshot.framebuffer);
    }
    gl.deleteRenderbuffer(depth);
    scene = aux = glowCopy = dofCopy = depth = null;
    depthSnapshot = null;
    size = [0, 0];
  };
  const resolve = (
    source: Surface,
    destination: WebGLFramebuffer | null,
    curve: StageColor2 | null,
    width = size[0],
    height = size[1],
  ) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.colorMask(true, true, true, true);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.bindSampler(0, sampler);
    gl.uniform1i(uniforms.image, 0);
    gl.uniform1i(uniforms.apply, curve ? 1 : 0);
    if (curve) {
      gl.uniform4fv(uniforms.color, curve.colorSaturation);
      gl.uniform4fv(uniforms.curve, curve.brightnessContrastGammaPower);
    }
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindSampler(0, null);
  };
  const glowSource = (current: Surface, glow: { width: number; height: number }) => {
    if (size[1] <= GLOW_HEIGHT)
      return { texture: current.texture, width: size[0], height: size[1] };
    glowCopy ??= createSurface(glow.width, glow.height, false);
    resolve(current, glowCopy.framebuffer, null, glow.width, glow.height);
    return { texture: glowCopy.texture, ...glow };
  };
  const snapshotDepth = () => {
    if (!depthSnapshot) {
      const texture = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      try {
        if (!texture || !framebuffer) throw new Error("Stage post: cannot create a depth snapshot");
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH24_STENCIL8, size[0], size[1]);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
          gl.DRAW_FRAMEBUFFER,
          gl.DEPTH_STENCIL_ATTACHMENT,
          gl.TEXTURE_2D,
          texture,
          0,
        );
        gl.drawBuffers([gl.NONE]);
        if (gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
          throw new Error("Stage post: depth snapshot is incomplete");
        depthSnapshot = { texture, framebuffer };
      } catch (error) {
        gl.deleteTexture(texture);
        gl.deleteFramebuffer(framebuffer);
        throw error;
      }
    }
    const scissor = gl.isEnabled(gl.SCISSOR_TEST);
    if (scissor) gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, scene!.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, depthSnapshot.framebuffer);
    gl.blitFramebuffer(
      0,
      0,
      size[0],
      size[1],
      0,
      0,
      size[0],
      size[1],
      gl.DEPTH_BUFFER_BIT,
      gl.NEAREST,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene!.framebuffer);
    if (scissor) gl.enable(gl.SCISSOR_TEST);
    return depthSnapshot.texture;
  };
  return {
    begin(width, height, frame) {
      const reset = frame && (frame.reset || (previousTick !== null && frame.tick < previousTick));
      if (reset) bloom2Pass?.resetHistory();
      historyFrames =
        frame === undefined || reset || previousTick === null ? 1 : frame.tick - previousTick;
      previousTick = frame?.tick ?? null;
      if (!scene || size[0] !== width || size[1] !== height) {
        bloom2Pass?.resetHistory();
        release();
        try {
          depth = gl.createRenderbuffer();
          if (!depth) throw new Error("Stage post: cannot create a depth buffer");
          gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
          gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
          scene = createSurface(width, height, true);
          size = [width, height];
        } catch (error) {
          release();
          throw error;
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.framebuffer);
      gl.viewport(0, 0, width, height);
      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      gl.clearColor(0, 0, 0, 1);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    },
    snapshotDepth,
    end(filters, destination, after, camera) {
      let current = scene!;
      const filterDepth = filters.some((filter) => filter.kind === "dof") ? snapshotDepth() : null;
      const glow = {
        width: Math.max(1, Math.round((size[0] * GLOW_HEIGHT) / size[1])),
        height: GLOW_HEIGHT,
      };
      let lastWasBloom = false;
      const intoDestination = (index: number) => !after && index === filters.length - 1;
      filters.forEach((filter, index) => {
        if (filter.kind === "bloom") {
          let cached = plans.get(filter.bloom);
          if (!cached || cached.width !== glow.width || cached.height !== glow.height) {
            cached = { ...glow, plan: buildBloomPlan(filter.bloom, glow.width, glow.height) };
            plans.set(filter.bloom, cached);
          }
          (bloomPass ??= createStageBloomPass(gl)).apply(
            cached.plan,
            glow,
            glowSource(current, glow),
            {
              framebuffer: current.framebuffer,
              width: size[0],
              height: size[1],
            },
          );
          lastWasBloom = true;
          return;
        }
        lastWasBloom = false;
        if (filter.kind === "dof") {
          if (!camera) throw new Error("Stage depth-of-field: camera is unavailable");
          const last = intoDestination(index);
          aux ??= last ? null : createSurface(size[0], size[1], true);
          dofCopy ??= createSurface(size[0], size[1], false);
          const next = last ? null : current === scene ? aux! : scene!;
          (dofPass ??= createStageDofPass(gl)).apply(
            filter.dof,
            camera,
            {
              texture: current.texture,
              width: size[0],
              height: size[1],
              internalFormat: current.internalFormat,
            },
            dofCopy,
            filterDepth!,
            next ? next.framebuffer : destination,
          );
          if (next) current = next;
          return;
        }
        if (filter.kind === "bloom2") {
          const last = intoDestination(index);
          aux ??= last ? null : createSurface(size[0], size[1], true);
          const next = last ? null : current === scene ? aux! : scene!;
          if (
            !(bloom2Pass ??= createStageBloom2Pass(gl)).apply(
              filter.bloom2,
              glow,
              glowSource(current, glow),
              { texture: current.texture, width: size[0], height: size[1] },
              next ? next.framebuffer : destination,
              historyFrames,
            )
          )
            resolve(current, next ? next.framebuffer : destination, null);
          if (next) current = next;
          return;
        }
        if (filter.kind === "mlaa" || filter.kind === "fxaa3") {
          if (filter.kind === "fxaa3" && filter.fxaa3.repeat) {
            aux ??= createSurface(size[0], size[1], true);
            const intermediate = current === scene ? aux : scene!;
            (fxaa3Pass ??= createStageFxaa3Pass(gl)).apply(
              current,
              intermediate.framebuffer,
              size[0],
              size[1],
            );
            current = intermediate;
          }
          const last = intoDestination(index);
          aux ??= last ? null : createSurface(size[0], size[1], true);
          const next = last ? null : current === scene ? aux! : scene!;
          const target = next ? next.framebuffer : destination;
          if (filter.kind === "mlaa")
            (mlaaPass ??= createStageMlaaPass(gl)).apply(
              filter.mlaa,
              current,
              target,
              size[0],
              size[1],
            );
          else (fxaa3Pass ??= createStageFxaa3Pass(gl)).apply(current, target, size[0], size[1]);
          if (next) current = next;
          return;
        }
        if (intoDestination(index)) {
          resolve(current, destination, filter.color2);
          return;
        }
        aux ??= createSurface(size[0], size[1], true);
        const next = current === scene ? aux : scene!;
        resolve(current, next.framebuffer, filter.color2);
        current = next;
      });
      if (after) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, current.framebuffer);
        gl.viewport(0, 0, size[0], size[1]);
        after();
        resolve(current, destination, null);
      } else if (filters.length === 0 || lastWasBloom) resolve(current, destination, null);
    },
    dispose() {
      release();
      bloomPass?.dispose();
      bloom2Pass?.dispose();
      mlaaPass?.dispose();
      fxaa3Pass?.dispose();
      dofPass?.dispose();
      gl.deleteSampler(sampler);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}
