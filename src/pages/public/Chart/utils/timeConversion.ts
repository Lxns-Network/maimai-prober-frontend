import { TimingTimeline, type BpmEvent } from "@lxns-network/maimai-chart-engine";

let cachedBpmEvents: readonly BpmEvent[] | null = null;
let cachedDefaultBpm = Number.NaN;
let cachedTimeline: TimingTimeline | null = null;

function getTimingTimeline(
  bpmEvents: readonly BpmEvent[] | null,
  defaultBpm: number,
): TimingTimeline {
  if (cachedTimeline && cachedBpmEvents === bpmEvents && cachedDefaultBpm === defaultBpm) {
    return cachedTimeline;
  }

  cachedBpmEvents = bpmEvents;
  cachedDefaultBpm = defaultBpm;
  cachedTimeline = new TimingTimeline(defaultBpm, bpmEvents);
  return cachedTimeline;
}

const LEAD_IN_BEATS = 4;

/** Lead-in duration in ms: 4 beats at the given BPM. */
export function getLeadInMs(bpm: number): number {
  return (60000 * LEAD_IN_BEATS) / bpm;
}

export function beatsToMs(
  beats: number,
  bpmEvents: readonly BpmEvent[] | null,
  defaultBpm: number,
): number {
  return getTimingTimeline(bpmEvents, defaultBpm).msFromBeat(beats);
}

export function msToBeats(
  ms: number,
  bpmEvents: readonly BpmEvent[] | null,
  defaultBpm: number,
): number {
  return getTimingTimeline(bpmEvents, defaultBpm).beatFromMs(ms);
}

/** Music time in seconds from precise time (beats), accounting for lead-in, music offset and `&first`. */
export function calculateMusicTime(
  preciseTime: number,
  bpmEvents: readonly BpmEvent[] | null,
  bpm: number,
  musicOffset: number,
  firstMs: number = 0,
): number {
  const chartTimeMs = beatsToMs(preciseTime, bpmEvents, bpm);
  const leadInMs = getLeadInMs(bpm);
  return (chartTimeMs - leadInMs - musicOffset + firstMs) / 1000;
}
