import { createPostProgram, createPostSampler, type PostProgram } from "./postKit";

export const FXAA3_SHADER = `void main(){
  vec2 center=pixelUv();
  vec2 rcpFrame=textureSize0.zw;
  vec2 shifted=center-rcpFrame*(0.5-0.25);
  vec3 luma=vec3(0.299,0.587,0.114);
  vec3 rgbNW=sampleImage(texture0,shifted).xyz;
  vec3 rgbNE=sampleImage(texture0,shifted+vec2(1.0,0.0)*rcpFrame).xyz;
  vec3 rgbSW=sampleImage(texture0,shifted+vec2(0.0,1.0)*rcpFrame).xyz;
  vec3 rgbSE=sampleImage(texture0,shifted+vec2(1.0,1.0)*rcpFrame).xyz;
  vec4 base=sampleImage(texture0,center);
  vec3 rgbM=base.xyz;
  float lumaNW=dot(rgbNW,luma);
  float lumaNE=dot(rgbNE,luma);
  float lumaSW=dot(rgbSW,luma);
  float lumaSE=dot(rgbSE,luma);
  float lumaM=dot(rgbM,luma);
  float lumaMin=min(lumaM,min(min(lumaNW,lumaNE),min(lumaSW,lumaSE)));
  float lumaMax=max(lumaM,max(max(lumaNW,lumaNE),max(lumaSW,lumaSE)));
  vec2 dir;
  dir.x=-((lumaNW+lumaNE)-(lumaSW+lumaSE));
  dir.y=((lumaNW+lumaSW)-(lumaNE+lumaSE));
  float dirReduce=max((lumaNW+lumaNE+lumaSW+lumaSE)*(0.25*(1.0/8.0)),1.0/128.0);
  float rcpDirMin=1.0/(min(abs(dir.x),abs(dir.y))+dirReduce);
  dir=min(vec2(8.0,8.0),max(vec2(-8.0,-8.0),dir*rcpDirMin))*rcpFrame;
  vec3 rgbA=(1.0/2.0)*(
    sampleImage(texture0,center+dir*(1.0/3.0-0.5)).xyz+
    sampleImage(texture0,center+dir*(2.0/3.0-0.5)).xyz);
  vec3 rgbB=rgbA*(1.0/2.0)+(1.0/4.0)*(
    sampleImage(texture0,center+dir*(0.0/3.0-0.5)).xyz+
    sampleImage(texture0,center+dir*(3.0/3.0-0.5)).xyz);
  float lumaB=dot(rgbB,luma);
  if((lumaB<lumaMin)||(lumaB>lumaMax)){
    outputColor=vec4(rgbA,base.w);
    return;
  }
  outputColor=vec4(rgbB,base.w);
}`;

/** Runs the edge-smoothing filter: one full-screen pass over the scene. */
export interface StageFxaa3Pass {
  apply(
    scene: { texture: WebGLTexture },
    output: WebGLFramebuffer | null,
    width: number,
    height: number,
  ): void;
  dispose(): void;
}

export function createStageFxaa3Pass(gl: WebGL2RenderingContext): StageFxaa3Pass {
  let entry: PostProgram | null = null;
  const vao = gl.createVertexArray()!;
  const sampler = createPostSampler(gl, gl.LINEAR);
  return {
    apply(scene, output, width, height) {
      entry ??= createPostProgram(gl, FXAA3_SHADER);
      gl.bindVertexArray(vao);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.BLEND);
      gl.depthMask(false);
      gl.colorMask(true, true, true, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, output);
      gl.viewport(0, 0, width, height);
      gl.useProgram(entry.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, scene.texture);
      gl.bindSampler(0, sampler);
      gl.uniform4f(entry.uniforms.textureSize0, width, height, 1 / width, 1 / height);
      gl.uniform4f(entry.uniforms.targetSize, width, height, 1 / width, 1 / height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindSampler(0, null);
      gl.bindVertexArray(null);
    },
    dispose() {
      if (entry) gl.deleteProgram(entry.program);
      gl.deleteSampler(sampler);
      gl.deleteVertexArray(vao);
    },
  };
}
