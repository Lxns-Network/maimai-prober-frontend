import { describe, expect, it } from "vitest";
import { prepareAudioEvents, type PreparedAudioEvent } from "@lxns-network/maimai-chart-engine";
import type {
  HoldEndNote,
  HoldStartNote,
  Note,
  SlideNote,
  TapNote,
  TouchHoldEndNote,
  TouchHoldStartNote,
  TouchNote,
} from "@lxns-network/maimai-chart-engine";

const base = { timing: 0, measure: 1, positionInMeasure: 0, scale: 1, bpm: 120 } as const;

function tap(timingMs: number, type: TapNote["type"] = "tap"): TapNote {
  return { ...base, type, position: 1, timingMs };
}

function slide(timingMs: number, extra: Partial<SlideNote> = {}): SlideNote {
  return {
    ...base,
    type: "slide",
    position: 1,
    timingMs,
    duration: 1,
    durationMs: 500,
    slideSegments: [],
    ...extra,
  };
}

function holdStart(timingMs: number, isBreakHold: boolean, isEx = false): HoldStartNote {
  return {
    ...base,
    type: "hold-start",
    position: 1,
    timingMs,
    duration: 1,
    isHoldStart: true,
    isBreakHold,
    isEx,
  };
}

function holdEnd(timingMs: number): HoldEndNote {
  return {
    ...base,
    type: "hold-end",
    position: 1,
    timingMs,
    holdStartTiming: 0,
    isHoldEnd: true,
  };
}

function touch(timingMs: number, hasFirework = false): TouchNote {
  return { ...base, type: "touch", position: "C1", timingMs, hasFirework };
}

function touchHoldStart(timingMs: number, durationMs: number): TouchHoldStartNote {
  return {
    ...base,
    type: "touch-hold-start",
    position: "C1",
    timingMs,
    duration: 1,
    durationMs,
    isHoldStart: true,
  };
}

function touchHoldEnd(timingMs: number, hasFirework = false): TouchHoldEndNote {
  return {
    ...base,
    type: "touch-hold-end",
    position: "C1",
    timingMs,
    holdStartTiming: 0,
    isHoldEnd: true,
    hasFirework,
  };
}

function at(events: PreparedAudioEvent[], timeMs: number): PreparedAudioEvent {
  const event = events.find((candidate) => candidate.timeMs === timeMs);
  expect(event, `no event at ${timeMs}ms`).toBeDefined();
  return event!;
}

describe("prepareAudioEvents", () => {
  it("routes break notes to the break layer instead of the tap layer", () => {
    const events = prepareAudioEvents([tap(0, "break"), tap(1000)]);
    expect(at(events, 0)).toMatchObject({
      hasBaseSound: true,
      hasBreakJudgeSound: true,
      hasTapJudgeSound: false,
    });
    expect(at(events, 1000)).toMatchObject({
      hasBreakJudgeSound: false,
      hasTapJudgeSound: true,
    });
  });

  it.each([
    { label: "break hold", note: holdStart(0, true), hasBreakJudgeSound: true },
    { label: "normal hold", note: holdStart(0, false), hasBreakJudgeSound: false },
    { label: "break star slide", note: slide(0, { isStartBreak: true }), hasBreakJudgeSound: true },
    { label: "normal slide", note: slide(0), hasBreakJudgeSound: false },
  ])("assigns the head layer for $label", ({ note, hasBreakJudgeSound }) => {
    expect(at(prepareAudioEvents([note]), 0)).toMatchObject({
      hasBaseSound: true,
      hasBreakJudgeSound,
      hasTapJudgeSound: !hasBreakJudgeSound,
    });
  });

  it("emits the slide sound at the launch time rather than the head time", () => {
    const events = prepareAudioEvents([slide(0, { delayMs: 250 })]);
    expect(at(events, 0).hasSlideSound).toBe(false);
    expect(at(events, 250)).toMatchObject({ hasSlideSound: true, hasBaseSound: false });
  });

  it("falls back to one beat when the slide carries no delay", () => {
    expect(at(prepareAudioEvents([slide(0)]), 500).hasSlideSound).toBe(true);
  });

  it("keeps the slide sound for headless slides but drops the head sound", () => {
    const events = prepareAudioEvents([slide(0, { isHeadless: true, delayMs: 250 })]);
    expect(at(events, 0).hasBaseSound).toBe(false);
    expect(at(events, 250).hasSlideSound).toBe(true);
  });

  it("emits one launch per split slide path", () => {
    const events = prepareAudioEvents([
      slide(0, { delayMs: 250, allDelayMs: [250, 250, 400], isSplitSlide: true }),
    ]);
    expect(events.filter((event) => event.hasSlideSound).map((event) => event.timeMs)).toEqual([
      250, 400,
    ]);
  });

  it("routes EX heads to the EX layer unless the note is a break", () => {
    const events = prepareAudioEvents([
      { ...tap(0), isEx: true },
      { ...tap(1000, "break"), isEx: true },
      holdStart(2000, false, true),
    ]);
    expect(at(events, 0)).toMatchObject({ hasExJudgeSound: true, hasTapJudgeSound: false });
    expect(at(events, 1000)).toMatchObject({ hasBreakJudgeSound: true, hasExJudgeSound: false });
    expect(at(events, 2000)).toMatchObject({ hasExJudgeSound: true, hasTapJudgeSound: false });
  });

  it("swaps the touch judge sound for the firework sound on firework touches", () => {
    const events = prepareAudioEvents([touch(0, true), touch(500)]);
    expect(at(events, 0)).toMatchObject({ hasFireworkSound: true, hasTouchSound: false });
    expect(at(events, 500)).toMatchObject({ hasFireworkSound: false, hasTouchSound: true });
  });

  it("marks the touch hold bed with its duration and firework-aware end", () => {
    const events = prepareAudioEvents([
      touchHoldStart(0, 800),
      touchHoldStart(0, 1200),
      touchHoldEnd(1200, true),
    ]);
    expect(at(events, 0)).toMatchObject({
      hasTouchSound: true,
      hasTouchHoldSound: true,
      touchHoldDurationMs: 1200,
    });
    expect(at(events, 1200)).toMatchObject({
      hasTouchHoldEndFireworkSound: true,
      hasTouchHoldEndSound: false,
    });
  });

  it("keeps the hold end flag so the release replays the tap judge sound", () => {
    expect(at(prepareAudioEvents([holdEnd(500)]), 500)).toMatchObject({
      hasHoldEndSound: true,
      hasTapJudgeSound: false,
    });
  });

  it("layers break slide sounds at launch and cheers at arrival", () => {
    const events = prepareAudioEvents([
      slide(0, {
        delayMs: 250,
        durationMs: 600,
        allDelayMs: [250, 250],
        allDurationMs: [600, 900],
        allSlideBreaks: [false, true],
        isSplitSlide: true,
      }),
    ]);
    expect(at(events, 250)).toMatchObject({ hasSlideSound: true, hasBreakSlideSound: true });
    expect(at(events, 1150)).toMatchObject({ hasBreakSlideCheerSound: true });
    expect(events.some((event) => event.hasBreakSlideCheerSound && event.timeMs === 850)).toBe(
      false,
    );
  });

  it("limits each monophonic layer to the gap before its next sound", () => {
    const notes: Note[] = [
      tap(0, "break"),
      slide(0, { delayMs: 100 }),
      tap(300, "break"),
      slide(500, { delayMs: 100 }),
    ];
    const events = prepareAudioEvents(notes);
    expect(at(events, 0).breakGapMs).toBe(300);
    expect(at(events, 300).breakGapMs).toBe(Infinity);
    expect(at(events, 100).slideGapMs).toBe(500);
    expect(at(events, 600).slideGapMs).toBe(Infinity);
  });

  it("tracks gaps for the EX and touch hold layers", () => {
    const events = prepareAudioEvents([
      { ...tap(0), isEx: true },
      touchHoldStart(100, 2000),
      { ...tap(400), isEx: true },
      touchHoldStart(900, 500),
    ]);
    expect(at(events, 0).exGapMs).toBe(400);
    expect(at(events, 400).exGapMs).toBe(Infinity);
    expect(at(events, 100).touchHoldGapMs).toBe(800);
    expect(at(events, 900).touchHoldGapMs).toBe(Infinity);
  });
});
