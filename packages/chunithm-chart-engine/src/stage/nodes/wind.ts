import {
  applyMotions,
  computeWorld,
  sceneState,
  type NodeBehavior,
  type StageNode,
  type StageScene,
} from "../runtime";

export const WIND_TYPE = 6001019;
const MATRIX_FIRST_WORD = 5;
const WIND_STATE = "wind";

/** Wind settings retained until another wind node publishes. */
export interface StageWind {
  enabled: boolean;
  /** The base vector. */
  readonly vector: Float32Array;
  /** Nine values, row by row. */
  readonly matrix: Float32Array;
  /** The first value of each matrix row. */
  readonly direction: Float32Array;
}

function windOf(scene: StageScene): StageWind {
  return sceneState(scene, WIND_STATE, () => ({
    enabled: false,
    vector: Float32Array.of(1, 0, 0),
    matrix: Float32Array.of(200, 0.2, 0.4, 200, 0.2, 0.4, 200, 0.2, 0.4),
    direction: Float32Array.of(200, 200, 200),
  }));
}

/** Shares the wind environment of scenes that advance together; bind before accessing or stepping them. */
export function bindStageWind(scenes: readonly StageScene[]): void {
  for (const scene of scenes)
    if (scene.classState.has(WIND_STATE))
      throw new Error("Stage wind: scenes were already initialized");
  if (!scenes.length) return;
  const shared = windOf(scenes[0]);
  for (let i = 1; i < scenes.length; i++) scenes[i].classState.set(WIND_STATE, shared);
}

function publish(node: StageNode): void {
  const g = node.scene.graph;
  const at = node.record!.settings;
  if (at === null) return;
  const wind = windOf(node.scene);
  wind.enabled = g.u32(at) !== 0;
  for (let i = 0; i < 3; i++) wind.vector[i] = g.f32(at + 4 + i * 4);
  for (let i = 0; i < 9; i++) wind.matrix[i] = g.f32(at + (MATRIX_FIRST_WORD + i) * 4);
  for (let row = 0; row < 3; row++) wind.direction[row] = wind.matrix[row * 3];
}

/** The wind node: each step it publishes its settings to the wind environment. */
export const windNode: NodeBehavior = {
  type: WIND_TYPE,
  update(node) {
    computeWorld(node);
    applyMotions(node);
    publish(node);
  },
};

/** The wind last published to the scene's environment. */
export function stageWind(scene: StageScene): StageWind {
  return windOf(scene);
}

/** Calculates the two published shader phases from the graphics clock, in 60 Hz frame units. */
export function stageWindPhases(
  wind: StageWind,
  graphicsClock: number,
): [Float32Array, Float32Array] {
  const f = Math.fround;
  const seconds = f(f(graphicsClock) * f(1 / 60));
  const phases: [Float32Array, Float32Array] = [new Float32Array(3), new Float32Array(3)];
  for (let axis = 0; axis < 3; axis++) {
    for (let frequency = 0; frequency < 2; frequency++) {
      const angle = f(f(seconds * wind.matrix[axis * 3 + frequency + 1]) * f(Math.PI));
      phases[frequency][axis] = f(angle + angle);
    }
  }
  return phases;
}
