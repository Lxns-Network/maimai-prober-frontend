import { expect, it } from "vitest";
import { type StageNode, type StageScene } from "./runtime";
import { cloneStageScene, createStageRewind } from "./snapshot";
import { bindStageMaterialUv, StageMaterialUvState } from "./model/materialUv";
import type { UvAnimation } from "../assets/uvAnimation";
import type { StageShape } from "./pack";

it("keeps motion state in rewind checkpoints and held nodes without copying it into ordinary displays", () => {
  const build = () => {
    const scene = {
      tick: 0,
      failure: null,
      traversalClock: { framePhase: 0 },
      top: { flags: 0x15, children: [], graveyard: [] },
      classState: new Map(),
      options: {
        heldStates: new Map([[100, { state: 1, match: -1 }]]),
        nodes: new Map([
          [
            0,
            {
              finishStep(current: StageScene) {
                for (const node of current.classState.values() as Iterable<StageNode>) {
                  const state = node.stateMotions[0].instance as unknown as { elapsed: number };
                  state.elapsed++;
                  node.world[0] = state.elapsed;
                }
              },
            },
          ],
        ]),
      },
    } as unknown as StageScene;
    for (const id of [100, 200]) {
      scene.classState.set(String(id), {
        scene,
        record: { id },
        birth: 0,
        world: new Float32Array(1),
        stateMotions: [{ instance: { elapsed: 0 } }],
        before: [],
        after: [],
        pending: [],
        graveyard: [],
        controller: { schedule: [{ remaining: 10 }], killWhenChildrenDone: false },
        extension: {
          provider: {
            poses: [{ position: Float32Array.of(1, 2, 3) }],
            playback: { samples: [Float32Array.of(4, 5, 6)] },
            pose: { worlds: [Float32Array.of(7)], active: [true] },
          },
        },
      } as unknown as StageNode);
    }
    return [scene];
  };
  const rewind = createStageRewind(build, 2);
  for (const tick of [3, 7, 2, 6]) {
    const display = rewind.sample(tick, 0.5)[0];
    const held = display.classState.get("100") as StageNode;
    const ordinary = display.classState.get("200") as StageNode;
    expect(ordinary.stateMotions).toEqual([]);
    expect(held.stateMotions).toHaveLength(1);
    expect(ordinary.controller!.schedule).toEqual([]);
    expect(held.controller!.schedule).toHaveLength(1);
    const providerOf = (node: StageNode) =>
      (
        node.extension as {
          provider: { poses: unknown[]; playback: unknown; pose: { worlds: Float32Array[] } };
        }
      ).provider;
    expect(providerOf(ordinary).poses).toEqual([]);
    expect(providerOf(ordinary).playback).toBeNull();
    expect(providerOf(ordinary).pose.worlds[0][0]).toBe(7);
    expect(providerOf(held).poses).toHaveLength(1);
    expect(providerOf(held).playback).not.toBeNull();
    expect(ordinary.world[0]).toBe(tick + 0.5);
    expect(held.world[0]).toBe(tick + 0.5);
  }
  const restored = rewind.seek(4)[0];
  expect((restored.classState.get("200") as StageNode).stateMotions).toHaveLength(1);
  expect((restored.classState.get("200") as StageNode).world[0]).toBe(4);
  expect((restored.classState.get("200") as StageNode).controller!.schedule).toHaveLength(1);
});

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
  const displayed = rewind.sample(5, 0.25)[0];
  expect(rewind.warm(30, performance.now())).toBe(false);
  expect(rewind.warm(30, Infinity)).toBe(true);
  expect(displayed.tick).toBe(5);
  expect((displayed.classState.get("pose") as { frame: number }).frame).toBe(5.25);
  for (const tick of [25, 10, 29, 2]) {
    const warmed = rewind.sample(tick, 0.5)[0];
    expect((warmed.classState.get("pose") as { frame: number }).frame).toBe(tick + 0.5);
  }
});

it("holds looping transforms and their children across a reset without blending through the scene", () => {
  const build = () => {
    const scene = {
      tick: 0,
      failure: null,
      traversalClock: { framePhase: 0 },
      top: { flags: 0x15, children: [], graveyard: [] },
      classState: new Map(),
      options: {
        nodes: new Map([
          [
            0,
            {
              finishStep(current: StageScene) {
                const parent = current.classState.get("parent") as StageNode;
                const child = current.classState.get("child") as StageNode;
                parent.transformEpoch = current.tick >= 2 ? 1 : 0;
                parent.world[0] = current.tick === 1 ? 500 : current.tick - 2;
                child.world[0] = parent.world[0] + 10;
              },
            },
          ],
        ]),
      },
    } as unknown as StageScene;
    const parent = {
      scene,
      record: { id: 1 },
      birth: 0,
      coordinateMode: 1,
      coordinateParent: null,
      transformEpoch: 0,
      world: Float32Array.of(499),
    } as unknown as StageNode;
    const child = {
      scene,
      record: { id: 2 },
      birth: 0,
      coordinateMode: 0,
      coordinateParent: parent,
      transformEpoch: 0,
      world: Float32Array.of(509),
    } as unknown as StageNode;
    scene.classState.set("parent", parent);
    scene.classState.set("child", child);
    return [scene];
  };
  const rewind = createStageRewind(build, 2);
  for (const fraction of [0.25, 0.75, 0]) {
    const scene = rewind.sample(1, fraction)[0];
    expect((scene.classState.get("parent") as StageNode).world[0]).toBe(500);
    expect((scene.classState.get("child") as StageNode).world[0]).toBe(510);
  }
  const scene = rewind.sample(2, 0.5)[0];
  expect((scene.classState.get("parent") as StageNode).world[0]).toBe(0.5);
  expect((scene.classState.get("child") as StageNode).world[0]).toBe(10.5);
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

it("reuses display storage while refreshing changed fields and preserving rewind snapshots", () => {
  const rewind = createStageRewind(
    () => [
      {
        tick: 0,
        failure: null,
        traversalClock: { framePhase: 0 },
        top: { flags: 0x15, children: [], graveyard: [] },
        classState: new Map([
          ["pose", { frame: 0, world: Float32Array.of(0), fixed: Float32Array.of(1), old: true }],
        ]),
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
    fixed: Float32Array;
    old?: boolean;
  };
  const buffer = pose.world;
  expect(pose.world[0]).toBe(7);
  pose.fixed[0] = 9;
  rewind.sample(3, 0.75);
  expect(pose.fixed[0]).toBe(1);
  expect(pose.world[0]).toBe(7.5);
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

it.each([
  ["vertices", 6],
  ["normalVertices", 9],
] as const)(
  "keeps %s positions and packed colours interpolated with shared integer views",
  (key, stride) => {
    const rewind = createStageRewind(() => {
      const vertices = new Float32Array(stride);
      const mesh = { [key]: vertices, words: new Uint32Array(vertices.buffer) };
      return [
        {
          tick: 0,
          failure: null,
          traversalClock: { framePhase: 0 },
          top: { flags: 0x15, children: [], graveyard: [] },
          classState: new Map([["mesh", mesh]]),
          options: {
            nodes: new Map([
              [
                0,
                {
                  finishStep(scene: StageScene) {
                    const live = scene.classState.get("mesh") as typeof mesh;
                    live[key][0] = scene.tick * 10;
                    live.words[stride - 3] = scene.tick % 2 ? 0xffffffff : 0xff000000;
                  },
                },
              ],
            ]),
          },
        } as unknown as StageScene,
      ];
    }, 2);
    for (const [tick, fraction, x, colour] of [
      [2, 0.5, 25, 0xff808080],
      [2, 0.25, 22.5, 0xff404040],
      [3, 0.5, 35, 0xff808080],
      [2, 0, 20, 0xff000000],
    ]) {
      const mesh = rewind.sample(tick, fraction)[0].classState.get("mesh") as Record<
        string,
        Float32Array | Uint32Array
      >;
      expect(mesh[key][0]).toBe(x);
      expect(mesh.words[stride - 3]).toBe(colour);
      expect(mesh.words.buffer).toBe(mesh[key].buffer);
    }
  },
);
