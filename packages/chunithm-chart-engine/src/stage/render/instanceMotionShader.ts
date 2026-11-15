/** Instance-motion texture decode shared by Stage rendering and the native GPU comparison. */
export const STAGE_INSTANCE_MOTION_GLSL = `
uniform bool instanceMotionHasWeight1;
uniform bool instanceMotionSingleWeight;
uniform bool instanceMotionBlend;
uniform highp sampler2D instanceMotionTexture;
uniform vec4 instanceMotionTextureSize;
uniform vec3 instanceMotionFrame;

mat3x4 instanceMotionMatrix(float frame, int bone){
  vec2 coordinate=vec2(fract(frame),instanceMotionTextureSize.y*
    (float(bone)+instanceMotionTextureSize.x*floor(frame)))+instanceMotionTextureSize.zw;
  vec4 positionScale=textureLod(instanceMotionTexture,coordinate,0.0);
  vec4 q=textureLod(instanceMotionTexture,coordinate+vec2(0.0,instanceMotionTextureSize.w*2.0),0.0);
  return mat3x4(
    vec4(1.0-2.0*q.y*q.y-2.0*q.z*q.z,2.0*q.x*q.y-2.0*q.w*q.z,2.0*q.x*q.z+2.0*q.w*q.y,positionScale.x),
    vec4(2.0*q.x*q.y+2.0*q.w*q.z,1.0-2.0*q.x*q.x-2.0*q.z*q.z,2.0*q.y*q.z-2.0*q.w*q.x,positionScale.y),
    vec4(2.0*q.x*q.z-2.0*q.w*q.y,2.0*q.y*q.z+2.0*q.w*q.x,1.0-2.0*q.x*q.x-2.0*q.y*q.y,positionScale.z)
  )*positionScale.w;
}

mat3x4 instanceMotionSkinAt(vec4 weight0, vec4 weight1, vec3 frames){
  int high=int(weight0.z*255.01);
  int first=int(weight0.y*255.01)+(high%16)*255;
  int second=int(weight0.w*255.01)+(high/16)*255;
  float firstWeight=weight0.x+(instanceMotionHasWeight1?weight1.x+weight1.z:0.0);
  if(instanceMotionSingleWeight)firstWeight=1.0;
  float secondWeight=1.0-firstWeight;
  float currentWeight=instanceMotionBlend?frames.z:1.0;
  float previousWeight=instanceMotionBlend?1.0-frames.z:0.0;
  mat3x4 result=instanceMotionMatrix(frames.x,first)*(firstWeight*currentWeight);
  if(!instanceMotionSingleWeight)
    result+=instanceMotionMatrix(frames.x,second)*(secondWeight*currentWeight);
  if(instanceMotionBlend){
    result+=instanceMotionMatrix(frames.y,first)*(firstWeight*previousWeight);
    if(!instanceMotionSingleWeight)
      result+=instanceMotionMatrix(frames.y,second)*(secondWeight*previousWeight);
  }
  return result;
}

mat3x4 instanceMotionSkin(vec4 weight0, vec4 weight1){
  return instanceMotionSkinAt(weight0,weight1,instanceMotionFrame);
}`;
