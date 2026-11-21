import { throwIfAborted } from "../assets/abort";
export type MusicContext = Pick<
  AudioContext,
  "state" | "currentTime" | "sampleRate" | "destination" | "resume" | "getOutputTimestamp"
> & { createBufferSource(): AudioBufferSourceNode };

export interface MusicPosition {
  readonly phase: "scheduled" | "playing" | "paused" | "ended";
  /** The context time currently reaching the output. */
  readonly outputTime: number;
  /** Monotonic clock time in milliseconds at which this position was sampled. */
  readonly performanceTime: number;
  /** Seconds into the music at `outputTime`. */
  readonly bufferSeconds: number;
  readonly playbackRate: number;
}

export interface MusicPoll {
  readonly position: MusicPosition;
  /** An upcoming start while no source is audible, in the same audio clock as `position`. */
  readonly scheduledPosition: {
    readonly bufferSeconds: number;
    readonly playbackRate: number;
    readonly outputTime: number;
  } | null;
  readonly intendedPlaying: boolean;
  /** A target not yet handed to the output; the position still belongs to the audible source. */
  readonly requestedSeconds: number | null;
  readonly transitioning: boolean;
  readonly needsFrame: boolean;
}

export interface MusicPlayer {
  readonly durationSeconds: number;
  /** Resumes the context and waits for its first output timestamp; call from a user gesture. */
  activate(): Promise<void>;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  replay(): void;
  setPlaybackRate(rate: number): void;
  /** Requires a running context; commits queued intentions once the previous handoff is audible. */
  poll(): MusicPoll;
  dispose(): void;
}

class MusicOutputPending extends Error {}

/** Two Web Audio render quanta allow a stopped source and its initial cues to start together. */
const START_LEAD_FRAMES = 256;

/** True for output clock readings the caller should retry on a later frame. */
export function isMusicOutputPending(cause: unknown): boolean {
  return cause instanceof MusicOutputPending;
}

/** Returns audible context seconds at a DOM event timestamp, or null before the clock is ready. */
export function readAudioOutputTime(
  context: MusicContext,
  performanceTime: number,
  sample = context.getOutputTimestamp(),
): number | null {
  if (
    context.state !== "running" ||
    !Number.isFinite(sample.contextTime) ||
    sample.contextTime! < 0 ||
    !Number.isFinite(sample.performanceTime) ||
    sample.performanceTime! <= 0
  )
    return null;
  return Math.max(
    0,
    Math.min(
      context.currentTime,
      sample.contextTime! + (performanceTime - sample.performanceTime!) / 1000,
    ),
  );
}

function readOutputTime(
  context: MusicContext,
  sample: AudioTimestamp,
  performanceTime: number,
): number {
  if (context.state !== "running") throw new Error("Running output clock required");
  const time = readAudioOutputTime(context, performanceTime, sample);
  if (time === null) throw new MusicOutputPending("Audible output timestamp is not initialized");
  return time;
}

interface Node {
  readonly voice: number;
  readonly atContextTime: number;
  readonly offsetFrames: number;
  readonly playbackRate: number;
}

function createTransport(context: MusicContext, buffer: AudioBuffer, destination: AudioNode) {
  const rate = buffer.sampleRate;
  const frames = buffer.length;
  const duration = frames / rate;
  const voices = new Map<number, { source: AudioBufferSourceNode; at: number }>();
  let nextVoice = 0;
  let current: Node | null = null;
  let pending: { at: number; next: Node | null; heldFrame: number } | null = null;
  let heldFrame = 0;
  let playbackRate = 1;
  let lastTime = -Infinity;
  let disposed = false;

  const available = () => {
    if (disposed) throw new Error("Music transport is disposed");
  };
  const finite = (value: number) => {
    if (!Number.isFinite(value) || value < 0)
      throw new RangeError("Finite nonnegative seconds required");
  };
  const cursor = (node: Node, time: number) =>
    Math.min(
      frames,
      node.offsetFrames + Math.max(0, time - node.atContextTime) * rate * node.playbackRate,
    );
  const ahead = (at: number) => {
    if (context.state !== "running" || !Number.isFinite(at) || at < context.currentTime)
      throw new RangeError("Music events must be scheduled ahead of device processing");
  };
  const release = (voice: number, stop: boolean) => {
    const entry = voices.get(voice);
    if (!entry) return;
    voices.delete(voice);
    entry.source.onended = null;
    try {
      if (stop) entry.source.stop();
    } finally {
      entry.source.disconnect();
      entry.source.buffer = null;
    }
  };

  const read = (): MusicPosition => {
    available();
    const sample = context.getOutputTimestamp();
    const performanceTime = performance.now();
    const time = Math.max(lastTime, readOutputTime(context, sample, performanceTime));
    finite(time);
    lastTime = time;
    if (pending && time >= pending.at) {
      current = pending.next;
      heldFrame = pending.heldFrame;
      pending = null;
    }
    if (current && cursor(current, time) >= frames) {
      current = null;
      heldFrame = frames;
    }
    const frame = current ? cursor(current, time) : (pending?.heldFrame ?? heldFrame);
    return Object.freeze({
      phase: current ? "playing" : pending ? "scheduled" : frame >= frames ? "ended" : "paused",
      outputTime: time,
      performanceTime,
      bufferSeconds: frame / rate,
      playbackRate: current?.playbackRate ?? playbackRate,
    });
  };
  const boundary = (at: number) => {
    finite(at);
    const position = read();
    if (pending) throw new Error("Previous audible handoff has not completed");
    if (at <= position.outputTime) throw new RangeError("Handoff must be ahead of audible output");
  };
  const frameAt = (seconds: number) => {
    finite(seconds);
    if (seconds > duration) throw new RangeError("Offset exceeds the music");
    return seconds === duration ? frames : seconds * rate;
  };
  const start = (atContextTime: number, offsetFrames: number) => {
    if (!Number.isFinite(offsetFrames) || offsetFrames < 0 || offsetFrames >= frames)
      throw new RangeError("Playable music offset required");
    boundary(atContextTime);
    ahead(atContextTime);
    const node: Node = Object.freeze({
      voice: nextVoice++,
      atContextTime,
      offsetFrames,
      playbackRate,
    });
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = false;
    source.playbackRate.value = playbackRate;
    source.channelInterpretation = "speakers";
    voices.set(node.voice, { source, at: atContextTime });
    source.onended = () => release(node.voice, false);
    try {
      source.connect(destination);
      source.start(atContextTime, offsetFrames / rate);
    } catch (error) {
      release(node.voice, false);
      throw error;
    }
    if (current && cursor(current, atContextTime) < frames) stop(current, atContextTime);
    pending = { at: atContextTime, next: node, heldFrame: offsetFrames };
  };
  // Chromium advances `currentTime` between reads in one task, so `at` may already be processed;
  // a stop time in the past stops the source at once.
  const stop = (node: Node, at: number) => {
    const entry = voices.get(node.voice);
    if (!entry) throw new Error("Current music voice disappeared before its handoff");
    entry.source.stop(at);
  };

  return {
    durationSeconds: duration,
    read,
    scheduledPosition() {
      return pending?.next
        ? {
            bufferSeconds: pending.heldFrame / rate,
            outputTime: pending.at,
            playbackRate: pending.next.playbackRate,
          }
        : null;
    },
    setPlaybackRate(value: number) {
      playbackRate = value;
    },
    changeRate(at: number) {
      boundary(at);
      ahead(at);
      if (!current) throw new Error("Rate handoff requires an active source");
      const frame = cursor(current, at);
      const entry = voices.get(current.voice);
      if (frame >= frames) return false;
      if (!entry) throw new Error("Active music source is missing");
      entry.source.playbackRate.setValueAtTime(playbackRate, at);
      pending = {
        at,
        next: { ...current, atContextTime: at, offsetFrames: frame, playbackRate },
        heldFrame: frame,
      };
      return true;
    },
    seek(atContextTime: number, seconds: number) {
      available();
      start(atContextTime, frameAt(seconds));
    },
    replay(atContextTime: number) {
      available();
      start(atContextTime, 0);
    },
    resume(atContextTime: number) {
      available();
      if (read().phase !== "paused") throw new Error("Resume requires an audible paused boundary");
      start(atContextTime, heldFrame);
    },
    pause(atContextTime: number) {
      available();
      boundary(atContextTime);
      if (!current) throw new Error("Pause requires an active music source");
      const at = cursor(current, atContextTime);
      if (at < frames) stop(current, atContextTime);
      pending = { at: atContextTime, next: null, heldFrame: at };
    },
    seekPaused(seconds: number) {
      available();
      const at = frameAt(seconds);
      const phase = read().phase;
      if (phase !== "paused" && phase !== "ended")
        throw new Error("Paused seek requires no active or pending source");
      heldFrame = at;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const voice of [...voices.keys()]) release(voice, true);
    },
  };
}

function waitForOutput(context: MusicContext, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let frame: number | null = null;
    let finished = false;
    const finish = (error?: unknown) => {
      if (finished) return;
      finished = true;
      if (frame !== null) cancelAnimationFrame(frame);
      signal.removeEventListener("abort", abort);
      if (error !== undefined) reject(error);
      else resolve();
    };
    const abort = () => finish(new DOMException("Audio activation cancelled", "AbortError"));
    const poll = () => {
      frame = null;
      if (finished) return;
      try {
        if (context.state !== "running")
          throw new Error("Audio output interrupted before its clock became ready");
        const stamp = context.getOutputTimestamp();
        if (
          (stamp.contextTime === undefined ||
            (Number.isFinite(stamp.contextTime) && stamp.contextTime >= 0)) &&
          (stamp.performanceTime === undefined ||
            (Number.isFinite(stamp.performanceTime) && stamp.performanceTime <= 0))
        ) {
          frame = requestAnimationFrame(poll);
          return;
        }
        readOutputTime(context, stamp, performance.now());
        finish();
      } catch (error) {
        finish(error);
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    try {
      if (context.state === "closed") throw new Error("AudioContext is closed");
      if (context.state === "running") poll();
      else Promise.resolve(context.resume()).then(poll, finish);
    } catch (error) {
      finish(error);
    }
  });
}

/**
 * Plays one decoded buffer whose sample zero is music time zero. Play, pause and seek requests are
 * merged once the previous handoff is audible. Active-source changes use `scheduleLeadSeconds`;
 * starts from silence use two render quanta. Positions are read from the output timestamp only.
 */
export function createMusicPlayer(options: {
  context: MusicContext;
  destination?: AudioNode;
  buffer: AudioBuffer;
  initialSeconds: number;
  playbackRate?: number;
  scheduleLeadSeconds: number;
  signal?: AbortSignal;
}): MusicPlayer {
  const { context, buffer, scheduleLeadSeconds } = options;
  if (buffer.length <= 0 || buffer.sampleRate !== context.sampleRate)
    throw new RangeError("Nonempty music decoded at the context's sample rate required");
  if (!Number.isFinite(scheduleLeadSeconds) || scheduleLeadSeconds <= 0)
    throw new RangeError("Positive scheduling lead required");
  options.signal && throwIfAborted(options.signal);
  const transport = createTransport(context, buffer, options.destination ?? context.destination);
  const lifetime = new AbortController();
  let playbackRate = options.playbackRate ?? 1;
  const validateRate = (rate: number) => {
    if (!Number.isFinite(rate) || rate < 0.1 || rate > 1)
      throw new RangeError("Playback rate must be between 0.1 and 1");
  };
  validateRate(playbackRate);
  transport.setPlaybackRate(playbackRate);
  let intendedPlaying = false;
  let requestedSeconds: number | null = null;
  let requestedReplay = false;
  let pendingUntil: number | null = null;
  let pendingSeek: { seconds: number; replay: boolean } | null = null;
  let pausedSeek: { seconds: number; replay: boolean } | null = null;
  let activation: Promise<void> | null = null;
  let disposed = false;

  const available = () => {
    if (disposed) throw new DOMException("Music player disposed", "AbortError");
  };
  const target = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > transport.durationSeconds)
      throw new RangeError("Music target must lie within the music");
    return seconds;
  };
  const setPlaying = (value: boolean) => {
    intendedPlaying = value;
    if (value) pausedSeek = null;
    else if (requestedSeconds === null && pendingSeek) pausedSeek = pendingSeek;
  };
  const seek = (seconds: number) => {
    requestedSeconds = target(seconds);
    requestedReplay = false;
    pausedSeek = null;
    if (seconds === transport.durationSeconds) intendedPlaying = false;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    options.signal?.removeEventListener("abort", dispose);
    transport.dispose();
  };
  options.signal?.addEventListener("abort", dispose, { once: true });
  if (options.initialSeconds !== 0) seek(options.initialSeconds);

  return Object.freeze({
    durationSeconds: transport.durationSeconds,
    activate() {
      available();
      activation ??= waitForOutput(context, lifetime.signal)
        .catch((error: unknown) => {
          dispose();
          throw error;
        })
        .finally(() => {
          activation = null;
        });
      return activation;
    },
    play() {
      available();
      setPlaying(true);
    },
    pause() {
      available();
      setPlaying(false);
      if (context.state === "running" && pendingUntil === null) {
        const position = transport.read();
        if (position.phase === "playing") {
          const at = Math.max(context.currentTime, position.outputTime + 1 / context.sampleRate);
          transport.pause(at);
          pendingUntil = at;
        }
      }
    },
    seek(seconds: number) {
      available();
      seek(seconds);
    },
    replay() {
      available();
      requestedSeconds = 0;
      requestedReplay = true;
      setPlaying(true);
    },
    setPlaybackRate(rate: number) {
      available();
      validateRate(rate);
      playbackRate = rate;
    },
    poll() {
      available();
      if (context.state !== "running") throw new Error("Running audio context required");
      let position = transport.read();
      if (pendingUntil !== null && position.outputTime >= pendingUntil) {
        pendingUntil = null;
        pendingSeek = null;
      }
      if (pendingUntil === null) {
        if (position.phase === "scheduled")
          throw new Error("Music transport changed outside its player");
        const at = Math.max(
          context.currentTime +
            (position.phase === "playing"
              ? scheduleLeadSeconds
              : Math.min(scheduleLeadSeconds, START_LEAD_FRAMES / context.sampleRate)),
          position.outputTime + 1 / context.sampleRate,
        );
        const stopAt = Math.max(context.currentTime, position.outputTime + 1 / context.sampleRate);
        transport.setPlaybackRate(playbackRate);
        const seekTarget = requestedSeconds ?? pausedSeek?.seconds ?? null;
        if (seekTarget !== null) {
          if (intendedPlaying) {
            if (requestedReplay) transport.replay(at);
            else transport.seek(at, seekTarget);
            pendingUntil = at;
            pendingSeek = { seconds: seekTarget, replay: requestedReplay };
            requestedSeconds = null;
            requestedReplay = false;
          } else if (position.phase === "playing") {
            transport.pause(stopAt);
            pendingUntil = stopAt;
          } else {
            transport.seekPaused(seekTarget);
            requestedSeconds = null;
            requestedReplay ||= pausedSeek?.replay ?? false;
            pausedSeek = null;
          }
        } else if (intendedPlaying && position.phase !== "playing") {
          if (requestedReplay) {
            transport.replay(at);
            pendingUntil = at;
            requestedReplay = false;
          } else if (position.phase === "ended") {
            intendedPlaying = false;
          } else {
            transport.resume(at);
            pendingUntil = at;
          }
        } else if (!intendedPlaying && position.phase === "playing") {
          transport.pause(stopAt);
          pendingUntil = stopAt;
        } else if (position.phase === "playing" && position.playbackRate !== playbackRate) {
          if (transport.changeRate(at)) pendingUntil = at;
        }
        position = transport.read();
      }
      return Object.freeze({
        position,
        scheduledPosition: transport.scheduledPosition(),
        intendedPlaying,
        requestedSeconds: requestedSeconds ?? pausedSeek?.seconds ?? pendingSeek?.seconds ?? null,
        transitioning: pendingUntil !== null,
        needsFrame:
          pendingUntil !== null ||
          requestedSeconds !== null ||
          pausedSeek !== null ||
          position.phase === "playing",
      });
    },
    dispose,
  });
}
