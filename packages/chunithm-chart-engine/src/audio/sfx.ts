import type { Timeline } from "../chart/timeline/reader";
import { packSlice, readPack } from "../assets/packFormat";

/** Name of the sample pack's engine tag. */
export const SFX_ENGINE = "chunithm-sfx";

/** One track of a cue as stored in the pack. */
export interface SfxVoice {
  track: number;
  /** Pack entry of the samples. */
  sample: string;
  delayMilliseconds: number;
  releaseMilliseconds: number;
  releaseCurve: number;
  releaseAmount: number;
}

/** How a cue that plays one of its tracks per start picks it. */
export interface SfxCombo {
  /** Milliseconds after which the pick starts over. */
  reset: number;
  wrap: number;
  initialMicroseconds: number;
}

export interface SfxCue {
  combo: SfxCombo | null;
  voices: readonly SfxVoice[];
}

export interface SfxBufferLike {
  readonly length: number;
  getChannelData(channel: number): Float32Array;
}

export interface SfxParamLike {
  value: number;
  setValueCurveAtTime(values: Float32Array, time: number, duration: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

export interface SfxGainLike {
  readonly gain: SfxParamLike;
  connect(destination: unknown): unknown;
  disconnect(): void;
}

export interface SfxSourceLike {
  buffer: unknown;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  onended: ((event: Event) => unknown) | null;
  connect(destination: unknown): unknown;
  disconnect(): void;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
}

/** The part of an `AudioContext` the player uses. */
export interface SfxContextLike {
  readonly currentTime: number;
  createBuffer(channels: number, length: number, sampleRate: number): SfxBufferLike;
  createBufferSource(): SfxSourceLike;
  createGain(): SfxGainLike;
}

/** Samples of a pack, decoded once and shared by every player on the context. */
export interface SfxLibrary {
  readonly sampleRate: number;
  readonly cues: ReadonlyMap<number, SfxCue>;
  /** Decoded buffers by pack entry; an entry of one frame is silence. */
  readonly buffers: ReadonlyMap<string, SfxSample>;
}

export interface SfxSample {
  buffer: SfxBufferLike;
  frames: number;
  loopStart: number;
  loopEnd: number;
}

/** Decodes a sample pack into buffers of `context`. */
export async function loadSfxLibrary(
  context: SfxContextLike & Pick<AudioContext, "decodeAudioData">,
  bytes: ArrayBuffer,
  signal?: AbortSignal,
): Promise<SfxLibrary> {
  const pack = readPack(bytes, SFX_ENGINE);
  const table = JSON.parse(new TextDecoder().decode(packSlice(pack, "sfx/voices"))) as {
    sampleRate: number;
    cues: Record<string, SfxCue>;
  };
  const buffers = new Map<string, SfxSample>();
  for (const entry of pack.entries.values()) {
    if (entry.kind !== "sample") continue;
    signal?.throwIfAborted();
    const { frames, channels, sampleRate, loopStart, loopEnd } = entry.meta as {
      frames: number;
      channels: number;
      sampleRate: number;
      loopStart: number;
      loopEnd: number;
    };
    const raw = packSlice(pack, entry.name);
    let buffer: SfxBufferLike;
    if (entry.meta.codec === "flac") {
      const decoded = await context.decodeAudioData(raw.slice().buffer);
      signal?.throwIfAborted();
      if (
        decoded.length !== frames ||
        decoded.numberOfChannels !== channels ||
        decoded.sampleRate !== sampleRate
      )
        throw new RangeError(`Decoded SFX sample ${entry.name} disagrees with its metadata`);
      buffer = decoded;
    } else {
      if (entry.meta.codec !== undefined)
        throw new RangeError(`Unsupported SFX codec: ${entry.meta.codec}`);
      const pcm = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      buffer = context.createBuffer(channels, frames, sampleRate);
      for (let channel = 0; channel < channels; channel++) {
        const samples = buffer.getChannelData(channel);
        for (let i = 0; i < frames; i++)
          samples[i] = pcm.getInt16((i * channels + channel) * 2, true) / 32768;
      }
    }
    buffers.set(entry.name, { buffer, frames, loopStart, loopEnd });
  }
  const cues = new Map<number, SfxCue>();
  for (const [id, cue] of Object.entries(table.cues)) cues.set(Number(id), cue);
  return { sampleRate: table.sampleRate, cues, buffers };
}

/** Shortest release the envelope runs, in milliseconds. */
const MIN_RELEASE_MILLISECONDS = 5;
const RELEASE_POINTS = 64;
/** Fade a voice gets when it is cut off by a seek or a pause, in seconds. */
const CUT_SECONDS = 0.01;

/** Release curve of the envelope: progress 0..1 to curve value 0..1. */
export function releaseProgress(type: number, control: number, amount: number): number {
  const x = Math.max(0, Math.min(1, control));
  const a = Math.max(0, Math.min(2, amount));
  if (type === 0) return x;
  if (type === 1) {
    if (a > 1) {
      const x2 = x * x;
      return ((a - 1) * x2 + (2 - a)) * x2;
    }
    return (x * a + (1 - a)) * x;
  }
  if (type === 2) {
    if (a > 1) {
      const y = (2 - x) * x;
      return ((1 - y) * a + y) * y;
    }
    return ((1 - x) * a + 1) * x;
  }
  if (type === 3) {
    if (a <= 1) return ((3 - (x + x)) * (x * a) + (1 - a)) * x;
    const k = 8 - a * 6;
    const y = x <= 0.5 ? x : 1 - x;
    const z = (k * (0.5 - y) + 2) * (y * y);
    return x <= 0.5 ? z : 1 - z;
  }
  if (a <= 1) return x > 0.5 ? (x + x - 3) * (x * a) + a + x : (a + 1 - a * 2 * x) * x;
  const y = (x - 1) * (x * 4);
  const z = y * a;
  const w = y * 0.5;
  return x <= 0.5 ? (y - z - a) * w : 1 - (y - a - z) * w;
}

/** Gain values of a release, from full to silent, relative to the gain the voice had. */
export function releaseCurve(type: number, amount: number): Float32Array {
  const values = new Float32Array(RELEASE_POINTS);
  for (let i = 0; i < RELEASE_POINTS; i++)
    values[i] = 1 - releaseProgress(type, i / (RELEASE_POINTS - 1), amount);
  return values;
}

/** Which track of each combo cue each start plays, from the cue rows alone. */
export function comboTracks(
  library: SfxLibrary,
  cues: Uint16Array | ArrayLike<number>,
  times: ArrayLike<number>,
): Int16Array {
  const picked = new Int16Array(cues.length).fill(-1);
  const state = new Map<number, { index: number; microseconds: number }>();
  for (let row = 0; row < cues.length; row++) {
    const cue = library.cues.get(cues[row]);
    if (!cue?.combo) continue;
    const { reset, wrap, initialMicroseconds } = cue.combo;
    const microseconds = Math.floor((Math.round(times[row] * 120) * 1e6) / 120);
    const prior = state.get(cues[row]) ?? { index: -1, microseconds: initialMicroseconds };
    let index = ((prior.index + 1) << 16) >> 16;
    if (index >= cue.voices.length) index = wrap === 0xffff ? 0 : wrap;
    if (microseconds - prior.microseconds > reset * 1000) index = 0;
    if (index < 0 || index >= cue.voices.length) index = 0;
    state.set(cues[row], { index, microseconds });
    picked[row] = index;
  }
  return picked;
}

/** Where the music is: the page's music session reports this on every poll. */
export interface SfxPosition {
  phase: "scheduled" | "playing" | "paused" | "ended";
  /** Chart seconds corresponding to the audible music; may be negative before chart time zero. */
  bufferSeconds: number;
  /** Context time that position is audible at. */
  outputTime: number;
  playbackRate?: number;
}

export interface SfxPlayerOptions {
  context: SfxContextLike;
  /** Node the mix goes to; the player adds one gain node in front of it. */
  destination: unknown;
  library: SfxLibrary;
  timeline: Timeline;
  /** Seconds of cues scheduled ahead of audio processing, including output already queued. */
  lookaheadSeconds?: number;
  volume?: number;
}

interface Playing {
  source: SfxSourceLike;
  gain: SfxGainLike;
  /** Context time the voice is silent from, or Infinity while it plays on. */
  end: number;
  /** Context time its release ramp starts at, once one is scheduled. */
  releaseAt: number;
}

/** Offset change, in seconds, past which the music is taken to have jumped. */
const JUMP_SECONDS = 0.03;
const DEFAULT_LOOKAHEAD = 0.25;
/** Late one-shots beyond this scheduling tolerance are skipped instead of replayed in a burst. */
const MAX_LATE_SECONDS = 0.05;

/**
 * Plays the cue rows of a timeline with the pack's samples. The page calls `update` with each
 * poll of its music session; the player schedules every start inside the lookahead on the audio
 * clock, with the stop (a release ramp) of each, and drops what it scheduled whenever the music
 * pauses or jumps; tracks still sounding at the new position then resume where they would be. A
 * track stopped before its delay runs out, or with no delay in the step its cue started, is never
 * heard.
 */
export function createSfxPlayer(options: SfxPlayerOptions) {
  const { context, library, timeline } = options;
  const lookahead = options.lookaheadSeconds ?? DEFAULT_LOOKAHEAD;
  const master = context.createGain();
  master.gain.value = options.volume ?? 1;
  master.connect(options.destination);

  const count = timeline.count("cue");
  const times = timeline.column("cue", "time") as Float64Array;
  const cues = timeline.column("cue", "cue") as Uint16Array;
  const gains = timeline.column("cue", "gain") as Float32Array;
  const picked = comboTracks(library, cues, times);
  const stopAt = new Float64Array(count).fill(Infinity);
  const stopCount = timeline.count("cuestop");
  const stopRows = timeline.column("cuestop", "row") as Uint32Array;
  const stopTimes = timeline.column("cuestop", "time") as Float64Array;
  for (let i = 0; i < stopCount; i++) stopAt[stopRows[i]] = stopTimes[i];
  const curves = new Map<string, Float32Array>();

  let cursor = 0;
  let offset: number | null = null;
  let playbackRate = 1;
  let live: Playing[] = [];
  let silent = true;
  let disposed = false;

  const available = () => {
    if (disposed) throw new Error("The cue player is disposed");
  };

  function cut(voice: Playing, at: number) {
    if (voice.releaseAt <= at) return;
    voice.gain.gain.cancelScheduledValues(at);
    voice.gain.gain.setValueCurveAtTime(
      releaseCurve(0, 1).map((value) => value * voice.gain.gain.value),
      at,
      CUT_SECONDS,
    );
    voice.source.stop(at + CUT_SECONDS);
    voice.releaseAt = at;
    voice.end = at + CUT_SECONDS;
  }

  function silence(now = context.currentTime) {
    for (const voice of live) if (voice.end > now) cut(voice, now);
    live = [];
    silent = true;
  }

  /** Starts the tracks of a row; from a position past a track's start, where it is by then. */
  function start(
    row: number,
    base: number,
    position = -Infinity,
    dropLate = false,
    loopsOnly = false,
  ) {
    const cue = library.cues.get(cues[row]);
    if (!cue) return;
    const voices = picked[row] >= 0 ? [cue.voices[picked[row]]] : cue.voices;
    for (const voice of voices) {
      const sample = library.buffers.get(voice.sample);
      if (!sample || sample.frames <= 1) continue;
      const sounding = times[row] + voice.delayMilliseconds / 1000;
      if (stopAt[row] <= sounding) continue;
      const looping = sample.loopEnd > sample.loopStart;
      if (loopsOnly && !looping) continue;
      const now = context.currentTime;
      if (dropLate && !looping && base + sounding / playbackRate < now - MAX_LATE_SECONDS) continue;
      const playbackPosition = dropLate
        ? Math.max(position, (now - base) * playbackRate)
        : position;
      let offset = 0;
      if (playbackPosition > sounding) {
        if (stopAt[row] <= playbackPosition) continue;
        offset = ((playbackPosition - sounding) / playbackRate) * library.sampleRate;
        if (looping && offset >= sample.loopEnd)
          offset =
            sample.loopStart + ((offset - sample.loopStart) % (sample.loopEnd - sample.loopStart));
        else if (!looping && offset >= sample.frames) continue;
      }
      const begin = Math.max(now, base + Math.max(sounding, playbackPosition) / playbackRate);
      const stop = base + stopAt[row] / playbackRate;
      const release = Math.max(voice.releaseMilliseconds, MIN_RELEASE_MILLISECONDS) / 1000;
      if (stop + release <= begin) continue;
      const source = context.createBufferSource();
      source.buffer = sample.buffer;
      if (looping) {
        source.loop = true;
        source.loopStart = sample.loopStart / library.sampleRate;
        source.loopEnd = sample.loopEnd / library.sampleRate;
      }
      const gain = context.createGain();
      gain.gain.value = gains[row];
      source.connect(gain);
      gain.connect(master);
      const playing: Playing = { source, gain, end: Infinity, releaseAt: Infinity };
      source.start(begin, offset / library.sampleRate);
      if (stop !== Infinity) {
        const key = `${voice.releaseCurve}/${voice.releaseAmount}`;
        let curve = curves.get(key);
        if (!curve)
          curves.set(key, (curve = releaseCurve(voice.releaseCurve, voice.releaseAmount)));
        const at = Math.max(stop, begin);
        gain.gain.setValueCurveAtTime(
          curve.map((value) => value * gains[row]),
          at,
          release,
        );
        source.stop(at + release);
        playing.releaseAt = at;
        playing.end = at + release;
      } else if (!looping) {
        playing.end = begin + (sample.frames - offset) / library.sampleRate;
        source.stop(playing.end);
      }
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      live.push(playing);
    }
  }

  function seekTo(seconds: number, base: number | null, at = context.currentTime) {
    silence(at);
    let lo = 0;
    let hi = count;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (times[mid] < seconds) lo = mid + 1;
      else hi = mid;
    }
    cursor = lo;
    offset = base;
  }

  return Object.freeze({
    /** Schedules what is due; call once per poll of the music session. */
    update(position: SfxPosition) {
      available();
      if (position.phase !== "playing") {
        if (!silent) silence();
        offset = null;
        return;
      }
      const rate = position.playbackRate ?? 1;
      const rateChanged = playbackRate !== rate;
      playbackRate = rate;
      const base = position.outputTime - position.bufferSeconds / rate;
      if (offset === null || rateChanged || Math.abs(base - offset) > JUMP_SECONDS) {
        seekTo(position.bufferSeconds, base, Math.max(context.currentTime, position.outputTime));
        for (let row = 0; row < cursor; row++)
          if (stopAt[row] > position.bufferSeconds)
            start(row, base, position.bufferSeconds, true, rateChanged);
      } else offset = base;
      silent = false;
      const now = context.currentTime;
      live = live.filter((voice) => voice.end > now);
      // Bluetooth output can trail processing by more than the entire lookahead window.
      const horizon =
        position.bufferSeconds +
        (Math.max(0, now - position.outputTime) + lookahead) * playbackRate;
      while (cursor < count && times[cursor] < horizon) start(cursor++, base, -Infinity, true);
    },
    /** Drops every sounding and scheduled voice and restarts scheduling at `seconds`. */
    seek(seconds: number) {
      available();
      seekTo(seconds, null);
    },
    /** Silences the voices; the next `update` of a playing position reschedules. */
    pause() {
      available();
      silence();
      offset = null;
    },
    setVolume(volume: number) {
      available();
      master.gain.value = volume;
    },
    get activeVoices() {
      const now = context.currentTime;
      return live.filter((voice) => voice.end > now).length;
    },
    dispose() {
      if (disposed) return;
      silence();
      disposed = true;
      master.disconnect();
    },
  });
}

export type SfxPlayer = ReturnType<typeof createSfxPlayer>;
