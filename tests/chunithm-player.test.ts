import { describe, expect, test } from "vitest";
import { parseLxchu } from "@lxns-network/chunithm-chart-engine/chart/parse/lxchu";
import { bindScore } from "@lxns-network/chunithm-chart-engine/chart/bind/bindScore";
import { bake } from "@lxns-network/chunithm-chart-engine/chart/bake/bake";
import { GROUND_MAIN_PART } from "@lxns-network/chunithm-chart-engine/chart/bake/events";
import { compileJudgeTimingIni } from "@lxns-network/chunithm-chart-engine/chart/bind/config";
import { assembleEvents } from "@lxns-network/chunithm-chart-engine/chart/lifecycle/emissions";
import { lifecycleContext } from "@lxns-network/chunithm-chart-engine/chart/lifecycle/context";
import { chartSteps } from "@lxns-network/chunithm-chart-engine/chart/lifecycle/nativeChart";
import { noteObjects } from "@lxns-network/chunithm-chart-engine/chart/lifecycle/objects";
import { lifecycleRuns } from "@lxns-network/chunithm-chart-engine/chart/lifecycle/runs";
import {
  scanState,
  spawnSteps,
} from "@lxns-network/chunithm-chart-engine/chart/lifecycle/spawnStep";
import { motionParts } from "@lxns-network/chunithm-chart-engine/chart/lifecycle/motion";
import { Timeline } from "@lxns-network/chunithm-chart-engine/chart/timeline/reader";
import { createLivePlayback } from "@lxns-network/chunithm-chart-engine/notes/livePlayback";
import { createPlayStates } from "@/pages/public/Chart/chunithm/runtime/playStates";
import { createPlayEffects } from "@/pages/public/Chart/chunithm/runtime/playEffects";
import { createScoreKeeper } from "@lxns-network/chunithm-chart-engine/chart/sweep/score";
import { noteScoreOf } from "@lxns-network/chunithm-chart-engine/notes/score";
import {
  createPlayer,
  type Judgment,
  type PlayInput,
} from "@/pages/public/Chart/chunithm/runtime/player";

/** One of every note family at 120 BPM. */
const PATTERN = `&format=lxchu/1
&id=0
&title=Pattern Check
&artist=test
&genre=test
&bpm=120

&lv_3=10
&chart_3=
bpm 0 120
beat 0 4/4
tap 768 0-3
tap 864 4-7 ex up
tap 960 8-11
  air up
flick 1056 12-15
mine 1152 6-9
tap 1248 0-1
tap 1250 0-1
hold 1344..1536 0-3
  airhold -> 1728
slide 1920 4-7 -> 2112 8-11
  air down
slide 2304 0-3 ~> 2400 4-7 -> 2496 8-11
  airslide h5 -> 2592 8-11 h5
crush 2688 12-15 h5 every 1 -> 2690 12-15 h1
tap 2880 0-15
`;

/** The test chart with the built-in judge windows. */
function load() {
  const config = compileJudgeTimingIni(new Uint8Array());
  const bytes = new TextEncoder().encode(PATTERN);
  const bound = bindScore(parseLxchu(bytes, { difficulty: 3, mirror: false }), config, {
    difficulty: 3,
    mirror: false,
  });
  const score = noteScoreOf(bound);
  const steps = chartSteps(score.records);
  const objects = noteObjects(score.records, spawnSteps(score, 0, steps));
  return { bound, score, steps, objects, context: lifecycleContext(bound) };
}

/** Plays the test chart with `inputs` and returns everything the player wrote. */
function play(inputs: PlayInput[], options = { flickNeedsMotion: true }, skipUntil = -1) {
  const { score, steps, objects, context } = load();
  const judgments: Judgment[] = [];
  const models = new Map<string, [number, number][]>();
  const bands = new Map<string, [number, number][]>();
  const write = (
    map: Map<string, [number, number][]>,
    key: string,
    step: number,
    value: number,
  ) => {
    const list = map.get(key) ?? [];
    if (last(list)?.[1] === value) return;
    if (last(list)?.[0] === step) list.pop();
    list.push([step, value]);
    map.set(key, list);
  };
  const player = createPlayer({
    score,
    objects,
    context,
    options,
    output: {
      model: (record, part, step, shown) => write(models, `${record}/${part}`, step, shown),
      band: (kind, record, step, state) => write(bands, `${kind}/${record}`, step, state),
      judge: (judgment) => judgments.push(judgment),
      sound() {},
      endStep() {},
    },
  });
  for (const input of [...inputs].sort((a, b) => a.frames - b.frames)) player.push(input);
  player.advance(steps + 600, skipUntil);
  const at = (className: string, nth = 0) =>
    judgments.filter((judgment) => judgment.object.className === className)[nth];
  return { score, objects, judgments, models, bands, finished: player.finished, at };
}

const last = <T>(list: readonly T[]): T | undefined => list[list.length - 1];
const lanes = (first: number, last: number) => ((1 << (last + 1)) - 1) & ~((1 << first) - 1);
/** A touch held from `ms` for `hold` milliseconds. */
const touch = (ms: number, mask: number, hold = 30): PlayInput[] => [
  { frames: ms * 0.06, lanes: mask, air: false, down: true },
  { frames: (ms + hold) * 0.06, lanes: mask, air: false, down: false },
];
const raise = (ms: number, hold = 30): PlayInput[] => [
  { frames: ms * 0.06, lanes: 0, air: true, down: true },
  { frames: (ms + hold) * 0.06, lanes: 0, air: true, down: false },
];

describe("live play animation", () => {
  test("keeps effect identities across additions and distinguishes a restarted play", () => {
    const { score, judgments } = play([...touch(4000, lanes(0, 3)), ...touch(4500, lanes(4, 7))]);
    const effects = createPlayEffects(score, () => 0);
    effects.add(judgments[0]);
    const first = effects.effects;
    effects.add(judgments[1]);
    const next = effects.effects;
    expect(first.instances.ids!.length).toBeGreaterThan(0);
    expect(next.sequence).toBe(first.sequence);
    expect(next.instances.ids!.slice(0, first.instances.ids!.length)).toEqual(first.instances.ids);
    expect(createPlayEffects(score, () => 0).effects.sequence).not.toBe(next.sequence);
    effects.reset();
    expect(effects.effects.sequence).not.toBe(next.sequence);
    expect(effects.effects.instances.ids).toHaveLength(0);
  });
  test.each([0, 0.375])("samples missed notes within their UV range at sub-step %s", (fraction) => {
    const { bound, score, steps, objects, context } = load();
    const runs = lifecycleRuns(score, objects, context);
    const timeline = Timeline.from(bake(bound, () => assembleEvents(runs), { musicId: 0 }));
    const states = createPlayStates(timeline, score.records);
    states.setPlaying(true);
    const player = createPlayer({
      score,
      objects,
      context,
      options: { flickNeedsMotion: true },
      output: {
        model: states.model,
        band: states.band,
        judge() {},
        sound() {},
        endStep() {},
      },
    });
    const slack = 60;
    const playback = createLivePlayback(score, runs, scanState(0), states.live.modelStates, slack);
    const parts = motionParts(score, runs, steps);
    let lateSamples = 0;
    for (let step = 0; step < steps + slack; step++) {
      player.advance(step);
      const count = playback.update(step, 0, 1);
      const active = new Set(playback.records.subarray(0, count));
      for (const part of parts) {
        const record = part.run.object.record;
        const visiblePart = part.pool === null ? GROUND_MAIN_PART : part.part;
        if (
          !active.has(record) ||
          step >= part.release + slack ||
          !states.live.modelStates.shownAt(record, visiblePart, step)
        )
          continue;
        const frame = playback.at(record, part.part, part.model, step + fraction);
        expect(
          frame,
          `${part.run.object.className}/${part.part} at ${step}`,
        ).toBeGreaterThanOrEqual(0);
        expect(frame, `${part.run.object.className}/${part.part} at ${step}`).toBeLessThanOrEqual(
          part.clock.upper,
        );
        if (step >= part.release) lateSamples++;
      }
    }
    expect(lateSamples).toBeGreaterThan(0);
  });
});

describe("skipped play", () => {
  test("commits what the engine's automatic play commits, for every note family", () => {
    const { score, objects, context } = load();
    const runs = lifecycleRuns(score, objects, context);
    const played = play([], undefined, Infinity);
    expect(new Set(objects.map((object) => object.className)).size).toBe(10);
    expect(played.finished).toBe(true);
    const key = (j: { step: number; judgePhase: number; part?: number; element?: boolean }) =>
      `${j.step}/${j.judgePhase}/${j.part}/${j.element ?? false}`;
    for (const run of runs)
      expect(played.judgments.filter((j) => j.object.order === run.object.order).map(key)).toEqual(
        run.judges.map(key),
      );
    const expected = new Map<string, [number, number][]>();
    for (const event of assembleEvents(runs)) {
      const step = Math.round(event.time * 120);
      const entry =
        event.kind === "airmodel"
          ? ([`${event.note}/${event.part}`, event.shown] as const)
          : event.kind === "band"
            ? ([`band/${event.note}`, event.state] as const)
            : event.kind === "slide" || event.kind === "airband"
              ? ([`${event.kind}/${event.note}`, event.mode] as const)
              : null;
      if (!entry) continue;
      const list = expected.get(entry[0]) ?? [];
      if (last(list)?.[0] === step) list.pop();
      list.push([step, entry[1]]);
      expected.set(entry[0], list);
    }
    for (const [name, list] of expected) {
      const source =
        name.startsWith("band/") || name.includes("band") || name.startsWith("slide/")
          ? played.bands
          : played.models;
      // The engine starts a HOLD band at state 0 without recording it.
      const got = (source.get(name) ?? []).filter(
        (entry, i) => !(i === 0 && name.startsWith("band/") && entry[1] === 0),
      );
      expect(got, name).toEqual(list);
    }
  });
});

describe("player input", () => {
  test("grades a TAP by when it is touched", () => {
    expect(play(touch(4000, lanes(0, 3))).at("TapNote")).toMatchObject({ grade: 4, timing: 0 });
    const late = play(touch(4050, lanes(0, 3))).at("TapNote");
    expect(late.grade).toBe(2);
    expect(late.timing).toBeCloseTo(3);
    const early = play(touch(3920, lanes(2, 2))).at("TapNote");
    expect(early.grade).toBe(1);
    expect(early.timing).toBeLessThan(0);
  });

  test("misses a TAP nobody touches, or touches outside its lanes or window", () => {
    for (const inputs of [[], touch(4000, lanes(4, 5)), touch(3800, lanes(0, 3))]) {
      const tap = play(inputs).at("TapNote");
      expect(tap.grade).toBe(0);
      expect(tap.step).toBeGreaterThan(480);
    }
  });

  test("hides a judged TAP from the step it is hit", () => {
    const { models, objects, at } = play(touch(3990, lanes(0, 3)));
    const tap = objects.find((object) => object.className === "TapNote")!;
    expect(last(models.get(`${tap.record}/${0xfff8}`)!)).toEqual([at("TapNote").step, 0]);
  });

  test("one touch takes one note per lane it covers", () => {
    const result = play(touch(6505, lanes(0, 1)));
    const taps = result.judgments.filter(
      (j) => j.object.className === "TapNote" && j.step > 770 && j.step < 800,
    );
    expect(taps.map((j) => j.grade > 0)).toEqual([true, false]);
  });

  test("an EX TAP is a JUSTICE CRITICAL anywhere in its window", () => {
    expect(play(touch(4580, lanes(4, 7))).at("CharaTapNote").grade).toBeGreaterThanOrEqual(3);
  });

  test("a HOLD counts its ticks while held and dims its band once let go", () => {
    const { objects, judgments } = play(touch(7000, lanes(0, 3), 1000));
    const hold = objects.find((object) => object.className === "HoldNote")!;
    const grades = judgments.filter((j) => j.object === hold).map((j) => j.grade);
    expect(grades.length).toBeGreaterThan(2);
    expect(grades.every((grade) => grade === 4)).toBe(true);

    const released = play(touch(7000, lanes(0, 3), 300));
    const ticks = released.judgments
      .filter((j) => j.object.order === hold.order)
      .map((j) => j.grade);
    expect(ticks[0]).toBe(4);
    expect(last(ticks)).toBe(0);
    expect(released.bands.get(`band/${hold.record}`)!.some(([, state]) => state === 2)).toBe(true);
  });

  test("a HOLD head already held when it arrives is taken", () => {
    const held = play(touch(6900, lanes(0, 3), 1100));
    const hold = held.judgments.find(
      (j) => j.object.className === "HoldNote" && j.judgePhase === 0,
    )!;
    expect(hold.grade).toBe(4);
  });

  test("a MINE is missed while its lanes are held", () => {
    expect(play([]).at("MineNote").grade).toBe(4);
    expect(play(touch(5950, lanes(7, 8), 200)).at("MineNote").grade).toBe(0);
  });

  test("a FLICK is graded by its touch and its slash, and is a late ATTACK without a slash", () => {
    const flick = (inputs: PlayInput[], options?: { flickNeedsMotion: boolean }) =>
      play(inputs, options).at("FlickNote");
    expect(flick([]).grade).toBe(0);
    const unslashed = flick(touch(5500, lanes(12, 12)));
    expect(unslashed.grade).toBe(1);
    expect(unslashed.timing).toBeGreaterThan(0);
    expect(
      flick([...touch(5480, lanes(12, 12), 60), ...touch(5500, lanes(13, 13))]).grade,
    ).toBeGreaterThanOrEqual(3);
    // The slash 120 ms late is past FLICK.SLASH's 83.33 ms JUSTICE CRITICAL, inside its 166.67 ms JUSTICE.
    expect(flick([...touch(5500, lanes(12, 12), 200), ...touch(5620, lanes(13, 13))]).grade).toBe(
      2,
    );
    expect(flick(touch(5500, lanes(12, 12)), { flickNeedsMotion: false }).grade).toBeGreaterThan(0);
  });

  test("a HOLD tick is graded by how long before it the HOLD was let go", () => {
    // Ticks at 7250, 7500 and 7750 ms; KEEP gives JUSTICE CRITICAL within 50 ms, JUSTICE 100, ATTACK 150.
    const firstTick = (letGo: number) =>
      play(touch(7000, lanes(0, 3), letGo - 7000)).judgments.filter(
        (j) => j.object.className === "HoldNote" && j.judgePhase !== 0,
      )[0].grade;
    expect(firstTick(7215)).toBeGreaterThanOrEqual(3);
    expect(firstTick(7175)).toBe(2);
    expect(firstTick(7125)).toBe(1);
    expect(firstTick(7070)).toBe(0);
  });

  test("an AIR HOLD tick is graded by how long before it the hand came down", () => {
    // Head at about 8008 ms, ticks at about 8492, 8742 and 9000 ms; AIRHOLD gives
    // JUSTICE CRITICAL within 200 ms, JUSTICE 400, ATTACK 600.
    const grades = play(raise(8000, 380))
      .judgments.filter((j) => j.object.className === "AirHoldNote" && j.judgePhase !== 0)
      .map((j) => j.grade);
    expect(grades[0]).toBeGreaterThanOrEqual(3);
    expect(grades[1]).toBe(2);
    expect(last(grades)).toBe(0);
  });

  test("an AIR CRUSH element takes a hand up within 266.67 ms of it", () => {
    // Elements at 14000 to 14010 ms.
    const crush = (inputs: PlayInput[]) =>
      play(inputs)
        .judgments.filter((j) => j.object.className === "AirLadderNote")
        .map((j) => j.grade);
    expect(crush(raise(13850)).every((grade) => grade === 4)).toBe(true);
    expect(crush(raise(14150)).every((grade) => grade === 4)).toBe(true);
    expect(crush(raise(13650)).every((grade) => grade === 0)).toBe(true);
    expect(crush(raise(14350)).every((grade) => grade === 0)).toBe(true);
  });

  test("an AIR takes an AIR action after its note, not before its window", () => {
    expect(play(raise(5050)).at("AirNote").grade).toBeGreaterThan(0);
    expect(play(raise(4500)).at("AirNote").grade).toBe(0);
  });

  test("a full play of JUSTICE CRITICALs scores 1,010,000", () => {
    const { score, judgments } = play([], undefined, Infinity);
    const keeper = createScoreKeeper(score);
    let values = keeper.judge(0, 1, 0, 4);
    for (const j of judgments.slice(1))
      values = keeper.judge(j.object.record, j.part, j.judgePhase, 4);
    expect(values.score).toBe(1010000);
    expect(values.combo).toBe(judgments.length);
    expect(keeper.judge(0, 1, 0, 0).combo).toBe(0);
  });
});
