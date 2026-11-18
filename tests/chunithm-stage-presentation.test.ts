import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FrameSurface } from "@lxns-network/chunithm-chart-engine/render/frameTypes";
import type { StageScene } from "@lxns-network/chunithm-chart-engine/stage/runtime";
import { coordinateCamera } from "@lxns-network/chunithm-chart-engine/stage/motions/coordinate";
import { sceneCamera } from "@lxns-network/chunithm-chart-engine/stage/motions/turnCamera";
import { useStagePresentation } from "../src/pages/public/Chart/chunithm/hooks/useStagePresentation";
import { stageSceneCameraFromDisplay } from "@lxns-network/chunithm-chart-engine/stage/view";
import { reflectionRenderCamera } from "@lxns-network/chunithm-chart-engine/stage/nodes/reflectionMath";
import type { StageDrawCamera } from "@lxns-network/chunithm-chart-engine/stage/camera/scopes";

const mocked = vi.hoisted(() => ({
  warm: vi.fn(() => false),
  useState: vi.fn(),
  useRef: vi.fn(),
  missing: [] as string[],
  created: [] as string[],
  lightGroups: [] as (readonly number[] | undefined)[],
  draws: [] as string[],
  captureAlpha: [] as boolean[],
  windBindings: [] as string[],
  windScene: "",
  windClocks: [] as number[],
  shadowsEnabled: false,
  shadowOwners: [] as object[],
  shadowUpdates: [] as object[],
  shadowCameras: [] as { position: readonly number[] }[],
  instanceCameras: [] as { position: readonly number[] }[],
  targetScenes: [] as string[],
  scenes: [] as StageScene[],
  drawCameras: [] as {
    position: ArrayLike<number>;
    view: ArrayLike<number>;
    projection: ArrayLike<number>;
    viewProjection: ArrayLike<number>;
  }[],
  baseCameraPublished: true,
  baseCamera: null as StageDrawCamera | null,
  reflectionEnabled: false,
  reflectionSizes: [] as (readonly number[])[],
  rimSource: null as string | null,
  namedCamera: null as StageDrawCamera | null,
  scopeCameras: [] as StageDrawCamera[],
  rimApply: vi.fn(),
  rimDispose: vi.fn(),
  postBegin: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: mocked.useState,
  useRef: mocked.useRef,
  useCallback: (callback: unknown) => callback,
}));
vi.mock("@lxns-network/chunithm-chart-engine/assets/packFormat", () => ({
  readPack: () => ({ entries: new Map() }),
  packSlice: vi.fn(),
}));
vi.mock("@lxns-network/chunithm-chart-engine/stage/pack", () => ({
  STAGE_ENGINE: "stage",
  readStagePack: () => ({
    meta: { notesFieldLine: { id: 1, str: "Blue" } },
    graphs: { base: { role: "base" }, field: { role: "field" } },
    model() {},
    animation() {},
  }),
}));
vi.mock("@lxns-network/chunithm-chart-engine/stage/runtime", () => ({
  liveNodes: () => [],
  createStageTraversalClock: () => ({ tick: 0 }),
  sceneState: (scene: { classState: Map<string, unknown> }, key: string, create: () => unknown) => {
    if (!scene.classState.has(key)) scene.classState.set(key, create());
    return scene.classState.get(key);
  },
  createStageScene: ({
    graph,
    lightGroups,
    targetScene,
  }: {
    graph: { role: string };
    lightGroups?: readonly number[];
    targetScene: string;
  }) => {
    mocked.created.push(graph.role);
    mocked.lightGroups.push(lightGroups);
    mocked.targetScenes.push(targetScene);
    const scene = { role: graph.role, missing: mocked.missing, classState: new Map() };
    mocked.scenes.push(scene as unknown as StageScene);
    return scene;
  },
}));
vi.mock("@lxns-network/chunithm-chart-engine/stage/snapshot", () => ({
  createStageRewind: (build: () => unknown[]) => ({
    sample: () => build(),
    prepareDisplay: vi.fn(),
    warm: mocked.warm,
  }),
}));
vi.mock("@lxns-network/chunithm-chart-engine/stage/registry", () => ({
  motionBehaviors: [],
  nodeBehaviors: [],
}));
vi.mock("@lxns-network/chunithm-chart-engine/stage/view", async (importOriginal) => ({
  stageSceneCameraFromDisplay: (
    await importOriginal<typeof import("@lxns-network/chunithm-chart-engine/stage/view")>()
  ).stageSceneCameraFromDisplay,
  bindStageSceneCameras() {},
  stageSceneCameraView: (scene: { role: string }) =>
    scene.role === "base" && mocked.baseCameraPublished
      ? (mocked.baseCamera ?? { view: [], projection: [], position: [10, 20, 30] })
      : null,
}));
vi.mock("@lxns-network/chunithm-chart-engine/stage/camera/scopes", () => ({
  stageCameraScopes: (
    scene: { role: string },
    camera: StageDrawCamera,
    _farScale?: number,
    published?: Map<string, StageDrawCamera>,
  ) => {
    mocked.scopeCameras.push(camera);
    if (scene.role === "base" && mocked.namedCamera) published?.set("Mirror", mocked.namedCamera);
    return new Map();
  },
}));
vi.mock("@lxns-network/chunithm-chart-engine/stage/nodes/lights", () => ({
  FIELD_LIGHT_GROUPS: Array(10).fill(31),
  BASE_LIGHT_GROUPS: Array.from({ length: 10 }, (_, i) => i),
  bindStageLighting() {},
  stageRimDepthScenes: (scene: StageScene) =>
    mocked.rimSource === null
      ? []
      : [{ key: "rim", source: mocked.rimSource, scene, minDiff: 0.125, light: { rimMask: 3 } }],
  stageLighting: () => ({ lights: [] }),
}));
vi.mock("@lxns-network/chunithm-chart-engine/stage/nodes/wind", () => ({
  bindStageWind: (scenes: { role: string }[]) => {
    mocked.windBindings = scenes.map((scene) => scene.role);
  },
  stageWind: (scene: { role: string }) => {
    mocked.windScene = scene.role;
    return {};
  },
}));
vi.mock("@lxns-network/chunithm-chart-engine/stage/nodes/filters", () => ({
  stagePostFilters: () => [],
}));
vi.mock("@lxns-network/chunithm-chart-engine/stage/nodes/reflection", () => ({
  bindStageReflections() {},
  stageReflections: () =>
    mocked.reflectionEnabled
      ? [{ key: "Mirror", plane: Float32Array.of(0, 1, 0, 0), sizeMode: 1, width: 16, height: 9 }]
      : [],
  stageReflectionKeys: () => ["Mirror"],
  stageReflectionScenes: (_light: unknown, scenes: StageScene[]) => ({
    source: scenes[0],
    casters: scenes[1],
  }),
}));
vi.mock("@lxns-network/chunithm-chart-engine/stage/nodes/shadow", () => ({
  bindStageShadows() {},
  stageShadows: (scene: unknown) =>
    mocked.shadowsEnabled
      ? [
          {
            key: "shadow",
            sourceScene: scene,
            settings: { cascadeCount: 1 },
            direction: [0, -1, 0],
          },
        ]
      : [],
  stageShadowKeys: () => new Set(["shadow"]),
  stageShadowCasterScene: (_light: unknown, scenes: unknown[]) => scenes[1],
}));
vi.mock("@lxns-network/chunithm-chart-engine/stage/nodes/shadowCamera", () => ({
  createStageShadowCameras: () => {
    const owner = {
      resize() {},
      updateCascade: (
        _index: number,
        _settings: unknown,
        source: { position: readonly number[] },
      ) => {
        mocked.shadowCameras.push(source);
        mocked.shadowUpdates.push(owner);
        return {};
      },
    };
    mocked.shadowOwners.push(owner);
    return owner;
  },
}));
vi.mock("@lxns-network/chunithm-chart-engine/stage/render/stageShadow", () => ({
  createStageShadowTargets: () => ({ resize() {}, begin() {}, finish() {}, dispose() {} }),
}));
vi.mock("@lxns-network/chunithm-chart-engine/stage/render/stageRenderer", () => ({
  createStageRenderer: () => ({
    draw: ({
      scene,
      role,
      instanceCameras,
      captureAlpha,
      camera,
      wind,
    }: {
      scene: { role: string };
      role: string;
      instanceCameras: ReadonlyMap<string, { position: readonly number[] }>;
      captureAlpha?: boolean;
      camera: (typeof mocked.drawCameras)[number];
      wind: { graphicsClock: number };
    }) => {
      mocked.draws.push(`${role}:${scene.role}`);
      mocked.captureAlpha.push(Boolean(captureAlpha));
      mocked.drawCameras.push(camera);
      mocked.windClocks.push(wind.graphicsClock);
      mocked.instanceCameras.push(instanceCameras.get("BgScene")!);
      return { draws: 1, skipped: new Map(), finish: () => 0 };
    },
    prepareShadow: ({
      instanceCameras,
    }: {
      instanceCameras: ReadonlyMap<string, { position: readonly number[] }>;
    }) => {
      mocked.instanceCameras.push(instanceCameras.get("BgScene")!);
      return {
        casterSpheres: [],
        skipped: new Map(),
        draw: () => ({ draws: 1, skipped: new Map() }),
      };
    },
    dispose() {},
  }),
}));
vi.mock("@lxns-network/chunithm-chart-engine/stage/render/post/stagePost", () => ({
  createStagePost: () => ({ begin: mocked.postBegin, end() {}, dispose() {} }),
}));
vi.mock(
  "@lxns-network/chunithm-chart-engine/stage/render/stageReflection",
  async (importOriginal) => ({
    createStageReflectionTarget: () => ({
      begin(width: number, height: number) {
        mocked.reflectionSizes.push([width, height]);
      },
      dispose() {},
    }),
    createStageReflectionSizing: (
      await importOriginal<
        typeof import("@lxns-network/chunithm-chart-engine/stage/render/stageReflection")
      >()
    ).createStageReflectionSizing,
  }),
);
vi.mock("@lxns-network/chunithm-chart-engine/gpu/depthSnapshot", () => ({
  createDepthSnapshot: () => ({ binding: {}, capture() {}, dispose() {} }),
}));
vi.mock("@lxns-network/chunithm-chart-engine/stage/render/stageRimMask", () => ({
  createStageRimMask: () => ({ apply: mocked.rimApply, dispose: mocked.rimDispose }),
}));

beforeEach(() => {
  mocked.warm.mockClear();
  mocked.missing = [];
  mocked.created = [];
  mocked.lightGroups = [];
  mocked.draws = [];
  mocked.captureAlpha = [];
  mocked.windBindings = [];
  mocked.windScene = "";
  mocked.windClocks = [];
  mocked.shadowsEnabled = false;
  mocked.shadowOwners = [];
  mocked.shadowUpdates = [];
  mocked.shadowCameras = [];
  mocked.instanceCameras = [];
  mocked.targetScenes = [];
  mocked.scenes = [];
  mocked.drawCameras = [];
  mocked.baseCameraPublished = true;
  mocked.baseCamera = null;
  mocked.reflectionEnabled = false;
  mocked.reflectionSizes = [];
  mocked.rimSource = null;
  mocked.namedCamera = null;
  mocked.scopeCameras = [];
  mocked.rimApply.mockClear();
  mocked.rimDispose.mockClear();
  mocked.postBegin.mockClear();
  vi.stubGlobal("window", {
    location: { search: "", href: "https://preview.test/" },
    history: { state: null, replaceState() {} },
  });
});

function setup() {
  let slot = 0;
  const slots: unknown[] = [];
  mocked.useState.mockImplementation((initial: unknown) => {
    const index = slot++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (value: unknown) => (slots[index] = value)];
  });
  mocked.useRef.mockImplementation((initial: unknown) => {
    const index = slot++;
    if (!(index in slots)) slots[index] = { current: initial };
    return slots[index];
  });
  function Stage() {
    return useStagePresentation("/stages/");
  }
  const render = () => {
    slot = 0;
    return Stage();
  };
  const gl = {
    getExtension: () => null,
    getParameter: () => null,
    bindFramebuffer() {},
    viewport() {},
    depthMask() {},
    clear() {},
    activeTexture() {},
    bindTexture() {},
  };
  const canvas = { width: 16, height: 9, dataset: {} as Record<string, string> };
  const device = { gl, canvas, markResourcesUnknown() {}, markExternalBindingsUnknown() {} };
  type Device = typeof device;
  let background: ((seconds: number, target: Device, resetHistory: boolean) => boolean) | null =
    null;
  const identity = new Float32Array(16);
  const scene = {
    withPresentation: (callback: (target: Device) => unknown) => callback(device),
    setBackgroundRenderer: (renderer: typeof background) => (background = renderer),
    readCamera: () => ({
      cameraA: identity,
      cameraB: identity,
      stageEnvironment: {
        eye: [3, 5, 7],
        target: [-2, 4, 6],
        up: [0, 1, 0],
        rollCode: 0,
        fovCode: 8192,
        near: 1,
        far: 10000,
        aspect: 16 / 9,
        offsetX: 0,
        offsetY: 0,
      },
    }),
    readEffectCamera: () => ({ position: [0, 0, 0] }),
  } as unknown as FrameSurface;
  const draw = (seconds = 0, resetHistory = false) => {
    if (!background) throw new Error("Stage renderer has not been attached");
    (background as (seconds: number, target: Device, resetHistory: boolean) => boolean)(
      seconds,
      device,
      resetHistory,
    );
  };
  return { render, scene, draw, canvas };
}

const index = {
  engine: "stage",
  fieldOptions: [{ label: "1", state: 1 }],
  stages: {
    "1": { name: "first", core: "first.bin", tiers: { rgba8: "first-textures.bin" } },
    "2": { name: "second", core: "second.bin", tiers: { rgba8: "second-textures.bin" } },
  },
};

function response() {
  return { ok: true, json: async () => index, arrayBuffer: async () => new ArrayBuffer(0) };
}

describe("stage presentation lifecycle", () => {
  it("loads hidden stage resources without advancing or drawing scenes, then resumes at the current time", async () => {
    const fetcher = vi.fn(async () => response());
    vi.stubGlobal("fetch", fetcher);
    const s = setup();
    s.render().selectBackground(false);
    await s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(3);
    s.draw(60);
    expect(mocked.created).toEqual([]);
    expect(mocked.draws).toEqual([]);
    s.render().selectBackground(true);
    s.draw(60);
    expect(mocked.draws.length).toBeGreaterThan(0);
    expect(mocked.postBegin.mock.lastCall?.[2]).toEqual({ tick: 3824, reset: true });
    mocked.draws.length = 0;
    mocked.postBegin.mockClear();
    s.render().selectBackground(false);
    s.draw(90);
    expect(mocked.draws).toEqual([]);
    expect(mocked.postBegin).not.toHaveBeenCalled();
    s.render().selectBackground(true);
    s.draw(90);
    expect(mocked.postBegin.mock.lastCall?.[2]).toEqual({ tick: 5624, reset: true });
  });
  it.each([10, 60])("resets scene histories on an explicit seek to %s seconds", async (seconds) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const s = setup();
    mocked.shadowsEnabled = true;
    mocked.reflectionEnabled = true;
    await s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal);
    s.canvas.width = 640;
    s.canvas.height = 360;
    s.draw(9);
    s.draw(10);
    expect(mocked.shadowOwners).toHaveLength(1);
    expect(mocked.postBegin.mock.lastCall?.[2]).toEqual({ tick: 824, reset: false });
    expect(mocked.reflectionSizes[mocked.reflectionSizes.length - 1]).toEqual([640, 360]);
    s.canvas.width = 320;
    s.canvas.height = 180;
    s.draw(10);
    expect(mocked.shadowOwners).toHaveLength(2);
    expect(mocked.shadowUpdates[mocked.shadowUpdates.length - 1]).toBe(mocked.shadowOwners[1]);
    expect(mocked.reflectionSizes[mocked.reflectionSizes.length - 1]).toEqual([320, 180]);
    s.draw(seconds, true);
    expect(s.render().error).toBeNull();
    expect(mocked.shadowOwners).toHaveLength(3);
    const reset = mocked.shadowOwners[2];
    expect(mocked.shadowUpdates.slice(-2)).toEqual([reset, reset]);
    expect(mocked.reflectionSizes[mocked.reflectionSizes.length - 1]).toEqual([320, 180]);
    s.draw(seconds);
    expect(mocked.shadowOwners).toHaveLength(3);
    expect(mocked.shadowUpdates[mocked.shadowUpdates.length - 1]).toBe(reset);
    expect(mocked.reflectionSizes[mocked.reflectionSizes.length - 1]).toEqual([320, 180]);
  });

  it.each([
    { seconds: 60, reset: true },
    { seconds: 5, reset: false },
  ])("resets disabled effects after a timeline change to $seconds", async ({ seconds, reset }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const s = setup();
    mocked.shadowsEnabled = true;
    mocked.reflectionEnabled = true;
    await s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal);
    s.canvas.width = 640;
    s.canvas.height = 360;
    s.draw(10);
    mocked.shadowsEnabled = false;
    mocked.reflectionEnabled = false;
    s.canvas.width = 320;
    s.canvas.height = 180;
    s.draw(seconds, reset);
    expect(mocked.shadowOwners).toHaveLength(2);
    expect(mocked.postBegin.mock.lastCall?.[2]).toEqual({
      tick: seconds * 60 + 224,
      reset: true,
    });
    expect(mocked.reflectionSizes).toEqual([[640, 360]]);
    mocked.shadowsEnabled = true;
    mocked.reflectionEnabled = true;
    s.draw(61);
    expect(s.render().error).toBeNull();
    expect(mocked.shadowOwners).toHaveLength(2);
    expect(mocked.postBegin.mock.lastCall?.[2]).toEqual({ tick: 3884, reset: false });
    expect(mocked.shadowUpdates[mocked.shadowUpdates.length - 1]).toBe(mocked.shadowOwners[1]);
    expect(mocked.reflectionSizes[mocked.reflectionSizes.length - 1]).toEqual([320, 180]);
  });

  it("resets scene histories once when a brightness change and seek arrive together", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const s = setup();
    mocked.shadowsEnabled = true;
    mocked.reflectionEnabled = true;
    await s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal);
    s.canvas.width = 640;
    s.canvas.height = 360;
    s.draw(10);
    s.canvas.width = 320;
    s.canvas.height = 180;
    s.render().selectField("1");
    s.draw(10, true);
    expect(s.render().error).toBeNull();
    expect(mocked.shadowOwners).toHaveLength(2);
    expect(mocked.shadowUpdates[mocked.shadowUpdates.length - 1]).toBe(mocked.shadowOwners[1]);
    expect(mocked.reflectionSizes[mocked.reflectionSizes.length - 1]).toEqual([320, 180]);
    s.canvas.width = 160;
    s.canvas.height = 90;
    s.draw(10);
    expect(mocked.shadowOwners).toHaveLength(3);
    expect(mocked.reflectionSizes[mocked.reflectionSizes.length - 1]).toEqual([160, 90]);
  });

  it("renders a Rim depth mask with the latest named scene camera and its environment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const s = setup();
    mocked.rimSource = "Mirror";
    mocked.namedCamera = stageSceneCameraFromDisplay({
      ...s.scene.readCamera().stageEnvironment!,
      eye: [9, 7, 5],
      offsetX: 0.25,
      aspect: 1,
    });
    await s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal);
    s.draw();
    expect(s.render().error).toBeNull();
    expect((s.canvas.dataset.stageMissing ?? "").split("\n").filter(Boolean)).toEqual([]);
    expect(mocked.draws).toEqual(["field:field", "base:base", "field:field"]);
    expect(mocked.drawCameras[0]).toBe(mocked.namedCamera);
    expect(mocked.scopeCameras[2]).toEqual(mocked.namedCamera);
    expect(mocked.scopeCameras[2].environment).toBe(mocked.namedCamera.environment);
    expect(mocked.rimApply.mock.lastCall?.slice(1, 5)).toEqual([
      2,
      1,
      mocked.namedCamera.projection,
      0.125,
    ]);

    mocked.namedCamera = null;
    s.draw();
    expect(s.render().error).toBeNull();
    expect((s.canvas.dataset.stageMissing ?? "").split("\n").filter(Boolean)).toContain(
      "Stage rim: unavailable source scene Mirror",
    );
    expect(mocked.rimApply).toHaveBeenCalledTimes(1);
    expect(mocked.rimDispose).toHaveBeenCalledTimes(1);
  });

  it.each(["MainScene", "BgScene", ""])("retains the Rim source camera for %s", async (source) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const s = setup();
    const environment = s.scene.readCamera().stageEnvironment!;
    mocked.baseCamera = stageSceneCameraFromDisplay({
      ...environment,
      eye: [20, 30, 40],
      aspect: 1,
      offsetY: -0.125,
    });
    mocked.rimSource = source;
    await s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal);
    s.draw();
    expect(s.render().error).toBeNull();
    expect((s.canvas.dataset.stageMissing ?? "").split("\n").filter(Boolean)).toEqual([]);
    const expected =
      source === "MainScene" ? stageSceneCameraFromDisplay(environment) : mocked.baseCamera;
    expect(mocked.drawCameras[0]).toEqual(expected);
    expect(mocked.scopeCameras[2]).toEqual({
      ...expected,
      environment: source === "MainScene" ? environment : expected.environment,
    });
    expect(mocked.rimApply).toHaveBeenCalledTimes(1);
  });

  it("keeps wind on the Stage timeline through paused redraws, playback and seek", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const s = setup();
    mocked.reflectionEnabled = true;
    await s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal);
    const times = [0, 10, 10, 10.01, 10.02, 60, 10];
    for (const seconds of times) s.draw(seconds);
    s.render().selectField("1");
    s.draw(10);
    const expected = [...times, 10].flatMap((seconds) => Array(3).fill(224 + seconds * 60));
    expect(mocked.windClocks).toHaveLength(expected.length);
    mocked.windClocks.forEach((tick, index) => expect(tick).toBeCloseTo(expected[index], 9));
    expect(s.render().error).toBeNull();
  });
  it("passes Stage ticks and explicit seek or field resets to temporal post effects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const s = setup();
    await s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal);
    s.draw(10, true);
    s.draw(10);
    s.draw(60, true);
    s.draw(10, true);
    expect(mocked.postBegin.mock.calls.map((call) => call[2])).toEqual([
      { tick: 824, reset: true },
      { tick: 824, reset: false },
      { tick: 3824, reset: true },
      { tick: 824, reset: true },
    ]);
    s.render().selectField("1");
    s.draw(10);
    expect(mocked.postBegin.mock.lastCall?.[2]).toEqual({ tick: 824, reset: true });
  });
  it("seeds shared motion cameras from the chart display before the first step", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const s = setup();
    await s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal);
    s.draw();
    expect(mocked.scenes).toHaveLength(2);
    const [field, base] = mocked.scenes;
    expect(coordinateCamera(field)).toBe(coordinateCamera(base));
    expect(sceneCamera(field)).toBe(sceneCamera(base));
    expect(Array.from(coordinateCamera(field).eye)).toEqual([3, 5, 7]);
    expect(Array.from(coordinateCamera(field).target)).toEqual([-2, 4, 6]);
    expect(Array.from(sceneCamera(field).eye)).toEqual([3, 5, 7]);
    expect(Array.from(sceneCamera(field).at)).toEqual([-2, 4, 6]);
    expect(Array.from(sceneCamera(field).up)).toEqual([0, 1, 0]);
    expect(sceneCamera(field).fovCode).toBe(8192);
    expect(s.render().error).toBeNull();
  });

  it("uses MainScene's camera for a base-published shadow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const s = setup();
    mocked.shadowsEnabled = true;
    await s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal);
    s.draw();
    expect(s.render().error).toBeNull();
    expect(mocked.shadowCameras).toHaveLength(2);
    expect(mocked.shadowCameras.every((camera) => camera.position.join() === "3,5,7")).toBe(true);
    expect(mocked.instanceCameras).toHaveLength(3);
    expect(mocked.instanceCameras.every((camera) => camera.position.join() === "10,20,30")).toBe(
      true,
    );
  });
  it("uses rebuilt scene cameras for both queues before any Stage camera publication", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const s = setup();
    mocked.baseCameraPublished = false;
    await s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal);
    s.draw();
    expect(s.render().error).toBeNull();
    const expected = stageSceneCameraFromDisplay(s.scene.readCamera().stageEnvironment!);
    expect(mocked.drawCameras).toHaveLength(2);
    for (const camera of mocked.drawCameras) {
      expect(Array.from(camera.position)).toEqual(expected.position);
      expect(Array.from(camera.view)).toEqual(Array.from(expected.view));
      expect(Array.from(camera.view)).not.toEqual(s.scene.readCamera().cameraA);
    }
    expect(mocked.instanceCameras).toEqual([expected, expected]);
  });
  it("uses the default source scene's view and half-far projection in a reflection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const s = setup();
    mocked.baseCameraPublished = false;
    mocked.reflectionEnabled = true;
    await s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal);
    s.draw();
    expect(s.render().error).toBeNull();
    const environment = s.scene.readCamera().stageEnvironment!;
    const full = stageSceneCameraFromDisplay(environment);
    const half = stageSceneCameraFromDisplay(environment, 0.5);
    const expected = reflectionRenderCamera(full, half.projection, Float32Array.of(0, 1, 0, 0));
    expect(mocked.drawCameras).toHaveLength(3);
    const mirror = mocked.drawCameras[0];
    expect(Array.from(mirror.view)).toEqual(Array.from(expected.view));
    expect(Array.from(mirror.projection)).toEqual(Array.from(full.projection));
    expect(Array.from(mirror.viewProjection)).toEqual(Array.from(expected.viewProjection));
  });
  it("keeps base and field in their draw roles", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const s = setup();
    await s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal);
    s.draw();
    expect(mocked.created).toEqual(["field", "base"]);
    expect(mocked.targetScenes).toEqual(["MainScene", "BgScene"]);
    expect(mocked.lightGroups).toEqual([
      Array(10).fill(31),
      Array.from({ length: 10 }, (_, i) => i),
    ]);
    expect(mocked.windBindings).toEqual(["field", "base"]);
    expect(mocked.windScene).toBe("base");
    expect(mocked.draws).toEqual(["base:base", "field:field"]);
    expect(mocked.captureAlpha).toEqual([true, false]);
  });

  it("publishes the loaded Stage's divider color", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const s = setup();
    const color = vi.fn();
    await s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal, color);
    expect(color).toHaveBeenCalledWith(1);
  });

  it("replaces unsupported diagnostics when a new stage has none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const s = setup();
    mocked.missing = ["first stage unsupported"];
    const first = await s.render().prepare!(
      s.scene,
      Promise.resolve(1),
      new AbortController().signal,
    );
    s.draw();
    expect((s.canvas.dataset.stageMissing ?? "").split("\n").filter(Boolean)).toEqual([
      "first stage unsupported",
    ]);
    first();

    mocked.missing = [];
    await s.render().prepare!(s.scene, Promise.resolve(2), new AbortController().signal);
    expect((s.canvas.dataset.stageMissing ?? "").split("\n").filter(Boolean)).toEqual([]);
    s.draw();
    expect(s.canvas.dataset.stageMissing).toBe("");
    expect((s.canvas.dataset.stageMissing ?? "").split("\n").filter(Boolean)).toEqual([]);
  });

  it("publishes unsupported diagnostics that belong to the new stage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const s = setup();
    mocked.missing = ["first stage unsupported"];
    const first = await s.render().prepare!(
      s.scene,
      Promise.resolve(1),
      new AbortController().signal,
    );
    s.draw();
    first();

    mocked.missing = ["second stage unsupported"];
    await s.render().prepare!(s.scene, Promise.resolve(2), new AbortController().signal);
    expect((s.canvas.dataset.stageMissing ?? "").split("\n").filter(Boolean)).toEqual([]);
    s.draw();
    expect(s.canvas.dataset.stageMissing).toBe("second stage unsupported");
    expect((s.canvas.dataset.stageMissing ?? "").split("\n").filter(Boolean)).toEqual([
      "second stage unsupported",
    ]);
  });

  it("does not publish a cancelled stage after a newer stage has loaded", async () => {
    let resolveFirst!: (value: ReturnType<typeof response>) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.endsWith("stages.json") && !resolveFirst
          ? new Promise<ReturnType<typeof response>>((resolve) => (resolveFirst = resolve))
          : Promise.resolve(response()),
      ),
    );
    const s = setup();
    const lifetime = new AbortController();
    const first = s.render().prepare!(s.scene, Promise.resolve(1), lifetime.signal);
    lifetime.abort();
    await s.render().prepare!(s.scene, Promise.resolve(2), new AbortController().signal);
    expect(s.canvas.dataset.stageId).toBe("2");
    resolveFirst(response());
    await first;
    expect(s.canvas.dataset.stageId).toBe("2");
  });

  it("does not use the presentation device again after cancellation during core loading", async () => {
    let resolveCore!: (value: ArrayBuffer) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("first.bin")
          ? {
              ok: true,
              arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => (resolveCore = resolve)),
            }
          : response(),
      ),
    );
    const s = setup();
    const withPresentation = vi.spyOn(s.scene, "withPresentation");
    const lifetime = new AbortController();
    const first = s.render().prepare!(s.scene, Promise.resolve(1), lifetime.signal);
    await vi.waitFor(() => expect(resolveCore).toBeDefined());
    expect(withPresentation).toHaveBeenCalledTimes(2);
    withPresentation.mockClear();
    lifetime.abort();
    resolveCore(new ArrayBuffer(0));
    await first;
    expect(withPresentation).not.toHaveBeenCalled();
  });

  it.each(["rgba8", "bc"])("downloads the core and %s textures concurrently", async (tier) => {
    let resolveCore!: (value: ArrayBuffer) => void;
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("stages.json"))
        return {
          ok: true,
          json: async () => ({
            ...index,
            stages: {
              "1": {
                ...index.stages["1"],
                core: "https://assets.test/stage-objects/first.bin",
                tiers: { ...index.stages["1"].tiers, bc: "first-bc.bin" },
              },
            },
          }),
        };
      if (url.endsWith("first.bin"))
        return {
          ok: true,
          arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => (resolveCore = resolve)),
        };
      return response();
    });
    vi.stubGlobal("fetch", fetcher);
    const s = setup();
    const device = s.scene.withPresentation((device) => device);
    vi.spyOn(device.gl, "getExtension").mockReturnValue(tier === "bc" ? {} : null);
    const first = s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal);
    await vi.waitFor(() => expect(resolveCore).toBeDefined());
    const urls = fetcher.mock.calls.map(([url]) => url);
    const texture = tier === "bc" ? "/stages/first-bc.bin" : "/stages/first-textures.bin";
    expect(urls).toEqual([
      "/stages/stages.json",
      "https://assets.test/stage-objects/first.bin",
      new URL(texture, window.location.href).href,
    ]);
    expect(s.render().status).toBe("loading");
    resolveCore(new ArrayBuffer(0));
    const release = await first;
    expect(s.render().status).toBe("ready");
    release();
  });

  it("reports an index HTTP failure before reading its body or fetching packs", async () => {
    const json = vi.fn(async () => index);
    const fetcher = vi.fn(async () => ({ ok: false, status: 503, json }));
    vi.stubGlobal("fetch", fetcher);
    const s = setup();
    await s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal);
    expect(s.render().status).toBe("error");
    expect(s.render().error).toBe("Stage index: 503");
    expect(json).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(["first.bin", "first-textures.bin"])(
    "cancels the other download when %s fails and keeps the original error",
    async (failed) => {
      const aborted: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, options?: RequestInit) => {
          if (url.endsWith("stages.json")) return response();
          if (url.endsWith(failed)) return { ok: false, status: 502 };
          const signal = options?.signal;
          if (!signal) return response();
          return {
            ok: true,
            arrayBuffer: () =>
              new Promise<ArrayBuffer>((_resolve, reject) => {
                signal.addEventListener(
                  "abort",
                  () => {
                    aborted.push(url);
                    reject(signal.reason);
                  },
                  { once: true },
                );
              }),
          };
        }),
      );
      const s = setup();
      await s.render().prepare!(s.scene, Promise.resolve(1), new AbortController().signal);
      expect(s.render().status).toBe("error");
      expect(s.render().error).toBe(`Stage pack https://preview.test/stages/${failed}: 502`);
      expect(aborted).toEqual([
        `https://preview.test/stages/${failed === "first.bin" ? "first-textures.bin" : "first.bin"}`,
      ]);
      expect(() => s.draw()).toThrow("Stage renderer has not been attached");
    },
  );

  it.each(["index", "packs"])(
    "aborts %s requests on page cancellation without publishing an error or attaching a renderer",
    async (phase) => {
      const requests: { url: string; signal: AbortSignal }[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string, options?: RequestInit) => {
          const signal = options?.signal ?? new AbortController().signal;
          requests.push({ url, signal });
          if (phase === "packs" && url.endsWith("stages.json")) return Promise.resolve(response());
          return new Promise((_resolve, reject) =>
            signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
          );
        }),
      );
      const s = setup();
      const lifetime = new AbortController();
      const pending = s.render().prepare!(s.scene, Promise.resolve(1), lifetime.signal);
      await vi.waitFor(() => expect(requests).toHaveLength(phase === "index" ? 1 : 3));
      const withPresentation = vi.spyOn(s.scene, "withPresentation");
      const setBackground = vi.spyOn(s.scene, "setBackgroundRenderer");
      lifetime.abort();
      const release = await pending;
      release();
      expect(requests.every((request) => request.signal.aborted)).toBe(true);
      expect(s.render().error).toBeNull();
      expect(s.render().status).toBe("loading");
      expect(withPresentation).not.toHaveBeenCalled();
      expect(setBackground).not.toHaveBeenCalled();
    },
  );
});

it("throttles playing warm work, yields while busy and cancels pending work on detach", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response()),
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 1),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) =>
    setTimeout(() => callback({ timeRemaining: () => 10, didTimeout: false }), 1),
  );
  vi.stubGlobal("cancelIdleCallback", clearTimeout);
  let detach: (() => void) | undefined;
  try {
    const s = setup();
    const state = { playing: true, busy: false, blockedUntil: 0 };
    detach = await s.render().prepare!(
      s.scene,
      Promise.resolve(1),
      new AbortController().signal,
      undefined,
      Promise.resolve(160),
      () => state,
    );
    s.draw();
    await vi.advanceTimersByTimeAsync(49);
    expect(mocked.warm).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4);
    expect(mocked.warm).toHaveBeenCalledTimes(1);
    state.busy = true;
    await vi.advanceTimersByTimeAsync(100);
    expect(mocked.warm).toHaveBeenCalledTimes(1);
    state.busy = false;
    state.playing = false;
    await vi.advanceTimersByTimeAsync(60);
    expect(mocked.warm.mock.calls.length).toBeGreaterThan(2);
    detach();
    const calls = mocked.warm.mock.calls.length;
    await vi.advanceTimersByTimeAsync(100);
    expect(mocked.warm).toHaveBeenCalledTimes(calls);
  } finally {
    detach?.();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
