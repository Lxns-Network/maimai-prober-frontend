const f = Math.fround;
const MIN_TOTAL = f(2.384185791015625e-7);
const EPSILON = f(1.1920929e-7);

/** One key of a parameter track: how long it takes to reach the key from the previous one, and its four values. */
export interface TrackKey {
  readonly duration: number;
  readonly values: Float32Array;
}

/** A keyed parameter track; with `loop` set it wraps around the sum of its key durations. */
export interface KeyTrack {
  readonly loop: boolean;
  readonly keys: readonly TrackKey[];
  readonly total: number;
}

/** Builds a track from keys in table order. */
export function createKeyTrack(keys: readonly TrackKey[], loop: boolean): KeyTrack {
  let total = 0;
  for (const key of keys) total = f(total + key.duration);
  return { loop, keys, total };
}

/**
 * Evaluates the track at `time` into `out` (four values). The first key blends from the last key; a
 * time past the last key holds the last key; an empty track gives zeros.
 */
export function evaluateKeyTrack(track: KeyTrack, time: number, out: Float32Array): Float32Array {
  const keys = track.keys;
  out.fill(0);
  if (keys.length === 0) return out;
  const last = keys[keys.length - 1];
  let previous = last.values;
  let remaining = f(time);
  if (track.loop) {
    const total = Math.abs(track.total) <= EPSILON ? MIN_TOTAL : track.total;
    remaining = f(remaining % total);
  }
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    remaining = f(remaining - key.duration);
    if (remaining < 0) {
      if (key.duration > EPSILON) {
        const factor = f(f(key.duration + remaining) / key.duration);
        for (let c = 0; c < 4; c++) {
          const from = previous[c];
          out[c] = f(f(f(key.values[c] - from) * factor) + from);
        }
      } else out.set(key.values);
      return out;
    }
    previous = key.values;
  }
  out.set(last.values);
  return out;
}
