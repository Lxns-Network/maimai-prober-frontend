import { lightReachesGroup } from "../nodes/lights";
import type { StageShadowLight } from "../nodes/shadow";
import type { StageShadowCamera } from "../nodes/shadowCamera";

export interface StageShadowFrame {
  readonly light: StageShadowLight;
  readonly cameras: readonly StageShadowCamera[];
  readonly textures: readonly WebGLTexture[];
  readonly moments?: WebGLTexture;
}

/** Native same-type ordinal zero publishes the sole shadow slot for each receiving group. */
export function stageGroupShadow(
  shadows: readonly StageShadowFrame[] | undefined,
  group: number,
): StageShadowFrame | undefined {
  return shadows?.find(({ light }) => lightReachesGroup(light.mask, group));
}
