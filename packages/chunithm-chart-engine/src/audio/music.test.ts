import { describe, expect, it, vi } from "vitest";
import { createMusicPlayer, isMusicOutputPending, type MusicContext } from "./music";

function fakeContext(frames = 48000 * 10) {
  const sources: {
    buffer: unknown;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }[] = [];
  const clock = { current: 1, output: 1, wall: 100, stamp: 100, ready: true };
  vi.spyOn(performance, "now").mockImplementation(() => clock.wall);
  const context = {
    state: "running" as AudioContextState,
    sampleRate: 48000,
    get currentTime() {
      return clock.current;
    },
    destination: {} as AudioDestinationNode,
    resume: vi.fn(async () => {}),
    getOutputTimestamp: () =>
      clock.ready
        ? { contextTime: clock.output, performanceTime: clock.stamp }
        : { contextTime: 0, performanceTime: 0 },
    createBufferSource: vi.fn(() => {
      const node = {
        buffer: null as unknown,
        loop: false,
        playbackRate: { value: 1 },
        channelInterpretation: "speakers",
        onended: null as (() => void) | null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      };
      sources.push(node);
      return node as unknown as AudioBufferSourceNode;
    }),
  } satisfies MusicContext;
  const buffer = { length: frames, sampleRate: 48000, numberOfChannels: 2 } as AudioBuffer;
  const advance = (seconds: number) => {
    clock.current += seconds;
    clock.output += seconds;
    clock.wall += seconds * 1000;
    clock.stamp = clock.wall;
  };
  return { context, buffer, sources, clock, advance };
}

describe("music player", () => {
  it("advances between output timestamps and stays continuous when a new timestamp arrives", () => {
    const f = fakeContext();
    f.clock.current = 1.1;
    const music = createMusicPlayer({
      context: f.context,
      buffer: f.buffer,
      initialSeconds: 2,
      scheduleLeadSeconds: 0.05,
    });
    music.play();
    music.poll();
    f.advance(0.2);
    const first = music.poll().position.bufferSeconds;
    for (let i = 1; i <= 4; i++) {
      f.clock.wall += 5;
      f.clock.current += 0.005;
      expect(music.poll().position.bufferSeconds).toBeCloseTo(first + i * 0.005, 10);
    }
    f.clock.output += 0.02;
    f.clock.stamp = f.clock.wall;
    expect(music.poll().position.bufferSeconds).toBeCloseTo(first + 0.02, 10);
    f.clock.output -= 0.001;
    expect(music.poll().position.bufferSeconds).toBeCloseTo(first + 0.02, 10);
    f.clock.wall += 5;
    f.clock.current += 0.005;
    expect(music.poll().position.bufferSeconds).toBeCloseTo(first + 0.024, 10);
    music.dispose();
  });

  it("starts from silence promptly while keeping the playhead on the audible clock", () => {
    const f = fakeContext();
    const music = createMusicPlayer({
      context: f.context,
      buffer: f.buffer,
      initialSeconds: 2,
      scheduleLeadSeconds: 0.05,
    });
    expect(music.durationSeconds).toBe(10);
    const rest = music.poll();
    expect(rest.position).toMatchObject({ phase: "paused", bufferSeconds: 2 });
    music.play();
    const startAt = 1 + 256 / f.context.sampleRate;
    const handoff = music.poll();
    expect(handoff.transitioning).toBe(true);
    expect(handoff.scheduledPosition).toEqual({
      bufferSeconds: 2,
      outputTime: startAt,
      playbackRate: 1,
    });
    expect(f.sources).toHaveLength(1);
    expect(f.sources[0].start).toHaveBeenCalledWith(startAt, 2);
    expect(handoff.position.bufferSeconds).toBe(2);
    f.advance(0.15);
    const playing = music.poll();
    expect(playing.position.phase).toBe("playing");
    expect(playing.position.bufferSeconds).toBeCloseTo(2 + 1.15 - startAt, 12);
    expect(playing.transitioning).toBe(false);
    expect(playing.scheduledPosition).toBeNull();
  });

  it("holds the fractional position across a pause and resumes from it", () => {
    const f = fakeContext();
    const music = createMusicPlayer({
      context: f.context,
      buffer: f.buffer,
      initialSeconds: 0,
      scheduleLeadSeconds: 0.05,
    });
    music.play();
    music.poll();
    f.advance(1.0003);
    music.poll();
    music.pause();
    const stopAt = f.clock.current + 1 / f.context.sampleRate;
    expect(f.sources[0].stop).toHaveBeenCalledWith(stopAt);
    music.poll();
    f.advance(0.2);
    const paused = music.poll();
    expect(paused.position.phase).toBe("paused");
    const startAt = f.sources[0].start.mock.calls[0][0] as number;
    expect(paused.position.bufferSeconds).toBeCloseTo(stopAt - startAt, 12);
    music.play();
    music.poll();
    expect(f.sources[1].start.mock.calls[0][1]).toBeCloseTo(stopAt - startAt, 12);
  });

  it("hands a seek during playback to a new source at the target", () => {
    const f = fakeContext();
    const music = createMusicPlayer({
      context: f.context,
      buffer: f.buffer,
      initialSeconds: 0,
      scheduleLeadSeconds: 0.05,
    });
    music.play();
    music.poll();
    f.advance(0.5);
    music.seek(7);
    const handoff = music.poll();
    expect(handoff.requestedSeconds).toBe(7);
    expect(handoff.scheduledPosition).toEqual({
      bufferSeconds: 7,
      outputTime: f.clock.current + 0.05,
      playbackRate: 1,
    });
    expect(f.sources[1].start).toHaveBeenCalledWith(f.clock.current + 0.05, 7);
    expect(f.sources[0].stop).toHaveBeenCalledWith(f.clock.current + 0.05);
    f.advance(0.1);
    expect(music.poll().position.bufferSeconds).toBeCloseTo(7.05, 12);
  });

  it("ends at the last frame and stops wanting playback", () => {
    const f = fakeContext(48000);
    const music = createMusicPlayer({
      context: f.context,
      buffer: f.buffer,
      initialSeconds: 0.9,
      scheduleLeadSeconds: 0.05,
    });
    music.play();
    music.poll();
    f.advance(0.5);
    const end = music.poll();
    expect(end.position).toMatchObject({ phase: "ended", bufferSeconds: 1 });
    expect(music.poll().intendedPlaying).toBe(false);
  });

  it("reports an output clock that is not ready as pending", () => {
    const f = fakeContext();
    const music = createMusicPlayer({
      context: f.context,
      buffer: f.buffer,
      initialSeconds: 0,
      scheduleLeadSeconds: 0.05,
    });
    f.clock.ready = false;
    let caught: unknown;
    try {
      music.poll();
    } catch (cause) {
      caught = cause;
    }
    expect(isMusicOutputPending(caught)).toBe(true);
  });

  it("stops and releases its sources on dispose", () => {
    const f = fakeContext();
    const music = createMusicPlayer({
      context: f.context,
      buffer: f.buffer,
      initialSeconds: 0,
      scheduleLeadSeconds: 0.05,
    });
    music.play();
    music.poll();
    music.dispose();
    expect(f.sources[0].stop).toHaveBeenCalled();
    expect(f.sources[0].disconnect).toHaveBeenCalled();
    expect(() => music.poll()).toThrow();
  });
});
