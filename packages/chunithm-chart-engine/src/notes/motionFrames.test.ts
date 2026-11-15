import { describe, expect, it } from "vitest";
import { TimelineWriter } from "../chart/timeline/writer";
import { Timeline } from "../chart/timeline/reader";
import { createMotionFrames, motionFramesOf } from "./motionFrames";
import type { MotionTracks } from "../chart/lifecycle/motion";
import { BakedSpeedMismatchError } from "./bakedSpeed";

describe("recorded per-part motion frames", () => {
  it("uses the exact recorded part and step in either seek direction and rejects another speed epoch", () => {
    const writer = new TimelineWriter();
    for (const [time, note, part, model, frame] of [
      [0, 1, 0xfffa, 146, 0.5],
      [1 / 120, 1, 0xfffa, 146, 1],
      [1 / 120, 1, 0, 342, 2.25],
    ])
      writer.push("motion", { time, note, part, model, frame });
    const timeline = Timeline.from(
      writer.finish({
        durationSeconds: 1,
        noteCount: 2,
        defaultSpeedRow: 4,
        unsupported: [],
        appearIsPlaceholder: true,
      }),
    );
    const frames = createMotionFrames(timeline, 4);
    expect(frames.at(1, 0xfffa, 146, 1)).toBe(1);
    expect(frames.at(1, 0xfffa, 146, 0)).toBe(0.5);
    expect(frames.at(1, 0, 342, 1)).toBe(2.25);
    expect(frames.at(1, 0xfffa, 146, 1)).toBe(1);
    expect(() => frames.at(1, 0xfffa, 146, 2)).toThrow(/not recorded/);
    expect(() => frames.at(1, 0xfffa, 147, 1)).toThrow(/binding/);
    expect(() => createMotionFrames(timeline, 0)).toThrow(/speed/);
  });

  it("names the baked and the requested speed row when they differ", () => {
    const writer = new TimelineWriter();
    writer.push("motion", { time: 0, note: 1, part: 0xfffa, model: 146, frame: 0.5 });
    const timeline = Timeline.from(
      writer.finish({
        durationSeconds: 1,
        noteCount: 2,
        defaultSpeedRow: 4,
        unsupported: [],
        appearIsPlaceholder: true,
      }),
    );
    try {
      createMotionFrames(timeline, 9);
      throw new Error("expected a speed mismatch");
    } catch (error) {
      expect(error).toBeInstanceOf(BakedSpeedMismatchError);
      expect(error).toMatchObject({ baked: 4, requested: 9 });
    }
  });

  it("reads computed tracks at their exact step and rejects another speed or binding", () => {
    const tracks: MotionTracks = {
      speedRow: 4,
      records: Uint32Array.of(1, 1),
      parts: Uint16Array.of(0xfffa, 0),
      models: Uint16Array.of(146, 342),
      firsts: Int32Array.of(10, 20),
      offsets: Uint32Array.of(0, 3, 4),
      frames: Float32Array.of(0.5, NaN, 1.5, 2.25),
    };
    const frames = motionFramesOf(tracks, 4);
    expect(frames.has(1, 0xfffa)).toBe(true);
    expect(frames.has(1, 1)).toBe(false);
    expect(frames.at(1, 0xfffa, 146, 12)).toBe(1.5);
    expect(frames.at(1, 0xfffa, 146, 10)).toBe(0.5);
    expect(frames.at(1, 0, 342, 20)).toBe(2.25);
    expect(() => frames.at(1, 0xfffa, 146, 11)).toThrow(/not advanced/);
    expect(() => frames.at(1, 0xfffa, 146, 13)).toThrow(/not advanced/);
    expect(() => frames.at(1, 0xfffa, 147, 10)).toThrow(/binding/);
    expect(() => motionFramesOf(tracks, 0)).toThrow(BakedSpeedMismatchError);
  });

  it("does not tie a timeline without recorded motion to any speed row", () => {
    const writer = new TimelineWriter();
    const timeline = Timeline.from(
      writer.finish({
        durationSeconds: 1,
        noteCount: 0,
        defaultSpeedRow: 4,
        unsupported: [],
        appearIsPlaceholder: true,
      }),
    );
    const frames = createMotionFrames(timeline, 9);
    expect(frames.has(0, 0xfffa)).toBe(false);
  });
});
