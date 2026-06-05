import type { BpmEvent } from "@lxns-network/maimai-chart-engine";

export function beatsToMs(beats: number, bpmEvents: BpmEvent[] | null, defaultBpm: number): number {
  if (!bpmEvents || bpmEvents.length === 0) {
    return (60000 * beats) / defaultBpm;
  }

  let totalMs = 0;
  let lastBeat = 0;
  let currentBpm = defaultBpm;

  for (const event of bpmEvents) {
    if (event.timing >= beats) break;
    totalMs += (60000 * (event.timing - lastBeat)) / currentBpm;
    lastBeat = event.timing;
    currentBpm = event.bpm;
  }

  totalMs += (60000 * (beats - lastBeat)) / currentBpm;
  return totalMs;
}

export function msToBeats(ms: number, bpmEvents: BpmEvent[] | null, defaultBpm: number): number {
  if (!bpmEvents || bpmEvents.length === 0) {
    return (ms * defaultBpm) / 60000;
  }

  let remainingMs = ms;
  let totalBeats = 0;
  let lastBeat = 0;
  let currentBpm = defaultBpm;

  for (const event of bpmEvents) {
    const segmentBeats = event.timing - lastBeat;
    const segmentMs = (60000 * segmentBeats) / currentBpm;

    if (remainingMs <= segmentMs) {
      totalBeats += (remainingMs * currentBpm) / 60000;
      return totalBeats;
    }

    remainingMs -= segmentMs;
    totalBeats += segmentBeats;
    lastBeat = event.timing;
    currentBpm = event.bpm;
  }

  totalBeats += (remainingMs * currentBpm) / 60000;
  return totalBeats;
}
