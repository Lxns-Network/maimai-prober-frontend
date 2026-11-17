import { createDepthSnapshot, type DepthSnapshot } from "../gpu/depthSnapshot";
import type {
  FrameDepth,
  FrameHost,
  FrameHostOptions,
  FrameDraw,
  FrameCamera,
  FrameExternalRenderer,
  FrameBackgroundRenderer,
  FramePresentation,
} from "./frameTypes";
import { orderPass, renderPass, DEPTH_SNAPSHOT_FIRST_PASS } from "./passOrder";

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  depth: true,
  stencil: true,
  premultipliedAlpha: false,
};

function checkDraw(entry: FrameDraw): void {
  if (!renderPass(entry.pass)) throw new RangeError(`未支持的绘制 pass ${entry.pass}`);
  if (!Number.isInteger(entry.key) || entry.key < 0 || entry.key > 0xffff)
    throw new RangeError("绘制键必须是 0..0xffff 的整数");
  if (!Number.isFinite(entry.depth) || Math.fround(entry.depth) !== entry.depth)
    throw new RangeError("绘制深度必须是有限 binary32");
  if (entry.requiresDepthSnapshot && entry.pass < DEPTH_SNAPSHOT_FIRST_PASS)
    throw new RangeError("深度快照只服务 pass 16 及之后");
  if (typeof entry.draw !== "function") throw new TypeError("绘制项缺少 draw");
}

export function createFrameHost(options: FrameHostOptions): FrameHost {
  const { canvas } = options;
  const gl = canvas.getContext("webgl2", CONTEXT_ATTRIBUTES) as WebGL2RenderingContext | null;
  if (!gl) throw new Error("浏览器无法创建 WebGL2 上下文");

  let sequence = 0;
  let disposed = false;
  let background: FrameBackgroundRenderer | null = null;
  let resetBackgroundHistory = true;
  let playbackEpoch = 0;
  let external: FrameExternalRenderer | null = null;
  let scenery: Parameters<FrameHost["setScenery"]>[0] = null;
  let snapshot: DepthSnapshot | null = null;

  const presentation: FramePresentation = {
    gl,
    canvas,
    get executionSequence() {
      return sequence;
    },
    markResourcesUnknown() {
      sequence++;
    },
    markExternalBindingsUnknown() {
      sequence++;
    },
  };
  const live = () => {
    if (disposed) throw new Error("The frame host has been disposed");
  };
  const cameraOf = (): FrameCamera => {
    const evaluated = options.evaluateCamera(canvas.width, canvas.height);
    return {
      stageEnvironment: evaluated.stageEnvironment,
      viewport: evaluated.viewport,
      cameraA: Array.from(evaluated.view),
      cameraB: Array.from(evaluated.projection),
      viewProjection: Float32Array.from(evaluated.viewProjection),
    };
  };
  const clearFrame = () => {
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.depthMask(true);
    gl.clearDepth(1);
    gl.stencilMask(0xff);
    gl.clearStencil(0);
    gl.clear(gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  };
  const runPasses = (entries: readonly FrameDraw[]): number => {
    const byPass = new Map<number, FrameDraw[]>();
    for (const entry of entries) {
      checkDraw(entry);
      let group = byPass.get(entry.pass);
      if (!group) byPass.set(entry.pass, (group = []));
      group.push(entry);
    }
    const snapshotNeeded = entries.some((entry) => entry.requiresDepthSnapshot === true);
    const context: { depth: FrameDepth | null } = { depth: null };
    let draws = 0;
    let previous: object | undefined;
    const passes = [...byPass.keys()].sort((a, b) => a - b);
    for (const passIndex of passes) {
      if (snapshotNeeded && context.depth === null && passIndex >= DEPTH_SNAPSHOT_FIRST_PASS) {
        snapshot ??= createDepthSnapshot(gl);
        snapshot.capture();
        context.depth = snapshot.binding;
        previous = undefined;
      }
      const pass = renderPass(passIndex)!;
      for (const entry of orderPass(byPass.get(passIndex)!, pass.sortMode)) {
        if (entry.source === undefined || entry.source !== previous) sequence++;
        previous = entry.source;
        const result = entry.draw(context);
        if (!result || !Number.isSafeInteger(result.draws) || result.draws < 0)
          throw new TypeError("绘制项必须同步返回绘制次数");
        draws += result.draws;
      }
    }
    return draws;
  };

  return {
    speedOptions: options.speedOptions,
    readCamera() {
      live();
      return cameraOf();
    },
    readEffectCamera() {
      live();
      const evaluated = options.evaluateCamera(canvas.width, canvas.height);
      return { position: evaluated.eye, up: evaluated.up };
    },
    withPresentation(action) {
      live();
      return action(presentation);
    },
    setBackgroundRenderer(renderer) {
      live();
      background = renderer;
      resetBackgroundHistory = true;
    },
    resetBackgroundHistory() {
      live();
      playbackEpoch++;
      resetBackgroundHistory = true;
    },
    setExternalNoteRenderer(renderer) {
      live();
      if (renderer !== null && typeof renderer !== "function")
        throw new TypeError("External note renderer must be synchronous");
      external = renderer;
    },
    setScenery(next) {
      live();
      scenery = next;
    },
    render(seconds, speedRow, chartSeconds = seconds, speedMultiplier = 1, playbackRate = 1) {
      live();
      if (
        !Number.isFinite(seconds) ||
        seconds < 0 ||
        !Number.isFinite(chartSeconds) ||
        !options.speedOptions.some((option) => Number(option.value) === speedRow)
      )
        throw new RangeError("预览时间或流速选项无效");
      clearFrame();
      const backgroundDrawn = background
        ? background(seconds, presentation, resetBackgroundHistory) === true
        : false;
      if (backgroundDrawn) resetBackgroundHistory = false;
      const camera = cameraOf();
      const entries: FrameDraw[] = scenery
        ? [...scenery(camera, chartSeconds, speedRow, speedMultiplier)]
        : [];
      let notes = 0;
      if (external) {
        const frame = external({
          seconds: chartSeconds,
          speedRow,
          speedMultiplier,
          playbackRate,
          playbackEpoch,
          camera,
          environment: { ...options.environment },
        });
        if (
          !frame ||
          !Array.isArray(frame.entries) ||
          !Number.isSafeInteger(frame.notes) ||
          frame.notes < 0
        )
          throw new TypeError("Invalid external frame");
        entries.push(...frame.entries);
        notes = frame.notes;
        sequence++;
      }
      const draws = runPasses(entries);
      return { draws, notes, backgroundDrawn };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      background = null;
      external = null;
      scenery = null;
      snapshot?.dispose();
      snapshot = null;
    },
  };
}
