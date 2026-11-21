import { Timeline } from "../timeline/reader";
import { lifecycleContext } from "../lifecycle/context";
import { cueSimulation, type CueRow, type Sound } from "../sweep/cues";
import { createScoreKeeper } from "../sweep/score";
import type { LoadedChart } from "../worker/loadChart";
import type { HudValues } from "../../hud/timelineValues";
import { stepForSeconds } from "../../loop/audioClock";
import type { NoteScore } from "../../notes/score";
import { createPlayEffects, type ResultText } from "./effects";
import type { ButtonHold, ControlChange, SurfaceSample } from "./input";
import { createPlayStates } from "./noteStates";
import {
  createPlayer,
  type Judgment,
  type Player,
  type PlayerOptions,
  type SliderLightOutput,
} from "./player";

/** Running totals of one play, for the page to show. */
export interface PlayStats {
  score: number;
  combo: number;
  maxCombo: number;
  /** JUSTICE CRITICAL, JUSTICE, ATTACK and MISS. */
  counts: readonly [number, number, number, number];
  fast: number;
  late: number;
  /** Whether every note has been played to its end. */
  finished: boolean;
  /** Whether part of the chart was skipped, so the score is not a full play. */
  partial: boolean;
}

const EMPTY_STATS: PlayStats = {
  score: 0,
  combo: 0,
  maxCombo: 0,
  counts: [0, 0, 0, 0],
  fast: 0,
  late: 0,
  finished: false,
  partial: false,
};

/** Where cue starts and stops are played, at chart times in seconds. */
export interface PlaySounds {
  start(row: number, cue: number, gain: number, seconds: number): void;
  stop(row: number, seconds: number): void;
  silence(): void;
}

/**
 * One chart played with the player's controls: the player's results feed the note states the
 * note layer draws, the HUD values, the sounds and the result effects. While not playing, the note
 * states are the recorded automatic play and nothing else runs.
 */
export function createPlaySession(input: {
  chart: Pick<LoadedChart, "score" | "livePlayback">;
  /** Compiled judge-timing configuration. */
  config: DataView;
  /** Difficulty row the judge windows were bound for. */
  difficulty: number;
  judgeTimingRow: number;
  sounds: () => PlaySounds | null;
  readonly sliderLights?: SliderLightOutput;
  text: ResultText;
  options: () => PlayerOptions;
}) {
  const { chart } = input;
  const states = createPlayStates(Timeline.from(chart.livePlayback.timeline), chart.score.records);
  const objects = chart.livePlayback.runs.map((run) => run.object);
  const context = lifecycleContext(
    { config: input.config, difficulty: input.difficulty },
    input.judgeTimingRow,
  );
  const slideObjects = new Map(
    objects.filter((o) => o.className === "SlideNote").map((o) => [o.record, o]),
  );
  let score: NoteScore = chart.score;
  let effects = createPlayEffects(score, input.text);
  let keeper = createScoreKeeper(score);
  let player: Player | null = null;
  let stats = EMPTY_STATS;
  let gauge = 0;
  let skippedJudgment = false;
  const rows: CueRow[] = [];
  let simulation = cueSimulation(rows);
  let cues = 0;
  const sounds: { order: number; sound: Sound }[] = [];
  const listeners = new Set<() => void>();
  const publish = (next: PlayStats) => {
    stats = next;
    for (const listener of listeners) listener();
  };
  const judge = (judgment: Judgment) => {
    const { object } = judgment;
    if (judgment.judgePhase === 0) states.judged(object.record, judgment.part === 2, judgment.step);
    effects.add(judgment);
    if (judgment.skipped) {
      skippedJudgment = true;
      return;
    }
    const values = keeper.judge(object.record, judgment.part, judgment.judgePhase, judgment.grade);
    gauge = values.gauge;
    const timedHead =
      judgment.judgePhase === 0 &&
      (object.className === "TapNote" ||
        object.className === "CharaTapNote" ||
        object.className === "HoldNote" ||
        object.className === "SlideNote");
    const timing = timedHead && judgment.grade > 0 && judgment.grade < 4 ? judgment.timing : null;
    publish({
      ...stats,
      score: values.score,
      combo: values.combo,
      maxCombo: Math.max(stats.maxCombo, values.combo),
      counts: values.counts,
      fast: stats.fast + Number(timing !== null && timing < 0),
      late: stats.late + Number(timing !== null && timing > 0),
    });
  };

  /** Plays the sounds of one step through the cue simulation and passes on what it starts and stops. */
  const endStep = (step: number) => {
    simulation.begin(step);
    for (const { order, sound } of sounds) simulation.apply(sound, order);
    sounds.length = 0;
    simulation.service();
    const target = input.sounds();
    for (const row of rows) {
      if (row.kind === "cue") {
        target?.start(cues, row.cue, row.gain, row.time);
        cues++;
      } else target?.stop(row.row, row.time);
    }
    rows.length = 0;
  };

  /** Starts over at `step`, skipping every note before it. */
  const restart = (step: number) => {
    states.setPlaying(true);
    effects = createPlayEffects(score, input.text);
    keeper = createScoreKeeper(score);
    gauge = 0;
    rows.length = 0;
    simulation = cueSimulation(rows);
    cues = 0;
    sounds.length = 0;
    input.sounds()?.silence();
    player = createPlayer({
      score,
      objects,
      context,
      options: input.options(),
      output: {
        model: states.model,
        spawn: effects.spawn,
        keyBeam: effects.keyBeam,
        get sliderLights() {
          return input.sliderLights;
        },
        band(kind, record, at, state) {
          states.band(kind, record, at, state);
          if (kind === "slide") effects.slide(slideObjects.get(record)!, at, state);
        },
        judge,
        sound(object, sound, skipped) {
          if (!skipped) sounds.push({ order: object.order, sound });
        },
        endStep,
      },
    });
    skippedJudgment = false;
    player.advance(step - 1, step);
    publish({ ...EMPTY_STATS, partial: skippedJudgment });
  };

  return {
    live: states.live,
    get playing() {
      return states.playing;
    },
    /** Turns play on, starting over at `step`, or back to the recorded automatic play. */
    setPlaying(value: boolean, step: number) {
      if (value) restart(step);
      else {
        states.setPlaying(false);
        player = null;
        input.sounds()?.silence();
        publish(EMPTY_STATS);
      }
    },
    /** Judges with another lane layout from now on, as a mirror switch needs. */
    selectScore(next: NoteScore, step: number) {
      score = next;
      if (player) restart(step);
    },
    /** Starts over at `step`, skipping every note before it. */
    restart(step: number) {
      if (player) restart(step);
    },
    /** Advances only forward and releases any held key beams when the music ends. */
    advance(step: number, musicEnded = false) {
      if (!player) return;
      if (step > player.step) player.advance(step);
      if (musicEnded) player.finishKeyBeams();
      if (player.finished && !stats.finished) publish({ ...stats, finished: true });
    },
    /**
     * Passes the control changes of one event at chart time `seconds` and judges up to it. A change
     * from before the last step played, as an event stamped before the frame that handled it is,
     * keeps its own time and is judged with the next step instead of starting the play over.
     */
    control(changes: ControlChange | ControlChange[], seconds: number) {
      if (!player) return;
      for (const change of Array.isArray(changes) ? changes : [changes])
        player.push({ ...change, frames: seconds * 60 });
      this.advance(stepForSeconds(seconds));
    },
    surface(sample: SurfaceSample, seconds: number) {
      player?.push({ ...sample, frames: seconds * 60 });
    },
    seedSurface(sample: SurfaceSample) {
      player?.seedSurface(sample);
    },
    seedControls(state: ButtonHold) {
      player?.seedControls(state);
    },
    get step() {
      return player?.step ?? -1;
    },
    /** Whether every note of the play has been played to its end. */
    get finished() {
      return stats.finished;
    },
    /** Result effects of the play so far. */
    get effects() {
      return effects.effects;
    },
    /** HUD values of the play so far. */
    hudValues(_step: number, out: HudValues): HudValues {
      out.score = stats.score;
      out.combo = stats.maxCombo;
      out.gauge = gauge;
      out.counts = [...stats.counts];
      return out;
    },
    stats: {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getSnapshot: () => stats,
    },
  };
}

export type PlaySession = ReturnType<typeof createPlaySession>;
