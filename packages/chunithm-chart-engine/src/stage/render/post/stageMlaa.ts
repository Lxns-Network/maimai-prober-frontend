import type { StageMlaa } from "../../nodes/mlaa";
import { buildMlaaArea } from "./mlaaArea";
import {
  createPostProgram,
  createPostSampler,
  createPostSurface,
  disposePostSurface,
  type PostProgram,
  type PostSurface,
} from "./postKit";

export const MLAA_EDGE_SHADER = `void main(){
  vec2 tc=pixelUv();
  vec4 offset0=tc.xyxy+textureSize0.zwzw*vec4(-1.0,0.0,0.0,-1.0);
  vec4 offset1=tc.xyxy+textureSize0.zwzw*vec4(1.0,0.0,0.0,1.0);
  vec3 weights=vec3(0.2126,0.7152,0.0722);
  float L=dot(sampleImage(texture0,tc).rgb,weights);
  float Lleft=dot(sampleImage(texture0,offset0.xy).rgb,weights);
  float Ltop=dot(sampleImage(texture0,offset0.zw).rgb,weights);
  float Lright=dot(sampleImage(texture0,offset1.xy).rgb,weights);
  float Lbottom=dot(sampleImage(texture0,offset1.zw).rgb,weights);
  vec4 delta=abs(vec4(L)-vec4(Lleft,Ltop,Lright,Lbottom));
  outputColor=step(vec4(shaderParam0.x),delta);
}`;

export function mlaaWeightShader(distance: number): string {
  return `const float MAX_DISTANCE=${distance}.0;
const float MAX_SEARCH_STEPS=8.0;
vec4 edgeAt(vec2 tc,vec2 offset){return sampleImageLevel0(texture1,tc+textureSize0.zw*offset);}
float searchXLeft(vec2 tc){
  float i;
  float e=0.0;
  for(i=-1.5;i>-2.0*MAX_SEARCH_STEPS;i-=2.0){
    e=edgeAt(tc,vec2(i,0.0)).g;
    if(e<0.9)return max(i+1.5-2.0*e,-2.0*MAX_SEARCH_STEPS);
  }
  return max(i+1.5-2.0*e,-2.0*MAX_SEARCH_STEPS);
}
float searchXRight(vec2 tc){
  float i;
  float e=0.0;
  for(i=1.5;i<2.0*MAX_SEARCH_STEPS;i+=2.0){
    e=edgeAt(tc,vec2(i,0.0)).g;
    if(e<0.9)return min(i-1.5+2.0*e,2.0*MAX_SEARCH_STEPS);
  }
  return min(i-1.5+2.0*e,2.0*MAX_SEARCH_STEPS);
}
float searchYUp(vec2 tc){
  float i;
  float e=0.0;
  for(i=-1.5;i>-2.0*MAX_SEARCH_STEPS;i-=2.0){
    e=edgeAt(tc,vec2(0.0,i)).r;
    if(e<0.9)return max(i+1.5-2.0*e,-2.0*MAX_SEARCH_STEPS);
  }
  return max(i+1.5-2.0*e,-2.0*MAX_SEARCH_STEPS);
}
float searchYDown(vec2 tc){
  float i;
  float e=0.0;
  for(i=1.5;i<2.0*MAX_SEARCH_STEPS;i+=2.0){
    e=edgeAt(tc,vec2(0.0,i)).r;
    if(e<0.9)return min(i-1.5+2.0*e,2.0*MAX_SEARCH_STEPS);
  }
  return min(i-1.5+2.0*e,2.0*MAX_SEARCH_STEPS);
}
vec2 areaLookup(vec2 dist,float e1,float e2){
  float areaSize=MAX_DISTANCE*5.0;
  vec2 pixcoord=MAX_DISTANCE*floor(4.0*vec2(e1,e2)+0.5)+dist;
  vec2 areaUv=pixcoord/(areaSize-1.0);
  return textureLod(texture2,areaUv,0.0).rg;
}
void main(){
  vec2 tc=pixelUv();
  vec4 areas=vec4(0.0);
  vec2 e=sampleImage(texture0,tc).rg;
  if(e.g!=0.0){
    vec2 d=vec2(searchXLeft(tc),searchXRight(tc));
    vec4 coords=vec4(d.x,-0.25,d.y+1.0,-0.25)*textureSize0.zwzw+tc.xyxy;
    float e1=sampleImageLevel0(texture1,coords.xy).r;
    float e2=sampleImageLevel0(texture1,coords.zw).r;
    areas.rg=areaLookup(abs(d),e1,e2);
  }
  if(e.r!=0.0){
    vec2 d=vec2(searchYUp(tc),searchYDown(tc));
    vec4 coords=vec4(-0.25,d.x,-0.25,d.y+1.0)*textureSize0.zwzw+tc.xyxy;
    float e1=sampleImageLevel0(texture1,coords.xy).g;
    float e2=sampleImageLevel0(texture1,coords.zw).g;
    areas.ba=areaLookup(abs(d),e1,e2);
  }
  outputColor=areas;
}`;
}

export const MLAA_BLEND_SHADER = `void main(){
  vec2 tc=pixelUv();
  vec4 offset1=tc.xyxy+textureSize0.zwzw*vec4(1.0,0.0,0.0,1.0);
  vec4 topLeft=sampleImage(texture2,tc);
  float bottom=sampleImage(texture2,offset1.zw).g;
  float right=sampleImage(texture2,offset1.xy).a;
  vec4 a=vec4(topLeft.r,bottom,topLeft.b,right);
  vec4 w=a*a*a;
  float sum=dot(w,vec4(1.0));
  if(sum<1e-5){
    outputColor=sampleImage(texture1,tc);
    return;
  }
  vec4 color=vec4(0.0);
  vec4 coords=vec4(0.0,-a.r,0.0,a.g)*textureSize0.wwww+tc.xyxy;
  color=sampleImage(texture1,coords.xy)*w.r+color;
  color=sampleImage(texture1,coords.zw)*w.g+color;
  coords=vec4(-a.b,0.0,a.a,0.0)*textureSize0.zzzz+tc.xyxy;
  color=sampleImage(texture1,coords.xy)*w.b+color;
  color=sampleImage(texture1,coords.zw)*w.a+color;
  outputColor=color/sum;
}`;

/** Runs the morphological anti-aliasing filter: edge detection, blend weights from the area lookup, and the blend. */
export interface StageMlaaPass {
  apply(
    mlaa: StageMlaa,
    scene: { texture: WebGLTexture },
    output: WebGLFramebuffer | null,
    width: number,
    height: number,
  ): void;
  dispose(): void;
}

export function createStageMlaaPass(gl: WebGL2RenderingContext): StageMlaaPass {
  const programs = new Map<string, PostProgram>();
  const program = (key: string, body: string): PostProgram => {
    let entry = programs.get(key);
    if (!entry) {
      entry = createPostProgram(gl, body);
      programs.set(key, entry);
    }
    return entry;
  };
  const vao = gl.createVertexArray()!;
  const linear = createPostSampler(gl, gl.LINEAR);
  const nearest = createPostSampler(gl, gl.NEAREST);
  const areas = new Map<number, WebGLTexture>();
  const areaTexture = (distance: number): WebGLTexture => {
    let texture = areas.get(distance);
    if (texture) return texture;
    const area = buildMlaaArea(distance);
    texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG8, area.size, area.size);
    const alignment = gl.getParameter(gl.UNPACK_ALIGNMENT) as number;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      area.size,
      area.size,
      gl.RG,
      gl.UNSIGNED_BYTE,
      area.texels,
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, alignment);
    areas.set(distance, texture);
    return texture;
  };
  let edges: PostSurface | null = null;
  let weights: PostSurface | null = null;
  let size = [0, 0];
  const release = () => {
    disposePostSurface(gl, edges);
    disposePostSurface(gl, weights);
    edges = weights = null;
    size = [0, 0];
  };
  const run = (
    entry: PostProgram,
    target: WebGLFramebuffer | null,
    width: number,
    height: number,
    inputs: readonly { texture: WebGLTexture; sampler: WebGLSampler }[],
    threshold: number,
  ) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, width, height);
    gl.useProgram(entry.program);
    inputs.forEach((input, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, input.texture);
      gl.bindSampler(unit, input.sampler);
    });
    gl.uniform4f(entry.uniforms.textureSize0, width, height, 1 / width, 1 / height);
    gl.uniform4f(entry.uniforms.targetSize, width, height, 1 / width, 1 / height);
    gl.uniform4f(entry.uniforms.shaderParam0, threshold, 0, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  return {
    apply(mlaa, scene, output, width, height) {
      if (!edges || !weights || size[0] !== width || size[1] !== height) {
        release();
        try {
          edges = createPostSurface(gl, width, height, gl.RGBA8);
          weights = createPostSurface(gl, width, height, gl.RGBA8);
        } catch (error) {
          release();
          throw error;
        }
        size = [width, height];
      }
      gl.bindVertexArray(vao);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.BLEND);
      gl.depthMask(false);
      gl.colorMask(true, true, true, true);
      const source = { texture: scene.texture, sampler: linear };
      run(
        program("edge", MLAA_EDGE_SHADER),
        edges.framebuffer,
        width,
        height,
        [{ texture: scene.texture, sampler: nearest }],
        mlaa.threshold,
      );
      run(
        program(`weight${mlaa.distance}`, mlaaWeightShader(mlaa.distance)),
        weights.framebuffer,
        width,
        height,
        [
          { texture: edges.texture, sampler: linear },
          { texture: edges.texture, sampler: linear },
          { texture: areaTexture(mlaa.distance), sampler: nearest },
        ],
        0,
      );
      run(
        program("blend", MLAA_BLEND_SHADER),
        output,
        width,
        height,
        [source, source, { texture: weights.texture, sampler: nearest }],
        0,
      );
      for (let unit = 0; unit < 3; unit++) gl.bindSampler(unit, null);
      gl.bindVertexArray(null);
    },
    dispose() {
      release();
      for (const entry of programs.values()) gl.deleteProgram(entry.program);
      programs.clear();
      for (const texture of areas.values()) gl.deleteTexture(texture);
      areas.clear();
      gl.deleteSampler(linear);
      gl.deleteSampler(nearest);
      gl.deleteVertexArray(vao);
    },
  };
}
