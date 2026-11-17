import { throwIfAborted } from "@lxns-network/chunithm-chart-engine/assets/abort";
import {
  createMusicPlayer,
  type MusicPlayer,
  type MusicPoll,
} from "@lxns-network/chunithm-chart-engine/audio/music";
import {
  createLiveCuePlayer,
  createSfxPlayer,
  loadSfxLibrary,
  type SfxPlayer,
} from "@lxns-network/chunithm-chart-engine/audio/sfx";
import type { Timeline } from "@lxns-network/chunithm-chart-engine/chart/timeline/reader";

/** Silence at either end supports the full music-offset range without clipping chart time. */
const MUSIC_PADDING_SECONDS = 2;
const SCHEDULE_LEAD_SECONDS = 0.05;

interface PreviewAudioInput {
  assetBase: string;
  musicAddress: Promise<string>;
  signal: AbortSignal;
  initialSeconds: number;
  playbackSpeed: number;
  musicOffset: number;
  soundOffset: number;
  musicVolume: number;
  soundVolume: number;
}

export type PreviewMusic = Pick<
  MusicPlayer,
  "durationSeconds" | "activate" | "play" | "pause" | "seek" | "setPlaybackRate" | "poll"
>;

/** Owns the audio context, gains and players. Public transport times are chart seconds. */
export function createPreviewAudio(input: PreviewAudioInput) {
  const context = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
  context.destination.channelCount = 2;
  context.destination.channelCountMode = "explicit";
  context.destination.channelInterpretation = "discrete";
  const musicGain = context.createGain();
  musicGain.gain.value = input.musicVolume;
  musicGain.connect(context.destination);
  const soundGain = context.createGain();
  soundGain.gain.value = input.soundVolume;
  soundGain.connect(context.destination);
  let musicOffset = input.musicOffset / 1000;
  let soundOffset = input.soundOffset / 1000;
  let transport: MusicPlayer | null = null;
  let sfx: SfxPlayer | null = null;
  let library: Awaited<ReturnType<typeof loadSfxLibrary>> | null = null;
  let liveCues: ReturnType<typeof createLiveCuePlayer> | null = null;
  /** Where the sounds' chart time was at the last poll, for cues played as they happen. */
  let clock = { outputTime: 0, seconds: 0, rate: 1 };
  const contextTime = (seconds: number) =>
    clock.outputTime + (seconds - clock.seconds) / clock.rate;
  let disposed = false;
  const musicSeconds = (chart: number) => chart + MUSIC_PADDING_SECONDS - musicOffset;
  const chartSeconds = (buffer: number) => buffer - MUSIC_PADDING_SECONDS + musicOffset;
  const sfxUrl = new URL("chunithm-sfx.bin", input.assetBase).href;
  let sfxBytes: Promise<ArrayBuffer> | null = fetch(sfxUrl, { signal: input.signal }).then(
    (response) => {
      if (!response.ok) throw new Error(`${sfxUrl} returned ${response.status}`);
      return response.arrayBuffer();
    },
  );
  // The session awaits this after the chart is ready; observe rejection during parallel loading.
  void sfxBytes.catch(() => {});
  const ready = (async (): Promise<PreviewMusic> => {
    const response = await fetch(new URL(await input.musicAddress, window.location.href).href, {
      signal: input.signal,
    });
    if (!response.ok) throw new Error(`音乐加载失败（${response.status}）。`);
    const decoded = await context.decodeAudioData(await response.arrayBuffer());
    const musicDuration = decoded.duration;
    throwIfAborted(input.signal);
    const padding = Math.round(MUSIC_PADDING_SECONDS * decoded.sampleRate);
    const buffer = context.createBuffer(
      decoded.numberOfChannels,
      decoded.length + padding * 2,
      decoded.sampleRate,
    );
    for (let channel = 0; channel < decoded.numberOfChannels; channel++)
      buffer.copyToChannel(decoded.getChannelData(channel), channel, padding);
    const player = createMusicPlayer({
      context,
      destination: musicGain,
      buffer,
      initialSeconds: musicSeconds(
        Math.min(input.initialSeconds, musicDuration + Math.max(0, musicOffset)),
      ),
      playbackRate: input.playbackSpeed,
      scheduleLeadSeconds: SCHEDULE_LEAD_SECONDS,
      signal: input.signal,
    });
    transport = player;
    return {
      get durationSeconds() {
        return musicDuration + Math.max(0, musicOffset);
      },
      activate: () => player.activate(),
      play: () => player.play(),
      pause: () => player.pause(),
      seek: (seconds) => player.seek(musicSeconds(seconds)),
      setPlaybackRate: (rate) => player.setPlaybackRate(rate),
      poll() {
        const state = player.poll();
        return {
          ...state,
          position: {
            ...state.position,
            bufferSeconds: chartSeconds(state.position.bufferSeconds),
          },
          scheduledPosition: state.scheduledPosition && {
            ...state.scheduledPosition,
            bufferSeconds: chartSeconds(state.scheduledPosition.bufferSeconds),
          },
          requestedSeconds:
            state.requestedSeconds === null ? null : chartSeconds(state.requestedSeconds),
        };
      },
    };
  })();
  const replaceSfx = (timeline: Timeline) => {
    if (!library) throw new Error("SFX library is not ready");
    const next = createSfxPlayer({ context, destination: soundGain, library, timeline });
    sfx?.dispose();
    sfx = next;
  };
  return {
    ready,
    replaceSfx,
    sfxUrl,
    get running() {
      return context.state === "running";
    },
    async connectSfx(timeline: Timeline) {
      if (!library) {
        const bytes = await sfxBytes!;
        throwIfAborted(input.signal);
        sfxBytes = null;
        const decoded = await loadSfxLibrary(context, bytes, input.signal);
        throwIfAborted(input.signal);
        library = decoded;
      }
      throwIfAborted(input.signal);
      replaceSfx(timeline);
    },
    updateSfx(state: MusicPoll, playTiming: number) {
      const position = !state.intendedPlaying
        ? { ...state.position, phase: "paused" as const }
        : state.scheduledPosition
          ? { ...state.scheduledPosition, phase: "playing" as const }
          : state.position;
      sfx?.update({
        ...position,
        bufferSeconds: position.bufferSeconds - playTiming - soundOffset,
      });
    },
    pauseSfx() {
      sfx?.pause();
      liveCues?.silence();
    },
    /** Follows the music for cues played as they happen, in place of the timeline's cues. */
    trackLiveSfx(state: MusicPoll, playTiming: number) {
      sfx?.pause();
      clock = {
        outputTime: state.position.outputTime,
        seconds: state.position.bufferSeconds - playTiming - soundOffset,
        rate: state.position.playbackRate ?? 1,
      };
    },
    /** Cue starts and stops played as they happen, at chart times in seconds. */
    liveSounds: {
      start(row: number, cue: number, gain: number, seconds: number) {
        if (!library || context.state !== "running") return;
        liveCues ??= createLiveCuePlayer({ context, destination: soundGain, library });
        liveCues.start(row, cue, gain, contextTime(seconds), seconds);
      },
      stop(row: number, seconds: number) {
        liveCues?.stop(row, contextTime(seconds));
      },
      silence() {
        liveCues?.silence();
      },
    },
    setOffsets(nextMusicMs: number, nextSoundMs: number, seconds: number) {
      const nextMusic = nextMusicMs / 1000;
      const nextSound = nextSoundMs / 1000;
      if (nextMusic === musicOffset && nextSound === soundOffset) return;
      const changedMusic = nextMusic !== musicOffset;
      musicOffset = nextMusic;
      soundOffset = nextSound;
      sfx?.pause();
      if (changedMusic && transport) {
        const end =
          transport.durationSeconds - MUSIC_PADDING_SECONDS * 2 + Math.max(0, musicOffset);
        transport.seek(musicSeconds(Math.min(seconds, end)));
      }
    },
    setVolume(music: number, sound: number) {
      musicGain.gain.setTargetAtTime(music, context.currentTime, 0.01);
      soundGain.gain.setTargetAtTime(sound, context.currentTime, 0.01);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sfx?.dispose();
      liveCues?.dispose();
      transport?.dispose();
      library = null;
      sfxBytes = null;
      musicGain.disconnect();
      soundGain.disconnect();
      if (context.state !== "closed") void context.close().catch(() => {});
    },
  };
}
