import {
  STAGE_FOG_GLSL,
  STAGE_SHADOW_CASCADE_GLSL,
  STAGE_SHADOW_SAMPLE_GLSL,
} from "../stage/render/stageShader";

/**
 * Shader sources for effect primitives and particles.
 *
 * Both programs write clip depth remapped to the GL range and may sample the framebuffer's depth,
 * so a quad fades where it meets geometry already drawn. A program is chosen per distinct
 * combination of the {@link EffectProgramKey} fields.
 */

export interface EffectProgramKey {
  particle: boolean;
  billboard?: boolean;
  points?: boolean;
  /** Fades alpha with the distance to the geometry the depth snapshot holds. */
  softEdge: boolean;
  refraction?: boolean;
  textures: number;
  /** Blend mode between textures 0 and 1, and between that result and texture 2; 0 is none. */
  blend0: number;
  blend1: number;
  /** Texture units after the first read their own coordinate set. */
  separateUv: boolean;
  /** The colour is one value for every vertex and arrives as a uniform. */
  uniformColor: boolean;
  /** Normal-bearing primitives lit by this many parallel lights. */
  parallelLights: number;
  shadow?: boolean;
  fog?: boolean;
}

/** Locations every program binds its vertex streams to. */
export const EFFECT_ATTRIBUTES = Object.freeze({
  position: 0,
  color: 1,
  uv: 2,
  uv1: 3,
  normal: 4,
  tangent: 0,
  birthPosition: 1,
  birthRotation: 2,
});

/** Texture units of the colour textures; the depth snapshot follows them. */
export const EFFECT_DEPTH_UNIT = 3;
export const EFFECT_COLOR_UNIT = 4;

const PARTICLE_REGISTERS = 59;

const SOFT_EDGE = `
vec4 effectSoftEdge(vec4 color, float targetDepth, float fragmentDistance, vec4 systemParam, vec4 fixedParam0) {
  float distance = systemParam.w / (targetDepth + systemParam.z);
  color.a *= clamp((distance - fragmentDistance) / fixedParam0.x, 0.0, 1.0);
  return color;
}
`;

/** Particle motion, evaluated per vertex from the 59 parameter vectors. */
const PARTICLE = `
${Array.from({ length: PARTICLE_REGISTERS }, (_, i) => `uniform vec4 uParticle${i};`).join("\n")}
struct ParticleVertex { vec3 position; vec4 tangent; vec4 color; vec4 rotation; vec2 uv; };
float particleFmod(float x, float y) {
  float magnitude = y == 0.0 ? 0.0 : fract(abs(x * (1.0 / y))) * abs(y);
  return x < 0.0 ? -magnitude : magnitude;
}
vec3 particleFmod(vec3 x, vec3 y) {
  return vec3(particleFmod(x.x,y.x),particleFmod(x.y,y.y),particleFmod(x.z,y.z));
}
float particleSmoothstep(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
vec4 particleRand(ParticleVertex v, float seed) {
  return fract(v.tangent.xyzx * (vec4(700.0,800.0,900.0,1000.0) + seed));
}
mat3 particleRotation(vec4 q) {
  return transpose(mat3(
    1.0-2.0*q.y*q.y-2.0*q.z*q.z, 2.0*q.x*q.y-2.0*q.w*q.z, 2.0*q.x*q.z+2.0*q.w*q.y,
    2.0*q.x*q.y+2.0*q.w*q.z, 1.0-2.0*q.x*q.x-2.0*q.z*q.z, 2.0*q.y*q.z-2.0*q.w*q.x,
    2.0*q.x*q.z-2.0*q.w*q.y, 2.0*q.y*q.z+2.0*q.w*q.x, 1.0-2.0*q.x*q.x-2.0*q.y*q.y));
}
void particleColor(inout vec4 color, inout float time, vec4 a, vec4 b, float duration, ParticleVertex v) {
  if(time>0.0) {
    float next=time-duration;
    vec4 target=particleRand(v,0.789)*a+b;
    color=next<0.0?mix(color,target,time/duration):target;
    time=next;
  }
}
void particleScale(inout vec4 scale, inout float time, vec4 target) {
  if(time>0.0) {
    float next=time-target.w;
    scale=next<0.0?mix(scale,target,time/target.w):target;
    time=next;
  }
}
void particleVelocity(inout vec3 position, float time, vec4 a, vec4 b, ParticleVertex v) {
  vec3 velocity=particleRand(v,0.234).xyz*a.xyz+b.xyz;
  if(a.w>=time) {} else if(time>=b.w) position+=velocity*(b.w-a.w);
  else position+=velocity*(time-a.w);
}
void particleAccel(inout vec3 position, float time, vec4 a, vec4 b, ParticleVertex v) {
  vec3 velocity=particleRand(v,0.345).xyz*a.xyz+b.xyz;
  if(a.w>=time) {} else if(time>=b.w) position+=0.5*velocity*pow(b.w-a.w,2.0);
  else position+=0.5*velocity*pow(time-a.w,2.0);
}
void particleRadial(inout vec3 position, float time, vec4 a, vec4 b, ParticleVertex v) {
  vec4 r=particleRand(v,0.456);
  vec3 velocity=normalize(r.xyz-0.5)*(r.w*a.x+b.x);
  if(a.w>=time) {} else if(time>=b.w) position+=velocity*(b.w-a.w);
  else position+=velocity*(time-a.w);
}
void particleForce(inout vec3 position, inout vec3 force, inout float time, vec4 a, vec4 b, ParticleVertex v, bool last) {
  if(time>0.0) {
    float next=time-a.w;
    vec3 accel=particleRand(v,0.567).xyz*a.xyz+b.xyz;
    if(next<0.0||last) {
      force=mix(force,accel,clamp(time/a.w,0.0,1.0));
      position+=force*time;
    } else {force=accel;position+=force*a.w;}
    time=next;
  }
}
void particleDecel(inout vec2 target, inout float time, vec4 a, bool last) {
  if(time>0.0) {
    float next=time-a.w;
    if(next<0.0) {
      float speed=mix(target.y,a.x,clamp(time/a.w,0.0,1.0));
      target.x+=time*mix(target.y,speed,0.5);target.y=speed;
    } else if(last) {
      float speed=mix(target.y,a.x,clamp(time/a.w,0.0,1.0));
      target.x+=a.w*mix(target.y,speed,0.5);target.y=speed;target.x+=next*a.x;
    } else {target.x+=a.w*mix(target.y,a.x,0.5);target.y=a.x;}
    time=next;
  }
}
vec2 particlePattern(vec2 uv, float time, ParticleVertex v) {
  float index=floor(time/uParticle55.x+uParticle54.z*uParticle54.w*particleRand(v,0.17934).z);
  index=uParticle55.y!=0.0?particleFmod(index,uParticle54.w):min(index,uParticle54.w);
  vec2 rect=uParticle54.xy;
  uv*=rect;index*=uParticle54.x;
  uv.x+=rect.x*(fract(index)/uParticle54.x);uv.y+=rect.y*floor(index);
  return uv;
}
float particleCreate(float birth, float time, vec2 interval) {
  vec2 bounds=interval+time;
  return birth>=bounds.x&&birth<bounds.y?1.0:0.0;
}
void particleWorld(out vec3 result, inout ParticleVertex v, mat4 world, vec3 eye, vec3 direction, vec3 up) {
  v.tangent.xyz=particleRotation(uParticle5)*v.tangent.xyz;
  float birth=v.tangent.w*uParticle0.y, current=uParticle0.x;
  float time=current-birth;
  vec4 randTime=particleRand(v,0.634);
  time*=1.0+uParticle6.z*randTime.x;
  float create=particleCreate(birth,current,uParticle52.xy)+particleCreate(birth,current,uParticle52.zw)
    +particleCreate(birth,current,uParticle53.xy)+particleCreate(birth,current,uParticle53.zw);
  float ratio=fract(v.tangent.x*randTime.y+randTime.z);
  if(mix(1.0,ratio,uParticle6.w)<0.5) create=0.0;
  if(create<=0.0) {result=vec3(-99999999.0);return;}
  vec3 position=particleFmod(v.tangent.xyz*uParticle3.w,uParticle3.xyz);
  if(uParticle0.z>=1.5) position=particleRotation(v.rotation)*position+v.position;
  float decTime=time;
  vec2 target=vec2(0.0,1.0);
  particleDecel(target,decTime,uParticle46,false);
  particleDecel(target,decTime,uParticle48,false);
  particleDecel(target,decTime,uParticle50,true);
  decTime=target.x;
  particleVelocity(position,decTime,uParticle22,uParticle23,v);
  particleVelocity(position,decTime,uParticle24,uParticle24,v);
  particleVelocity(position,decTime,uParticle26,uParticle25,v);
  particleAccel(position,decTime,uParticle28,uParticle29,v);
  particleAccel(position,decTime,uParticle30,uParticle31,v);
  particleAccel(position,decTime,uParticle32,uParticle33,v);
  particleRadial(position,decTime,uParticle34,uParticle35,v);
  particleRadial(position,decTime,uParticle36,uParticle37,v);
  particleRadial(position,decTime,uParticle38,uParticle39,v);
  float forceTime=decTime;
  vec3 force=vec3(0.0);
  particleForce(position,force,forceTime,uParticle40,uParticle41,v,false);
  particleForce(position,force,forceTime,uParticle42,uParticle43,v,false);
  particleForce(position,force,forceTime,uParticle44,uParticle45,v,true);
  vec2 uv=v.color.w<0.15?vec2(0.0):v.color.w<0.45?vec2(1.0,0.0):v.color.w<0.75?vec2(0.0,1.0):vec2(1.0);
  vec2 separate=uv-0.5;
  vec4 r=particleRand(v,0.123);
  separate.x*=r.x*uParticle1.x+uParticle1.y;
  separate.y*=uParticle1.z<0.0?r.x*uParticle1.x+uParticle1.y:r.y*uParticle1.z+uParticle1.w;
  vec4 scale=vec4(1.0,1.0,0.0,0.0);float scaleTime=time;
  particleScale(scale,scaleTime,uParticle18);particleScale(scale,scaleTime,uParticle19);
  particleScale(scale,scaleTime,uParticle20);particleScale(scale,scaleTime,uParticle21);
  separate*=scale.xy;separate*=uParticle55.w;
  vec2 angle=vec2(r.z*uParticle2.x+uParticle2.y,(r.w*uParticle2.z+uParticle2.w)*time);
  vec2 s=sin(angle),c=cos(angle),original=separate;
  separate=vec2(c.x*original.x-s.x*original.y,s.x*original.x+c.x*original.y);
  original=separate;separate=vec2(c.y*original.x-s.y*original.y,s.y*original.x+c.y*original.y);
  vec4 color=vec4(1.0,1.0,1.0,0.0);float colorTime=time;
  particleColor(color,colorTime,uParticle8,uParticle9,uParticle7.x,v);
  particleColor(color,colorTime,uParticle10,uParticle11,uParticle7.y,v);
  particleColor(color,colorTime,uParticle12,uParticle13,uParticle7.z,v);
  particleColor(color,colorTime,uParticle14,uParticle15,uParticle7.w,v);
  particleColor(color,colorTime,uParticle16,uParticle17,uParticle6.x,v);
  v.uv=particlePattern(uv,time,v);
  if(uParticle0.z<0.5) result=(world*vec4(position,1.0)).xyz;
  else if(uParticle0.z<1.5) result=particleRotation(v.rotation)*position+v.position;
  else result=position;
  result-=uParticle56.xyz;result=particleFmod(result,uParticle57.xyz);
  result+=uParticle58.xyz;result=particleFmod(result,uParticle57.xyz);result+=uParticle56.xyz;
  float dist=distance(eye,result);
  color.a*=particleSmoothstep(0.0,uParticle56.w,dist);
  color.a*=particleSmoothstep(uParticle57.w,uParticle57.w*0.5,dist);
  if(uParticle0.w>0.5) {
    if(uParticle0.w>1.5) up=mat3(world)*vec3(0.0,1.0,0.0);
    vec3 y=normalize(up),z=normalize(direction),x=normalize(cross(y,z));
    result+=mat3(x,y,z)*vec3(separate,0.0);
  } else result+=mat3(world)*vec3(separate,0.0);
  v.color=color*uParticle4;v.rotation=vec4(0.0);
}
`;

/** The same code addressing one 59-vector uniform array. */
const PARTICLE_ARRAY = PARTICLE.replace(/uniform vec4 uParticle\d+;\n/g, "").replace(
  /\buParticle(\d+)\b/g,
  "uParticles[$1]",
);

export function effectShaders(key: EffectProgramKey): { vertex: string; fragment: string } {
  const {
    particle,
    billboard,
    softEdge,
    textures,
    blend0,
    blend1,
    separateUv,
    uniformColor,
    parallelLights,
  } = key;
  const secondaryUv = separateUv
    ? "aTexCoord1"
    : particle
      ? "v.uv"
      : billboard
        ? "uv"
        : "aTexCoord";
  const vertex = `#version 300 es
precision highp float;
${particle ? "layout(location = 0) in vec4 aTangent;\nlayout(location = 1) in vec3 aBirthPosition;\nlayout(location = 2) in vec4 aBirthRotation;\nuniform vec3 uEyePosition;\nuniform vec4 uCornerAlpha;" : billboard ? "layout(location = 0) in vec3 aPosition;\nlayout(location = 2) in vec4 aUvRect;\nlayout(location = 3) in vec4 aExtent;" : "layout(location = 0) in vec3 aPosition;\nlayout(location = 2) in vec2 aTexCoord;"}
${
  key.fog
    ? `${particle ? "" : "uniform vec3 uEyePosition;"}
uniform int uFogMode;
uniform vec4 uFogRange;
uniform vec4 uFogHeight;
out float vFogVisibility;
${STAGE_FOG_GLSL}`
    : ""
}
${uniformColor ? "uniform vec4 uEffectColor;" : particle ? "" : "layout(location = 1) in vec4 aColor;"}
${separateUv ? "layout(location = 3) in vec2 aTexCoord1;" : ""}
${
  parallelLights
    ? `layout(location = 4) in vec3 aNormal;
uniform vec3 uParallelDirection[${parallelLights}];
uniform vec3 uParallelDiffuse[${parallelLights}];`
    : ""
}
uniform mat4 uWorld;
uniform mat4 uViewProjection;
${key.points ? "uniform float uPointSize;" : ""}
uniform vec4 uVertexParam0;
uniform vec4 uVertexParam1;
uniform vec4 uScreenParam;
out vec4 vColor;
out vec2 vUv;
out vec2 vUv1;
out vec2 vUv2;
out vec4 vScreen;
${key.shadow ? "out vec3 vWorldPosition;" : ""}
${particle ? `uniform vec4 uParticles[${PARTICLE_REGISTERS}];\n${PARTICLE_ARRAY}` : ""}
void main() {
  ${
    particle
      ? `ParticleVertex v = ParticleVertex(aBirthPosition, aTangent, vec4(0.0, 0.0, 0.0, uCornerAlpha[gl_VertexID & 3]), aBirthRotation, vec2(0.0));
  vec3 position;
  particleWorld(position, v, uWorld, uEyePosition,
    vec3(uViewProjection[0][2],uViewProjection[1][2],uViewProjection[2][2]),
    vec3(uViewProjection[0][1],uViewProjection[1][1],uViewProjection[2][1]));
  vec4 p = uViewProjection * vec4(position, 1.0);
  vColor = v.color;
  vUv = v.uv + uVertexParam0.zw;`
      : billboard
        ? `const int corners[6] = int[6](0, 1, 2, 2, 1, 3);
  int corner = corners[gl_VertexID];
  vec2 offsets[4] = vec2[4](vec2(-aExtent.x, aExtent.w), vec2(-aExtent.y, -aExtent.z),
    vec2(aExtent.y, aExtent.z), vec2(aExtent.x, -aExtent.w));
  vec3 localPosition = aPosition + vec3(offsets[corner], 0.0);
  vec3 position = (uWorld * vec4(localPosition, 1.0)).xyz;
  vec4 p = uViewProjection * vec4(position, 1.0);
  vec2 uv = vec2(corner < 2 ? aUvRect.x : aUvRect.z,
    (corner & 1) == 0 ? aUvRect.y : aUvRect.w);
  vColor = aColor;
  vUv = uv + uVertexParam0.zw;`
        : `vec4 p = uViewProjection * uWorld * vec4(aPosition, 1.0);
  vColor = ${uniformColor ? "uEffectColor" : "aColor"};
  vUv = aTexCoord + uVertexParam0.zw;`
  }
  ${
    parallelLights
      ? `${billboard ? "vec3 cornerNormal = aNormal * vec3(corner < 2 ? -1.0 : 1.0, (corner & 1) == 0 ? 1.0 : -1.0, 1.0);" : ""}
  vec3 normal = mat3(uWorld) * ${billboard ? "cornerNormal" : "aNormal"};
  vec3 diffuse = vec3(0.0);
  for (int i = 0; i < ${parallelLights}; i++) {
    float light = dot(normal, uParallelDirection[i]) * 0.5 + 0.5;
    diffuse += light * light * uParallelDiffuse[i];
  }
  vColor.rgb *= diffuse;`
      : ""
  }
  vUv1 = ${secondaryUv} + uVertexParam1.xy;
  ${key.shadow ? `vWorldPosition = ${particle || billboard ? "position" : "(uWorld * vec4(aPosition, 1.0)).xyz"};` : ""}
  ${
    key.fog
      ? `vec3 fogPosition = ${particle || billboard ? "position" : "(uWorld * vec4(aPosition, 1.0)).xyz"};
  vFogVisibility = stageFogVisibility(uFogMode, uFogRange, uFogHeight,
    length(fogPosition - uEyePosition), fogPosition.y, 1.0);`
      : ""
  }
  vUv2 = ${secondaryUv} + uVertexParam1.zw;
  gl_Position = vec4(p.xy, 2.0 * p.z - p.w, p.w);
  ${key.points ? "gl_PointSize = uPointSize;" : ""}
  vScreen = vec4(p.xy * vec2(0.5, -0.5) + 0.5 * p.w + 0.25 / uScreenParam.xy * p.w, p.zw);
}
`;
  const fragment = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec4 vColor;
in vec2 vUv;
in vec2 vUv1;
in vec2 vUv2;
in vec4 vScreen;
uniform sampler2D uTexture0;
uniform sampler2D uTexture1;
uniform sampler2D uTexture2;
uniform sampler2D uSceneDepth;
uniform sampler2D uSceneColor;
uniform vec4 uScreenParam;
uniform vec4 uSystemParam;
uniform vec4 uFixedParam0;
uniform int uDepthFlipY;
uniform vec4 uDepthUvTransform;
uniform float uDepthBias;
uniform int uAlphaTestEnabled;
uniform int uAlphaFunc;
uniform float uAlphaRef;
out vec4 outColor;
${key.fog ? "in float vFogVisibility;\nuniform vec3 uFogColor;" : ""}
${
  key.shadow
    ? `in vec3 vWorldPosition;
uniform sampler2DShadow uShadowImage0;
uniform sampler2DShadow uShadowImage1;
uniform sampler2DShadow uShadowImage2;
uniform mat4 uShadowMatrix0;
uniform mat4 uShadowMatrix1;
uniform mat4 uShadowMatrix2;
uniform int uShadowCascadeCount;
uniform bool uShadowEdgeHide;
uniform int uShadowSoftness;
uniform vec3 uShadowColor;
${STAGE_SHADOW_SAMPLE_GLSL}
${STAGE_SHADOW_CASCADE_GLSL}
float effectShadow() {
  return shadowCascades(uShadowImage0,uShadowImage1,uShadowImage2,
    uShadowMatrix0,uShadowMatrix1,uShadowMatrix2,uShadowCascadeCount,uShadowEdgeHide,uShadowSoftness,vWorldPosition);
}`
    : ""
}
${SOFT_EDGE}
vec4 multiTexBlend(vec4 src, vec4 dest, int mode) {
  if (mode == 2) return src;
  if (mode == 3) return mix(dest, src, src.a);
  if (mode == 4) return dest + src;
  if (mode == 5) return dest - src;
  if (mode == 6) return dest * src;
  if (mode == 7) return 1.0 - dest;
  if (mode == 9) return vec4(src.rgb, src.a + dest.a * 0.00001);
  if (mode == 10) return vec4(mix(dest.rgb, src.rgb, src.a), dest.a);
  if (mode == 11) return vec4(dest.rgb, src.r);
  if (mode == 12) return vec4(dest.rgb, dest.a * src.r);
  return dest;
}
bool alphaPass(float a) {
  if (uAlphaFunc == 1) return false;
  if (uAlphaFunc == 2) return a < uAlphaRef;
  if (uAlphaFunc == 3) return a == uAlphaRef;
  if (uAlphaFunc == 4) return a <= uAlphaRef;
  if (uAlphaFunc == 5) return a > uAlphaRef;
  if (uAlphaFunc == 6) return a != uAlphaRef;
  if (uAlphaFunc == 7) return a >= uAlphaRef;
  return true;
}
void main() {
  vec4 color = ${textures ? `texture(uTexture0, ${key.points ? "gl_PointCoord" : "vUv"})` : "vec4(1.0)"};
  ${textures > 1 && blend0 ? `color = multiTexBlend(texture(uTexture1, vUv1), color, ${blend0});` : ""}
  ${textures > 2 && blend1 ? `color = multiTexBlend(texture(uTexture2, vUv2), color, ${blend1});` : ""}
  color *= vColor;
  ${
    softEdge
      ? `vec2 uv = vScreen.xy / vScreen.w;
  if (uDepthFlipY != 0) uv.y = 1.0 - uv.y;
  uv = uv * uDepthUvTransform.xy + uDepthUvTransform.zw;
  color = effectSoftEdge(color, texture(uSceneDepth, uv).r, vScreen.w, uSystemParam, uFixedParam0);`
      : ""
  }
  color.rgb *= uFixedParam0.z;
  ${key.shadow ? "color.rgb *= mix(uShadowColor, vec3(1.0), effectShadow());" : ""}
  ${
    key.refraction
      ? `vec2 offset=(color.rg-0.5)*color.a*uFixedParam0.x*vScreen.w;
  if(abs(offset.x)<0.05 || abs(offset.y)<0.05) discard;
  vec2 colorUv=(vScreen.xy+offset/uScreenParam.xy)/vScreen.w;
  colorUv.y=1.0-colorUv.y;
  colorUv=colorUv*uDepthUvTransform.xy+uDepthUvTransform.zw;
  color.rgb=texture(uSceneColor,colorUv).rgb;
  color.a=1.0;`
      : ""
  }
  ${key.fog ? "color.rgb = mix(uFogColor, color.rgb, vFogVisibility);" : ""}
  if (any(greaterThan(color, vec4(999.9)))) color = vec4(0.0);
  if (uAlphaTestEnabled != 0 && !alphaPass(color.a)) discard;
  outColor = color;
  gl_FragDepth = gl_FragCoord.z + uDepthBias;
}
`;
  return { vertex, fragment };
}

/** A number that is equal for equal keys, so programs can be looked up without building a string. */
export function effectProgramId(key: EffectProgramKey): number {
  return (
    Number(key.particle) |
    (Number(key.softEdge) << 1) |
    (key.textures << 2) |
    (key.blend0 << 4) |
    (key.blend1 << 8) |
    (Number(key.separateUv) << 11) |
    (Number(key.uniformColor) << 12) |
    (key.parallelLights << 13) |
    (Number(key.shadow === true) << 15) |
    (Number(key.refraction === true) << 16) |
    (Number(key.billboard === true) << 17) |
    (Number(key.fog === true) << 18) |
    (Number(key.points === true) << 19)
  );
}
