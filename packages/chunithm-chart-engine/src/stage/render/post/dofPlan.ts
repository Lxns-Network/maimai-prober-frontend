import type { StageDof } from "../../nodes/dof";
import type { Vec3 } from "../../camera/math";

const f = Math.fround;

export type DofImage =
  | "scene"
  | "sceneSnapshot"
  | "depth"
  | "target0"
  | "target1"
  | "target2"
  | "output";

export interface DofStep {
  readonly shader: "down" | "horizontal" | "vertical" | "near" | "small" | "copy" | "combine";
  readonly target: DofImage;
  readonly inputs: readonly DofImage[];
}

/** The native filter's intermediate target dependencies. */
export const DOF_STEPS: readonly DofStep[] = [
  { shader: "down", target: "target0", inputs: ["scene", "depth"] },
  { shader: "horizontal", target: "target1", inputs: ["target0"] },
  { shader: "vertical", target: "target2", inputs: ["target1"] },
  { shader: "near", target: "target1", inputs: ["target0", "target2"] },
  { shader: "small", target: "target0", inputs: ["target1"] },
  { shader: "copy", target: "sceneSnapshot", inputs: ["scene", "depth"] },
  { shader: "combine", target: "output", inputs: ["sceneSnapshot", "target0", "target2", "depth"] },
];

export interface DofUniforms {
  readonly nearAndFar: Float32Array;
  readonly farAndSky: Float32Array;
}

/** Converts the native projection's coefficients to the positive camera distance used by the filter. */
export function dofDepthCoefficients(projection: ArrayLike<number>): [number, number] {
  return [projection[10], projection[11]];
}

/** Native depth-of-field equations from the filter's camera and parameter inputs. */
export function dofUniforms(dof: StageDof, eye: Vec3, target: Vec3): DofUniforms {
  const [distance, nearRate, nearOffset, farRate, farOffset, sky] = dof.values;
  const dx = f(eye[0] - target[0]);
  const dy = f(eye[1] - target[1]);
  const dz = f(eye[2] - target[2]);
  const focus = dof.autofocus ? f(Math.sqrt(f(f(f(dx * dx) + f(dy * dy)) + f(dz * dz)))) : distance;
  const nearPosition = f(focus - nearOffset);
  const farPosition = f(focus + farOffset);
  const nearScale = f(-1 / nearRate);
  const farScale = f(1 / farRate);
  const nearBias = -f(nearPosition * nearScale);
  const farBias = -f(farPosition * farScale);
  return {
    nearAndFar: Float32Array.of(nearScale, nearBias, farScale, farBias),
    farAndSky: Float32Array.of(farScale, farBias, 0, sky),
  };
}

/** Sized exactly as the source's integer target division. */
export function dofTargetSize(width: number, height: number, divisor: number) {
  const w = Math.trunc(width / divisor);
  const h = Math.trunc(height / divisor);
  if (w < 1 || h < 1) throw new RangeError("Stage depth-of-field target is empty");
  return { width: w, height: h };
}
