import type { StageDof } from "../../nodes/dof";
import type { StageCameraLook } from "../../view";
import {
  DOF_STEPS,
  dofDepthCoefficients,
  dofTargetSize,
  dofUniforms,
  type DofImage,
} from "./dofPlan";
import {
  createPostProgram,
  createPostSampler,
  createPostSurface,
  disposePostSurface,
  type PostProgram,
  type PostSurface,
} from "./postKit";

const DISTANCE = `
float sceneDistance(vec2 at){
  float depth=sampleImage(texture1,at).r;
  return systemParam.y/(depth+systemParam.x);
}`;

const NO_BLUR_COC = Math.fround(0.1);

export const DOF_DOWN_SHADER = `
uniform vec2 systemParam;
${DISTANCE}
void main(){
  vec2 tc=pixelUv();
  vec3 color=sampleImage(texture0,tc).rgb;
  float depth=sceneDistance(tc);
  vec2 coc=min(max(shaderParam0.xz*depth+shaderParam0.yw,0.0),1.0);
  outputColor=vec4(color,max(coc.x,coc.y));
}`;

export function dofGaussianShader(focusNoBlur: boolean): string {
  const conditional = focusNoBlur;
  return `
uniform vec2 direction;
uniform float noBlurCoc;
void main(){
  vec2 tc=pixelUv();
  vec4 result=sampleImage(texture0,tc)*0.199471;
  float total=0.199471;
  ${[0.176033, 0.120985, 0.064759, 0.026995, 0.008764]
    .map(
      (weight, i) => `
  vec4 a${i}=sampleImage(texture0,tc+textureSize0.zw*direction*${i + 1}.0);
  vec4 b${i}=sampleImage(texture0,tc-textureSize0.zw*direction*${i + 1}.0);
  float wa${i}=${weight};
  float wb${i}=${weight};
  ${conditional ? `if(a${i}.a<noBlurCoc) wa${i}=0.0;\n  if(b${i}.a<noBlurCoc) wb${i}=0.0;` : ""}
  result.${conditional ? "rgb" : "rgba"}+=a${i}.${conditional ? "rgb" : "rgba"}*wa${i}+b${i}.${conditional ? "rgb" : "rgba"}*wb${i};
  total+=wa${i}+wb${i};`,
    )
    .join("")}
  result.${conditional ? "rgb" : "rgba"}/=total;
  outputColor=result;
}`;
}

export const DOF_NEAR_SHADER = `void main(){
  vec2 tc=pixelUv();
  vec4 small=sampleImage(texture0,tc);
  vec4 blurred=sampleImage(texture1,tc);
  outputColor=vec4(small.rgb,2.0*max(blurred.a,small.a)-small.a);
}`;

// The native draw passes zero sample offsets; its D3D9 position correction is unnecessary in WebGL.
export const DOF_SMALL_SHADER = `void main(){outputColor=sampleImage(texture0,pixelUv());}`;

export const DOF_COPY_SHADER = `void main(){outputColor=sampleImage(texture0,pixelUv());}`;

// Depth textures cannot use linear samplers on all WebGL drivers; interpolate nearest reads instead.
export const DOF_DEPTH_SHADER = `
uniform sampler2D depthImage;
uniform vec2 depthTexelSize;
float linearDofDepth(vec2 at){
  vec2 pixel=at/depthTexelSize-0.5;
  vec2 base=floor(pixel);
  vec2 weight=pixel-base;
  float a=sampleImageLevel0(depthImage,(base+vec2(0.5,0.5))*depthTexelSize).r;
  float b=sampleImageLevel0(depthImage,(base+vec2(1.5,0.5))*depthTexelSize).r;
  float c=sampleImageLevel0(depthImage,(base+vec2(0.5,1.5))*depthTexelSize).r;
  float d=sampleImageLevel0(depthImage,(base+vec2(1.5,1.5))*depthTexelSize).r;
  float top=a+(b-a)*weight.x;
  float bottom=c+(d-c)*weight.x;
  return top+(bottom-top)*weight.y;
}`;

export const DOF_COMBINE_SHADER = `
${DOF_DEPTH_SHADER}
uniform vec2 systemParam;
uniform vec4 farAndSky;
void main(){
  vec2 tc=pixelUv();
  vec4 med=sampleImage(texture1,tc);
  vec3 large=sampleImage(texture2,tc).rgb;
  float rawDepth=linearDofDepth(tc);
  float depth=systemParam.y/(rawDepth+systemParam.x);
  float coc=0.0;
  if(depth<=farAndSky.w) coc=max(med.a,min(max(farAndSky.x*depth+farAndSky.y,0.0),1.0));
  vec4 weights=min(max(coc*vec4(3.33333325,-2.0,-1.25,1.25)+vec4(1.0,0.39999998,1.25,-0.24999998),0.0),1.0);
  vec3 blurred=weights.z*med.rgb+weights.w*large;
  outputColor=vec4(sampleImage(texture0,tc).rgb*(1.0-coc)+blurred*coc,1.0);
}`;

export interface StageDofPass {
  apply(
    dof: StageDof,
    camera: StageCameraLook,
    scene: {
      readonly texture: WebGLTexture;
      readonly width: number;
      readonly height: number;
      readonly internalFormat: number;
    },
    sceneSnapshot: { readonly texture: WebGLTexture; readonly framebuffer: WebGLFramebuffer },
    depth: WebGLTexture,
    output: WebGLFramebuffer | null,
  ): void;
  dispose(): void;
}

/** The depth-of-field chain and its reduced-resolution targets. */
export function createStageDofPass(gl: WebGL2RenderingContext): StageDofPass {
  const programs = new Map<
    string,
    { entry: PostProgram; locations: Record<string, WebGLUniformLocation | null> }
  >();
  const getProgram = (key: string, source: string) => {
    let cached = programs.get(key);
    if (!cached) {
      const entry = createPostProgram(gl, source);
      const locations: Record<string, WebGLUniformLocation | null> = {};
      for (const name of [
        "systemParam",
        "farAndSky",
        "noBlurCoc",
        "direction",
        "depthImage",
        "depthTexelSize",
      ])
        locations[name] = gl.getUniformLocation(entry.program, name);
      cached = { entry, locations };
      programs.set(key, cached);
    }
    return cached;
  };
  const vao = gl.createVertexArray()!;
  const linear = createPostSampler(gl, gl.LINEAR);
  const nearest = createPostSampler(gl, gl.NEAREST);
  let surfaces: PostSurface[] = [];
  const gaussian = ["", ""];
  let width = 0;
  let height = 0;
  let internalFormat = 0;
  const release = () => {
    for (const surface of surfaces) disposePostSurface(gl, surface);
    surfaces = [];
    width = height = 0;
    internalFormat = 0;
  };
  return {
    apply(dof, camera, scene, sceneSnapshot, depth, output) {
      const size = dofTargetSize(scene.width, scene.height, dof.divisor);
      if (
        width !== size.width ||
        height !== size.height ||
        internalFormat !== scene.internalFormat
      ) {
        release();
        try {
          for (let i = 0; i < 3; i++)
            surfaces.push(createPostSurface(gl, size.width, size.height, scene.internalFormat));
        } catch (error) {
          release();
          throw error;
        }
        width = size.width;
        height = size.height;
        internalFormat = scene.internalFormat;
      }
      const equations = dofUniforms(dof, camera.position, camera.target);
      const [depthScale, depthNumerator] = dofDepthCoefficients(camera.projection);
      const textures: Record<Exclude<DofImage, "output">, WebGLTexture> = {
        scene: scene.texture,
        sceneSnapshot: sceneSnapshot.texture,
        depth,
        target0: surfaces[0].texture,
        target1: surfaces[1].texture,
        target2: surfaces[2].texture,
      };
      const variant = dof.focusNoBlur ? 1 : 0;
      gaussian[variant] ||= dofGaussianShader(dof.focusNoBlur);
      gl.bindVertexArray(vao);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.BLEND);
      gl.depthMask(false);
      gl.colorMask(true, true, true, true);
      for (const step of DOF_STEPS) {
        const source =
          step.shader === "down"
            ? DOF_DOWN_SHADER
            : step.shader === "near"
              ? DOF_NEAR_SHADER
              : step.shader === "small"
                ? DOF_SMALL_SHADER
                : step.shader === "copy"
                  ? DOF_COPY_SHADER
                  : step.shader === "combine"
                    ? DOF_COMBINE_SHADER
                    : gaussian[variant];
        const key =
          step.shader === "horizontal" || step.shader === "vertical"
            ? `gaussian-${dof.focusNoBlur}`
            : step.shader;
        const { entry, locations } = getProgram(key, source);
        const reduced = step.target.startsWith("target");
        const framebuffer = reduced
          ? surfaces[Number(step.target.slice(-1))].framebuffer
          : step.target === "sceneSnapshot"
            ? sceneSnapshot.framebuffer
            : output;
        const targetWidth = reduced ? width : scene.width;
        const targetHeight = reduced ? height : scene.height;
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(0, 0, targetWidth, targetHeight);
        gl.useProgram(entry.program);
        step.inputs.forEach((input, unit) => {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, textures[input as Exclude<DofImage, "output">]);
          gl.bindSampler(unit, input === "depth" ? nearest : linear);
        });
        const fullSize = step.inputs[0] === "scene" || step.inputs[0] === "sceneSnapshot";
        const sourceWidth = fullSize ? scene.width : width;
        const sourceHeight = fullSize ? scene.height : height;
        gl.uniform4f(
          entry.uniforms.textureSize0,
          sourceWidth,
          sourceHeight,
          1 / sourceWidth,
          1 / sourceHeight,
        );
        gl.uniform4f(
          entry.uniforms.targetSize,
          targetWidth,
          targetHeight,
          1 / targetWidth,
          1 / targetHeight,
        );
        gl.uniform4fv(entry.uniforms.shaderParam0, equations.nearAndFar);
        gl.uniform2f(locations.systemParam, depthScale, depthNumerator);
        gl.uniform4fv(locations.farAndSky, equations.farAndSky);
        gl.uniform1f(locations.noBlurCoc, NO_BLUR_COC);
        gl.uniform2f(
          locations.direction,
          step.shader === "horizontal" ? 1 : 0,
          step.shader === "vertical" ? 1 : 0,
        );
        if (step.shader === "combine") {
          gl.uniform1i(locations.depthImage, 3);
          gl.uniform2f(locations.depthTexelSize, 1 / scene.width, 1 / scene.height);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      for (let unit = 0; unit < 4; unit++) gl.bindSampler(unit, null);
      gl.bindVertexArray(null);
    },
    dispose() {
      release();
      for (const cached of programs.values()) gl.deleteProgram(cached.entry.program);
      programs.clear();
      gl.deleteSampler(linear);
      gl.deleteSampler(nearest);
      gl.deleteVertexArray(vao);
    },
  };
}
