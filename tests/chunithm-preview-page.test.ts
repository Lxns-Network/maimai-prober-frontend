import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewLiveState } from "../src/pages/public/Chart/chunithm/runtime/liveState";
import { createPreviewSession } from "../src/pages/public/Chart/chunithm/runtime/session";
import type { PreviewControls } from "../src/pages/public/Chart/chunithm/runtime/types";

const mock = vi.hoisted(() => ({
  sfxPause: vi.fn(),
  sfxUpdate: vi.fn(),
  computedSpeed: vi.fn(),
  render: vi.fn(() => ({ draws: 1, notes: 1, backgroundDrawn: false })),
  resetBackgroundHistory: vi.fn(),
  hudDraw: vi.fn(),
  judgePositionOffset: null as (() => number) | null,
  criticalDisplayRow: null as (() => number) | null,
}));

vi.mock("../src/pages/public/Chart/chunithm/assets/chartInput", () => ({
  loadChartInput: async () => ({
    song: {},
    jacketUrl: null,
    musicUrl: "/music.mp3",
    difficulty: 3,
    difficulties: [],
    mirror: false,
    stage: null,
  }),
}));
vi.mock("../src/pages/public/Chart/chunithm/rendering/notes", () => ({
  readNotePack: async () => ({}),
  openPageChartSession: () => ({
    compute: async (row: number) => {
      mock.computedSpeed(row);
      return { effects: {} };
    },
    dispose() {},
  }),
  createNoteHost: async (input: {
    judgePositionOffset: () => number;
    criticalDisplayRow: () => number;
  }) => {
    mock.judgePositionOffset = input.judgePositionOffset;
    mock.criticalDisplayRow = input.criticalDisplayRow;
    return {
      timeline: { duration: 10, column: () => [], meta: {} },
      textures: new Map(),
      dispose() {},
    };
  },
}));
vi.mock("@lxns-network/chunithm-chart-engine/field", () => ({
  readFieldPack: () => ({
    camera: { environment: {} },
    speedOptions: [
      { value: "0", label: "1" },
      { value: "28", label: "8" },
    ],
    wall: { positions: [{ rawId: 0, number: 1 }] },
    dividers: {
      rows: [
        { value: "0", label: "关闭" },
        { value: "2", label: "4 分割" },
      ],
      defaultRow: 2,
      defaultColor: 8,
      colors: 10,
    },
  }),
}));
vi.mock("../src/pages/public/Chart/chunithm/rendering/field", () => ({
  createFieldCamera: () => () => ({}),
  createField: async () => ({ draws: () => [], dispose() {} }),
}));
vi.mock("@lxns-network/chunithm-chart-engine/render/frameHost", () => ({
  createFrameHost: () => ({
    speedOptions: [
      { value: "0", label: "1" },
      { value: "28", label: "8" },
    ],
    render: mock.render,
    resetBackgroundHistory: mock.resetBackgroundHistory,
    setScenery() {},
    dispose() {},
  }),
}));
vi.mock("../src/pages/public/Chart/chunithm/rendering/hud", () => ({
  loadHudResources: async () => ({ jacket: Promise.resolve(null) }),
  createHudHost: () => ({ missing: [], draw: mock.hudDraw, selectSpeed() {}, dispose() {} }),
}));
vi.mock("@lxns-network/chunithm-chart-engine/audio/sfx", () => ({
  loadSfxLibrary: () => ({}),
  createSfxPlayer: () => ({ update: mock.sfxUpdate, pause: mock.sfxPause, dispose() {} }),
}));
afterEach(() => vi.unstubAllGlobals());

async function setup(
  initialSpeedRow: number | null = 0,
  initialJudgePositionRow: number | null = null,
  preparePresentation?: Parameters<typeof createPreviewSession>[0]["preparePresentation"],
) {
  const clock = { current: 1, output: 1 };
  vi.spyOn(performance, "now").mockReturnValue(100);
  const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  class Context {
    state: AudioContextState = "running";
    sampleRate = 48000;
    destination = {} as AudioDestinationNode;
    get currentTime() {
      return clock.current;
    }
    getOutputTimestamp() {
      return { contextTime: clock.output, performanceTime: 100 };
    }
    async resume() {}
    async close() {
      this.state = "closed";
    }
    async decodeAudioData() {
      return {
        duration: 10,
        length: 480000,
        sampleRate: 48000,
        numberOfChannels: 2,
        getChannelData: () => new Float32Array(480000),
      };
    }
    createGain() {
      return { gain: { value: 1, setTargetAtTime() {} }, connect() {}, disconnect() {} };
    }
    createBuffer(channels: number, length: number, sampleRate: number) {
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        copyToChannel() {},
      };
    }
    createBufferSource() {
      const source = {
        buffer: null,
        loop: false,
        playbackRate: { value: 1 },
        channelInterpretation: "speakers",
        onended: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      sources.push(source);
      return source as unknown as AudioBufferSourceNode;
    }
  }
  const audio = new Context();
  mock.sfxPause.mockClear();
  mock.sfxUpdate.mockClear();
  mock.computedSpeed.mockClear();
  mock.hudDraw.mockClear();
  mock.render.mockClear();
  mock.resetBackgroundHistory.mockClear();
  mock.judgePositionOffset = null;
  mock.criticalDisplayRow = null;
  vi.stubGlobal("AudioContext", function () {
    return audio;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("window", {
    location: { search: "?effect_diagnostic=off", href: "https://local.test/" },
    devicePixelRatio: 1,
    matchMedia: () => ({ addEventListener() {}, removeEventListener() {} }),
  });
  vi.stubGlobal("fetch", async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const flushFrame = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(clock.current * 1000);
  };
  const advance = (seconds: number) => {
    clock.current += seconds;
    clock.output += seconds;
  };
  const playing: boolean[] = [];
  const seeking: boolean[] = [];
  const judgePositions: string[] = [];
  const criticalDisplays: string[] = [];
  const statuses: string[] = [];
  let controls: PreviewControls | null = null;
  const live = createPreviewLiveState();
  const cleanup = createPreviewSession({
    canvas: {
      width: 640,
      height: 360,
      getBoundingClientRect: () => ({ width: 640, height: 360 }),
      getContext: () => ({}),
      setAttribute() {},
    } as unknown as HTMLCanvasElement,
    assetBase: "https://local.test/",
    musicId: 1,
    initialSeconds: 0,
    initialSpeedRow,
    initialPlayTimingRow: null,
    initialJudgePositionRow,
    initialCriticalDisplayRow: null,
    mirror: false,
    initialWallRawId: null,
    initialDividerRow: null,
    preparePresentation,
    live,
    ui: {
      setChangingDifficulty() {},
      setStatus: (value) => statuses.push(value),
      setError() {},
      setPlaying: (value) => playing.push(value),
      setSeeking: (value) => seeking.push(value),
      setDurationSeconds() {},
      setSpeedOptions() {},
      setSpeedValue() {},
      setPlayTimingValue() {},
      setJudgePositionValue: (value) => judgePositions.push(value),
      setCriticalDisplayValue: (value) => criticalDisplays.push(value),
      setFieldWallOptions() {},
      setFieldWallValue() {},
      setDividerOptions() {},
      setDividerValue() {},
      setDifficultyOptions() {},
      setDifficultyValue() {},
    },
    setControls: (value) => {
      controls = value;
    },
  });
  await vi.waitFor(() => expect(statuses).toContain("ready"));
  const page = controls as unknown as PreviewControls;
  const start = async () => {
    page.toggle();
    await vi.waitFor(() => expect(frames.size).toBeGreaterThan(0));
    await Promise.resolve();
    flushFrame();
    advance(0.2);
    flushFrame();
    expect(live.time.getSnapshot()).toBeGreaterThan(0);
  };
  return {
    page,
    live,
    playing,
    seeking,
    judgePositions,
    criticalDisplays,
    sources,
    flushFrame,
    advance,
    start,
    cleanup,
    audio,
  };
}

describe("preview Stage loading", () => {
  it("aborts pending presentation loading when the page is disposed and releases it once", async () => {
    let signal!: AbortSignal;
    let resolvePrepared!: (release: () => void) => void;
    const release = vi.fn();
    const f = await setup(0, null, (_scene, _stage, loadingSignal) => {
      signal = loadingSignal;
      return new Promise((resolve) => (resolvePrepared = resolve));
    });
    expect(signal.aborted).toBe(false);
    f.cleanup();
    expect(signal.aborted).toBe(true);
    resolvePrepared(release);
    await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(1));
  });
});

describe("preview Stage exposure history", () => {
  it("resets for seeks, scrubs and replay, retaining history for an ordinary redraw", async () => {
    const f = await setup();
    try {
      f.page.seek(4);
      f.flushFrame();
      f.page.seek(4);
      f.flushFrame();
      expect(mock.resetBackgroundHistory).toHaveBeenCalledTimes(2);
      f.page.selectJudgePosition("3");
      f.flushFrame();
      expect(mock.resetBackgroundHistory).toHaveBeenCalledTimes(2);
      f.page.scrub(6);
      f.flushFrame();
      expect(mock.resetBackgroundHistory).toHaveBeenCalledTimes(3);
      f.page.toggle();
      await vi.waitFor(() => expect(mock.resetBackgroundHistory).toHaveBeenCalledTimes(4));
    } finally {
      f.cleanup();
    }
  });
});

describe("preview initial speed", () => {
  it("uses the basic default only when no speed row is supplied", async () => {
    const standard = await setup(null);
    try {
      expect(mock.computedSpeed).toHaveBeenCalledWith(28);
    } finally {
      standard.cleanup();
    }
    const explicit = await setup(0);
    try {
      expect(mock.computedSpeed).toHaveBeenCalledWith(0);
    } finally {
      explicit.cleanup();
    }
  });
});

describe("preview judge position", () => {
  it("uses the selected row and redraws the current frame without seeking", async () => {
    const f = await setup(0, 1);
    try {
      expect(f.judgePositions[f.judgePositions.length - 1]).toBe("1");
      expect(mock.judgePositionOffset?.()).toBe(-40);
      f.page.seek(4);
      f.flushFrame();
      mock.render.mockClear();
      f.page.selectJudgePosition("3");
      f.flushFrame();
      expect(f.judgePositions[f.judgePositions.length - 1]).toBe("3");
      expect(mock.judgePositionOffset?.()).toBe(-100);
      expect(mock.render).toHaveBeenLastCalledWith(4, 0, 4, 1, 1);
      expect(f.live.time.getSnapshot()).toBe(4);
      f.page.selectJudgePosition("invalid");
      expect(mock.judgePositionOffset?.()).toBe(-100);
    } finally {
      f.cleanup();
    }
  });
});

describe("preview critical display", () => {
  it("updates the selected row and redraws without moving the music time", async () => {
    const f = await setup();
    try {
      expect(f.criticalDisplays[f.criticalDisplays.length - 1]).toBe("0");
      expect(mock.criticalDisplayRow?.()).toBe(0);
      f.page.seek(4);
      f.flushFrame();
      mock.render.mockClear();
      f.page.selectCriticalDisplay("3");
      f.flushFrame();
      expect(f.criticalDisplays[f.criticalDisplays.length - 1]).toBe("3");
      expect(mock.criticalDisplayRow?.()).toBe(3);
      expect(mock.render).toHaveBeenLastCalledWith(4, 0, 4, 1, 1);
      expect(f.live.time.getSnapshot()).toBe(4);
      f.page.selectCriticalDisplay("invalid");
      expect(mock.criticalDisplayRow?.()).toBe(3);
    } finally {
      f.cleanup();
    }
  });
});

describe("preview play timing", () => {
  it("moves notes, effects, HUD and SFX together without moving the music cursor", async () => {
    const f = await setup();
    try {
      f.page.seek(4);
      f.flushFrame();
      mock.render.mockClear();
      mock.hudDraw.mockClear();
      f.page.selectPlayTiming("40");
      f.flushFrame();
      expect(mock.render).toHaveBeenLastCalledWith(4, 0, 4 - 2 / 60, 1, 1);
      expect(mock.hudDraw).toHaveBeenLastCalledWith(476);
      expect(f.live.time.getSnapshot()).toBe(4);
      f.page.selectPlayTiming("0");
      f.flushFrame();
      expect(mock.render).toHaveBeenLastCalledWith(4, 0, 4 + 2 / 60, 1, 1);
      expect(mock.hudDraw).toHaveBeenLastCalledWith(484);
      expect(f.live.time.getSnapshot()).toBe(4);
      await f.start();
      const position = mock.sfxUpdate.mock.lastCall![0];
      expect(position.bufferSeconds).toBeCloseTo(f.live.time.getSnapshot() + 2 / 60, 9);
      expect(mock.sfxPause).toHaveBeenCalledTimes(2);
    } finally {
      f.cleanup();
    }
  });

  it("keeps a negative chart time before positive timing while leaving the music time unchanged", async () => {
    const f = await setup();
    try {
      f.page.selectPlayTiming("40");
      f.flushFrame();
      expect(mock.render).toHaveBeenLastCalledWith(0, 0, -2 / 60, 1, 1);
      expect(mock.hudDraw).toHaveBeenLastCalledWith(0);
      expect(f.live.time.getSnapshot()).toBe(0);
    } finally {
      f.cleanup();
    }
  });

  it("schedules initial SFX against the upcoming music start", async () => {
    const f = await setup();
    try {
      f.page.selectPlayTiming("40");
      f.flushFrame();
      f.page.toggle();
      await vi.waitFor(() => {
        expect(f.sources).toHaveLength(1);
      });
      expect(mock.sfxUpdate).toHaveBeenLastCalledWith({
        phase: "playing",
        playbackRate: 1,
        bufferSeconds: -2 / 60,
        outputTime: 1 + 256 / 48000,
      });
      f.advance(0.1);
      f.flushFrame();
      expect(mock.sfxUpdate).toHaveBeenLastCalledWith({
        phase: "playing",
        playbackRate: 1,
        bufferSeconds: expect.closeTo(0.1 - 256 / 48000 - 2 / 60, 9),
        outputTime: expect.closeTo(1.1, 9),
      });
    } finally {
      f.cleanup();
    }
  });

  it("schedules seek SFX at the upcoming handoff and then follows the audible clock", async () => {
    const f = await setup();
    try {
      await f.start();
      f.page.seek(4);
      f.flushFrame();
      expect(mock.sfxUpdate.mock.lastCall![0].bufferSeconds).toBe(4);
      expect(mock.sfxUpdate.mock.lastCall![0].outputTime).toBeCloseTo(
        f.audio.currentTime + 0.05,
        9,
      );
      f.advance(0.1);
      f.flushFrame();
      expect(mock.sfxUpdate.mock.lastCall![0].bufferSeconds).toBeCloseTo(4.05, 9);
    } finally {
      f.cleanup();
    }
  });

  it("keeps SFX silent when pausing before a scheduled start becomes audible", async () => {
    const f = await setup();
    try {
      f.page.toggle();
      await vi.waitFor(() => {
        f.flushFrame();
        expect(f.sources).toHaveLength(1);
      });
      const pausedAt = f.live.time.getSnapshot();
      f.page.toggle();
      f.flushFrame();
      expect(mock.sfxUpdate.mock.lastCall![0].phase).toBe("paused");
      expect(f.live.time.getSnapshot()).toBe(pausedAt);
      f.advance(0.1);
      f.flushFrame();
      expect(mock.sfxUpdate.mock.lastCall![0].phase).toBe("paused");
      expect(f.live.time.getSnapshot()).toBe(pausedAt);
      f.advance(0.1);
      f.flushFrame();
      expect(mock.sfxUpdate.mock.lastCall![0].phase).toBe("paused");
    } finally {
      f.cleanup();
    }
  });
});

describe("preview scrub handoff", () => {
  it("limits draws while polling audio and redraws paused seeks immediately", async () => {
    const f = await setup();
    try {
      await f.start();
      f.page.setFpsLimit(60);
      f.flushFrame();
      mock.render.mockClear();
      mock.sfxUpdate.mockClear();
      for (let i = 0; i < 120; i++) {
        f.advance(1 / 240);
        f.flushFrame();
      }
      expect(mock.render.mock.calls.length).toBeGreaterThanOrEqual(29);
      expect(mock.render.mock.calls.length).toBeLessThanOrEqual(30);
      expect(mock.sfxUpdate).toHaveBeenCalledTimes(120);
      f.page.toggle();
      f.page.scrub(4);
      f.flushFrame();
      expect(f.live.time.getSnapshot()).toBe(4);
    } finally {
      f.cleanup();
    }
  });

  it("reports the audible pause while scrubbing and resumes at the target on release", async () => {
    const f = await setup();
    try {
      await f.start();
      f.page.scrub(4);
      expect(f.playing[f.playing.length - 1]).toBe(false);
      expect(mock.sfxPause).toHaveBeenCalledOnce();
      f.flushFrame();
      expect(f.seeking[f.seeking.length - 1]).toBe(true);
      f.advance(0.2);
      f.flushFrame();
      expect(f.seeking[f.seeking.length - 1]).toBe(false);
      expect(f.live.time.getSnapshot()).toBe(4);
      f.page.seek(4);
      expect(f.playing[f.playing.length - 1]).toBe(true);
      f.flushFrame();
      expect(f.sources[f.sources.length - 1].start.mock.calls[0][1]).toBe(6);
      f.advance(0.2);
      f.flushFrame();
      expect(f.live.time.getSnapshot()).toBeGreaterThan(4);
    } finally {
      f.cleanup();
    }
  });

  it("does not request a source past the end when releasing a playing scrub there", async () => {
    const f = await setup();
    try {
      await f.start();
      f.page.scrub(10);
      f.flushFrame();
      f.advance(0.2);
      f.flushFrame();
      f.page.seek(10);
      expect(f.playing[f.playing.length - 1]).toBe(false);
      f.flushFrame();
      expect(f.sources).toHaveLength(1);
      expect(f.live.time.getSnapshot()).toBe(10);
    } finally {
      f.cleanup();
    }
  });

  it("commits the latest target if released before the pause handoff is audible", async () => {
    const f = await setup();
    try {
      await f.start();
      f.page.scrub(2);
      f.flushFrame();
      f.page.scrub(6);
      f.page.seek(6);
      f.flushFrame();
      expect(f.sources).toHaveLength(1);
      f.advance(0.2);
      f.flushFrame();
      expect(f.sources).toHaveLength(2);
      expect(f.sources[1].start.mock.calls[0][1]).toBe(8);
      f.advance(0.2);
      f.flushFrame();
      expect(f.live.time.getSnapshot()).toBeGreaterThan(6);
    } finally {
      f.cleanup();
    }
  });

  it("keeps an initially paused scrub paused when released", async () => {
    const f = await setup();
    try {
      f.page.scrub(3);
      f.flushFrame();
      f.page.seek(3);
      f.flushFrame();
      expect(f.sources).toHaveLength(0);
      expect(f.playing[f.playing.length - 1]).toBe(false);
      expect(f.live.time.getSnapshot()).toBe(3);
    } finally {
      f.cleanup();
    }
  });

  it("pauses the music intention even if the audio context is interrupted during a scrub", async () => {
    const f = await setup();
    try {
      await f.start();
      f.audio.state = "suspended";
      f.page.scrub(3);
      f.flushFrame();
      expect(f.playing[f.playing.length - 1]).toBe(false);
      f.audio.state = "running";
      f.page.refreshPresentation();
      f.flushFrame();
      expect(f.sources[0].stop).toHaveBeenCalled();
    } finally {
      f.cleanup();
    }
  });

  it("starts from the scrub target if play is pressed before release", async () => {
    const f = await setup();
    try {
      f.page.scrub(3);
      f.flushFrame();
      f.page.toggle();
      await vi.waitFor(() => {
        f.flushFrame();
        expect(f.sources).toHaveLength(1);
      });
      expect(f.sources[0].start.mock.calls[0][1]).toBe(5);
      f.advance(0.2);
      f.flushFrame();
      expect(f.live.time.getSnapshot()).toBeGreaterThan(3);
    } finally {
      f.cleanup();
    }
  });

  it("does not restart playback when a scrub cancels a pending activation", async () => {
    const f = await setup();
    try {
      f.page.toggle();
      f.page.scrub(3);
      await vi.waitFor(() => {
        f.flushFrame();
        expect(f.live.time.getSnapshot()).toBe(3);
      });
      expect(f.sources).toHaveLength(0);
      expect(f.playing[f.playing.length - 1]).toBe(false);
      f.page.seek(3);
      f.flushFrame();
      expect(f.sources).toHaveLength(1);
      expect(f.sources[0].start.mock.calls[0][1]).toBe(5);
    } finally {
      f.cleanup();
    }
  });
});
