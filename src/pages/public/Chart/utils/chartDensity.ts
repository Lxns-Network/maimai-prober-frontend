import type { Note } from "@lxns-network/maimai-chart-engine";
import { match, P } from "ts-pattern";

export type NoteCountKey = "tap" | "hold" | "slide" | "touch" | "break";

export type NoteCountData = Record<NoteCountKey, number> & {
  startMs: number;
  total: number;
};

export const DEFAULT_BUCKET_DURATION_MS = 500;

function classifyNote(note: Note): NoteCountKey | null {
  return match(note.type)
    .returnType<NoteCountKey | null>()
    .with("break", () => "break")
    .with(P.union("tap", "simultaneous"), () => "tap")
    .with(P.union("hold-start", "hold-start-simultaneous"), () => "hold")
    .with("slide", () => "slide")
    .with(P.union("touch", "touch-hold-start"), () => "touch")
    .with(P.union("hold-end", "hold-end-simultaneous", "touch-hold-end"), () => null)
    .exhaustive();
}

function createEmptyBucket(startMs: number): NoteCountData {
  return {
    startMs,
    tap: 0,
    hold: 0,
    slide: 0,
    touch: 0,
    break: 0,
    total: 0,
  };
}

export function calculateNoteCounts(
  notes: Note[],
  windowStartMs: number,
  durationMs: number,
  bucketDurationMs: number = DEFAULT_BUCKET_DURATION_MS,
): NoteCountData[] {
  if (durationMs <= 0) return [];

  const windowEndMs = windowStartMs + durationMs;
  const firstBucketIndex = Math.floor(windowStartMs / bucketDurationMs);
  const lastBucketIndex = Math.floor(windowEndMs / bucketDurationMs);
  const bucketCount = lastBucketIndex - firstBucketIndex + 1;
  const buckets: NoteCountData[] = Array.from({ length: bucketCount }, (_, i) =>
    createEmptyBucket((firstBucketIndex + i) * bucketDurationMs),
  );

  for (const note of notes) {
    if (note.timingMs < windowStartMs || note.timingMs > windowEndMs) continue;

    const absoluteBucketIndex = Math.floor(note.timingMs / bucketDurationMs);
    const bucket = buckets[absoluteBucketIndex - firstBucketIndex];
    if (!bucket) continue;

    const bucketKey = classifyNote(note);
    if (!bucketKey) continue;

    bucket[bucketKey]++;
    bucket.total++;
  }

  return buckets;
}

export function getMaxCount(buckets: NoteCountData[]): number {
  let max = 0;
  for (const bucket of buckets) {
    max = Math.max(max, bucket.total);
  }
  return max || 1;
}

export function getBucketAtMs(
  buckets: readonly NoteCountData[],
  currentMs: number,
  bucketDurationMs: number = DEFAULT_BUCKET_DURATION_MS,
): NoteCountData | null {
  const firstBucket = buckets[0];
  if (!firstBucket) return null;

  const bucketIndex = Math.floor(currentMs / bucketDurationMs);
  const firstBucketIndex = Math.floor(firstBucket.startMs / bucketDurationMs);
  return buckets[bucketIndex - firstBucketIndex] ?? null;
}

export function getBucketDensityPerSecond(
  bucket: NoteCountData | null,
  bucketDurationMs: number = DEFAULT_BUCKET_DURATION_MS,
): number {
  if (!bucket || bucketDurationMs <= 0) return 0;
  return bucket.total / (bucketDurationMs / 1000);
}
