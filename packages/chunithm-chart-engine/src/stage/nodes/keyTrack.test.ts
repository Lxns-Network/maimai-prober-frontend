import { describe, expect, it } from "vitest";
import { createKeyTrack, evaluateKeyTrack, type TrackKey } from "./keyTrack";

const key = (duration: number, ...values: number[]): TrackKey => ({
  duration,
  values: Float32Array.of(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0),
});
const at = (keys: TrackKey[], loop: boolean, time: number) =>
  Array.from(evaluateKeyTrack(createKeyTrack(keys, loop), time, new Float32Array(4)));

describe("keyed parameter track", () => {
  it("an empty track gives zeros", () => {
    expect(at([], false, 5)).toEqual([0, 0, 0, 0]);
  });

  it("a key without a duration holds its value", () => {
    expect(at([key(0, 3, 4, 5, 6)], false, 0)).toEqual([3, 4, 5, 6]);
    expect(at([key(0, 3, 4, 5, 6)], true, 123)).toEqual([3, 4, 5, 6]);
  });

  it("a single key with a duration is constant, looped or not", () => {
    for (const loop of [false, true])
      for (const time of [0, 2, 5, 11.5])
        expect(at([key(5, 7, 1, 2, 3)], loop, time)).toEqual([7, 1, 2, 3]);
  });

  it("the first key blends from the last, later keys from the one before", () => {
    const keys = [key(10, 10, 0), key(10, 20, 100), key(10, 0, 50)];
    expect(at(keys, false, 0)).toEqual([0, 50, 0, 0]);
    expect(at(keys, false, 5)).toEqual([5, 25, 0, 0]);
    expect(at(keys, false, 10)).toEqual([10, 0, 0, 0]);
    expect(at(keys, false, 15)).toEqual([15, 50, 0, 0]);
    expect(at(keys, false, 25)).toEqual([10, 75, 0, 0]);
    expect(at(keys, false, 30)).toEqual([0, 50, 0, 0]);
  });

  it("a time past the last key holds the last key", () => {
    const keys = [key(10, 10), key(10, 20)];
    expect(at(keys, false, 20)).toEqual([20, 0, 0, 0]);
    expect(at(keys, false, 1000)).toEqual([20, 0, 0, 0]);
  });

  it("a looping track wraps around the sum of the durations", () => {
    const keys = [key(10, 10), key(10, 20)];
    expect(at(keys, true, 25)).toEqual(at(keys, false, 5));
    expect(at(keys, true, 40)).toEqual(at(keys, false, 0));
    expect(at(keys, true, 45)).toEqual(at(keys, false, 5));
  });

  it("a zero-length key takes effect as soon as its time is reached", () => {
    const keys = [key(10, 10), key(0, 99), key(10, 20)];
    expect(at(keys, false, 5)[0]).toBe(15);
    expect(at(keys, false, 10)[0]).toBe(99);
  });

  it("works in single precision", () => {
    const keys = [key(3, 1), key(7, 0.1)];
    const value = at(keys, false, 4)[0];
    expect(value).toBe(Math.fround(value));
  });
});
