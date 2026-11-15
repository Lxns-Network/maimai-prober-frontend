import { compileProgram } from "../assets/shaderCompile";
import { isMobileDevice } from "../assets/textureFormat";
import type { HudGeometry, HudMaterial, HudSampling, HudScene } from "./hudScene";
import { HUD_VERTICES } from "./hudScene";

const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec2 aUv;
in vec2 aSecondaryUv;
in vec4 aMultiply;
in vec4 aAdd;
uniform mat4 uView;
uniform bool uSource2d;
uniform vec2 uScreenParam;
uniform vec2 uPixelCenter;
uniform float uFixedDepth;
out vec2 vUv;
out vec2 vSecondaryUv;
out vec4 vMultiply;
out vec4 vAdd;
void main() {
  vUv = aUv;
  vSecondaryUv = aSecondaryUv;
  vMultiply = aMultiply;
  vAdd = aAdd;
  vec4 position = uView * vec4(aPosition, 1.0);
  if (uSource2d) {
    position.x = (position.x - 0.5) / uScreenParam.x - 1.0;
    position.y = (-position.y + 0.5) / uScreenParam.y + 1.0;
    position.z = uFixedDepth * position.w;
    position.xy += uPixelCenter * position.w;
    position.z = 2.0 * position.z - position.w;
  }
  gl_Position = position;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform sampler2D uSecondaryTexture;
uniform int uSecondaryBlendMode;
uniform float uAlpha;
uniform bool uPremultiplied;
uniform bool uTextured;
uniform bool uLuminanceAlpha;
uniform bool uSecondaryLuminanceAlpha;
in vec2 vUv;
in vec2 vSecondaryUv;
in vec4 vMultiply;
in vec4 vAdd;
out vec4 color;
void main() {
  color = uTextured ? texture(uTexture, vec2(vUv.x, vUv.y)) : vec4(1.0);
  if (uLuminanceAlpha) color = color.rrrg;
  if (uSecondaryBlendMode != 0) {
    vec4 secondary = texture(uSecondaryTexture, vec2(vSecondaryUv.x, vSecondaryUv.y));
    if (uSecondaryLuminanceAlpha) secondary = secondary.rrrg;
    if (uSecondaryBlendMode == 9) {
      color.rgb = secondary.rgb;
      color.a = secondary.a + color.a * 0.00001;
    } else if (uSecondaryBlendMode == 10) {
      color.rgb = mix(color.rgb, secondary.rgb, secondary.a);
    } else if (uSecondaryBlendMode == 11) {
      color.a = secondary.r;
    } else if (uSecondaryBlendMode == 12) {
      color.a *= secondary.r;
    }
  }
  color *= vMultiply;
  color.rgb += vAdd.rgb;
  if (uPremultiplied) color.rgb *= color.a;
  color.a *= uAlpha;
  if (uPremultiplied) color.rgb *= uAlpha;
}`;

const COMPOSITE_VERTEX = `#version 300 es
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  gl_Position = vec4(corner * 4.0 - 1.0, 0.0, 1.0);
}`;

const SPLIT_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uSource;
out vec4 outColor;
void main() {
  vec4 texel = texelFetch(uSource, ivec2(gl_FragCoord.xy), 0);
  outColor = vec4(texel.r, texel.a, 0.0, 1.0);
}`;

const COMPOSITE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uHud;
out vec4 outColor;
void main() {
  outColor = texelFetch(uHud, ivec2(gl_FragCoord.xy), 0);
}`;

/** Samples per pixel of the interface target, as an antialiased page canvas draws with. */

/** A decoded texture: an image the browser decoded, or raw RGBA bytes. */
export type HudTextureImage =
  | TexImageSource
  | { width: number; height: number; pixels: Uint8Array };

export interface HudRenderer {
  /** Draws one frame of the interface into its own target; skipped when nothing changed. */
  draw(geometry: HudGeometry, revision: number): void;
  /** Blends the interface target over the bound framebuffer, premultiplied, one texel per pixel. */
  composite(): void;
  /** Resizes the interface target to the output size, forcing the next draw. */
  resize(width: number, height: number): void;
  /** Gives a loaded texture a new image, forcing the next draw. */
  replaceTexture(index: number, image: HudTextureImage): void;
  dispose(): void;
}

function samplerOf(
  gl: WebGL2RenderingContext,
  cache: Map<string, WebGLSampler>,
  sampling: HudSampling | null,
): WebGLSampler | null {
  if (!sampling) return null;
  const key = JSON.stringify(sampling);
  let sampler = cache.get(key);
  if (!sampler) {
    sampler = gl.createSampler()!;
    const filter = (value: HudSampling["minFilter"]) =>
      value === "nearest" ? gl.NEAREST : gl.LINEAR;
    const wrap = (value: HudSampling["wrapS"]) =>
      value === "repeat" ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, filter(sampling.minFilter));
    gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, filter(sampling.magFilter));
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, wrap(sampling.wrapS));
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, wrap(sampling.wrapT));
    cache.set(key, sampler);
  }
  return sampler;
}

/** Uploads straight-alpha RGBA as stored, linearly filtered and clamped. */
function upload(
  gl: WebGL2RenderingContext,
  image: HudTextureImage,
  texture: WebGLTexture,
): WebGLTexture {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  if ("pixels" in image)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      image.width,
      image.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      image.pixels,
    );
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  return texture;
}

/** The grey level and alpha of each RGBA pixel whose colour channels are equal. */
export function luminanceAlphaPixels(pixels: Uint8Array): Uint8Array {
  const out = new Uint8Array(pixels.length / 2);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j += 2) {
    out[j] = pixels[i];
    out[j + 1] = pixels[i + 3];
  }
  return out;
}

interface Blend {
  premultiplied: boolean;
  sourceRgb: GLenum;
  destinationRgb: GLenum;
}

function blendOf(gl: WebGL2RenderingContext, material: HudMaterial): Blend {
  if (material.blend === 0)
    return { premultiplied: true, sourceRgb: gl.ONE, destinationRgb: gl.ONE_MINUS_SRC_ALPHA };
  return {
    premultiplied: false,
    sourceRgb: gl.SRC_ALPHA,
    destinationRgb: material.blend === 3 ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE,
  };
}

/**
 * Draws interface geometry into an RGBA8 target the size of the output, as a transparent page
 * canvas would hold it, and composites that target over the scene. Texture `images` follow
 * `scene.meta.textures`; the jacket slot may be absent when the chart has none.
 */
export function createHudRenderer(
  gl: WebGL2RenderingContext,
  scene: HudScene,
  images: readonly (HudTextureImage | null)[],
): HudRenderer {
  let initializing = true;
  const pendingResources: (() => void)[] = [];
  const own = <T>(resource: T, release: (resource: T) => void): T => {
    if (initializing) pendingResources.push(() => release(resource));
    return resource;
  };
  const createProgram = (name: string, vertex: string, fragment: string) =>
    own(compileProgram(gl, { name, vertex, fragment }), (program) => gl.deleteProgram(program));
  try {
    const program = createProgram("HUD", VERTEX_SHADER, FRAGMENT_SHADER);
    const composite = createProgram("HUD composite", COMPOSITE_VERTEX, COMPOSITE_FRAGMENT);
    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const u = {
      view: uniform("uView"),
      source2d: uniform("uSource2d"),
      screenParam: uniform("uScreenParam"),
      pixelCenter: uniform("uPixelCenter"),
      fixedDepth: uniform("uFixedDepth"),
      texture: uniform("uTexture"),
      secondaryTexture: uniform("uSecondaryTexture"),
      secondaryBlendMode: uniform("uSecondaryBlendMode"),
      alpha: uniform("uAlpha"),
      premultiplied: uniform("uPremultiplied"),
      textured: uniform("uTextured"),
      luminanceAlpha: uniform("uLuminanceAlpha"),
      secondaryLuminanceAlpha: uniform("uSecondaryLuminanceAlpha"),
    };
    const hudLocation = gl.getUniformLocation(composite, "uHud");
    let split: {
      program: WebGLProgram;
      source: WebGLUniformLocation | null;
      vao: WebGLVertexArrayObject;
    } | null = null;
    const uploadLuminanceAlpha = (
      image: HudTextureImage,
      width: number,
      height: number,
      texture: WebGLTexture,
    ): WebGLTexture => {
      const store = (pixels: Uint8Array | null) => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, width, height, 0, gl.RG, gl.UNSIGNED_BYTE, pixels);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      };
      if ("pixels" in image) {
        store(luminanceAlphaPixels(image.pixels));
        return texture;
      }
      store(null);
      split ??= (() => {
        const splitProgram = createProgram("HUD split", COMPOSITE_VERTEX, SPLIT_FRAGMENT);
        return {
          program: splitProgram,
          source: gl.getUniformLocation(splitProgram, "uSource"),
          vao: own(gl.createVertexArray()!, (vao) => gl.deleteVertexArray(vao)),
        };
      })();
      const decoded = gl.createTexture();
      const framebuffer = gl.createFramebuffer();
      const dithered = gl.isEnabled(gl.DITHER);
      try {
        if (!decoded || !framebuffer)
          throw new Error("Interface texture conversion allocation failed");
        upload(gl, image, decoded);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.viewport(0, 0, width, height);
        for (const capability of [
          gl.BLEND,
          gl.DITHER,
          gl.DEPTH_TEST,
          gl.STENCIL_TEST,
          gl.CULL_FACE,
          gl.SCISSOR_TEST,
          gl.RASTERIZER_DISCARD,
        ])
          gl.disable(capability);
        gl.colorMask(true, true, true, true);
        gl.useProgram(split.program);
        gl.bindVertexArray(split.vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, decoded);
        gl.bindSampler(0, null);
        gl.uniform1i(split.source, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return texture;
      } finally {
        if (dithered) gl.enable(gl.DITHER);
        gl.bindVertexArray(null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(decoded);
      }
    };
    const luminanceAlpha = (index: number) =>
      scene.meta.textures[index]?.channels === "luminance-alpha";
    const textures = images.map((image, index) => {
      const texture = image
        ? own(gl.createTexture()!, (texture) => gl.deleteTexture(texture))
        : null;
      return !image
        ? null
        : luminanceAlpha(index)
          ? uploadLuminanceAlpha(
              image,
              scene.meta.textures[index].width,
              scene.meta.textures[index].height,
              texture!,
            )
          : upload(gl, image, texture!);
    });
    const samplers = new Map<string, WebGLSampler>();
    pendingResources.push(() => {
      for (const sampler of samplers.values()) gl.deleteSampler(sampler);
    });
    const materials = scene.meta.materials.map((material) => {
      const texture = material.texture < 0 ? null : textures[material.texture];
      if (material.texture >= 0 && !texture)
        throw new RangeError(
          `Interface texture ${scene.meta.textures[material.texture].id} missing`,
        );
      const secondary = material.secondary ? textures[material.secondary.texture] : null;
      if (material.secondary && !secondary)
        throw new RangeError(
          `Interface texture ${scene.meta.textures[material.secondary.texture].id} missing`,
        );
      return {
        material,
        texture,
        sampler: samplerOf(gl, samplers, material.sampling),
        secondary,
        secondarySampler: samplerOf(gl, samplers, material.secondary?.sampling ?? null),
        blend: blendOf(gl, material),
        luminanceAlpha: material.texture >= 0 && luminanceAlpha(material.texture),
        secondaryLuminanceAlpha: !!material.secondary && luminanceAlpha(material.secondary.texture),
      };
    });

    const vao = own(gl.createVertexArray()!, (vao) => gl.deleteVertexArray(vao));
    const buffers = [
      ["aPosition", 3, gl.FLOAT, false],
      ["aUv", 2, gl.FLOAT, false],
      ["aSecondaryUv", 2, gl.FLOAT, false],
      ["aMultiply", 4, gl.UNSIGNED_BYTE, true],
      ["aAdd", 4, gl.UNSIGNED_BYTE, true],
    ] as const;
    const buffer = buffers.map(() => own(gl.createBuffer()!, (buffer) => gl.deleteBuffer(buffer)));
    gl.bindVertexArray(vao);
    buffers.forEach(([name, size, type, normalized], i) => {
      const location = gl.getAttribLocation(program, name);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer[i]);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        scene.capacity * HUD_VERTICES * size * (type === gl.FLOAT ? 4 : 1),
        gl.DYNAMIC_DRAW,
      );
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, type, normalized, 0, 0);
    });
    gl.bindVertexArray(null);
    const emptyVao = own(gl.createVertexArray()!, (vao) => gl.deleteVertexArray(vao));

    let target: WebGLTexture | null = null;
    let framebuffer: WebGLFramebuffer | null = null;
    let samples: WebGLRenderbuffer | null = null;
    let sampled: WebGLFramebuffer | null = null;
    let width = 0;
    let height = 0;
    let drawn = -1;

    const release = () => {
      if (target) gl.deleteTexture(target);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      if (samples) gl.deleteRenderbuffer(samples);
      if (sampled) gl.deleteFramebuffer(sampled);
    };

    const resize = (w: number, h: number) => {
      if (w === width && h === height && target) return;
      width = w;
      height = h;
      release();
      target = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, target);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      framebuffer = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
      samples = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, samples);
      gl.renderbufferStorageMultisample(
        gl.RENDERBUFFER,
        Math.min(isMobileDevice() ? 2 : 4, gl.getParameter(gl.MAX_SAMPLES) as number),
        gl.RGBA8,
        w,
        h,
      );
      sampled = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, sampled);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, samples);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      drawn = -1;
    };

    const resetState = () => {
      for (const capability of [
        gl.DEPTH_TEST,
        gl.STENCIL_TEST,
        gl.CULL_FACE,
        gl.SCISSOR_TEST,
        gl.RASTERIZER_DISCARD,
        gl.SAMPLE_ALPHA_TO_COVERAGE,
        gl.SAMPLE_COVERAGE,
      ])
        gl.disable(capability);
      gl.enable(gl.BLEND);
      gl.colorMask(true, true, true, true);
      gl.blendColor(0, 0, 0, 0);
      gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
    };

    initializing = false;
    pendingResources.length = 0;
    return {
      resize,
      replaceTexture(index, image) {
        const texture = textures[index];
        if (!texture) throw new RangeError(`Interface texture ${index} was never loaded`);
        if (luminanceAlpha(index))
          uploadLuminanceAlpha(
            image,
            scene.meta.textures[index].width,
            scene.meta.textures[index].height,
            texture,
          );
        else upload(gl, image, texture);
        drawn = -1;
      },
      draw(geometry, revision) {
        if (!target || !framebuffer || !sampled)
          throw new Error("The interface target has no size");
        if (revision === drawn) return;
        drawn = revision;
        const vertices = geometry.count * HUD_VERTICES;
        const streams = [
          geometry.positions,
          geometry.uvs,
          geometry.secondaryUvs,
          geometry.multiply,
          geometry.add,
        ];
        if (vertices > 0)
          streams.forEach((stream, i) => {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer[i]);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, stream, 0, vertices * buffers[i][1]);
          });
        gl.bindFramebuffer(gl.FRAMEBUFFER, sampled);
        gl.viewport(0, 0, width, height);
        resetState();
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.bindVertexArray(vao);
        gl.uniformMatrix4fv(u.view, false, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        gl.uniform1i(u.source2d, 1);
        gl.uniform2f(u.screenParam, scene.meta.view.width / 2, scene.meta.view.height / 2);
        gl.uniform2f(u.pixelCenter, 1 / width, -1 / height);
        gl.uniform1f(u.fixedDepth, 0);
        gl.uniform1i(u.texture, 0);
        gl.uniform1i(u.secondaryTexture, 1);
        gl.uniform1f(u.alpha, 1);
        for (let first = 0; first < geometry.count; ) {
          const index = geometry.materials[first];
          let end = first + 1;
          while (end < geometry.count && geometry.materials[end] === index) end++;
          const state = materials[index];
          gl.blendFuncSeparate(
            state.blend.sourceRgb,
            state.blend.destinationRgb,
            gl.ONE,
            gl.ONE_MINUS_SRC_ALPHA,
          );
          gl.uniform1i(u.premultiplied, state.blend.premultiplied ? 1 : 0);
          gl.uniform1i(u.textured, state.texture ? 1 : 0);
          gl.uniform1i(u.luminanceAlpha, state.luminanceAlpha ? 1 : 0);
          gl.uniform1i(u.secondaryLuminanceAlpha, state.secondaryLuminanceAlpha ? 1 : 0);
          gl.uniform1i(u.secondaryBlendMode, state.material.secondary?.blendMode ?? 0);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, state.secondary);
          gl.bindSampler(1, state.secondarySampler);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, state.texture);
          gl.bindSampler(0, state.sampler);
          gl.drawArrays(gl.TRIANGLES, first * HUD_VERTICES, (end - first) * HUD_VERTICES);
          first = end;
        }
        gl.bindSampler(0, null);
        gl.bindSampler(1, null);
        gl.bindVertexArray(null);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sampled);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
        gl.blitFramebuffer(
          0,
          0,
          width,
          height,
          0,
          0,
          width,
          height,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST,
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      },
      composite() {
        if (!target) throw new Error("The interface target has no size");
        resetState();
        gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(composite);
        gl.bindVertexArray(emptyVao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, target);
        gl.bindSampler(0, null);
        gl.uniform1i(hudLocation, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
      },
      dispose() {
        for (const texture of textures) if (texture) gl.deleteTexture(texture);
        for (const sampler of samplers.values()) gl.deleteSampler(sampler);
        buffer.forEach((b) => gl.deleteBuffer(b));
        gl.deleteVertexArray(vao);
        gl.deleteVertexArray(emptyVao);
        release();
        gl.deleteProgram(program);
        gl.deleteProgram(composite);
        if (split) {
          gl.deleteProgram(split.program);
          gl.deleteVertexArray(split.vao);
        }
      },
    };
  } catch (error) {
    for (const release of pendingResources.reverse()) release();
    throw error;
  }
}
