import { Timeline } from "@lxns-network/chunithm-chart-engine/chart/timeline/reader";
import { lifecycleContext } from "@lxns-network/chunithm-chart-engine/chart/lifecycle/context";
import {
  cueSimulation,
  type CueRow,
  type Sound,
} from "@lxns-network/chunithm-chart-engine/chart/sweep/cues";
import { createScoreKeeper } from "@lxns-network/chunithm-chart-engine/chart/sweep/score";
import type { LoadedChart } from "@lxns-network/chunithm-chart-engine/chart/worker/loadChart";
import type { HudValues } from "@lxns-network/chunithm-chart-engine/hud/timelineValues";
import type { NoteScore } from "@lxns-network/chunithm-chart-engine/notes/score";
import { createPlayEffects, type ResultText } from "./playEffects";
import { createPlayStates } from "./playStates";
import { createPlayer, type Judgment, type Player, type PlayerOptions } from "./player";
import type { ControlChange } from "./controls";

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
  chart: LoadedChart;
  /** Compiled judge-timing configuration. */
  config: DataView;
  /** Difficulty row the judge windows were bound for. */
  difficulty: number;
  judgeTimingRow: number;
  sounds: () => PlaySounds | null;
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
  let score: NoteScore = chart.score;
  let effects = createPlayEffects(score, input.text);
  let keeper = createScoreKeeper(score);
  let player: Player | null = null;
  let stats = EMPTY_STATS;
  let rows: CueRow[] = [];
  let simulation = cueSimulation(rows);
  let flushed = 0;
  let cues = 0;
  let sounds: { order: number; sound: Sound }[] = [];
  const listeners = new Set<() => void>();
  const publish = (next: PlayStats) => {
    stats = next;
    for (const listener of listeners) listener();
  };
  const hud: HudValues = { score: 0, combo: 0, gauge: 0, counts: [0, 0, 0, 0] };

  const judge = (judgment: Judgment) => {
    const { object } = judgment;
    if (judgment.judgePhase === 0) states.judged(object.record, judgment.part === 2, judgment.step);
    effects.add(judgment);
    if (judgment.skipped) return;
    const values = keeper.judge(object.record, judgment.part, judgment.judgePhase, judgment.grade);
    hud.score = values.score;
    hud.combo = values.combo;
    hud.gauge = values.gauge;
    hud.counts = values.counts;
    const timed = judgment.timing !== null && judgment.grade > 0 && judgment.grade < 4;
    publish({
      ...stats,
      score: values.score,
      combo: values.combo,
      maxCombo: Math.max(stats.maxCombo, values.combo),
      counts: values.counts,
      fast: stats.fast + Number(timed && judgment.timing! < 0),
      late: stats.late + Number(timed && judgment.timing! > 0),
    });
  };

  /** Plays the sounds of one step through the cue simulation and passes on what it starts and stops. */
  const endStep = (step: number) => {
    simulation.begin(step);
    for (const { order, sound } of sounds) simulation.apply(sound, order);
    sounds = [];
    simulation.service();
    const target = input.sounds();
    for (; flushed < rows.length; flushed++) {
      const row = rows[flushed];
      if (row.kind === "cue") target?.start(cues++, row.cue, row.gain, row.time);
      else target?.stop(row.row, row.time);
    }
  };

  /** Starts over at `step`, skipping every note before it. */
  const restart = (step: number) => {
    states.reset();
    effects = createPlayEffects(score, input.text);
    keeper = createScoreKeeper(score);
    hud.score = hud.combo = hud.gauge = 0;
    hud.counts = [0, 0, 0, 0];
    rows = [];
    simulation = cueSimulation(rows);
    flushed = cues = 0;
    sounds = [];
    input.sounds()?.silence();
    player = createPlayer({
      score,
      objects,
      context,
      options: input.options(),
      output: {
        model: states.model,
        band: states.band,
        judge,
        sound(object, sound, skipped) {
          if (!skipped) sounds.push({ order: object.order, sound });
        },
        endStep,
      },
    });
    player.advance(step - 1, step);
    publish({ ...EMPTY_STATS, partial: step > 0 });
  };

  return {
    live: states.live,
    get playing() {
      return states.playing;
    },
    /** Turns play on, starting over at `step`, or back to the recorded automatic play. */
    setPlaying(value: boolean, step: number) {
      states.setPlaying(value);
      if (value) restart(step);
      else {
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
    /** Plays up to `step`; a step behind the last one played starts over there. */
    advance(step: number) {
      if (!player) return;
      if (step < player.step) restart(step);
      else player.advance(step);
      if (player.finished && !stats.finished) publish({ ...stats, finished: true });
    },
    /**
     * Passes a control change made at chart time `seconds` and judges up to it at once. A change
     * from before the last step played, as an event stamped before the frame that handled it is,
     * keeps its own time and is judged with the next step instead of starting the play over.
     */
    control(change: ControlChange, seconds: number) {
      if (!player) return;
      player.push({ ...change, frames: seconds * 60 });
      const step = Math.floor(seconds * 120);
      if (step > player.step) this.advance(step);
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
      out.score = hud.score;
      out.combo = hud.combo;
      out.gauge = hud.gauge;
      out.counts = [...hud.counts];
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
