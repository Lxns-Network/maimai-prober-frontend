import { SpriteSkin } from "./SpriteSkin";
import { createProgramInfo, setUniforms } from "twgl.js";
import { MainRenderer, type MainRendererConfig } from "../MainRenderer";
import { ChartPath } from "./ChartPath";
import { bakedSprites } from "../BaseRenderer";
import { RecordingContext2D, type RecordedOp } from "./RecordingContext2D";

const vertex = `#version 300 es
layout(location=0) in vec2 position;
uniform vec2 viewport;
uniform vec4 uvRect;
out vec2 pixel;
out vec2 uv;
void main() {
  pixel = position;
  uv = uvRect.xy + vec2(gl_VertexID & 1, (gl_VertexID >> 1) & 1) * uvRect.zw;
  gl_Position = vec4(position / viewport * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
}`;

const fragment = `#version 300 es
precision highp float;
uniform int kind;
uniform vec4 tint;
uniform vec4 geometry;
uniform int stopCount;
uniform highp sampler2D stops;
uniform sampler2D sprite;
in vec2 pixel;
in vec2 uv;
out vec4 result;
vec4 gradient(float t) {
  int lo = 0, hi = stopCount;
  while (lo < hi) {
    int mid = (lo + hi) / 2;
    if (texelFetch(stops, ivec2(mid, 1), 0).r <= t) lo = mid + 1;
    else hi = mid;
  }
  int a = max(lo - 1, 0), b = min(lo, stopCount - 1);
  float start = texelFetch(stops, ivec2(a, 1), 0).r;
  float end = texelFetch(stops, ivec2(b, 1), 0).r;
  return mix(texelFetch(stops, ivec2(a, 0), 0), texelFetch(stops, ivec2(b, 0), 0),
    end > start ? clamp((t - start) / (end - start), 0., 1.) : 0.);
}
void main() {
  vec4 c = tint;
  if (kind == 1) { result = texture(sprite, uv) * vec4(tint.rgb, 1.) * tint.a; return; }
  if (kind == 2) {
    vec2 delta = geometry.zw - geometry.xy;
    c *= gradient(dot(pixel - geometry.xy, delta) / max(dot(delta, delta), 0.000001));
  }
  if (kind == 3) c *= gradient((distance(pixel, geometry.xy) - geometry.z) / max(geometry.w - geometry.z, 0.000001));
  result = vec4(c.rgb * c.a, c.a);
}`;

function createDevice(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    stencil: true,
    depth: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error("浏览器无法创建 WebGL2 上下文");
  const program = createProgramInfo(gl, [vertex, fragment]);
  if (!program) throw new Error("无法编译舞萌 WebGL2 着色器");
  const buffer = gl.createBuffer()!;
  const texture = (filter: number) => {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return tex;
  };
  gl.useProgram(program.program);
  gl.uniform1i(gl.getUniformLocation(program.program, "sprite"), 0);
  gl.uniform1i(gl.getUniformLocation(program.program, "stops"), 1);
  gl.activeTexture(gl.TEXTURE1);
  const stops = texture(gl.NEAREST);
  gl.activeTexture(gl.TEXTURE0);
  const streamingTexture = texture(gl.LINEAR);
  const sprites = new WeakMap<TexImageSource, WebGLTexture>();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  const quad = new Float32Array(8);
  let activeClip: RecordedOp["clip"] | null = null;
  const triangles = (points: Float32Array) => {
    gl.bufferData(gl.ARRAY_BUFFER, points, gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, points.length / 2);
  };
  return {
    begin() {
      gl.viewport(0, 0, canvas.width, canvas.height);
      setUniforms(program, { viewport: [canvas.width, canvas.height] });
      activeClip = null;
      gl.disable(gl.STENCIL_TEST);
    },
    draw(op: RecordedOp) {
      if (gl.isContextLost()) return;
      if (op.clip !== activeClip) {
        activeClip = op.clip;
        if (!op.clip.length) gl.disable(gl.STENCIL_TEST);
        else {
          gl.enable(gl.STENCIL_TEST);
          gl.stencilMask(0xff);
          gl.clear(gl.STENCIL_BUFFER_BIT);
          gl.colorMask(false, false, false, false);
          gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
          setUniforms(program, { kind: 0 });
          for (const [index, mesh] of op.clip.entries()) {
            gl.stencilFunc(gl.EQUAL, index, 0xff);
            triangles(mesh);
          }
          gl.colorMask(true, true, true, true);
          gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
          gl.stencilFunc(gl.EQUAL, op.clip.length, 0xff);
        }
      }
      const destination =
        op.blend === "lighter"
          ? gl.ONE
          : op.blend === "screen"
            ? gl.ONE_MINUS_SRC_COLOR
            : gl.ONE_MINUS_SRC_ALPHA;
      gl.blendFunc(gl.ONE, destination);
      if (op.kind === "image") {
        setUniforms(program, { kind: 1, tint: [...op.tint, op.opacity], uvRect: op.uv });
        gl.activeTexture(gl.TEXTURE0);
        let sprite = sprites.get(op.source);
        if (sprite) gl.bindTexture(gl.TEXTURE_2D, sprite);
        else {
          const cacheable =
            op.source instanceof ImageBitmap ||
            op.source instanceof HTMLImageElement ||
            (op.source instanceof HTMLCanvasElement && bakedSprites.has(op.source));
          sprite = cacheable ? texture(gl.LINEAR) : streamingTexture;
          gl.bindTexture(gl.TEXTURE_2D, sprite);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, op.source);
          // 渐变纹理的第二行存放色标位置，预乘会把这些数值乘以 0。
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          if (cacheable) sprites.set(op.source, sprite);
        }
        for (const [i, corner] of op.corners.entries()) quad.set(corner, i * 2);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STREAM_DRAW);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return;
      }
      const paint = op.paint;
      if (paint.kind === "solid") {
        const [r, g, b, a] = paint.color;
        setUniforms(program, { kind: 0, tint: [r, g, b, a * op.opacity] });
      } else {
        const count = paint.stops.length;
        if (!count) return;
        const values = new Float32Array(count * 8);
        for (const [i, stop] of paint.stops.entries()) {
          values.set(stop.color, i * 4);
          values[(count + i) * 4] = stop.offset;
        }
        const linear = paint.kind === "linear";
        setUniforms(program, {
          kind: linear ? 2 : 3,
          tint: [1, 1, 1, op.opacity],
          stopCount: count,
          geometry: linear
            ? [paint.x0, paint.y0, paint.x1, paint.y1]
            : [paint.cx, paint.cy, paint.r0, paint.r1],
        });
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, stops);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, count, 2, 0, gl.RGBA, gl.FLOAT, values);
      }
      triangles(op.points);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteTexture(streamingTexture);
      gl.deleteTexture(stops);
      gl.deleteProgram(program.program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

export class WebGL2Renderer extends MainRenderer {
  private readonly device: ReturnType<typeof createDevice>;

  static async load() {
    const skin = await SpriteSkin.load();
    return (canvas: HTMLCanvasElement, config?: MainRendererConfig) =>
      new WebGL2Renderer(canvas, skin, config);
  }

  private constructor(
    canvas: HTMLCanvasElement,
    skin: SpriteSkin,
    config: MainRendererConfig = {},
  ) {
    const device = createDevice(canvas);
    const context = new RecordingContext2D(device.draw);
    super(
      canvas,
      { showStatistics: false, ...config },
      { skin, ctx: context, createPath: () => new ChartPath() },
    );
    this.device = device;
  }

  override clear() {
    this.device.begin();
    super.clear();
  }

  override dispose() {
    this.device.dispose();
    super.dispose();
  }
}
