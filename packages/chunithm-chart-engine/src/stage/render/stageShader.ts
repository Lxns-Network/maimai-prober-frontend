import { STAGE_INSTANCE_MOTION_GLSL } from "./instanceMotionShader";

/** Vertex attribute locations of stage model programs. */
export const STAGE_ATTRIBUTES = Object.freeze({
  position: 0,
  uv0: 1,
  color: 2,
  uv1: 3,
  normal: 4,
  weight0: 5,
  weight1: 6,
  tangent: 7,
  color1: 15,
});

/** Bones a skinned draw can address. */
export const STAGE_MAX_BONES = 64;

/** Ordinary wind displacement for vertex-colour shake materials. */
export const STAGE_VERTEX_SHAKE_GLSL = `
uniform bool shakeEnabled;
uniform bool shakeShader;
uniform vec3 shakeDirection;
uniform vec3 shakeTheta;
uniform vec3 shakeFrequency0;
uniform vec3 shakeFrequency1;

vec3 vertexShake(vec4 worldPosition, vec4 ratio){
  vec3 scale=shakeDirection*(1.0-ratio.r);
  vec3 position=worldPosition.xyz/shakeTheta;
  float product=position.x*position.y*position.z;
  return scale*(sin(shakeFrequency0+product)+sin(shakeFrequency1+product)-1.0);
}

vec4 shakeWorldPosition(vec3 localPosition, vec4 ratio, mat4 world){
  vec4 position=world*vec4(localPosition,1.0);
  if(shakeShader && shakeEnabled)position.xyz+=vertexShake(position,ratio);
  return position;
}

vec4 shakeOutputColor(vec4 color){
  return shakeShader?vec4(1.0,1.0,1.0,color.a):color;
}`;

/** Native fog visibility, including the HLSL smoothstep behavior for descending height limits. */
export const STAGE_FOG_GLSL = `
float stageFogVisibility(int mode, vec4 range, vec4 height, float distance, float worldY, float rate){
  float value=mode==1?clamp((range.x-distance)*range.y,0.0,1.0):clamp((range.x-distance)*range.y+range.w,range.w,range.z);
  if(mode==3){
    float ratio=clamp((worldY-height.x)/(height.y-height.x),0.0,1.0);
    float heightFactor=ratio*ratio*(3.0-2.0*ratio);
    float heightDistance=clamp((height.z-distance)*height.w,0.0,1.0);
    value=clamp(value-(1.0-heightDistance)*heightFactor,0.0,1.0);
  }
  return mix(1.0,value,rate);
}`;

export const STAGE_MODEL_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec2 uv0;
layout(location=2) in vec4 color;
layout(location=3) in vec2 uv1;
layout(location=4) in vec3 normal;
layout(location=5) in vec4 weight0;
layout(location=6) in vec4 weight1;
layout(location=7) in vec4 tangent;
layout(location=8) in mat4 batchWorld;
layout(location=12) in vec4 batchColor;
layout(location=13) in vec4 batchUv;
layout(location=14) in vec3 batchFrames;
layout(location=15) in vec4 color1;
uniform bool instanceBatch;
uniform bool skinned;
uniform bool instanceMotion;
uniform int skinInfluences;
uniform vec4 skinRows[192];
uniform mat4 world;
uniform mat4 viewProjection;
uniform bool hasColors;
uniform bool hasColor1;
uniform bool instanceColorEnabled;
uniform vec4 instanceColor;
uniform vec4 instanceUvOffsetScale;
uniform bool fogEnabled;
uniform int fogMode;
uniform vec4 fogRange;
uniform vec4 fogHeight;
uniform float fogRate;
uniform vec3 eyePosition;
out vec2 shadowDepth;
out float fogVisibility;
out vec4 texcoord01;
out vec4 vertexColor;
out vec4 vertexColor1;
out vec3 worldNormal;
out vec4 worldTangent;
out vec3 worldPosition;
${STAGE_VERTEX_SHAKE_GLSL}
${STAGE_INSTANCE_MOTION_GLSL}
${STAGE_FOG_GLSL}
void main(){
  mat4 drawWorld=instanceBatch?batchWorld:world;
  vec4 drawUv=instanceBatch?batchUv:instanceUvOffsetScale;
  vec3 localPosition=position;
  vec3 localNormal=(normal-0.5)*2.0;
  vec4 localTangent=(tangent-0.5)*2.0;
  if(instanceMotion){
    vec3 frames=instanceBatch?batchFrames:instanceMotionFrame;
    mat3x4 skin=instanceMotionSkinAt(weight0,weight1,frames);
    vec4 v=vec4(position,1.0);
    localPosition=vec3(dot(skin[0],v),dot(skin[1],v),dot(skin[2],v));
    localNormal=vec3(dot(skin[0].xyz,localNormal),dot(skin[1].xyz,localNormal),dot(skin[2].xyz,localNormal));
    localTangent.xyz=vec3(dot(skin[0].xyz,localTangent.xyz),dot(skin[1].xyz,localTangent.xyz),dot(skin[2].xyz,localTangent.xyz));
  }else if(skinned){
    int bone=int(weight0.y*255.01)*3;
    vec4 r0=skinRows[bone]*weight0.x;
    vec4 r1=skinRows[bone+1]*weight0.x;
    vec4 r2=skinRows[bone+2]*weight0.x;
    for(int i=1;i<4;i++){
      if(i>=skinInfluences)break;
      float w=i==1?weight0.z:(i==2?weight1.x:weight1.z);
      float index=i==1?weight0.w:(i==2?weight1.y:weight1.w);
      bone=int(index*255.01)*3;
      r0+=skinRows[bone]*w;
      r1+=skinRows[bone+1]*w;
      r2+=skinRows[bone+2]*w;
    }
    vec4 v=vec4(position,1.0);
    localPosition=vec3(dot(r0,v),dot(r1,v),dot(r2,v));
    localNormal=vec3(dot(r0.xyz,localNormal),dot(r1.xyz,localNormal),dot(r2.xyz,localNormal));
    localTangent.xyz=vec3(dot(r0.xyz,localTangent.xyz),dot(r1.xyz,localTangent.xyz),dot(r2.xyz,localTangent.xyz));
  }
  vec4 p=hasColors?shakeWorldPosition(localPosition,color,drawWorld):drawWorld*vec4(localPosition,1.0);
  gl_Position=viewProjection*p;
  shadowDepth=gl_Position.zw;
  gl_Position.z=2.0*gl_Position.z-gl_Position.w;
  texcoord01=vec4(uv0*drawUv.zw+drawUv.xy,uv1*drawUv.zw+drawUv.xy);
  vertexColor=hasColors?shakeOutputColor(color):vec4(1.0);
  if(instanceColorEnabled)vertexColor*=instanceBatch?batchColor:instanceColor;
  vertexColor1=hasColor1?color1:vec4(1.0);
  worldNormal=mat3(drawWorld)*localNormal;
  worldTangent=vec4(mat3(drawWorld)*localTangent.xyz,localTangent.w);
  worldPosition=p.xyz;
  fogVisibility=1.0;
  if(fogEnabled){
    float distance=length(p.xyz-eyePosition);
    fogVisibility=stageFogVisibility(fogMode,fogRange,fogHeight,distance,p.y,fogRate);
  }
}`;

/** Source normal-map decoding and Blend shader's colour/normal combination. */
export const STAGE_BLEND_GLSL = `
vec3 stageNormal(vec4 texel, bool compressed){
  if(!compressed)return texel.rgb*2.0-1.0;
  vec2 xy=texel.ag*2.0-1.0;
  return vec3(xy,sqrt(1.0-dot(xy,xy)));
}
vec4 stageBlendColor(vec4 c0, vec4 c2, vec4 c4, vec4 blend, vec4 vertexColor){
  return mix(mix(c0,c2,blend.g),c4,blend.b)*vertexColor;
}
vec4 stageBlendNormal(vec4 n1, vec4 n3, vec4 n5, vec4 normalTexel, vec4 blend, bool compressed){
  if(compressed){
    n1=vec4(stageNormal(n1,true),n1.b*2.0-1.0);
    n3=vec4(stageNormal(n3,true),n3.b*2.0-1.0);
    n5=vec4(stageNormal(n5,true),n5.b*2.0-1.0);
    vec4 value=normalize(mix(n1,n3,blend.g));
    value=normalize(mix(value,n5,blend.b));
    return normalize(value+vec4(stageNormal(normalTexel,true),normalTexel.b));
  }
  vec4 value=n1*2.0-1.0;
  value=normalize(mix(value,n3*2.0-1.0,blend.g));
  value=normalize(mix(value,n5*2.0-1.0,blend.b));
  normalTexel.rgb=normalTexel.rgb*2.0-1.0;
  return normalize(value+normalTexel*(1.0-normalTexel.a));
}`;

/** D16 comparison with the native white-border sampler represented by a cleared one-texel rim. */
export const STAGE_SHADOW_SAMPLE_GLSL = `
uniform highp sampler2DArray shadowMomentImage;
uniform bool shadowMomentMode;
float shadowSample(sampler2DShadow image, vec4 projected, int layer){
  vec3 coord=projected.xyz/projected.w;
  vec2 size=vec2(textureSize(image,0));
  vec2 uv=(vec2(coord.x,1.0-coord.y)*(size-2.0)+1.0)/size;
  if(shadowMomentMode)return texture(shadowMomentImage,vec3(uv,float(layer))).r;
  return texture(image,vec3(uv,coord.z));
}
float shadowFilteredSample(sampler2DShadow image, vec4 projected, int mode, int layer){
  if(mode>=3){
    vec3 coord=projected.xyz/projected.w;
    vec2 size=vec2(textureSize(shadowMomentImage,0).xy);
    vec2 uv=(vec2(coord.x,1.0-coord.y)*(size-2.0)+1.0)/size;
    vec2 moments=texture(shadowMomentImage,vec3(uv,float(layer))).rg;
    if(mode==4)return clamp(exp(-projected.z*64.0)*moments.x,0.0,1.0);
    float depth=projected.z-0.001;
    float variance=moments.y-moments.x*moments.x;
    float delta=moments.x-depth;
    float probability=variance/(variance+delta*delta);
    return clamp(max(probability,float(depth<moments.x))-0.5,0.0,1.0)*2.0;
  }
  if(mode==0)return shadowSample(image,projected,layer);
  vec2 texel=1.0/(vec2(textureSize(image,0))-2.0);
  float shadow=0.0;
  if(mode==1){
    const vec2 offsets[5]=vec2[5](vec2(0.0),vec2(0.5,0.866),vec2(0.866,-0.5),vec2(-0.5,-0.866),vec2(-0.866,0.5));
    for(int i=0;i<5;i++)shadow+=shadowSample(image,projected+vec4(offsets[i]*texel*projected.w,0.0,0.0),layer);
    return shadow/5.0;
  }
  for(int y=0;y<4;y++)for(int x=0;x<4;x++)
    shadow+=shadowSample(image,projected+vec4((vec2(float(x),float(y))-1.5)*texel*projected.w,0.0,0.0),layer);
  return shadow/16.0;
}`;

/** The third cascade samples directly; nearer cascades select or fade to the next. */
export const STAGE_SHADOW_CASCADE_GLSL = `
float shadowCascade(sampler2DShadow image, vec4 projected, float nextShadow, bool edgeHide, int mode, int layer){
  vec2 edge=abs(projected.xy/projected.w*2.0-1.0);
  float rate=edgeHide?clamp(dot(pow(edge,vec2(4.0)),vec2(1.0)),0.0,1.0):step(1.0,edge.x+edge.y);
  return mix(shadowFilteredSample(image,projected,mode,layer),nextShadow,rate);
}
float shadowCascades(sampler2DShadow image0, sampler2DShadow image1, sampler2DShadow image2,
  mat4 matrix0, mat4 matrix1, mat4 matrix2, int count, bool edgeHide, int softness, vec3 position){
  vec4 world=vec4(position,1.0);
  float shadow=1.0;
  if(count>2)shadow=shadowFilteredSample(image2,matrix2*world,max(min(softness,2)-2,0),2);
  if(count>1)shadow=shadowCascade(image1,matrix1*world,shadow,edgeHide,max(min(softness,2)-1,0),1);
  if(count>0)shadow=shadowCascade(image0,matrix0*world,shadow,edgeHide,softness,0);
  return shadow;
}`;

export const STAGE_MODEL_FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
uniform sampler2D image0;
uniform sampler2D image1;
uniform sampler2D environmentImage;
uniform sampler2D reflectionImage;
uniform highp sampler2DShadow shadowImage0;
uniform highp sampler2DShadow shadowImage1;
uniform highp sampler2DShadow shadowImage2;
uniform int shadowCascadeCount;
uniform bool shadowEdgeHide;
uniform int shadowSoftness;
uniform bool shadowLightEnabled;
uniform bool shadowReceiver;
uniform bool shadowDepthPass;
uniform float shadowAlphaRef;
uniform int shadowOutputMode;
uniform int shadowColorMode;
uniform vec3 shadowDirection;
uniform vec3 shadowDiffuse;
uniform vec3 shadowSpecular;
uniform vec3 shadowColor;
uniform mat4 shadowMatrix0;
uniform mat4 shadowMatrix1;
uniform mat4 shadowMatrix2;
uniform bool reflectionEnabled;
uniform bool clipEnabled;
uniform vec4 clipPlane;
uniform vec4 screenViewport;
uniform vec4 reflectionNormalRefractive;
uniform vec3 reflectionColor;
uniform highp samplerCube environmentCube;
uniform sampler2D specularImage;
uniform sampler2D normalImage;
uniform sampler2D incandescenceImage;
uniform sampler2D blendImage5;
uniform sampler2D blendImage6;
#define blendImage0 image0
#define blendImage1 image1
#define blendImage2 environmentImage
#define blendImage3 specularImage
#define blendImage4 incandescenceImage
uniform bool blendShader;
uniform bool hasColors;
uniform bool instanceColorAdd;
uniform bool instanceColorEdge;
uniform int blendUv[7];
uniform float blendLodBias[7];
uniform vec4 blendOffsetScale[7];
uniform bool hasIncandescenceMap;
uniform int incandescenceUv;
uniform int incandescenceMapType;
uniform float incandescenceLodBias;
uniform vec4 incandescenceOffsetScale;
uniform bool hasNormalMap;
uniform bool normalMapCompressed;
uniform int normalUv;
uniform float normalLodBias;
uniform vec4 normalOffsetScale;
uniform bool hasSpecularMap;
uniform int specularUv;
uniform int specularMapType;
uniform float specularLodBias;
uniform float environmentLodBias;
uniform vec2 lodBias;
uniform int environmentKind;
uniform int environmentMapType;
uniform mat4 cameraView;
uniform int layerCount;
uniform ivec2 uvSets;
uniform vec4 uvOffsetScale0;
uniform vec4 uvOffsetScale1;
uniform vec4 specularOffsetScale;
uniform ivec3 layerBlend;
uniform int baseMapType;
uniform int lighting;
uniform int lightModel;
uniform bool hasNormals;
uniform bool hasTexcoords;
uniform vec4 diffuseBase;
uniform vec4 specularBase;
uniform vec3 incandescenceBase;
uniform vec4 systemDiffuse;
uniform vec4 systemSpecular;
uniform bool pixelAlphaTest;
uniform float pixelAlphaRef;
uniform vec3 eyePosition;
uniform bool ambientEnabled;
uniform vec3 ambient;
uniform bool hemisphereEnabled;
uniform vec3 hemisphereDirection;
uniform vec3 hemisphereSky;
uniform vec3 hemisphereGround;
uniform int pointCount;
uniform vec4 pointPosition[3];
uniform vec4 pointDiffuse[3];
uniform vec4 pointSpecular[3];
uniform int parallelCount;
uniform vec3 parallelDirection[3];
uniform vec4 parallelDiffuse[3];
uniform vec4 parallelSpecular[3];
uniform bool rimEnabled;
uniform int rimMode;
uniform int rimMask;
uniform sampler2D rimMaskImage;
uniform vec3 rimDirection;
uniform vec4 rimColorBias;
uniform float rimOffset;
uniform float rimRate;
uniform bool edgeAlphaEnabled;
uniform vec3 edgeAlpha;
uniform bool fresnelEnabled;
uniform vec3 fresnel;
uniform float uDepthBias;
uniform int uAlphaTestEnabled;
uniform int uAlphaFunc;
uniform float uAlphaRef;
uniform bool writeOpaqueAlpha;
uniform bool fogEnabled;
uniform vec3 fogColor;
in vec2 shadowDepth;
in float fogVisibility;
in vec4 texcoord01;
in vec4 vertexColor;
in vec4 vertexColor1;
in vec3 worldNormal;
in vec4 worldTangent;
in vec3 worldPosition;
out vec4 outputColor;
${STAGE_BLEND_GLSL}
vec2 coordinate(int set, vec4 transform){
  vec2 uv=set==0?texcoord01.xy:texcoord01.zw;
  return uv*transform.zw+transform.xy;
}
vec4 blendSample(sampler2D image, int index){
  vec2 uv=coordinate(blendUv[index],blendOffsetScale[index]);
  return texture(image,uv,blendLodBias[index]);
}
float blendAlpha(int factor, vec4 dst, vec4 src){
  if(factor==0)return 0.0;
  if(factor==1)return 1.0;
  if(factor==2)return src.a;
  if(factor==3)return 1.0-src.a;
  if(factor==4)return dst.a;
  return 1.0-dst.a;
}
vec4 baseMap(){
  if(layerCount==0)return vec4(1.0);
  vec4 dst=texture(image0,coordinate(uvSets.x,uvOffsetScale0),lodBias.x);
  if(baseMapType==1)dst*=1.0+dst.a;
  if(baseMapType==2)dst*=1.0/dst.a;
  if(layerCount==2){
    vec4 src=texture(image1,coordinate(uvSets.y,uvOffsetScale1),lodBias.y);
    float srcAlpha=blendAlpha(layerBlend.x,dst,src);
    float dstAlpha=blendAlpha(layerBlend.y,dst,src);
    vec3 a=src.rgb*srcAlpha;
    vec3 b=dst.rgb*dstAlpha;
    if(layerBlend.z==0)dst.rgb=a+b;
    else if(layerBlend.z==1)dst.rgb=a-b;
    else dst.rgb=a*b;
  }
  return dst;
}
vec2 lightCore(vec3 direction, vec3 n, vec3 eye, float shininess){
  float ndl=dot(n,direction);
  vec3 halfVector=normalize(eye+direction);
  float ndh=dot(n,halfVector);
  if(lightModel!=0){
    float diffuse=lightModel==1?pow(ndl*0.5+0.5,2.0):(ndl<0.0?-ndl*0.25:ndl*0.75);
    return vec2(diffuse,pow(clamp(ndh,0.0,1.0),shininess));
  }
  float spec=ndl>0.0?pow(max(ndh,0.0),clamp(shininess,-128.0,128.0)):0.0;
  return vec2(max(ndl,0.0),spec);
}
${STAGE_SHADOW_SAMPLE_GLSL}
${STAGE_SHADOW_CASCADE_GLSL}
float shadowValue(){
  if(!shadowReceiver)return 1.0;
  return shadowCascades(shadowImage0,shadowImage1,shadowImage2,
    shadowMatrix0,shadowMatrix1,shadowMatrix2,shadowCascadeCount,shadowEdgeHide,shadowSoftness,worldPosition);
}
bool alphaPass(float value,float reference){
  if(uAlphaFunc==1)return false;
  if(uAlphaFunc==2)return value<reference;
  if(uAlphaFunc==3)return value==reference;
  if(uAlphaFunc==4)return value<=reference;
  if(uAlphaFunc==5)return value>reference;
  if(uAlphaFunc==6)return value!=reference;
  if(uAlphaFunc==7)return value>=reference;
  return true;
}
void main(){
  if(clipEnabled && !(blendShader && hasNormals) && dot(vec4(worldPosition,1.0),clipPlane)<0.0)discard;
  vec4 map=baseMap();
  vec4 materialColor=rimMask==1?vec4(1.0):vertexColor;
  if(instanceColorAdd)materialColor=vec4(1.0,1.0,1.0,vertexColor.a);
  vec4 base=materialColor*map;
  vec4 blend=vec4(0.0);
  if(blendShader && !shadowDepthPass){
    blend=blendSample(blendImage6,6);
    base=stageBlendColor(blendSample(blendImage0,0),blendSample(blendImage2,2),
      blendSample(blendImage4,4),blend,(instanceColorAdd || rimMask==1)?vec4(1.0):vertexColor);
  }else if(pixelAlphaTest && (hasTexcoords?map.a:base.a)<pixelAlphaRef)discard;
  if(shadowDepthPass){
    if(blendShader){
      base.a*=blendSample(blendImage0,0).a;
      base.a*=blendSample(blendImage1,1).a;
      base.a*=blendSample(blendImage2,2).a;
      base.a*=blendSample(blendImage3,3).a;
    }
    // The shadow environment replaces only the reference, not material enable/function.
    float outputAlpha=shadowOutputMode>=3?1.0:base.a;
    if(uAlphaTestEnabled!=0 && !alphaPass(outputAlpha,shadowAlphaRef))discard;
    gl_FragDepth=gl_FragCoord.z+uDepthBias;
    if(shadowOutputMode==3)outputColor=vec4(shadowDepth.x,shadowDepth.x*shadowDepth.x,0.0,1.0);
    else if(shadowOutputMode==4)outputColor=vec4(exp(shadowDepth.x*64.0),0.0,0.0,1.0);
    return;
  }
  vec4 result=base*systemDiffuse;
  vec3 specularMask=specularBase.rgb;
  float environmentMask=dot(specularMask,vec3(0.299,0.587,0.114));
  float shininess=specularBase.a*systemSpecular.a;
  float specularAlpha=specularBase.a;
  if(hasSpecularMap){
    vec4 specularTexel=texture(specularImage,coordinate(specularUv,specularOffsetScale),specularLodBias);
    specularAlpha=specularTexel.a;
    specularMask*=specularTexel.rgb;
    environmentMask=specularMapType==2?specularTexel.a:dot(specularMask,vec3(0.299,0.587,0.114));
    if(specularMapType==1)shininess=specularTexel.a*256.0;
    if(specularMapType==3)specularMask=specularTexel.rgb*mix(vec3(1.0),specularBase.rgb,specularAlpha);
  }
  if(blendShader)specularMask*=base.a;
  float shadow=shadowValue();
  if(hasNormals){
    vec3 n=normalize(worldNormal);
    if(hasNormalMap){
      vec3 tangentAxis=normalize(worldTangent.xyz);
      vec3 binormalAxis=cross(tangentAxis,worldNormal)*worldTangent.w;
      vec4 normalTexel=texture(normalImage,coordinate(normalUv,normalOffsetScale),normalLodBias);
      vec3 tangentNormal=stageNormal(normalTexel,normalMapCompressed);
      if(blendShader){
        tangentNormal=stageBlendNormal(blendSample(blendImage1,1),blendSample(blendImage3,3),
          blendSample(blendImage5,5),normalTexel,blend,normalMapCompressed).xyz;
      }
      n=normalize(tangentAxis*tangentNormal.x+binormalAxis*tangentNormal.y+worldNormal*tangentNormal.z);
    }
    if(shadowLightEnabled && shadowReceiver && shadowColorMode==2)
      shadow*=smoothstep(-0.5,0.5,dot(n,shadowDirection));
    float fresnelValue=fresnelEnabled?clamp(pow(1.0-dot(normalize(eyePosition-worldPosition),n),fresnel.z)*fresnel.x+fresnel.y,0.0,1.0):1.0;
    result=base*diffuseBase*(specularMapType==3?mix(vec4(1.0),systemDiffuse,specularAlpha):systemDiffuse);
    if(lighting==0){
      if(shadowLightEnabled && shadowColorMode<2)result.rgb*=mix(shadowColor,vec3(1.0),shadow);
    }else{
      vec3 eye=normalize(eyePosition-worldPosition);
      vec3 diffuseValue=vec3(0.0);
      vec3 specularValue=vec3(0.0);
      if(hemisphereEnabled)diffuseValue+=mix(hemisphereGround,hemisphereSky,dot(n,hemisphereDirection)*0.5+0.5);
      if(ambientEnabled)diffuseValue+=ambient;
      for(int i=0;i<3;i++){
        if(i>=parallelCount)break;
        vec2 terms=lightCore(parallelDirection[i],n,eye,shininess);
        diffuseValue+=terms.x*parallelDiffuse[i].rgb;
        if(lighting==2)specularValue+=terms.y*parallelSpecular[i].rgb;
      }
      if(shadowLightEnabled){
        vec2 terms=lightCore(shadowDirection,n,eye,shininess);
        if(shadowColorMode==0){
          diffuseValue+=mix(shadowColor,shadowDiffuse,clamp(shadow*terms.x,0.0,1.0));
          if(lighting==2)specularValue+=mix(shadowColor,shadowSpecular,clamp(shadow*terms.y,0.0,1.0));
        }else{
          diffuseValue+=terms.x*shadowDiffuse;
          if(lighting==2)specularValue+=terms.y*shadowSpecular;
          if(shadowColorMode==1){
            diffuseValue*=mix(shadowColor,vec3(1.0),clamp(shadow,0.0,1.0));
            if(lighting==2)specularValue*=mix(shadowColor,vec3(1.0),clamp(shadow,0.0,1.0));
          }
        }
      }
      for(int i=0;i<3;i++){
        if(i>=pointCount)break;
        vec3 toLight=pointPosition[i].xyz-worldPosition;
        float lightDistance=length(toLight);
        float attenuation=clamp((pointPosition[i].w-lightDistance)*pointDiffuse[i].w,0.0,1.0);
        vec2 terms=lightCore(toLight/lightDistance,n,eye,shininess);
        diffuseValue+=terms.x*pointDiffuse[i].rgb*attenuation;
        if(lighting==2)specularValue+=terms.y*pointSpecular[i].rgb*attenuation;
      }
      result.rgb*=diffuseValue;
      if(rimMask!=2)specularValue*=vertexColor1.rgb;
      if(lighting==2)result.rgb+=specularValue*specularMask*(specularMapType==3?mix(vec3(1.0),systemSpecular.rgb,specularAlpha):systemSpecular.rgb)*fresnelValue;
    }
    if(environmentKind!=0 || reflectionEnabled){
      vec4 env;
      if(reflectionEnabled){
        vec3 eye=normalize(eyePosition-worldPosition);
        vec3 offset=tan(reflect(eye,n)-reflect(eye,reflectionNormalRefractive.xyz))*reflectionNormalRefractive.w;
        env=texture(reflectionImage,(gl_FragCoord.xy-screenViewport.xy)/screenViewport.zw+vec2(offset.z,-offset.x));
        env*=vec4(reflectionColor,1.0);
      }else if(environmentKind==1){
        vec3 viewNormal=mat3(cameraView)*n;
        env=texture(environmentImage,viewNormal.xy*0.5+0.5,environmentLodBias);
      }else{
        vec3 eye=normalize(eyePosition-worldPosition);
        env=texture(environmentCube,reflect(-eye,n),environmentLodBias);
      }
      if(environmentMapType==1)env*=1.0+env.a;
      if(environmentMapType==2)env*=1.0/env.a;
      result.rgb+=env.rgb*environmentMask*fresnelValue;
    }
    if(edgeAlphaEnabled){
      vec3 eyeDirection=normalize(eyePosition-worldPosition);
      float edge=pow(1.0-abs(dot(n,eyeDirection)),edgeAlpha.z)*edgeAlpha.x+edgeAlpha.y;
      result.a=clamp(result.a-edge,0.0,1.0);
    }
    if(shadowLightEnabled && shadowReceiver && shadowColorMode>=2)
      result.rgb*=mix(shadowColor,vec3(1.0),clamp(shadow,0.0,1.0));
    if(rimEnabled && lighting!=0){
      vec3 eye=normalize(eyePosition-worldPosition);
      float eyeNormal=dot(n,eye);
      float eyeLight=rimMode==2?dot(-eye,rimDirection)*0.5+0.5:1.0;
      float rate=pow((1.0-abs(eyeNormal))*eyeLight,rimOffset);
      if(rimMode==3 && eyeNormal < -0.2)rate=clamp(rate+1.0-result.a,0.0,1.0);
      vec3 mask=(rimMask==1 && hasColors)?vertexColor.rgb:(rimMask==2?vertexColor1.rgb:vec3(1.0));
      if(rimMask==3)mask=clamp(texture(rimMaskImage,(gl_FragCoord.xy-screenViewport.xy)/screenViewport.zw).rgb*8.0,0.0,1.0);
      result.rgb+=rimColorBias.rgb*rimColorBias.a*rimRate*rate*mask;
    }
    if(instanceColorAdd){
      float rate=instanceColorEdge?pow(1.0-abs(dot(n,normalize(eyePosition-worldPosition))),2.0)*8.0:1.0;
      result.rgb+=vertexColor.rgb*rate;
    }
  }else if(shadowLightEnabled && shadowReceiver){
    result.rgb*=mix(shadowColor,vec3(1.0),clamp(shadow,0.0,1.0));
  }
  vec3 incandescence=incandescenceBase;
  if(hasIncandescenceMap){
    vec4 incandescenceTexel=texture(incandescenceImage,coordinate(incandescenceUv,incandescenceOffsetScale),incandescenceLodBias);
    if(incandescenceMapType==1)incandescenceTexel*=1.0+incandescenceTexel.a;
    if(incandescenceMapType==2)incandescenceTexel*=1.0/incandescenceTexel.a;
    incandescence+=incandescenceTexel.rgb;
  }
  result.rgb+=incandescence;
  if(fogEnabled)result.rgb=mix(fogColor,result.rgb,fogVisibility);
  if(writeOpaqueAlpha)result.a=1.0;
  if(any(greaterThan(result,vec4(999.9))))result=vec4(0.0);
  if(uAlphaTestEnabled!=0 && !alphaPass(result.a,uAlphaRef))discard;
  outputColor=result;
  gl_FragDepth=gl_FragCoord.z+uDepthBias;
}`;
