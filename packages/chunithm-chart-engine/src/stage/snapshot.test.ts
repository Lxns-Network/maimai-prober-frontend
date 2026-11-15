import { expect, it } from "vitest";
import { type StageScene } from "./runtime";
import { cloneStageScene, createStageRewind } from "./snapshot";
import { bindStageMaterialUv, StageMaterialUvState } from "./model/materialUv";
import type { UvAnimation } from "../assets/uvAnimation";
import type { StageShape } from "./pack";
it("preserves sampled poses across repeated fractions, forward steps and rewinds", () => {
  const build = () => {
    const scene = {
      tick: 0,
      failure: null,
      traversalClock: { framePhase: 0 },
      top: { flags: 0x15, children: [], graveyard: [] },
      classState: new Map([["pose", { frame: 0, world: Float32Array.of(0) }]]),
      options: {
        nodes: new Map([
          [
            0,
            {
              finishStep(current: StageScene) {
                current.classState.set("pose", {
                  frame: current.tick,
                  world: Float32Array.of(current.tick * 2),
                });
              },
            },
          ],
        ]),
      },
    } as unknown as StageScene;
    return [scene];
  };
  const rewind = createStageRewind(build, 2);
  for (const [tick, fraction] of [
    [3, 0.25],
    [3, 0.75],
    [3, 0],
    [4, 0.5],
    [1, 0.5],
    [5, 0.25],
  ]) {
    const scene = rewind.sample(tick, fraction)[0];
    const pose = scene.classState.get("pose") as { frame: number; world: Float32Array };
    expect(scene.tick).toBe(tick);
    expect(pose.frame).toBe(tick + fraction);
    expect(pose.world[0]).toBe((tick + fraction) * 2);
  }
  expect(rewind.seek(5)[0].tick).toBe(5);
  expect((rewind.seek(5)[0].classState.get("pose") as { frame: number }).frame).toBe(5);
});

it("clones retained per-draw material cells independently of the source scene", () => {
  const shape = {
    state: { _name: "material" },
    textures: [],
  } as unknown as StageShape;
  const animation = (offset: number): UvAnimation => ({
    frameCount: 1,
    tracks: [
      {
        materialName: "material",
        textureName: "image",
        channel: "UV0",
        frameCount: 1,
        staticValues: [offset, 0, 1, 1],
        curves: [null, null, null, null],
      },
    ],
  });
  const initial = animation(0.25);
  const binding = bindStageMaterialUv(initial, [{ shape }]);
  const material = new StageMaterialUvState(1);
  material.apply(initial, binding, 0);
  const scene = {
    options: {},
    extension: { material, binding },
  } as unknown as StageScene;
  const copy = cloneStageScene(scene).scene as StageScene & {
    extension: {
      material: StageMaterialUvState;
      binding: typeof binding;
    };
  };
  expect(copy.extension.material).not.toBe(material);
  expect(Array.from(copy.extension.material.parameter(0, 0)!)).toEqual([0.25, 0, 1, 1]);
  material.apply(animation(0.5), binding, 0);
  expect(Array.from(copy.extension.material.parameter(0, 0)!)).toEqual([0.25, 0, 1, 1]);
  copy.extension.material.apply(animation(0.75), copy.extension.binding, 0);
  expect(Array.from(material.parameter(0, 0)!)).toEqual([0.5, 0, 1, 1]);
  expect(Array.from(copy.extension.material.parameter(0, 0)!)).toEqual([0.75, 0, 1, 1]);
});

it("leaves packed integer words of mixed-view records unblended between ticks", () => {
  const build = () => {
    const buffer = new ArrayBuffer(8);
    const pool = { i: new Int32Array(buffer), f: new Float32Array(buffer) };
    pool.i[0] = 1;
    pool.i[1] = -1;
    const scene = {
      tick: 0,
      failure: null,
      traversalClock: { framePhase: 0 },
      top: { flags: 0x15, children: [], graveyard: [] },
      classState: new Map([["pool", pool]]),
      options: {
        nodes: new Map([
          [
            0,
            {
              finishStep(current: StageScene) {
                const live = current.classState.get("pool") as typeof pool;
                // A linked-list relink each tick, as the particle pool's NEXT words change.
                live.i[0] = current.tick % 2 ? 9 : 1;
              },
            },
          ],
        ]),
      },
    } as unknown as StageScene;
    return [scene];
  };
  const rewind = createStageRewind(build, 2);
  for (const fraction of [0.5, 0.25, 0]) {
    const scene = rewind.sample(2, fraction)[0];
    const pool = scene.classState.get("pool") as { i: Int32Array };
    expect(Array.from(pool.i)).toEqual([1, -1]);
  }
});
