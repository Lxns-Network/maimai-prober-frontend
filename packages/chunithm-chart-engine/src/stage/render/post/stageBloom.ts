import { compileProgram } from "../../../assets/shaderCompile";
import { bloomTargetSizes, type BloomShader, type BloomStep } from "./bloomPlan";
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
uniform sampler2D sourceImage0;
uniform sampler2D sourceImage1;
uniform vec4 textureSize0;
uniform vec4 targetSize;
uniform vec4 parameters[9];
uniform vec4 argument;
in vec2 uv;
out vec4 outputColor;`;

const BODIES: Record<BloomShader, { body: string; vectors: number }> = {
  reduceDeComp: {
    vectors: 0,
    body: `vec2 move=textureSize0.zw;
vec4 color=texture(sourceImage0,uv+vec2(-move.x,move.y));
color+=texture(sourceImage0,uv+vec2(move.x,move.y));
color+=texture(sourceImage0,uv+vec2(-move.x,-move.y));
color+=texture(sourceImage0,uv+vec2(move.x,-move.y));
outputColor=color/4.0;`,
  },
  reduce: {
    vectors: 0,
    body: `vec2 move=targetSize.zw*0.25;
vec4 color=texture(sourceImage0,uv+vec2(-move.x,move.y));
color+=texture(sourceImage0,uv+vec2(move.x,move.y));
color+=texture(sourceImage0,uv+vec2(-move.x,-move.y));
color+=texture(sourceImage0,uv+vec2(move.x,-move.y));
outputColor=max(color/4.0,vec4(0.0));`,
  },
  shiftRgb: {
    vectors: 5,
    body: `vec4 color=texture(sourceImage0,uv+vec2(textureSize0.z*parameters[4].x,0.0));
color.g=texture(sourceImage0,uv+vec2(textureSize0.z*parameters[4].y,0.0)).g;
color.b=texture(sourceImage0,uv+vec2(textureSize0.z*parameters[4].z,0.0)).b;
color=color*parameters[0]+parameters[1];
outputColor=clamp(color,parameters[2],parameters[3]);`,
  },
  shiftMax: {
    vectors: 5,
    body: `vec4 color=texture(sourceImage0,uv+vec2(textureSize0.z*parameters[4].x,0.0));
color.g=texture(sourceImage0,uv+vec2(textureSize0.z*parameters[4].y,0.0)).g;
color.b=texture(sourceImage0,uv+vec2(textureSize0.z*parameters[4].z,0.0)).b;
color=color*parameters[0]+parameters[1];
outputColor=clamp(color,texture(sourceImage1,uv),parameters[3]);`,
  },
  blur: {
    vectors: 7,
    body: `vec2 ofs=textureSize0.zw*parameters[0].xy;
vec4 color=vec4(0.0);
for(int tap=5;tap>=1;tap--)color+=texture(sourceImage0,uv+ofs*float(tap))*parameters[tap+1];
color+=texture(sourceImage0,uv)*parameters[1];
for(int tap=1;tap<=5;tap++)color+=texture(sourceImage0,uv-ofs*float(tap))*parameters[tap+1];
outputColor=color;`,
  },
  // Streak arguments use downward-positive Y; render-target UVs use upward-positive Y.
  starLong: {
    vectors: 9,
    body: `vec2 ofs=parameters[0].xy*argument.xy*vec2(8.0,-8.0);
vec4 color=vec4(0.0);
for(int tap=0;tap<8;tap++)color+=texture(sourceImage0,uv-ofs*float(tap))*parameters[tap+1];
outputColor=color;`,
  },
  starShort: {
    vectors: 1,
    body: `vec2 ofs=parameters[0].xy*argument.xy*vec2(1.0,-1.0);
vec4 color=vec4(0.0);
for(int tap=0;tap<8;tap++)color+=texture(sourceImage0,uv-ofs*float(tap));
outputColor=color/8.0;`,
  },
  starSingle: {
    vectors: 9,
    body: `vec2 ofs=parameters[0].xy*argument.xy*vec2(1.0,-1.0);
vec4 color=vec4(0.0);
for(int tap=0;tap<8;tap++)color+=texture(sourceImage0,uv-ofs*float(tap))*parameters[tap+1];
outputColor=color;`,
  },
  combine: {
    vectors: 1,
    body: `vec4 bloom=texture(sourceImage1,uv);
vec4 star=texture(sourceImage0,uv);
vec4 color=bloom*parameters[0].x+star*parameters[0].y;
color.a=0.0;
outputColor=color;`,
  },
};

interface Program {
  readonly program: WebGLProgram;
  readonly params: WebGLUniformLocation | null;
  readonly argument: WebGLUniformLocation | null;
  readonly textureSize: WebGLUniformLocation | null;
  readonly targetSize: WebGLUniformLocation | null;
  readonly vectors: number;
}

interface Target {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
}

/**
 * Runs a bloom draw sequence built for a frame of `glow`'s size, reading the scene from `source`
 * and adding the glow into the half-float `scene` target at its own size.
 */
export interface StageBloomPass {
  apply(
    plan: readonly BloomStep[],
    glow: { width: number; height: number },
    source: { texture: WebGLTexture; width: number; height: number },
    scene: { framebuffer: WebGLFramebuffer; width: number; height: number },
  ): void;
  dispose(): void;
}

export function createStageBloomPass(gl: WebGL2RenderingContext): StageBloomPass {
  const programs = new Map<BloomShader, Program>();
  const program = (name: BloomShader): Program => {
    let entry = programs.get(name);
    if (entry) return entry;
    const handle = compileProgram(gl, {
      name: "Stage bloom",
      vertex: VERTEX,
      fragment: `${PREFIX}\nvoid main(){\n${BODIES[name].body}\n}`,
    });
    gl.useProgram(handle);
    gl.uniform1i(gl.getUniformLocation(handle, "sourceImage0"), 0);
    gl.uniform1i(gl.getUniformLocation(handle, "sourceImage1"), 1);
    entry = {
      program: handle,
      params: gl.getUniformLocation(handle, "parameters[0]"),
      argument: gl.getUniformLocation(handle, "argument"),
      textureSize: gl.getUniformLocation(handle, "textureSize0"),
      targetSize: gl.getUniformLocation(handle, "targetSize"),
      vectors: BODIES[name].vectors,
    };
    programs.set(name, entry);
    return entry;
  };
  const vao = gl.createVertexArray()!;
  const sampler = gl.createSampler()!;
  gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  let targets: Target[] = [];
  let size = [0, 0];
  const release = () => {
    for (const target of targets) {
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.framebuffer);
    }
    targets = [];
    size = [0, 0];
  };
  const allocate = (width: number, height: number) => {
    release();
    try {
      for (const dimension of bloomTargetSizes(width, height))
        targets.push(createPostSurface(gl, dimension.width, dimension.height, gl.RGBA16F));
      size = [width, height];
    } catch (error) {
      release();
      throw error;
    }
  };
  return {
    apply(plan, glow, source, scene) {
      if (scene.width < 16 || scene.height < 16) return;
      if (size[0] !== glow.width || size[1] !== glow.height) allocate(glow.width, glow.height);
      gl.bindVertexArray(vao);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.depthMask(false);
      gl.colorMask(true, true, true, true);
      const image = (reference: number | "scene") =>
        reference === "scene" ? source : targets[reference];
      for (const step of plan) {
        const output = step.target === "scene" ? scene : targets[step.target];
        gl.bindFramebuffer(gl.FRAMEBUFFER, output.framebuffer);
        gl.viewport(0, 0, output.width, output.height);
        if (step.kind === "clear") {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          continue;
        }
        const entry = program(step.shader);
        gl.useProgram(entry.program);
        if (step.blend === "replace") gl.disable(gl.BLEND);
        else {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE);
          gl.blendEquation(step.blend === "max" ? gl.MAX : gl.FUNC_ADD);
        }
        step.inputs.forEach((reference, slot) => {
          gl.activeTexture(gl.TEXTURE0 + slot);
          gl.bindTexture(gl.TEXTURE_2D, image(reference).texture);
          gl.bindSampler(slot, sampler);
        });
        const first = image(step.inputs[0]);
        gl.uniform4f(
          entry.textureSize,
          first.width,
          first.height,
          1 / first.width,
          1 / first.height,
        );
        gl.uniform4f(
          entry.targetSize,
          output.width,
          output.height,
          1 / output.width,
          1 / output.height,
        );
        if (entry.vectors > 0) gl.uniform4fv(entry.params, step.params, 0, entry.vectors * 4);
        gl.uniform4fv(entry.argument, step.argument);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.bindSampler(0, null);
      gl.bindSampler(1, null);
      gl.bindVertexArray(null);
    },
    dispose() {
      release();
      for (const entry of programs.values()) gl.deleteProgram(entry.program);
      programs.clear();
      gl.deleteSampler(sampler);
      gl.deleteVertexArray(vao);
    },
  };
}
