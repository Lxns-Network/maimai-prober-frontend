import type { FrameSurface } from "@lxns-network/chunithm-chart-engine/render/frameTypes";
import { createAbortScope } from "@lxns-network/chunithm-chart-engine/assets/abort";
import { createDepthSnapshot } from "@lxns-network/chunithm-chart-engine/gpu/depthSnapshot";
import { packSlice, readPack } from "@lxns-network/chunithm-chart-engine/assets/packFormat";
import { uploadKtx2 } from "@lxns-network/chunithm-chart-engine/assets/gpuUpload";
import { readDeviceSignals } from "@lxns-network/chunithm-chart-engine/assets/textureFormat";
import {
  readStagePack,
  STAGE_ENGINE,
  type StagePack,
} from "@lxns-network/chunithm-chart-engine/stage/pack";
import {
  createStageScene,
  createStageTraversalClock,
  liveNodes,
  resolveState,
  setState,
  type StageHeldState,
} from "@lxns-network/chunithm-chart-engine/stage/runtime";
import {
  createStageRewind,
  type StageRewind,
} from "@lxns-network/chunithm-chart-engine/stage/snapshot";
import { StageRandom } from "@lxns-network/chunithm-chart-engine/stage/random";
import { bindStageCollisions } from "@lxns-network/chunithm-chart-engine/stage/collision";
import { motionBehaviors, nodeBehaviors } from "@lxns-network/chunithm-chart-engine/stage/registry";
import {
  bindStageSceneCameras,
  stageSceneCameraFromDisplay,
  stageSceneCameraView,
} from "@lxns-network/chunithm-chart-engine/stage/view";
import {
  stageCameraScopes,
  type StageDrawCamera,
} from "@lxns-network/chunithm-chart-engine/stage/camera/scopes";
import { bindStageCoordinateCamera } from "@lxns-network/chunithm-chart-engine/stage/motions/coordinate";
import { stageFrameForSeconds } from "@lxns-network/chunithm-chart-engine/stage/clock";
import {
  bindStageLighting,
  BASE_LIGHT_GROUPS,
  FIELD_LIGHT_GROUPS,
  stageLighting,
  stageRimDepthScenes,
} from "@lxns-network/chunithm-chart-engine/stage/nodes/lights";
import { bindStageInstanceGroups } from "@lxns-network/chunithm-chart-engine/stage/nodes/model";
import { bindStageWind, stageWind } from "@lxns-network/chunithm-chart-engine/stage/nodes/wind";
import { stagePostFilters } from "@lxns-network/chunithm-chart-engine/stage/nodes/filters";
import { bindStageBlooms } from "@lxns-network/chunithm-chart-engine/stage/nodes/bloom";
import { createStageRenderer } from "@lxns-network/chunithm-chart-engine/stage/render/stageRenderer";

import { createStagePost } from "@lxns-network/chunithm-chart-engine/stage/render/post/stagePost";
import {
  createStageReflectionTarget,
  createStageReflectionSizing,
} from "@lxns-network/chunithm-chart-engine/stage/render/stageReflection";
import {
  bindStageReflections,
  stageReflections,
  stageReflectionKeys,
  stageReflectionScenes,
} from "@lxns-network/chunithm-chart-engine/stage/nodes/reflection";
import type { StageReflectionFrame } from "@lxns-network/chunithm-chart-engine/stage/render/stageReflectionFrame";
import { reflectionRenderCamera } from "@lxns-network/chunithm-chart-engine/stage/nodes/reflectionMath";
import {
  bindStageShadows,
  stageShadows,
  stageShadowKeys,
  stageShadowCasterScene,
} from "@lxns-network/chunithm-chart-engine/stage/nodes/shadow";
import { createStageShadowCameras } from "@lxns-network/chunithm-chart-engine/stage/nodes/shadowCamera";
import type { Vec3 } from "@lxns-network/chunithm-chart-engine/stage/camera/math";
import { createStageShadowTargets } from "@lxns-network/chunithm-chart-engine/stage/render/stageShadow";
import { createStageRimMask } from "@lxns-network/chunithm-chart-engine/stage/render/stageRimMask";

interface StageIndex {
  engine: string;
  fieldOptions?: { label: string; state: number }[];
  stages: Record<string, { name?: string; core: string; tiers: Record<string, string> }>;
}

/** The notes-field record whose states are the field brightness steps. */
const FIELD_BRIGHTNESS_RECORD = 100;

async function fetchBytes(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Stage pack ${url}: ${response.status}`);
  return response.arrayBuffer();
}

function multiplyRows(a: ArrayLike<number>, b: ArrayLike<number>): Float32Array {
  const out = new Float32Array(16);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      out[r * 4 + c] = Math.fround(
        a[r * 4] * b[c] +
          a[r * 4 + 1] * b[4 + c] +
          a[r * 4 + 2] * b[8 + c] +
          a[r * 4 + 3] * b[12 + c],
      );
  return out;
}

interface StagePresentationInput {
  base: string;
  scene: FrameSurface;
  stage: Promise<number | null>;
  duration?: Promise<number>;
  signal: AbortSignal;
  readFieldValue(): string;
  readShowBackground(): boolean;
  setDividerColor?: (color: number) => void;
  setStatus(status: "loading" | "ready" | "error"): void;
  setError(error: string | null): void;
  setFieldOptions(options: { value: string; label: string }[]): void;
}

/** Attaches the Stage renderer and owns its GPU resources until the returned cleanup runs. */
export async function prepareStagePresentation(input: StagePresentationInput): Promise<() => void> {
  const { base, scene, stage, signal, setDividerColor, setStatus, setError, setFieldOptions } =
    input;
  setStatus("loading");
  setError(null);
  setFieldOptions([]);
  const loading = new AbortController();
  const scope = createAbortScope([signal, loading.signal]);
  const requestSignal = scope.signal;
  let disposed = false;
  let release = () => {};
  let warmingFrame = 0;
  let idleWork = 0;
  const detach = () => {
    if (disposed) return;
    disposed = true;
    if (warmingFrame) cancelAnimationFrame(warmingFrame);
    if (idleWork) cancelIdleCallback(idleWork);
    loading.abort();
    if (!signal.aborted) scene.setBackgroundRenderer(null);
    release();
  };
  try {
    const [index, stageId] = await Promise.all([
      fetch(base + "stages.json", { signal: requestSignal }).then((response) => {
        if (!response.ok) throw new Error(`Stage index: ${response.status}`);
        return response.json() as Promise<StageIndex>;
      }),
      stage,
    ]);
    if (signal.aborted) return detach;
    const record = stageId === null ? undefined : index.stages[String(stageId)];
    if (stageId === null || !record)
      throw new Error(`No stage pack for stage ${stageId ?? "none"}`);
    if (import.meta.env.DEV)
      scene.withPresentation(({ canvas }) => {
        canvas.dataset.stageId = String(stageId);
        canvas.dataset.stageMissing = "";
      });
    const brightness = index.fieldOptions ?? [];
    setFieldOptions(brightness.map((option) => ({ value: option.label, label: option.label })));
    const device = scene.withPresentation((device) => device);
    const gl = device.gl as WebGL2RenderingContext;
    const signals = readDeviceSignals(gl);
    const tier =
      (["bc", "astc", "etc2"] as const).find(
        (target) => record.tiers[target] && (target === "bc" ? signals.s3tc : signals[target]),
      ) ?? "rgba8";
    const [packBytes, textureBytes] = await Promise.all([
      fetchBytes(new URL(record.core, new URL(base, window.location.href)).href, requestSignal),
      fetchBytes(
        new URL(record.tiers[tier], new URL(base, window.location.href)).href,
        requestSignal,
      ),
    ]);
    if (signal.aborted) return detach;
    const pack: StagePack = readStagePack(packBytes);
    if (setDividerColor) setDividerColor(pack.meta.notesFieldLine.id);
    const textures = readPack(textureBytes, STAGE_ENGINE);
    const uploaded = new Map<string, WebGLTexture>();
    const cubeTextures = new Set<WebGLTexture>();
    release = () => {
      for (const texture of uploaded.values()) gl.deleteTexture(texture);
      if (!signal.aborted) scene.withPresentation((device) => device.markResourcesUnknown());
    };
    for (const [name] of textures.entries) {
      const result = uploadKtx2(gl, packSlice(textures, name), {
        target: tier,
        dropTopMip: false,
        compare: false,
      });
      uploaded.set(name.slice("tex/".length), result.texture);
      if (result.target === gl.TEXTURE_CUBE_MAP) cubeTextures.add(result.texture);
    }
    const renderer = createStageRenderer(gl, pack, uploaded, cubeTextures);
    const releaseTextures = release;
    release = () => {
      renderer.dispose();
      releaseTextures();
    };
    const post = createStagePost(gl);
    const releaseRenderer = release;
    release = () => {
      post.dispose();
      releaseRenderer();
    };
    const reflectionTargets = new Map<
      string,
      {
        target: ReturnType<typeof createStageReflectionTarget>;
        sizing: ReturnType<typeof createStageReflectionSizing>;
      }
    >();
    const releasePost = release;
    release = () => {
      for (const { target } of reflectionTargets.values()) target.dispose();
      reflectionTargets.clear();
      releasePost();
    };
    const depthSnapshot = createDepthSnapshot(gl);
    const releaseReflectionTarget = release;
    release = () => {
      depthSnapshot.dispose();
      releaseReflectionTarget();
    };
    const shadowBuffers = new Map<
      string,
      {
        targets: ReturnType<typeof createStageShadowTargets>;
        cameras: ReturnType<typeof createStageShadowCameras>;
      }
    >();
    const releaseReflection = release;
    release = () => {
      for (const buffer of shadowBuffers.values()) buffer.targets.dispose();
      shadowBuffers.clear();
      releaseReflection();
    };
    const rimTargets = new Map<
      string,
      {
        readonly scene: ReturnType<typeof createStageReflectionTarget>;
        readonly depth: ReturnType<typeof createDepthSnapshot>;
        readonly filter: ReturnType<typeof createStageRimMask>;
      }
    >();
    const releaseShadow = release;
    release = () => {
      for (const target of rimTargets.values()) {
        target.scene.dispose();
        target.depth.dispose();
        target.filter.dispose();
      }
      rimTargets.clear();
      releaseShadow();
    };
    scene.withPresentation((device) => device.markResourcesUnknown());
    let rewind: StageRewind | null = null;
    const viewport: [number, number] = [0, 0];
    let previousTick: number | null = null;
    let listedKey = "";
    const held = new Map<number, StageHeldState>();
    let heldLabel: string | null = null;
    const holdField = () => {
      if (heldLabel === input.readFieldValue()) return;
      heldLabel = input.readFieldValue();
      const option = brightness.find((item) => item.label === heldLabel);
      if (option) held.set(FIELD_BRIGHTNESS_RECORD, { state: option.state, match: -1 });
      else held.delete(FIELD_BRIGHTNESS_RECORD);
    };
    const build = () => {
      const traversalClock = createStageTraversalClock();
      const make = (graph: StagePack["graphs"]["base"], role: "base" | "field") =>
        createStageScene({
          graph,
          traversalClock,
          random: new StageRandom(),
          motions: motionBehaviors,
          nodes: nodeBehaviors,
          skipUnregistered: true,
          model: (ordinal) => pack.model(role, ordinal),
          animation: (ordinal) => pack.animation(role, ordinal),
          viewport,
          drawIndex: role === "field" ? 0 : 16,
          targetScene: role === "field" ? "MainScene" : "BgScene",
          heldStates: role === "field" ? held : undefined,
          lightGroups: role === "field" ? FIELD_LIGHT_GROUPS : BASE_LIGHT_GROUPS,
        });
      const scenes = [make(pack.graphs.field, "field"), make(pack.graphs.base, "base")];
      const environment = scene.readCamera().stageEnvironment!;
      bindStageCoordinateCamera(scenes, environment);
      bindStageSceneCameras(scenes, environment);
      bindStageCollisions(scenes);
      bindStageInstanceGroups(scenes);
      bindStageLighting(scenes);
      bindStageReflections(scenes);
      bindStageShadows(scenes);
      bindStageWind(scenes);
      bindStageBlooms(scenes);
      return scenes;
    };
    let warmTarget = 0;
    let warmed = false;
    void input.duration?.then(
      (seconds) => {
        warmTarget = Math.ceil(stageFrameForSeconds(seconds));
        if (!disposed && !signal.aborted && rewind) scheduleWarm();
      },
      () => {},
    );
    const warm = (deadline?: IdleDeadline) => {
      warmingFrame = 0;
      idleWork = 0;
      if (disposed || signal.aborted || !input.readShowBackground() || !rewind || !warmTarget)
        return;
      try {
        const budget = deadline ? Math.min(3, deadline.timeRemaining() - 1) : 1;
        if (budget > 0) warmed = rewind.warm(warmTarget, performance.now() + budget);
        if (!warmed) scheduleWarm();
      } catch (cause) {
        detach();
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("error");
      }
    };
    const scheduleWarm = () => {
      if (warmed || warmingFrame || idleWork || !warmTarget) return;
      warmingFrame = requestAnimationFrame(() => {
        warmingFrame = 0;
        if (typeof requestIdleCallback === "function") idleWork = requestIdleCallback(warm);
        else warm();
      });
    };
    scene.setBackgroundRenderer((seconds, device, resetHistory) => {
      if (disposed || signal.aborted) return false;
      if (!input.readShowBackground()) {
        previousTick = null;
        return false;
      }
      const gl = device.gl as WebGL2RenderingContext;
      const width = device.canvas.width;
      const height = device.canvas.height;
      const destination = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      try {
        const resized = viewport[0] !== width || viewport[1] !== height;
        if (resized) {
          viewport[0] = width;
          viewport[1] = height;
        }
        const fieldChanged = heldLabel !== input.readFieldValue();
        holdField();
        const frame = stageFrameForSeconds(seconds);
        const tick = Math.floor(frame);
        rewind ??= createStageRewind(build);
        const fraction = frame - tick;
        const [fieldScene, baseScene] = rewind.sample(tick, fraction);
        scheduleWarm();
        const fieldState = held.get(FIELD_BRIGHTNESS_RECORD);
        if (fieldState) {
          for (const node of liveNodes(fieldScene)) {
            if (node.record?.id !== FIELD_BRIGHTNESS_RECORD) continue;
            const index = resolveState(node, fieldState.state, false);
            if (node.stateIndex !== index) {
              setState(node, index, true);
              for (const motion of node.graveyard) motion.dispose?.(node);
              node.graveyard.length = 0;
            }
            // Brightness states are static transforms; apply after interpolation without advancing time.
            const delta = node.delta;
            node.delta = 0;
            nodeBehaviors.get(node.record.type)!.update!(node);
            node.delta = delta;
          }
        }
        const historyReset =
          resetHistory || resized || fieldChanged || previousTick === null || tick < previousTick;
        if (historyReset) {
          for (const buffer of reflectionTargets.values()) buffer.sizing.reset();
          for (const buffer of shadowBuffers.values()) buffer.cameras = createStageShadowCameras();
        }
        previousTick = tick;
        const wind = {
          state: stageWind(baseScene),
          // Preview phases follow the rewound scene, including paused redraws and lead-in.
          graphicsClock: frame,
        };
        const chart = scene.readCamera();
        const incomingCamera = {
          view: Float32Array.from(chart.cameraA),
          projection: Float32Array.from(chart.cameraB),
          viewProjection: multiplyRows(chart.cameraB, chart.cameraA),
          position: scene.readEffectCamera().position,
          environment: chart.stageEnvironment!,
        };
        const defaultSceneCamera = stageSceneCameraFromDisplay(incomingCamera.environment);
        const camera = stageSceneCameraView(baseScene) ?? defaultSceneCamera;
        const skipped = new Set<string>();
        const snapshotDepth = () => {
          const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
          const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
          depthSnapshot.capture(framebuffer, viewport[2], viewport[3], viewport[0], viewport[1]);
          return depthSnapshot.binding;
        };
        let draws = 0;
        let front: (() => number) | undefined;
        const reflections: StageReflectionFrame[] = [];
        const reflectionKeys = new Set(stageReflectionKeys(baseScene));
        for (const [key, { target }] of reflectionTargets) {
          if (reflectionKeys.has(key)) continue;
          target.dispose();
          reflectionTargets.delete(key);
        }
        const lighting = stageLighting(baseScene);
        const publishedFieldCamera = stageSceneCameraView(fieldScene);
        const fieldCamera = publishedFieldCamera ?? defaultSceneCamera;
        const instanceCameras = new Map<string, StageDrawCamera>([
          ["MainScene", fieldCamera],
          ["BgScene", camera],
        ]);
        for (const reflection of stageReflections(baseScene)) {
          const { source } = stageReflectionScenes(reflection, [fieldScene, baseScene]);
          instanceCameras.set(
            reflection.key,
            stageSceneCameraView(baseScene, 1, reflection.key) ??
              (source === fieldScene ? fieldCamera : camera),
          );
        }
        const drawCameras = new Map(instanceCameras);
        const fieldCameraScopes = stageCameraScopes(fieldScene, incomingCamera, 1, drawCameras);
        const baseCameraScopes = stageCameraScopes(baseScene, incomingCamera, 1, drawCameras);
        const rimMasks = new Map<string, WebGLTexture>();
        const activeRims = new Set<string>();
        for (const rim of stageRimDepthScenes(baseScene)) {
          const source = rim.source || (rim.scene === baseScene ? "BgScene" : "MainScene");
          const sourceCamera = drawCameras.get(source);
          if (!sourceCamera) {
            skipped.add(`Stage rim: unavailable source scene ${source}`);
            continue;
          }
          const key = rim.key;
          activeRims.add(key);
          let target = rimTargets.get(key);
          if (!target) {
            const maskScene = createStageReflectionTarget(gl);
            const maskDepth = createDepthSnapshot(gl);
            try {
              target = { scene: maskScene, depth: maskDepth, filter: createStageRimMask(gl) };
            } catch (error) {
              maskScene.dispose();
              maskDepth.dispose();
              throw error;
            }
            rimTargets.set(key, target);
          }
          const maskWidth = Math.trunc(width / 8);
          const maskHeight = Math.trunc(height / 8);
          if (maskWidth < 1 || maskHeight < 1) throw new RangeError("Stage rim: empty depth scene");
          gl.activeTexture(gl.TEXTURE0 + 13);
          gl.bindTexture(gl.TEXTURE_2D, null);
          const maskColor = target.scene.begin(maskWidth, maskHeight);
          const result = renderer.draw({
            // The rim scene keeps draw index 0; the named source supplies its camera, not its queue.
            scene: fieldScene,
            role: "field",
            camera: sourceCamera,
            instanceCameras,
            cameraScopes: stageCameraScopes(fieldScene, {
              ...sourceCamera,
              environment:
                source === "MainScene" ? incomingCamera.environment : sourceCamera.environment,
            }),
            lighting: {
              ...lighting,
              lights: lighting.lights.filter((light) => light.kind !== "rim"),
            },
            wind,
            snapshotDepth,
          });
          for (const reason of result.skipped.values()) skipped.add(reason);
          target.depth.capture(gl.getParameter(gl.FRAMEBUFFER_BINDING), maskWidth, maskHeight);
          rimMasks.set(
            rim.key,
            target.filter.apply(
              target.depth.binding.texture,
              maskWidth,
              maskHeight,
              sourceCamera.projection,
              rim.minDiff,
              rim.light.rimMask === 4 ? maskColor : undefined,
            ),
          );
        }
        for (const [key, target] of rimTargets) {
          if (activeRims.has(key)) continue;
          target.scene.dispose();
          target.depth.dispose();
          target.filter.dispose();
          rimTargets.delete(key);
        }
        const shadows: NonNullable<Parameters<typeof renderer.draw>[0]["shadows"]>[number][] = [];
        const shadowKeys = stageShadowKeys(baseScene);
        for (const [key, buffer] of shadowBuffers) {
          if (shadowKeys.has(key)) continue;
          buffer.targets.dispose();
          shadowBuffers.delete(key);
        }
        for (const shadowLight of stageShadows(baseScene)) {
          let buffer = shadowBuffers.get(shadowLight.key);
          if (!buffer) {
            buffer = {
              targets: createStageShadowTargets(gl),
              cameras: createStageShadowCameras(),
            };
            shadowBuffers.set(shadowLight.key, buffer);
          }
          const shadowTargets = buffer.targets;
          shadowTargets.resize(shadowLight.settings.cascadeCount);
          const casterScene = stageShadowCasterScene(shadowLight, [fieldScene, baseScene]);
          const casterRole = casterScene === fieldScene ? "field" : "base";
          // Shadow lights leave the source name empty, selecting the default MainScene camera.
          const sourceCamera = fieldCamera;
          const shadowCameras = buffer.cameras;
          shadowCameras.resize(shadowLight.settings.cascadeCount);
          const cameras: ReturnType<typeof shadowCameras.update> = [];
          const shadowTextures: WebGLTexture[] = [];
          let moments: WebGLTexture | undefined;
          for (let index = 0; index < shadowLight.settings.cascadeCount; index++) {
            const initial = shadowCameras.updateCascade(
              index,
              shadowLight.settings,
              sourceCamera,
              shadowLight.direction as Vec3,
              [],
            );
            const queue = renderer.prepareShadow(
              {
                scene: casterScene,
                role: casterRole,
                camera: sourceCamera,
                instanceCameras,
                lighting,
                wind,
                shadowPass: shadowLight,
              },
              initial,
            );
            for (const reason of queue.skipped.values()) skipped.add(reason);
            const shadowCamera = shadowCameras.updateCascade(
              index,
              shadowLight.settings,
              sourceCamera,
              shadowLight.direction as Vec3,
              queue.casterSpheres,
            );
            cameras.push(shadowCamera);
            gl.activeTexture(gl.TEXTURE0 + 15);
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
            for (const unit of [11, 12, 14]) {
              gl.activeTexture(gl.TEXTURE0 + unit);
              gl.bindTexture(gl.TEXTURE_2D, null);
            }
            shadowTextures.push(
              shadowTargets.begin(
                index,
                shadowLight.settings.width,
                shadowLight.settings.height,
                shadowLight.settings.softness,
              ),
            );
            const result = queue.draw({
              ...shadowCamera,
              position: sourceCamera.position,
            });
            for (const reason of result.skipped.values()) skipped.add(reason);
            moments = shadowTargets.finish(index);
          }
          shadows.push({ light: shadowLight, cameras, textures: shadowTextures, moments });
        }
        for (const reflection of stageReflections(baseScene)) {
          let buffer = reflectionTargets.get(reflection.key);
          if (!buffer) {
            buffer = {
              target: createStageReflectionTarget(gl),
              sizing: createStageReflectionSizing(),
            };
            reflectionTargets.set(reflection.key, buffer);
          }
          const { source, casters } = stageReflectionScenes(reflection, [fieldScene, baseScene]);
          const sourceCamera = source === fieldScene ? fieldCamera : camera;
          const reflectedCamera =
            stageSceneCameraView(source, 0.5) ??
            stageSceneCameraFromDisplay(incomingCamera.environment, 0.5);
          const cullProjection = reflectedCamera.projection;
          const scopeSeed = source === casters ? incomingCamera : sourceCamera;
          const scopes =
            scopeSeed === incomingCamera
              ? casters === fieldScene
                ? fieldCameraScopes
                : baseCameraScopes
              : stageCameraScopes(casters, scopeSeed, 1, new Map(drawCameras));
          const halfFarScopes = stageCameraScopes(casters, scopeSeed, 0.5, new Map(drawCameras));
          const reflectedCameras = new Map<StageDrawCamera, StageDrawCamera>();
          const reflectedScopes = new Map(
            [...scopes].map(([node, scopedCamera]) => {
              let reflected = reflectedCameras.get(scopedCamera);
              if (!reflected) {
                reflected = {
                  ...reflectionRenderCamera(
                    scopedCamera,
                    scopedCamera === scopeSeed
                      ? cullProjection
                      : halfFarScopes.get(node)!.projection,
                    reflection.plane,
                  ),
                  environment: scopedCamera.environment,
                };
                reflectedCameras.set(scopedCamera, reflected);
              }
              return [node, reflected];
            }),
          );
          const [reflectionWidth, reflectionHeight] = buffer.sizing.update(
            width,
            height,
            reflection.sizeMode,
            reflection.width,
            reflection.height,
          );
          const reflectionTexture = buffer.target.begin(
            reflectionWidth,
            reflectionHeight,
            reflection.requestHdr,
          );
          const reflected = renderer.draw({
            scene: casters,
            role: casters === fieldScene ? "field" : "base",
            camera: reflectionRenderCamera(sourceCamera, cullProjection, reflection.plane),
            instanceCameras,
            cameraScopes: reflectedScopes,
            lighting,
            wind,
            mirror: reflection,
            rimMasks,
            shadows,
            snapshotDepth,
          });
          for (const reason of reflected.skipped.values()) skipped.add(reason);
          reflections.push({
            light: reflection,
            texture: reflectionTexture,
          });
        }
        post.begin(width, height, { tick, reset: historyReset });
        {
          const stats = renderer.draw({
            scene: baseScene,
            role: "base",
            camera,
            instanceCameras,
            cameraScopes: baseCameraScopes,
            lighting,
            wind,
            shadows,
            deferFront: true,
            captureAlpha: true,
            rimMasks,
            snapshotDepth,
            reflections,
          });
          draws += stats.draws;
          front = stats.finish;
          for (const reason of stats.skipped.values()) skipped.add(reason);
        }
        post.end(
          stagePostFilters(baseScene),
          destination,
          () => {
            if (!front) return;
            gl.viewport(0, 0, width, height);
            gl.depthMask(true);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            draws += front();
          },
          camera,
        );
        gl.viewport(0, 0, width, height);
        gl.depthMask(true);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        const field = renderer.draw({
          scene: fieldScene,
          role: "field",
          camera: fieldCamera,
          instanceCameras,
          cameraScopes: fieldCameraScopes,
          lighting,
          shadows,
          reflections,
          rimMasks,
          wind,
          snapshotDepth,
        });
        draws += field.draws;
        for (const reason of field.skipped.values()) skipped.add(reason);
        if (import.meta.env.DEV) {
          const key = [...new Set([...baseScene.missing, ...fieldScene.missing, ...skipped])]
            .sort()
            .join("\n");
          if (key !== listedKey) {
            listedKey = key;
            device.canvas.dataset.stageMissing = key;
          }
          if (fieldChanged)
            device.canvas.dataset.stageField = held.has(FIELD_BRIGHTNESS_RECORD)
              ? (heldLabel ?? "")
              : "";
        }
        return draws > 0;
      } catch (cause) {
        detach();
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("error");
        return false;
      } finally {
        gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
        gl.viewport(0, 0, width, height);
        gl.depthMask(true);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        device.markExternalBindingsUnknown();
      }
    });
    setStatus("ready");
  } catch (cause) {
    if (!signal.aborted) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    }
    detach();
  } finally {
    scope.dispose();
  }
  return detach;
}
