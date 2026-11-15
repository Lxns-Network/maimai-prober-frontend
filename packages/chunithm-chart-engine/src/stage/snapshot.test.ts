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

it("reuses display storage while refreshing changed fields and preserving rewind snapshots", () => {
  const rewind = createStageRewind(
    () => [
      {
        tick: 0,
        failure: null,
        traversalClock: { framePhase: 0 },
        top: { flags: 0x15, children: [], graveyard: [] },
        classState: new Map([["pose", { frame: 0, world: Float32Array.of(0), old: true }]]),
        options: {
          nodes: new Map([
            [
              0,
              {
                finishStep(scene: StageScene) {
                  const pose = scene.classState.get("pose") as {
                    frame: number;
                    world: Float32Array;
                    old?: boolean;
                  };
                  pose.frame = scene.tick;
                  pose.world[0] = scene.tick * 2;
                  if (scene.tick >= 4) delete pose.old;
                },
              },
            ],
          ]),
        },
      } as unknown as StageScene,
    ],
    2,
  );
  const first = rewind.sample(3, 0.5)[0];
  const pose = first.classState.get("pose") as {
    frame: number;
    world: Float32Array;
    old?: boolean;
  };
  const buffer = pose.world;
  expect(pose.world[0]).toBe(7);
  const second = rewind.sample(4, 0.5)[0];
  expect(second).not.toBe(first);
  const nextPose = second.classState.get("pose") as typeof pose;
  expect(nextPose).not.toBe(pose);
  expect(nextPose.world).toBe(buffer);
  expect(nextPose.world[0]).toBe(9);
  expect(nextPose).not.toHaveProperty("old");
  const back = rewind.sample(2, 0.5)[0].classState.get("pose") as typeof pose;
  expect(back.world[0]).toBe(5);
  expect(back.old).toBe(true);
});
