export const MUSIC_CALIBRATION_TAPS = 6;

export type MusicCalibrationMode = "measure" | "demo";

export interface MusicCalibrationProgress {
  count: number;
  beat?: 1 | 2 | 3 | 4;
  result: "listening" | "demo-ended" | "unstable" | "interrupted" | number;
}

export type StartMusicCalibration = (
  signal: AbortSignal,
  onProgress: (progress: MusicCalibrationProgress) => void,
  mode?: MusicCalibrationMode,
) => Promise<(timeStamp: number) => void>;

type ReadOutputTime = (performanceTime: number) => number | null;

// Changing the count-in tempo makes a press on the wrong beat fail the consistency check.
const BEAT_INTERVALS = [0.4, 0.6] as const;
const OUTPUT_PREROLL_SECONDS = 0.05;
const TONE_SECONDS = 0.09;
const TONE_ATTACK_SECONDS = 0.002;
const TONE_RELEASE_START_SECONDS = 0.018;
const CLICK_SECONDS = 0.008;
const CLICK_ATTACK_SECONDS = 0.00025;
const OFFSET_LIMIT_MS = 2000;
const GROUP_GAP_SECONDS = 0.25;
const DEMO_LEAD_SECONDS = 0.15;
const CLOCK_TIMEOUT_MS = 5000;

function activateOutput(
  context: AudioContext,
  readOutputTime: ReadOutputTime,
  signal: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    let frame = 0;
    let settled = false;
    const timeout = setTimeout(
      () => finish(new Error("音频输出未就绪，请重新校准。")),
      CLOCK_TIMEOUT_MS,
    );
    const abort = () => finish(signal.reason ?? new DOMException("Aborted", "AbortError"));
    function finish(error?: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
      signal.removeEventListener("abort", abort);
      if (error === undefined) resolve();
      else reject(error);
    }
    function checkClock() {
      if (settled) return;
      try {
        if (context.state !== "running") throw new Error("音频输出已中断，请重新校准。");
        const time = readOutputTime(performance.now());
        if (time !== null && time > 0) finish();
        else frame = requestAnimationFrame(checkClock);
      } catch (error) {
        finish(error);
      }
    }
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    if (context.state === "running") checkClock();
    else context.resume().then(checkClock, finish);
  });
}

function createBeatGroup(context: AudioContext, interval: number) {
  const rate = context.sampleRate;
  const prerollFrames = Math.round(rate * OUTPUT_PREROLL_SECONDS);
  const buffer = context.createBuffer(
    2,
    prerollFrames + Math.ceil(rate * (3 * interval + TONE_SECONDS)),
    rate,
  );
  const samples = buffer.getChannelData(0);
  for (let beat = 0; beat < 4; beat++) {
    const start = prerollFrames + Math.round(beat * interval * rate);
    // Quietly wake the output after each gap without moving the audible beat.
    for (let i = 0; i < prerollFrames; i++) {
      const envelope = Math.sin((Math.PI * i) / prerollFrames) ** 2;
      samples[start - prerollFrames + i] =
        0.001 * envelope * Math.sin((2 * Math.PI * 220 * i) / rate);
    }
    const frequency = beat === 3 ? 1050 : 525;
    const amplitude = beat === 3 ? 0.86 : 0.76;
    for (let i = 0; i < Math.floor(TONE_SECONDS * rate); i++) {
      const time = i / rate;
      const envelope =
        time < TONE_RELEASE_START_SECONDS
          ? Math.min(1, time / TONE_ATTACK_SECONDS)
          : ((TONE_SECONDS - time) / (TONE_SECONDS - TONE_RELEASE_START_SECONDS)) ** 2;
      const tone = amplitude * envelope * Math.sin(2 * Math.PI * frequency * time);
      const clickMix =
        0.35 *
        Math.min(1, time / CLICK_ATTACK_SECONDS) *
        Math.max(0, 1 - time / CLICK_SECONDS) ** 2;
      const click = Math.sin(2 * Math.PI * 3000 * time);
      samples[start + i] = (1 - clickMix) * tone + clickMix * click;
    }
  }
  // The preview uses discrete stereo output, so a mono cue would play only on the left.
  buffer.copyToChannel(samples, 1);
  return buffer;
}

function recommendedOffset(taps: number[]): number | "unstable" {
  taps.sort((a, b) => a - b);
  const middle = taps.length / 2;
  const median = (taps[middle - 1] + taps[middle]) / 2;
  const closeTaps = taps.filter((tap) => Math.abs(tap - median) <= 55);
  if (closeTaps.length < taps.length - 1) return "unstable";
  return -Math.round(median / 10) * 10;
}

/**
 * Plays count-ins on the active music output. Taps use DOM event timestamps; results are absolute
 * music offsets in ms relative to the same audible output clock as chart playback.
 * The demo cues all four beats. During measurement the fourth cue acknowledges an accepted tap.
 * Aborting silences this run and prevents further progress updates.
 */
export async function startMusicCalibration(
  context: AudioContext,
  destination: AudioNode,
  readOutputTime: ReadOutputTime,
  signal: AbortSignal,
  onProgress: (progress: MusicCalibrationProgress) => void,
  mode: MusicCalibrationMode = "measure",
) {
  await activateOutput(context, readOutputTime, signal);
  if (signal.aborted) throw signal.reason;
  const groups = BEAT_INTERVALS.map((interval) => ({
    interval,
    countInSeconds: 3 * interval,
    beats: createBeatGroup(context, interval),
  }));
  const cues = mode === "demo" ? ([1, 2, 3, 4, "demo-ended"] as const) : ([1, 2, 3] as const);
  const taps: number[] = [];
  const sources = new Set<AudioBufferSourceNode>();
  let target = 0;
  let retryTimer: ReturnType<typeof setTimeout>;
  let cueTimer: ReturnType<typeof setTimeout>;
  let stopped = false;
  let missedGroups = 0;

  function stop() {
    stopped = true;
    clearTimeout(retryTimer);
    clearTimeout(cueTimer);
    signal.removeEventListener("abort", stop);
    context.removeEventListener("statechange", stateChanged);
    context.removeEventListener("sinkchange", interrupt);
    for (const source of sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    sources.clear();
  }

  function finish(result: MusicCalibrationProgress["result"]) {
    stop();
    onProgress({ count: taps.length, result });
  }

  function interrupt() {
    finish("interrupted");
  }

  function stateChanged() {
    if (context.state !== "running") interrupt();
  }

  function scheduleCues(start: number, interval: number, groupTarget: number) {
    let next = 0;
    function update() {
      if (stopped || target !== groupTarget || taps.length === MUSIC_CALIBRATION_TAPS) return;
      const now = readOutputTime(performance.now());
      if (now === null) {
        interrupt();
        return;
      }
      while (next < cues.length) {
        const at = start + next * interval;
        if (now < at) {
          cueTimer = setTimeout(update, Math.ceil((at - now) * 1000));
          return;
        }
        const cue = cues[next++];
        if (cue === "demo-ended") {
          finish(cue);
          return;
        }
        if (now < start + next * interval)
          onProgress({ count: taps.length, result: "listening", beat: cue });
      }
    }
    update();
  }

  function schedule() {
    const now = readOutputTime(performance.now());
    if (now === null) {
      interrupt();
      return;
    }
    clearTimeout(retryTimer);
    clearTimeout(cueTimer);
    const group = groups[taps.length % groups.length];
    // Leave the full early window after the last tap and finish the previous count-in, even if
    // somebody anticipated its accent. A second press on the same beat then cannot count twice.
    target =
      mode === "demo"
        ? context.currentTime + DEMO_LEAD_SECONDS + group.countInSeconds
        : Math.max(context.currentTime + OFFSET_LIMIT_MS / 1000, target + group.countInSeconds) +
          GROUP_GAP_SECONDS;
    const start = target - group.countInSeconds;
    let source: AudioBufferSourceNode | undefined;
    try {
      source = context.createBufferSource();
      source.buffer = group.beats;
      source.connect(destination);
      source.start(start - OUTPUT_PREROLL_SECONDS);
    } catch {
      source?.disconnect();
      interrupt();
      return;
    }
    const playing = source;
    playing.onended = () => {
      playing.disconnect();
      sources.delete(playing);
      if (!sources.size && taps.length === MUSIC_CALIBRATION_TAPS) finish(recommendedOffset(taps));
    };
    sources.add(playing);
    if (!taps.length || missedGroups) onProgress({ count: taps.length, result: "listening" });
    scheduleCues(start, group.interval, target);
    if (mode === "demo" || stopped) return;
    retryTimer = setTimeout(
      () => {
        if (++missedGroups >= 3) finish("interrupted");
        else schedule();
      },
      (target - now) * 1000 + OFFSET_LIMIT_MS + 100,
    );
  }

  signal.addEventListener("abort", stop, { once: true });
  context.addEventListener("statechange", stateChanged);
  context.addEventListener("sinkchange", interrupt);
  schedule();
  return (timeStamp: number) => {
    if (stopped || mode === "demo" || taps.length === MUSIC_CALIBRATION_TAPS) return;
    const at = readOutputTime(timeStamp);
    if (at === null) {
      interrupt();
      return;
    }
    const differenceMs = Math.round((at - target) * 1000);
    if (Math.abs(differenceMs) > OFFSET_LIMIT_MS) return;
    taps.push(differenceMs);
    onProgress({ count: taps.length, result: "listening", beat: 4 });
    if (stopped) return;
    if (taps.length === MUSIC_CALIBRATION_TAPS) {
      clearTimeout(retryTimer);
      clearTimeout(cueTimer);
      if (!sources.size || context.currentTime >= target + TONE_SECONDS)
        finish(recommendedOffset(taps));
      return;
    }
    missedGroups = 0;
    schedule();
  };
}
