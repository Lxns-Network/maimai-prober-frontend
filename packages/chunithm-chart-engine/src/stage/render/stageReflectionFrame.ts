import { lightReachesGroup } from "../nodes/lights";
import type { StageReflection } from "../nodes/reflection";

export interface StageReflectionFrame {
  readonly light: StageReflection;
  readonly texture: WebGLTexture;
}

/** Reflection providers overwrite the shared parameter slots in registration order. */
export function stageGroupReflection(
  reflections: readonly StageReflectionFrame[] | undefined,
  group: number,
): StageReflectionFrame | undefined {
  if (!reflections) return undefined;
  for (let i = reflections.length - 1; i >= 0; i--)
    if (lightReachesGroup(reflections[i].light.mask, group)) return reflections[i];
  return undefined;
}
