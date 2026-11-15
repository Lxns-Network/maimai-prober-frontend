import { compileProgram } from "../../../assets/shaderCompile";
import type { StageBloom2 } from "../../nodes/bloom2";
import { bloom2LevelSizes, buildBloom2Plan, type Bloom2Draw, type Bloom2Image } from "./bloom2Plan";
import { createPostSurface } from "./postKit";

const VERTEX = `#version 300 es
precision highp float;
out vec2 uv;
void main(){
  vec2 corner=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  uv=corner;
  gl_Position=vec4(corner*2.0-1.0,0.0,1.0);
}`;

const PREFIX = `#version 300 es
precision highp float;
uniform sampler2D texture0;
uniform sampler2D texture1;
uniform sampler2D texture2;
uniform sampler2D texture3;
uniform vec4 textureSize0;
uniform vec4 targetSize;
uniform vec4 shaderParam0;
uniform vec4 shaderParam1;
uniform vec4 shaderParam2;
uniform vec4 starWeights[8];
uniform vec4 shaderParamArg0;
in vec2 uv;
out vec4 outputColor;`;

const GAUSS = [0.008764, 0.026995, 0.064759, 0.120985, 0.176033, 0.199471];

function gaussBody(horizontal: boolean): string {
  const lines = [
    "vec2 ofs=textureSize0.zw;",
    horizontal ? "ofs.y=0.0;" : "ofs.x=0.0;",
    "vec4 color=vec4(0.0);",
  ];
  for (let tap = 5; tap >= 1; tap--)
    lines.push(`color+=texture(texture0,uv+ofs*${tap}.0)*${GAUSS[5 - tap]};`);
  lines.push(`color+=texture(texture0,uv)*${GAUSS[5]};`);
  for (let tap = 1; tap <= 5; tap++)
    lines.push(`color+=texture(texture0,uv-ofs*${tap}.0)*${GAUSS[5 - tap]};`);
  lines.push("outputColor=color;");
  return lines.join("\n");
}

const REDUCE = `vec2 move=targetSize.zw*0.25;
vec4 color=texture(texture0,uv+vec2(-move.x,move.y));
color+=texture(texture0,uv+vec2(move.x,move.y));
color+=texture(texture0,uv+vec2(-move.x,-move.y));
color+=texture(texture0,uv+vec2(move.x,-move.y));
color/=4.0;
outputColor=max(color,vec4(0.0));`;

const REDUCE16 = `vec4 color=vec4(0.0);
vec2 move=targetSize.zw*0.25;
vec2 hmove=move*0.5;
vec2 centers[4]=vec2[4](uv+vec2(-move.x,move.y),uv+vec2(move.x,move.y),uv+vec2(-move.x,-move.y),uv+vec2(move.x,-move.y));
for(int i=0;i<4;i++){
  color+=texture(texture0,centers[i]+vec2(-hmove.x,hmove.y));
  color+=texture(texture0,centers[i]+vec2(hmove.x,hmove.y));
  color+=texture(texture0,centers[i]+vec2(-hmove.x,-hmove.y));
  color+=texture(texture0,centers[i]+vec2(hmove.x,-hmove.y));
}
outputColor=max(color/16.0,vec4(0.0));`;

const LUM_EXT = `vec4 color=texture(texture0,uv+vec2(shaderParam1.x,0.0));
color.g=texture(texture0,uv+vec2(shaderParam1.y,0.0)).g;
color.b=texture(texture0,uv+vec2(shaderParam1.z,0.0)).b;
float tone=texture(texture1,uv).r;
vec4 bloom=texture(texture2,uv);
color.rgb=mix(color.rgb,color.rgb*shaderParam1.w/(tone+0.001),shaderParam0.w);
color=max(color-shaderParam0.y,vec4(0.0));
float lum=dot(color.rgb,vec3(0.299,0.587,0.114));
lum-=shaderParam0.x+shaderParamArg0.x;
color=max(color*lum,vec4(0.0));
color.rgb*=shaderParam0.z;
color=max(color,bloom);
outputColor=color;`;

const TONE_FUNCTIONS = `vec3 calcReinhard(vec3 rgb){return rgb/(1.0+rgb);}
vec3 calcFilmic(vec3 rgb){
  vec3 x=max(vec3(0.0),rgb-0.004);
  return (x*(6.2*x+0.5))/(x*(6.2*x+1.7)+0.06);
}
vec3 funcFilmic2(vec3 rgb,float A,float B,float C,float D,float E,float F){
  return ((rgb*(A*rgb+C*B)+D*E)/(rgb*(A*rgb+B)+D*F))-(E/F);
}
vec3 calcFilmic2(vec3 rgb,vec3 linearWhite,float A,float B,float C,float D,float E,float F){
  return funcFilmic2(rgb,A,B,C,D,E,F)/funcFilmic2(linearWhite,A,B,C,D,E,F);
}`;

function toneBrightBody(mode: number, blueShift: boolean): string {
  const lines = [
    "vec4 color=max(texture(texture0,uv),vec4(0.0));",
    "vec4 bloom=texture(texture1,uv);",
    "float tone=texture(texture3,uv).r;",
  ];
  if (blueShift)
    lines.push(
      "float blue=1.0-(tone+1.5)/4.1;",
      "blue*=shaderParam0.z;",
      "blue=clamp(blue,0.0,1.0);",
      "vec3 rod=dot(color.rgb,vec3(0.299,0.587,0.114))*vec3(1.05,0.97,1.27);",
      "color.rgb=mix(color.rgb,rod,blue);",
    );
  if (mode >= 1)
    lines.push("color.rgb=mix(color.rgb,color.rgb*shaderParam0.w/(tone+0.001),shaderParam0.z);");
  if (mode === 2)
    lines.push(
      "color.rgb=pow(color.rgb,vec3(2.2));",
      "color.rgb=calcReinhard(color.rgb);",
      "color.rgb=pow(color.rgb,vec3(1.0/2.2));",
    );
  else if (mode === 3)
    lines.push("color.rgb=pow(color.rgb,vec3(2.2));", "color.rgb=calcFilmic(color.rgb);");
  else if (mode === 4)
    lines.push(
      "color.rgb=pow(color.rgb,vec3(2.2));",
      "color.rgb=calcFilmic2(color.rgb,vec3(shaderParam2.z),shaderParam1.x,shaderParam1.y,shaderParam1.z,shaderParam1.w,shaderParam2.x,shaderParam2.y);",
      "color.rgb=pow(color.rgb,vec3(1.0/2.2));",
    );
  lines.push(
    "color.rgb+=bloom.rgb;",
    "if(any(greaterThan(color,vec4(999.9))))color=vec4(0.0);",
    "outputColor=color;",
  );
  return lines.join("\n");
}

const TONE_WHITE = `vec2 move=textureSize0.zw;
vec2 hmove=move*0.5;
vec2 centers[4]=vec2[4](uv+vec2(-move.x,move.y),uv+vec2(move.x,move.y),uv+vec2(-move.x,-move.y),uv+vec2(move.x,-move.y));
float lumSum=0.0;
for(int i=0;i<4;i++){
  vec4 c=texture(texture0,centers[i]+vec2(-hmove.x,hmove.y));
  lumSum+=log(dot(c.rgb,vec3(0.299,0.587,0.114))+0.05);
  c=texture(texture0,centers[i]+vec2(hmove.x,hmove.y));
  lumSum+=log(dot(c.rgb,vec3(0.299,0.587,0.114))+0.05);
  c=texture(texture0,centers[i]+vec2(-hmove.x,-hmove.y));
  lumSum+=log(dot(c.rgb,vec3(0.299,0.587,0.114))+0.05);
  c=texture(texture0,centers[i]+vec2(hmove.x,-hmove.y));
  lumSum+=log(dot(c.rgb,vec3(0.299,0.587,0.114))+0.05);
}
lumSum/=16.0;
lumSum=exp(lumSum);
float tone=texture(texture1,uv).r;
lumSum=mix(tone,lumSum,shaderParam0.x);
lumSum=clamp(lumSum,0.01,999999.0);
outputColor=vec4(lumSum);`;

const COPY = "outputColor=texture(texture0,uv);";

/** Converts downward-positive streak arguments to render-target UVs at sampling. */
function starBody(shader: "starLong" | "starShort" | "starSingle"): string {
  return `vec2 ofs=shaderParam0.xy*shaderParamArg0.xy*vec2(1.0,-1.0)${shader === "starLong" ? "*8.0" : ""};
vec4 color=vec4(0.0);
for(int tap=0;tap<8;tap++)color+=texture(texture0,uv-ofs*float(tap))${shader === "starShort" ? "" : "*starWeights[tap]"};
outputColor=color${shader === "starShort" ? "/8.0" : ""};`;
}

interface Program {
  readonly program: WebGLProgram;
  readonly uniforms: Record<string, WebGLUniformLocation | null>;
}

interface Image {
  readonly texture: WebGLTexture;
  readonly width: number;
  readonly height: number;
}

interface Surface extends Image {
  readonly framebuffer: WebGLFramebuffer;
}

/**
 * Runs the tone-mapping bloom filter: a reduction pyramid sized for a frame of `glow`'s size, read
 * from `source`, then retina adaptation, bloom levels and the composite over `scene` into
 * `output` at the scene's size.
 */
export interface StageBloom2Pass {
  /** Reinitializes exposure from the next source image without reallocating its targets. */
  resetHistory(): void;
  apply(
    bloom: StageBloom2,
    glow: { width: number; height: number },
    source: Image,
    scene: Image,
    output: WebGLFramebuffer | null,
    /** Whole Stage ticks since the previous draw; zero holds the existing exposure. */
    historyFrames?: number,
  ): boolean;
  dispose(): void;
}

export function createStageBloom2Pass(gl: WebGL2RenderingContext): StageBloom2Pass {
  const programs = new Map<string, Program>();
  const program = (key: string, body: string, functions = ""): Program => {
    let entry = programs.get(key);
    if (entry) return entry;
    const handle = compileProgram(gl, {
      name: "Stage bloom",
      vertex: VERTEX,
      fragment: `${PREFIX}\n${functions}\nvoid main(){\n${body}\n}`,
    });
    gl.useProgram(handle);
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of [
      "textureSize0",
      "targetSize",
      "shaderParam0",
      "shaderParam1",
      "shaderParam2",
      "shaderParamArg0",
      "starWeights[0]",
    ])
      uniforms[name] = gl.getUniformLocation(handle, name);
    for (let i = 0; i < 4; i++) gl.uniform1i(gl.getUniformLocation(handle, `texture${i}`), i);
    entry = { program: handle, uniforms };
    programs.set(key, entry);
    return entry;
  };
  const shaderFor = (step: Bloom2Draw, bloom: StageBloom2): Program => {
    switch (step.shader) {
      case "reduce":
        return program("reduce", REDUCE);
      case "reduce16":
        return program("reduce16", REDUCE16);
      case "lumExt":
        return program("lumExt", LUM_EXT);
      case "gaussW":
        return program("gaussW", gaussBody(true));
      case "gaussH":
        return program("gaussH", gaussBody(false));
      case "starLong":
      case "starShort":
      case "starSingle":
        return program(step.shader, starBody(step.shader));
      case "copy":
        return program("copy", COPY);
      case "toneBright":
        return program(
          `toneBright${bloom.toneMode}${bloom.blueShift}`,
          toneBrightBody(bloom.toneMode, bloom.blueShift),
          TONE_FUNCTIONS,
        );
    }
  };
  const vao = gl.createVertexArray()!;
  const sampler = gl.createSampler()!;
  gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const black = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, black);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    Uint8Array.of(0, 0, 0, 255),
  );
  let levels: Surface[] = [];
  let results: Surface[] = [];
  let retina: Surface[] = [];
  let stars: Surface[] = [];
  let frame = -1;
  let size = [0, 0];
  const plans = new WeakMap<
    StageBloom2,
    { width: number; height: number; plan: ReturnType<typeof buildBloom2Plan> }
  >();
  const release = () => {
    for (const s of [...levels, ...results, ...retina, ...stars]) {
      gl.deleteTexture(s.texture);
      gl.deleteFramebuffer(s.framebuffer);
    }
    levels = [];
    results = [];
    retina = [];
    stars = [];
    size = [0, 0];
    frame = -1;
  };
  const allocate = (width: number, height: number) => {
    release();
    try {
      for (const dimension of bloom2LevelSizes(width, height)) {
        levels.push(createPostSurface(gl, dimension.width, dimension.height, gl.RGBA16F));
        results.push(createPostSurface(gl, dimension.width, dimension.height, gl.RGBA16F));
      }
      for (let i = 0; i < 2; i++) retina.push(createPostSurface(gl, 1, 1, gl.R16F));
      size = [width, height];
    } catch (error) {
      release();
      throw error;
    }
  };
  let toneTexture: WebGLTexture | null = null;
  const copyParams = new Float32Array(12);
  const toneParams = new Float32Array(12);
  const toneArgument = new Float32Array(4);
  const imageOf = (image: Bloom2Image, scene: Image): Image => {
    switch (image.kind) {
      case "scene":
        return scene;
      case "tone":
        return { texture: toneTexture!, width: 1, height: 1 };
      case "none":
        return { texture: black, width: 1, height: 1 };
      case "level":
        return levels[image.index];
      case "result":
        return results[image.index];
      case "star":
        return stars[image.index];
    }
  };
  const run = (
    entry: Program,
    target: { framebuffer: WebGLFramebuffer | null; width: number; height: number },
    inputs: Image[],
    params: Float32Array,
    argument: Float32Array,
  ) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(entry.program);
    inputs.forEach((input, slot) => {
      gl.activeTexture(gl.TEXTURE0 + slot);
      gl.bindTexture(gl.TEXTURE_2D, input.texture);
      gl.bindSampler(slot, sampler);
    });
    const first = inputs[0];
    gl.uniform4f(
      entry.uniforms.textureSize0,
      first.width,
      first.height,
      1 / first.width,
      1 / first.height,
    );
    gl.uniform4f(
      entry.uniforms.targetSize,
      target.width,
      target.height,
      1 / target.width,
      1 / target.height,
    );
    gl.uniform4fv(entry.uniforms.shaderParam0, params, 0, 4);
    gl.uniform4fv(entry.uniforms.shaderParam1, params, 4, 4);
    gl.uniform4fv(entry.uniforms.shaderParam2, params, 8, 4);
    gl.uniform4fv(entry.uniforms.shaderParamArg0, argument);
    if (entry.uniforms["starWeights[0]"] !== null)
      gl.uniform4fv(entry.uniforms["starWeights[0]"], params, 4, 32);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const draw = (
    step: Bloom2Draw,
    bloom: StageBloom2,
    scene: Image,
    output: { framebuffer: WebGLFramebuffer | null; width: number; height: number },
  ) => {
    const target =
      step.target === "output"
        ? output
        : step.target.kind === "level"
          ? levels[step.target.index]
          : step.target.kind === "star"
            ? stars[step.target.index]
            : results[step.target.index];
    if (step.blend === "replace") gl.disable(gl.BLEND);
    else {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.blendEquation(step.blend === "max" ? gl.MAX : gl.FUNC_ADD);
    }
    run(
      shaderFor(step, bloom),
      target,
      step.inputs.map((image) => imageOf(image, scene)),
      step.params,
      step.argument,
    );
  };
  return {
    resetHistory() {
      frame = -1;
      toneTexture = null;
    },
    apply(bloom, glow, source, scene, output, historyFrames = 1) {
      if (size[0] !== glow.width || size[1] !== glow.height) allocate(glow.width, glow.height);
      if (levels.length === 0) return false;
      let cached = plans.get(bloom);
      if (!cached || cached.width !== glow.width || cached.height !== glow.height) {
        cached = { ...glow, plan: buildBloom2Plan(bloom, glow.width, glow.height) };
        plans.set(bloom, cached);
      }
      const plan = cached.plan;
      if (plan.stars.length > 0 && stars.length === 0) {
        try {
          for (let i = 0; i < 3; i++)
            stars.push(createPostSurface(gl, levels[0].width, levels[0].height, gl.RGBA16F));
        } catch (error) {
          release();
          throw error;
        }
      }
      const destination = { framebuffer: output, width: scene.width, height: scene.height };
      gl.bindVertexArray(vao);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.BLEND);
      gl.depthMask(false);
      gl.colorMask(true, true, true, true);
      for (const step of plan.reduction) draw(step, bloom, source, destination);
      const top = levels.length - 1;
      if (bloom.toneMode !== 0 && (frame < 0 || historyFrames > 0)) {
        const initialize = frame < 0;
        if (frame < 0) {
          frame = 0;
          run(program("copy", COPY), retina[0], [levels[top]], copyParams, toneArgument);
        }
        const read = frame % 2 === 0 ? retina[0] : retina[1];
        const write = frame % 2 === 0 ? retina[1] : retina[0];
        toneParams[0] =
          initialize || historyFrames === 1
            ? bloom.toneRetinaSpeed
            : 1 - (1 - bloom.toneRetinaSpeed) ** historyFrames;
        run(program("toneWhite", TONE_WHITE), write, [levels[top], read], toneParams, toneArgument);
        toneTexture = write.texture;
        frame++;
      } else if (bloom.toneMode === 0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, retina[0].framebuffer);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        toneTexture = retina[0].texture;
        frame = -1;
      }
      if (plan.stars.length > 0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, stars[2].framebuffer);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        for (const step of plan.stars) draw(step, bloom, scene, destination);
      }
      for (const step of plan.bloom) draw(step, bloom, scene, destination);
      draw(plan.final, bloom, scene, destination);
      for (let slot = 0; slot < 4; slot++) gl.bindSampler(slot, null);
      gl.bindVertexArray(null);
      return true;
    },
    dispose() {
      release();
      for (const entry of programs.values()) gl.deleteProgram(entry.program);
      programs.clear();
      gl.deleteTexture(black);
      gl.deleteSampler(sampler);
      gl.deleteVertexArray(vao);
    },
  };
}
