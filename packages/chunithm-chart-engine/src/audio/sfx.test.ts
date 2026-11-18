import { describe, expect, it, vi } from "vitest";
import { Timeline } from "../chart/timeline/reader";
import { TimelineWriter } from "../chart/timeline/writer";
import { createLiveCuePlayer, createSfxPlayer, type SfxLibrary, type SfxSourceLike } from "./sfx";

function player(times: number[]) {
  const writer = new TimelineWriter();
  for (const time of times) writer.push("cue", { time, cue: 1, channel: 0, gain: 1 });
  const timeline = Timeline.from(
    writer.finish({
      durationSeconds: 10,
      noteCount: 0,
      unsupported: [],
      defaultSpeedRow: 28,
      appearIsPlaceholder: false,
    }),
  );
  const sources: (SfxSourceLike & { start: ReturnType<typeof vi.fn> })[] = [];
  const context = {
    currentTime: 1,
    createBuffer: () => ({ length: 4800, getChannelData: () => new Float32Array(4800) }),
    createGain: () => ({
      gain: { value: 1, setValueCurveAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    createBufferSource: () => {
      const source = {
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        onended: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      sources.push(source);
      return source;
    },
  };
  const library = {
    sampleRate: 48000,
    cues: new Map([
      [
        1,
        {
          combo: null,
          voices: [
            {
              track: 0,
              sample: "tap",
              delayMilliseconds: 0,
              releaseMilliseconds: 5,
              releaseCurve: 0,
              releaseAmount: 1,
            },
          ],
        },
      ],
    ]),
    buffers: new Map([
      ["tap", { buffer: context.createBuffer(), frames: 4800, loopStart: 0, loopEnd: 0 }],
    ]),
  } satisfies SfxLibrary;
  return {
    context,
    library,
    sources,
    sfx: createSfxPlayer({ context, destination: {}, library, timeline }),
  };
}

it("resumes a live sustained voice at its loop phase without replaying a tap", () => {
  const { context, library, sources } = player([]);
  const sample = library.buffers.get("tap")!;
  library.buffers.set("sustain", { ...sample, loopStart: 480, loopEnd: 2400 });
  const voice = library.cues.get(1)!.voices[0];
  library.cues.set(2, { combo: null, voices: [{ ...voice, sample: "sustain" }] });
  const live = createLiveCuePlayer({ context, destination: {}, library });
  live.start(0, 1, 1, 1, 0);
  live.start(1, 2, 1, 1, 0);
  context.currentTime = 1.12;
  live.pause();
  context.currentTime = 2;
  live.resume();
  live.resume();
  expect(sources).toHaveLength(3);
  expect(sources[2].loop).toBe(true);
  expect(sources[2].start.mock.calls[0][1]).toBeCloseTo(0.04);
  live.pause();
  live.stop(1, 2);
  live.resume();
  expect(sources).toHaveLength(3);
});

describe("SFX output latency", () => {
  it.each([1, 0.5, 0.1])("keeps taps scheduled through a 400ms output delay at %sx", (rate) => {
    const times = [0, 0.2, 0.4, 0.6, 0.8].map((time) => time * rate);
    const f = player(times);
    const start = 1.01;
    for (let elapsed = 0; elapsed <= 1.2; elapsed += 0.02) {
      f.context.currentTime = 1 + elapsed;
      const audible = f.context.currentTime - 0.4;
      const outputTime = Math.max(start, audible);
      f.sfx.update({
        phase: "playing",
        bufferSeconds: (outputTime - start) * rate,
        outputTime,
        playbackRate: rate,
      });
    }
    expect(f.sources).toHaveLength(times.length);
    times.forEach((time, i) => {
      expect(f.sources[i].start.mock.calls[0][0]).toBeCloseTo(start + time / rate, 10);
      expect(f.sources[i].start.mock.calls[0][1]).toBe(0);
    });
    f.sfx.dispose();
  });

  it("still skips expired taps after a main-thread stall", () => {
    const f = player([0.2, 0.4, 0.6, 0.8]);
    f.sfx.update({ phase: "playing", bufferSeconds: 0, outputTime: 1.01 });
    f.context.currentTime = 1.7;
    f.sfx.update({ phase: "playing", bufferSeconds: 0.29, outputTime: 1.3 });
    expect(f.sources).toHaveLength(2);
    expect(f.sources[0].start.mock.calls[0][0]).toBeCloseTo(1.21, 10);
    expect(f.sources[1].start.mock.calls[0][0]).toBeCloseTo(1.81, 10);
    f.sfx.dispose();
  });
});
