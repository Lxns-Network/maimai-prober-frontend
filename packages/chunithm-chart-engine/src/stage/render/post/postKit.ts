export const POST_VERTEX = `#version 300 es
precision highp float;
out vec2 uv;
void main(){
  vec2 corner=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  uv=corner;
  gl_Position=vec4(corner*2.0-1.0,0.0,1.0);
}`;

/** Shader header of the filter passes: image slots, the sizes of the first image and of the target, and a few parameters. */
export const POST_PREFIX = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D texture0;
uniform sampler2D texture1;
uniform sampler2D texture2;
uniform vec4 textureSize0;
uniform vec4 targetSize;
uniform vec4 shaderParam0;
in vec2 uv;
out vec4 outputColor;
vec2 imageUv(vec2 p){return vec2(p.x,1.0-p.y);}
vec4 sampleImage(sampler2D s,vec2 p){return texture(s,imageUv(p));}
vec4 sampleImageLevel0(sampler2D s,vec2 p){return textureLod(s,imageUv(p),0.0);}
vec2 pixelUv(){return imageUv(uv);}`;

export interface PostProgram {
  readonly program: WebGLProgram;
  readonly uniforms: Readonly<Record<string, WebGLUniformLocation | null>>;
}

export interface PostSurface {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
}

const UNIFORMS = ["textureSize0", "targetSize", "shaderParam0"];

/** Compiles a full-screen filter pass; `texture0`..`texture2` are bound to units 0..2. */
export function createPostProgram(gl: WebGL2RenderingContext, body: string): PostProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("Stage filter: cannot create a program");
  const shaders: WebGLShader[] = [];
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Stage filter: cannot create a shader");
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) || "Stage filter shader compilation failed");
    return shader;
  };
  try {
    const vertex = compile(gl.VERTEX_SHADER, POST_VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, `${POST_PREFIX}\n${body}`);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) || "Stage filter program link failed");
    gl.useProgram(program);
    for (let i = 0; i < 3; i++) gl.uniform1i(gl.getUniformLocation(program, `texture${i}`), i);
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of UNIFORMS) uniforms[name] = gl.getUniformLocation(program, name);
    return { program, uniforms };
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

/** Creates a colour target of the given size and internal format. */
export function createPostSurface(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  internal: number,
): PostSurface {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  try {
    if (!texture || !framebuffer) throw new Error("Stage filter: cannot create a target");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, internal, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error("Stage filter: a target is incomplete");
    return { texture, framebuffer, width, height };
  } catch (error) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    throw error;
  }
}

export function disposePostSurface(gl: WebGL2RenderingContext, surface: PostSurface | null): void {
  if (!surface) return;
  gl.deleteTexture(surface.texture);
  gl.deleteFramebuffer(surface.framebuffer);
}

/** Creates a clamped sampler with the given filter. */
export function createPostSampler(gl: WebGL2RenderingContext, filter: number): WebGLSampler {
  const sampler = gl.createSampler()!;
  gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, filter);
  gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, filter);
  gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return sampler;
}
