import {
  GROUND_MAIN_PART,
  GROUND_TAIL_PART,
  PLAIN_AIR_PART,
  slideJointPart,
  type JudgePhase,
} from "../bake/events";
import { airChecker, laneChecker, stepFrames, type AirChecker } from "../lifecycle/autoplayJudge";
import type { LifecycleContext } from "../lifecycle/context";
import { ACTIVE_AFTER } from "../lifecycle/emissions";
import { airRow, airTimeMs } from "../lifecycle/families/air";
import { AIR_HOLD_PARTS } from "../lifecycle/families/airHold";
import { AIR_SLIDE_HEAD_PART } from "../lifecycle/families/airSlide";
import { longHeadRow } from "../lifecycle/families/hold";
import type { NoteObject } from "../lifecycle/objects";
import {
  AIR_UP_DIRECTIONS,
  LOOP,
  SOUND,
  holdTailStep,
  playsExtra,
  slideTailSteps,
  startSound,
  type Sound,
} from "../sweep/cues";
import type { NoteScore } from "../../notes/score";
import { NOTE_WIDTHS, SPAWN_CONSTANTS } from "../../notes/tables";
import {
  createAirSensor,
  createContactGate,
  createKeep,
  createSlideAreas,
  createSlash,
  type GroundContacts,
} from "./arcadeJudgment";
import { LANE_COUNT, laneRows, type ControlChange, type SurfaceSample } from "./input";
import { createKeyBeams, type KeyBeamOutput } from "./keyBeams";
import type { BandKind } from "./noteStates";

const f = Math.fround;
const K = SPAWN_CONSTANTS.framesPerMs;
const ALL_LANES = (1 << LANE_COUNT) - 1;
/** Head and tail state a long note sets once that end is done. */
const GROUND_DONE = 4;
/** Head and hold state an AIR long note sets once that part is done. */
const AIR_DONE = 5;
const SLIDE_JOINT_RESULTS = 5;
const UNMARKED = 255;
const TICK_FRAMES_PER_MS = f(0.06);
const CONFIG_WINDOWS = 0x588;
const CONFIG_ROW_BYTES = 56;
const CONFIG_HOLD_THRESHOLDS = 0x710;
const CONFIG_MINE_DELAY = 0x720;
/** WIDTH_MOVE of FLICK.16 down to FLICK.01: lanes a slash moves across a FLICK that wide. */
const CONFIG_FLICK_MOVES = 0x4d0;
const CONFIG_SLIDE_WINDOWS = 0x730;
const CONFIG_SLIDE_ROW_BYTES = 20;
const CONFIG_AIR_SHIFT = 0x870;
const CONFIG_AIR_HOLD_CENTRE = 0x87c;
const CONFIG_AIR_HOLD_THRESHOLDS = 0x888;
const CONFIG_AIR_ROWS = 0x898;
const CONFIG_AIR_ROW_BYTES = 60;
/** Configuration rows of a FLICK's touch and of its slash. */
const FLICK_ROW = 4;
const FLICK_SLASH_ROW = 5;
/** AIR checker rows of AIR HOLD and AIR SLIDE elements, and of AIR LADDER elements. */
const AIR_ELEMENT_ROW = 6;
const LADDER_ROW = 7;
/** Lanes a SLIDE accepts a hold beside its band, on each side. */
const SLIDE_SLACK_LANES = 1;

/** One change of the player's controls, at a chart time in frames. */
export interface PlayInput extends ControlChange {
  frames: number;
}

/** One result a note commits. */
export interface Judgment {
  object: NoteObject;
  step: number;
  /** 1 for the note itself, 2 for its attached AIR. */
  part: 1 | 2;
  judgePhase: JudgePhase;
  element?: true;
  /** 0 MISS, 1 ATTACK, 2 JUSTICE, 3 and 4 JUSTICE CRITICAL. */
  grade: number;
  /** Frames the input came before (negative) or after its window centre, when timing graded it. */
  timing: number | null;
  /** Committed while the player skipped ahead: shown as done, not counted. */
  skipped: boolean;
}

/** Physical slider feedback from manual ground judgments. Masks use one bit per lane. */
export interface SliderLightOutput {
  /** Installs a group across the note's full width, in judgment order. */
  hit(lanes: number, mine: boolean): void;
  /** End of a manual input step, after all hits and the HOLD/SLIDE keep checks. */
  step(step: number, touched: number, sustained: number): void;
}

/** Where the player's results go, step by step. */
export interface PlayerOutput {
  spawn?(object: NoteObject): void;
  model(record: number, part: number, step: number, shown: 0 | 1): void;
  band(kind: BandKind, record: number, step: number, state: number): void;
  judge(judgment: Judgment): void;
  /** A sound an object plays at the current step, in the order it plays them. */
  sound(object: NoteObject, sound: Sound, skipped: boolean): void;
  sliderLights?: SliderLightOutput;
  keyBeam?: KeyBeamOutput;
  /** Called once every object has ticked and the new ones are built. */
  endStep(step: number): void;
}

export interface PlayerOptions {
  surface?: SurfaceSample | null;
  /** Whether a FLICK needs a slash after its touch; otherwise a touch takes it. */
  flickNeedsMotion: boolean;
}

interface Press {
  frames: number;
  lanes: number;
  /** Lanes of the touch a note has already taken; each newly touched lane takes one note. */
  used: number;
}

/** What the controls did up to the end of one grid step. */
interface Step extends GroundContacts {
  arcade: boolean;
  lights?: SliderLightOutput;
  sustainedLights: number;
  hiddenBeams: number;
  airInUse: boolean;
  actions: number;
  owners: Int32Array;
  step: number;
  now: number;
  /** Plays every note as the automatic play does, for a stretch the player skipped. */
  auto: boolean;
  presses: Press[];
  /** AIR actions in this step, by frame time; one action serves every AIR open to it. */
  airActions: number[];
  held: number;
  airHeld: boolean;
  /** Frame time each lane was last let go. */
  released: Float64Array;
  airReleased: number;
}

interface Live {
  readonly object: NoteObject;
  done: boolean;
  nominate?(state: Step): void;
  /** Writes made as the object is built, at its spawn step. */
  build(step: number): void;
  /** One tick, from its first active step on. */
  tick(state: Step): void;
}

const widthOf = (index: number) => NOTE_WIDTHS[index] ?? 0;

function laneMask(lane: number, width: number): number {
  let mask = 0;
  for (let at = Math.max(0, lane); at < Math.min(LANE_COUNT, lane + width); at++) mask |= 1 << at;
  return mask;
}

const recordMask = (record: DataView) =>
  laneMask(record.getInt32(0x28, true), widthOf(record.getInt32(0x2c, true)));

function groundChecker(record: DataView, config: DataView, row: number, offset: number) {
  const bounds = new Float32Array(2 * LANE_COUNT);
  const window = laneChecker(record, config, row, offset, bounds);
  return {
    ...window,
    accepting(lanes: number, delta: number) {
      let accepted = 0;
      for (let pending = lanes; pending; pending &= pending - 1) {
        const bit = pending & -pending;
        const at = (31 - Math.clz32(bit)) * 2;
        if (bounds[at] <= delta && delta < bounds[at + 1]) accepted |= bit;
      }
      return accepted;
    },
  };
}

/** Grade of a ground input `delta` frames from its note, with the judge timing offset taken out. */
function groundGrade(config: DataView, row: number, delta: number, arcade = false): number {
  const at = (index: number) =>
    config.getFloat32(CONFIG_WINDOWS + CONFIG_ROW_BYTES * row + 4 * index, true);
  if (delta < 0) {
    if (delta >= at(4)) return 4;
    if (delta >= at(3)) return 3;
    if (delta >= at(2)) return 2;
    return delta >= at(1) ? 1 : 0;
  }
  const within = (limit: number) => (arcade ? delta < limit : delta <= limit);
  if (within(at(10))) return 4;
  if (within(at(9))) return 3;
  if (within(at(8))) return 2;
  return within(at(7)) ? 1 : 0;
}

/** AIR windows of a configuration row: its checker, latest accepted delta and grading. */
function airWindows(config: DataView, row: number, offset: number) {
  const at = (index: number) =>
    config.getFloat32(CONFIG_AIR_ROWS + CONFIG_AIR_ROW_BYTES * row + 4 * index, true);
  const shift = f(config.getFloat32(CONFIG_AIR_SHIFT, true) + at(0));
  const checker = airChecker(config, row, offset);
  let best: { grade: number; timing: number; priority: number } | null = null;
  return {
    checker,
    late: f(f(at(10) + offset) + shift),
    centre: f(offset + shift),
    manual(delta: number, actions: number) {
      if (delta <= checker.early) return null;
      const timing = delta - checker.centre;
      const late = f(f(at(10) + offset) + shift);
      const grade = this.grade(delta, true);
      // C3BE50 prefers the inner critical window, then FAST over LATE at each equal grade.
      const priority = delta >= late ? 2 : grade === 4 ? 11 : 3 + 2 * grade + Number(timing < 0);
      const savedWins = !!best && best.priority > priority;
      const triggered = !!(actions & (1 << row));
      if (triggered && !savedWins) best = { grade, timing, priority };
      if (timing < 0) return null;
      if (best?.grade === 4) return best;
      if (delta >= late) return { grade: 0, timing: null };
      return savedWins || triggered ? best : null;
    },
    grade(delta: number, arcade = false): number {
      const d = delta - offset - shift;
      if (d < 0) {
        if (d >= at(9)) return 4;
        if (d >= at(8)) return 3;
        if (d >= at(7)) return 2;
        return d >= at(6) ? 1 : 0;
      }
      const within = (limit: number) => (arcade ? d < limit : d <= limit);
      if (within(at(14))) return 4;
      if (within(at(13))) return 3;
      if (within(at(12))) return 2;
      return within(at(11)) ? 1 : 0;
    },
  };
}

const settles = (checker: AirChecker, delta: number) =>
  !(checker.early >= delta) && !(checker.centre > delta);

/** Frames since the last lane of `mask` was let go; 0 while one is held. */
function sinceLetGo(state: Step, mask: number): number {
  if (state.auto || state.held & mask) return 0;
  let last = -Infinity;
  for (let lane = 0; lane < LANE_COUNT; lane++)
    if (mask & (1 << lane)) last = Math.max(last, state.released[lane]);
  return state.now - last;
}

const sinceAirLetGo = (state: Step) =>
  state.auto || state.airHeld ? 0 : state.now - state.airReleased;

/** Grade of a hold check `since` frames after the hold was let go, by its KEEP thresholds. */
function keepGrade(config: DataView, thresholds: number, since: number): number {
  const at = (index: number) => config.getFloat32(thresholds + 4 * index, true);
  if (since <= at(0)) return 4;
  if (since <= at(1)) return 3;
  if (since <= at(2)) return 2;
  return since <= at(3) ? 1 : 0;
}

/** The first touch with an unused lane on `mask` inside a ground checker; those lanes are used up. */
function takePress(
  state: Step,
  mask: number,
  checker: ReturnType<typeof groundChecker>,
  noteFrames: number,
  priority = true,
): { delta: number; frames: number; lanes: number } | null {
  for (const press of state.presses) {
    const delta = f(press.frames - noteFrames);
    let accepted = checker.accepting(
      press.lanes & mask & (state.arcade ? ALL_LANES : ~press.used),
      delta,
    );
    if (state.arcade && priority)
      for (let bits = accepted; bits; bits &= bits - 1) {
        const bit = bits & -bits;
        if (state.owners[31 - Math.clz32(bit)] !== Math.trunc(noteFrames)) accepted &= ~bit;
      }
    if (!accepted) continue;
    if (!state.arcade) press.used |= accepted;
    return { delta, frames: press.frames, lanes: accepted };
  }
  return null;
}

/** The first AIR action inside an AIR checker and its latest delta; actions are not used up. */
function airAction(state: Step, checker: AirChecker, late: number, noteFrames: number) {
  for (const frames of state.airActions) {
    const delta = f(frames - noteFrames);
    if (checker.early < delta && !(delta > late)) return { delta };
  }
  return null;
}

/** Lanes a SLIDE's band covers at a frame time, with slack on either side. */
function slidePath(record: DataView, joints: readonly DataView[]): (now: number) => number {
  const points = [
    {
      time: f(record.getFloat32(8, true) * K),
      lane: record.getInt32(0x28, true),
      width: widthOf(record.getInt32(0x2c, true)),
    },
    ...joints.map((joint) => ({
      time: f(joint.getFloat32(8, true) * K),
      lane: joint.getInt32(0x10, true),
      width: widthOf(joint.getInt32(0x20, true)),
    })),
  ];
  return (now) => {
    let k = 0;
    while (k < points.length - 2 && now >= points[k + 1].time) k++;
    const a = points[k];
    const b = points[Math.min(k + 1, points.length - 1)];
    const span = b.time - a.time;
    const t = span > 0 ? Math.max(0, Math.min(1, (now - a.time) / span)) : 1;
    const left = a.lane + (b.lane - a.lane) * t;
    const right = a.lane + a.width + (b.lane + b.width - a.lane - a.width) * t;
    const first = Math.floor(left) - SLIDE_SLACK_LANES;
    const end = Math.ceil(right) + SLIDE_SLACK_LANES;
    return laneMask(first, end - first);
  };
}

/** Plays one chart with the player's controls, a grid step at a time. */
export function createPlayer(input: {
  score: NoteScore;
  /** The chart's note objects in live-list order. */
  objects: readonly NoteObject[];
  context: LifecycleContext;
  output: PlayerOutput;
  options: PlayerOptions;
}) {
  const { score, objects, context, output, options } = input;
  const { config, offset, threshold, difficulty } = context;
  const keyBeams = output.keyBeam && createKeyBeams(output.keyBeam);

  function groundHit(s: Step, mask: number, grade: number, mine = false) {
    if (s.auto) return;
    keyBeams?.hit(mask, grade);
    s.lights?.hit(mask, mine);
  }

  /** Shared writers of one object: its judgments, sounds and the end of its life. */
  const writers = (object: NoteObject, state: () => Step) => {
    const record = object.record;
    return {
      judge(
        judgePhase: JudgePhase,
        grade: number,
        timing: number | null,
        part: 1 | 2 = 1,
        element?: true,
      ) {
        const { step, auto } = state();
        output.judge({
          object,
          step,
          part,
          judgePhase,
          ...(element && { element }),
          grade: auto ? 4 : grade,
          timing: auto ? null : timing,
          skipped: auto,
        });
      },
      sound(sound: Sound) {
        output.sound(object, sound, state().auto);
      },
      model(step: number, part: number, shown: 0 | 1) {
        output.model(record, part, step, shown);
      },
      band(kind: BandKind, step: number, value: number) {
        output.band(kind, record, step, value);
      },
    };
  };

  function nominate(
    mask: number,
    checker: ReturnType<typeof groundChecker>,
    frames: number,
    s: Step,
  ) {
    const time = Math.trunc(frames);
    if (time < 0) return;
    for (let bits = checker.accepting(mask, f(s.now - frames)); bits; bits &= bits - 1) {
      const lane = 31 - Math.clz32(bits & -bits);
      s.owners[lane] = Math.min(s.owners[lane], time);
    }
  }

  let current: Step;
  const state = () => current;

  /**
   * The slash of a FLICK: a later touch, by FLICK.SLASH timing, on a lane other than the first
   * touch's, within the FLICK or within its WIDTH_MOVE beside it. It takes no lane from other notes.
   */
  function flickSlash(record: DataView) {
    const lane = record.getInt32(0x28, true);
    const width = widthOf(record.getInt32(0x2c, true));
    const reach = Math.ceil(config.getFloat32(CONFIG_FLICK_MOVES + 4 * (LANE_COUNT - width), true));
    const area = laneMask(lane - reach, width + 2 * reach);
    const base = CONFIG_WINDOWS + CONFIG_ROW_BYTES * FLICK_SLASH_ROW;
    const checker = {
      early: f(config.getFloat32(base, true) + offset),
      late: f(config.getFloat32(base + 24, true) + offset),
    };
    return {
      checker,
      find(s: Step, touch: { frames: number; lanes: number }, noteFrames: number) {
        for (const press of s.presses) {
          if (press.frames < touch.frames || !(press.lanes & area & ~touch.lanes)) continue;
          const delta = f(press.frames - noteFrames);
          if (checker.early > delta || !(delta < checker.late)) continue;
          const timing = delta - offset;
          return { grade: groundGrade(config, FLICK_SLASH_ROW, timing), timing };
        }
        return null;
      },
    };
  }

  function tapLike(object: NoteObject, record: DataView, flick: boolean): Live {
    const w = writers(object, state);
    const row = flick
      ? FLICK_ROW
      : (object.className === "CharaTapNote" ? 2 : 0) + Number(difficulty >= 2);
    const noteFrames = f(record.getFloat32(8, true) * K);
    const checker = groundChecker(record, config, row, offset);
    const mask = recordMask(record);
    const motion =
      flick && options.surface
        ? createSlash(record.getInt32(0x28, true), widthOf(record.getInt32(0x2c, true)), config)
        : null;
    const slash = flick ? flickSlash(record) : null;
    let touch: { frames: number; lanes: number; grade: number; timing: number } | null = null;
    const mine = object.className === "MineNote";
    const delay = config.getFloat32(CONFIG_MINE_DELAY, true);
    let mineContact = 0;
    const live: Live = {
      object,
      done: false,
      nominate(s) {
        if (!mine && !touch) nominate(mask, checker, noteFrames, s);
      },
      build(step) {
        if (mine) w.model(step, GROUND_MAIN_PART, 1);
        else if (!flick) w.model(step, GROUND_MAIN_PART, 0);
      },
      tick(s) {
        const delta = f(s.now - noteFrames);
        let grade = -1;
        let timing: number | null = null;
        if (mine) {
          if (s.arcade && !s.auto) {
            const time = f(delta - delay - offset);
            const begin = config.getFloat32(0x724, true),
              end = config.getFloat32(0x728, true);
            const limit = config.getFloat32(0x72c, true);
            if (s.held & mask)
              mineContact += Math.max(0, Math.min(time, end) - Math.max(time - 0.5, begin));
            if (time >= 0) {
              if (mineContact >= limit) grade = 0;
              else if (mineContact + Math.max(end - time, 0) < limit) grade = 4;
            }
          } else {
            const passing = f(f(f(delta - delay) - offset) - threshold);
            if (f(passing + offset) >= 0) grade = s.auto || !(s.held & mask) ? 4 : 0;
          }
        } else if (s.auto) {
          const commits = flick
            ? delta >= threshold
            : !(checker.early > delta) && (delta >= threshold || !(delta < checker.late));
          if (commits) grade = 4;
        } else if (slash && (motion || options.flickNeedsMotion || touch)) {
          if (!touch) {
            const press = takePress(s, mask, checker, noteFrames, false);
            if (press) {
              const timing = press.delta - offset;
              touch = {
                frames: press.frames,
                lanes: press.lanes,
                grade: groundGrade(config, row, timing, s.arcade),
                timing,
              };
            } else if (!(delta < checker.late)) grade = 0;
          }
          if (touch) {
            const moved =
              motion &&
              delta >= slash.checker.early &&
              delta < slash.checker.late &&
              motion(s.front, s.rear);
            const result = motion
              ? moved
                ? {
                    grade: groundGrade(config, FLICK_SLASH_ROW, delta - offset, true),
                    timing: delta - offset,
                  }
                : null
              : slash.find(s, touch, noteFrames);
            if (result) {
              const worse = result.grade < touch.grade;
              grade = motion
                ? touch.grade + result.grade >= 5
                  ? 4
                  : 2
                : worse
                  ? result.grade
                  : touch.grade;
              timing = motion
                ? grade === 4
                  ? null
                  : touch.timing
                : worse
                  ? result.timing
                  : touch.timing;
            } else if (!(delta < slash.checker.late)) {
              grade = 1;
              timing = slash.checker.late - offset;
            }
          }
        } else {
          const press = takePress(s, mask, checker, noteFrames);
          if (press) {
            timing = press.delta - offset;
            grade = groundGrade(config, row, timing, s.arcade);
          } else if (!(delta < checker.late)) grade = 0;
        }
        if (grade < 0) {
          w.model(s.step, GROUND_MAIN_PART, 1);
          return;
        }
        w.judge(0, grade, timing);
        if (mine ? grade === 0 : grade > 0) groundHit(s, mask, grade, mine);
        if (grade > 0) {
          if (playsExtra(record) && !mine) w.sound(startSound(SOUND.extra));
          w.sound(startSound(SOUND.tap));
          if (flick) w.sound(startSound(SOUND.flickSecond));
        }
        w.model(s.step, GROUND_MAIN_PART, 0);
        live.done = true;
      },
    };
    return live;
  }

  /** Head of a HOLD or SLIDE: a touch, or a lane already held when its time comes. */
  function longHead(
    s: Step,
    row: number,
    checker: ReturnType<typeof groundChecker>,
    mask: number,
    noteFrames: number,
  ): { grade: number; timing: number | null } | null {
    const delta = f(s.now - noteFrames);
    if (s.auto)
      return !(checker.early > delta) && (delta >= threshold || !(delta < checker.late))
        ? { grade: 4, timing: null }
        : null;
    const press = takePress(s, mask, checker, noteFrames);
    if (press) {
      const timing = press.delta - offset;
      return { grade: groundGrade(config, row, timing, s.arcade), timing };
    }
    if (!s.arcade && delta >= offset && checker.accepting(s.held & mask, delta)) {
      const timing = delta - offset;
      return { grade: groundGrade(config, row, timing, s.arcade), timing };
    }
    return !(delta < checker.late) ? { grade: 0, timing: null } : null;
  }

  function hold(object: NoteObject, record: DataView, ticks: readonly DataView[]): Live {
    const w = writers(object, state);
    const row = longHeadRow(record, difficulty);
    const noteFrames = f(record.getFloat32(8, true) * K);
    const head = groundChecker(record, config, row, offset);
    const tailStart = f(noteFrames + offset);
    const keep = createKeep(tailStart);
    const contacts = createContactGate();
    const mask = recordMask(record);
    const pending = [...ticks];
    const tailSound = holdTailStep(
      { object, removal: Infinity, judges: [], models: [] },
      record,
      context,
    );
    let headState = 0;
    let tailState = 0;
    const live: Live = {
      object,
      done: false,
      build(step) {
        w.model(step, GROUND_MAIN_PART, 0);
        w.model(step, GROUND_TAIL_PART, 0);
      },
      nominate(s) {
        if (headState !== GROUND_DONE) nominate(mask, head, noteFrames, s);
      },
      tick(s) {
        const { step: k, now } = s;
        if (headState !== GROUND_DONE) {
          const result = longHead(s, row, head, mask, noteFrames);
          if (result) {
            w.judge(0, result.grade, result.timing);
            if (result.grade > 0) {
              groundHit(s, mask, result.grade);
              if (playsExtra(record)) w.sound(startSound(SOUND.extra));
              w.sound({ kind: "loop", pool: LOOP.hold.pool, cue: LOOP.hold.cue });
            }
            headState = GROUND_DONE;
          } else headState = 0;
        }
        if (tailState !== GROUND_DONE) {
          const contact =
            s.arcade &&
            now >= noteFrames + head.early &&
            contacts(s, mask, now >= tailStart ? mask : 0);
          if (head.early > now) tailState = 0;
          else if (tailStart <= now) {
            s.hiddenBeams |= mask;
            const grade = keepGrade(
              config,
              CONFIG_HOLD_THRESHOLDS,
              s.arcade && !s.auto ? keep.sample(now, contact) : sinceLetGo(s, mask),
            );
            if (grade === 4) s.sustainedLights |= mask;
            const held = grade >= 3;
            const tick = pending[0];
            if (tick && !(now < f(f(tick.getFloat32(8, true) * TICK_FRAMES_PER_MS) + offset))) {
              if (tick.getUint8(0x14))
                w.judge(tick.getInt32(0x10, true) === 1 ? 2 : 1, grade, null);
              keep.commit();
              pending.shift();
            }
            if (k === tailSound && held) {
              w.sound(startSound(SOUND.holdTail));
              w.sound({ kind: "stop" });
            }
            tailState = pending.length ? (held ? 2 : 3) : GROUND_DONE;
          } else tailState = 0;
        }
        if (headState === GROUND_DONE && tailState === GROUND_DONE) {
          w.model(k, GROUND_MAIN_PART, 0);
          w.model(k, GROUND_TAIL_PART, 0);
          w.band("band", k, 3);
          w.sound({ kind: "stop" });
          live.done = true;
          return;
        }
        w.model(k, GROUND_MAIN_PART, headState !== GROUND_DONE ? 1 : 0);
        w.model(k, GROUND_TAIL_PART, tailState !== GROUND_DONE ? 1 : 0);
        w.band(
          "band",
          k,
          tailState === 2 ? 1 : headState === GROUND_DONE ? (tailState === 3 ? 1 : 0) + 1 : 0,
        );
      },
    };
    return live;
  }

  function slide(
    object: NoteObject,
    record: DataView,
    ticks: readonly DataView[],
    joints: readonly DataView[],
  ): Live {
    if (!joints.length) throw new RangeError(`SLIDE record ${object.record} has no joints`);
    const w = writers(object, state);
    const row = longHeadRow(record, difficulty);
    const noteFrames = f(record.getFloat32(8, true) * K);
    const head = groundChecker(record, config, row, offset);
    const tailStart = f(noteFrames + offset);
    const keep = createKeep(tailStart);
    const contacts = createContactGate();
    const firstWidth = record.getInt32(0x2c, true) + 1;
    const gate = f(
      f(
        config.getFloat32(
          CONFIG_SLIDE_WINDOWS + CONFIG_SLIDE_ROW_BYTES * (LANE_COUNT - firstWidth) + 4,
          true,
        ) + offset,
      ) + noteFrames,
    );
    const ends = joints.map((joint) => f(f(joint.getFloat32(8, true) * K) + offset));
    const modelled = joints.map(
      (joint, k) => k === joints.length - 1 || joint.getUint8(0x14) !== 0,
    );
    const marks = joints.map(() => UNMARKED);
    const path = slidePath(record, joints);
    let areas = options.surface ? createSlideAreas(record, joints, config, offset, K) : null;
    const mask = recordMask(record);
    const tails = slideTailSteps(
      { object, removal: Infinity, judges: [], models: [] },
      record,
      joints,
      context,
    );
    const pending = [...ticks];
    let headState = 0;
    let tailState = 0;
    const live: Live = {
      object,
      done: false,
      build(step) {
        w.model(step, GROUND_MAIN_PART, 0);
      },
      nominate(s) {
        if (headState !== GROUND_DONE) nominate(mask, head, noteFrames, s);
      },
      tick(s) {
        const { step: k, now } = s;
        if (headState !== GROUND_DONE) {
          const result = longHead(s, row, head, mask, noteFrames);
          if (result) {
            w.judge(0, result.grade, result.timing);
            if (result.grade > 0) {
              groundHit(s, mask, result.grade);
              if (playsExtra(record)) w.sound(startSound(SOUND.extra));
              w.sound({ kind: "loop", pool: LOOP.slide.pool, cue: LOOP.slide.cue });
            }
            headState = GROUND_DONE;
          } else headState = 0;
        }
        if (tailState !== GROUND_DONE) {
          if (keyBeams && !s.auto) areas ??= createSlideAreas(record, joints, config, offset, K);
          const area = areas?.(now);
          if (area && now >= gate) s.hiddenBeams |= area.active;
          const contact = s.arcade && !!area && contacts(s, area.trigger, area.active);
          if (gate > now || now < tailStart) tailState = 0;
          else {
            const grade = keepGrade(
              config,
              CONFIG_HOLD_THRESHOLDS,
              s.arcade && !s.auto ? keep.sample(now, contact) : sinceLetGo(s, path(now)),
            );
            if (s.lights && grade === 4 && area?.active) {
              // SlideNote lights the whole span between its outermost active lanes.
              const first = 31 - Math.clz32(area.active & -area.active);
              const last = 31 - Math.clz32(area.active);
              s.sustainedLights |= laneMask(first, last - first + 1);
            }
            const held = grade >= 3;
            let last = 0;
            const tick = pending[0];
            if (tick && !(now < f(f(tick.getFloat32(8, true) * TICK_FRAMES_PER_MS) + offset))) {
              last = grade;
              if (tick.getUint8(0x14)) {
                const kind = tick.getInt32(0x10, true);
                w.judge(kind === 4 ? 2 : 1, last, null);
              }
              keep.commit();
              pending.shift();
            }
            marks.forEach((mark, j) => {
              if (mark < SLIDE_JOINT_RESULTS || ends[j] > now) return;
              marks[j] = modelled[j] ? last : GROUND_DONE;
            });
            for (const tail of tails)
              if (tail.step === k && held) {
                w.sound(startSound(SOUND.slideTail));
                if (tail.last) w.sound({ kind: "stop" });
              }
            tailState = pending.length ? (held ? 2 : 3) : GROUND_DONE;
          }
        }
        if (headState === GROUND_DONE && tailState === GROUND_DONE) {
          w.model(k, GROUND_MAIN_PART, 0);
          modelled.forEach((has, j) => {
            if (has) w.model(k, slideJointPart(j), 0);
          });
          w.band("slide", k, 3);
          w.sound({ kind: "stop" });
          live.done = true;
          return;
        }
        w.model(k, GROUND_MAIN_PART, headState !== GROUND_DONE ? 1 : 0);
        modelled.forEach((has, j) => {
          if (has) w.model(k, slideJointPart(j), marks[j] < SLIDE_JOINT_RESULTS ? 0 : 1);
        });
        w.band(
          "slide",
          k,
          tailState === 2 ? 1 : headState === GROUND_DONE ? (tailState === 3 ? 1 : 0) + 1 : 0,
        );
      },
    };
    return live;
  }

  /** The frame time an attached AIR long note is judged at: its parent's end or head. */
  function airParentFrames(record: DataView, joints: readonly DataView[]): number {
    const type = record.getInt32(0x10, true);
    if (type === 2) {
      const last = joints[joints.length - 1];
      if (!last) throw new RangeError("An AIR long note on a SLIDE needs the SLIDE's joints");
      return f(last.getFloat32(8, true) * K);
    }
    if (type === 1) return f(record.getFloat32(0x38, true) * K);
    if (type === 0 || type === 4 || type === 6 || type === 11)
      return f(record.getFloat32(8, true) * K);
    throw new RangeError(`AIR long note on a parent of type ${type}`);
  }

  /** Head of an AIR or AIR long note: an AIR action inside its window, or a MISS past it. */
  function airHead(s: Step, windows: ReturnType<typeof airWindows>, noteFrames: number) {
    const delta = f(s.now - noteFrames);
    if (s.auto) return settles(windows.checker, delta) ? { grade: 4, timing: null } : null;
    if (s.arcade) {
      if (delta > windows.checker.early) s.airInUse = true;
      return windows.manual(delta, s.actions);
    }
    const action = airAction(s, windows.checker, windows.late, noteFrames);
    if (action)
      return { grade: windows.grade(action.delta), timing: action.delta - windows.centre };
    return delta > windows.late ? { grade: 0, timing: null } : null;
  }

  function air(object: NoteObject, record: DataView, joints: readonly DataView[]): Live {
    const w = writers(object, state);
    const noteFrames = f(airTimeMs(record, joints) * K);
    const direction = record.getInt32(0x90, true);
    const windows = airWindows(config, airRow(record.getInt32(0x10, true), direction), offset);
    const live: Live = {
      object,
      done: false,
      build(step) {
        w.model(step, PLAIN_AIR_PART, 0);
      },
      tick(s) {
        const result = airHead(s, windows, noteFrames);
        if (!result) {
          w.model(s.step, PLAIN_AIR_PART, 1);
          return;
        }
        w.judge(0, result.grade, result.timing, 2);
        if (result.grade > 0)
          w.sound(startSound(direction < AIR_UP_DIRECTIONS ? SOUND.airUp : SOUND.airDown));
        w.model(s.step, PLAIN_AIR_PART, 0);
        live.done = true;
      },
    };
    return live;
  }

  /** The hold of an AIR HOLD or AIR SLIDE: its ticks, elements and band tint while it lasts. */
  function airLong(
    object: NoteObject,
    record: DataView,
    vectors: {
      ticks: readonly DataView[];
      elements: readonly DataView[];
      joints: readonly DataView[];
    },
    slideKind: boolean,
  ): Live {
    const w = writers(object, state);
    const type = record.getInt32(0x10, true);
    const noteFrames = airParentFrames(record, vectors.joints);
    const windows = airWindows(config, airRow(type, record.getInt32(0x90, true)), offset);
    const head = windows.checker;
    const centre = config.getFloat32(CONFIG_AIR_HOLD_CENTRE, true);
    const holdStart = slideKind ? noteFrames : f(noteFrames + offset);
    const keep = createKeep(holdStart);
    const elementChecker = airChecker(config, AIR_ELEMENT_ROW, offset);
    const elementIndices = slideKind
      ? vectors.elements.flatMap((joint, k) => (joint.getUint8(0x14) ? [k] : []))
      : vectors.elements.map((_joint, k) => k);
    const elementTimes = elementIndices.map((k) => f(vectors.elements[k].getFloat32(8, true) * K));
    if (!slideKind && record.getUint8(0x24) !== 0) {
      elementIndices.push(elementIndices.length);
      elementTimes.push(f(record.getFloat32(0x20, true) * K));
    }
    const lastElement = vectors.elements.length - 1;
    const judged = elementTimes.map(() => false);
    const elementPart = (element: number, model: number) => element * 2 + model;
    const parts = slideKind
      ? [
          AIR_SLIDE_HEAD_PART,
          ...elementIndices.flatMap((k) => [elementPart(k, 0), elementPart(k, 1)]),
        ]
      : [
          AIR_HOLD_PARTS.body,
          AIR_HOLD_PARTS.plain,
          AIR_HOLD_PARTS.bar,
          AIR_HOLD_PARTS.cap,
          ...elementTimes.flatMap((_t, k) => [elementPart(k, 0), elementPart(k, 1)]),
        ];
    const elements = options.surface
      ? elementTimes.map(() => airWindows(config, AIR_ELEMENT_ROW, offset))
      : null;
    let airEligible = false;
    const pending = [...vectors.ticks];
    let element = 0;
    let headState = 0;
    let holdState = 0;
    const live: Live = {
      object,
      done: false,
      build(step) {
        for (const part of parts) w.model(step, part, 0);
        if (!slideKind) {
          w.band("airband", step, 0);
          w.band("airband", step + 1, 3);
        }
      },
      tick(s) {
        const { step: k, now } = s;
        if (headState !== AIR_DONE) {
          const result = airHead(s, windows, noteFrames);
          if (result) {
            w.judge(0, result.grade, result.timing, 2);
            if (result.grade > 0) {
              w.sound(startSound(SOUND.airHead));
              w.sound({ kind: "loop", pool: LOOP.air.pool, cue: LOOP.air.cue });
            }
            headState = AIR_DONE;
          }
        }
        if (holdState !== AIR_DONE) {
          const t = f(now - centre);
          if (s.arcade && t >= holdStart + head.early) {
            airEligible ||= !s.airHeld || !!(s.actions & (1 << AIR_ELEMENT_ROW));
            s.airInUse = true;
          }
          if (f(holdStart + head.early) > t || holdStart > t) holdState = 0;
          else {
            const grade = keepGrade(
              config,
              CONFIG_AIR_HOLD_THRESHOLDS,
              s.arcade && !s.auto ? keep.sample(t, airEligible && s.airHeld) : sinceAirLetGo(s),
            );
            holdState = grade >= 3 ? 3 : 4;
            const tick = pending[0];
            if (tick && t >= f(f(tick.getFloat32(8, true) * K) + offset)) {
              if (tick.getUint8(0x14)) w.judge(1, grade, null, 2);
              keep.commit();
              pending.shift();
            }
            const delta = f(now - elementTimes[element]);
            const action = elements && !s.auto ? elements[element]?.manual(delta, s.actions) : null;
            if (
              element < elementTimes.length &&
              (elements && !s.auto ? !!action : settles(elementChecker, delta))
            ) {
              const final = slideKind
                ? elementIndices[element] === lastElement
                : element === elementTimes.length - 1;
              const elementGrade = action?.grade ?? grade;
              w.judge(final ? 2 : 1, elementGrade, action?.timing ?? null, 2, true);
              if (elementGrade > 0) w.sound(startSound(SOUND.airElement));
              judged[element++] = true;
            }
            if (!pending.length && element === elementTimes.length) {
              holdState = AIR_DONE;
              w.sound({ kind: "stop" });
            }
          }
        }
        if (headState === AIR_DONE && holdState === AIR_DONE) {
          for (const part of parts) w.model(k, part, 0);
          w.band("airband", k, 3);
          live.done = true;
          return;
        }
        if (slideKind) {
          w.model(k, AIR_SLIDE_HEAD_PART, headState !== AIR_DONE ? 1 : 0);
          elementIndices.forEach((e, i) => {
            w.model(k, elementPart(e, 0), judged[i] ? 0 : 1);
            w.model(k, elementPart(e, 1), judged[i] ? 0 : 1);
          });
        } else {
          w.model(k, AIR_HOLD_PARTS.plain, 1);
          w.model(k, AIR_HOLD_PARTS.body, headState !== AIR_DONE ? 1 : 0);
          judged.forEach((done, e) => {
            w.model(k, elementPart(e, 0), done ? 0 : 1);
            w.model(k, elementPart(e, 1), done ? 0 : 1);
          });
          w.model(k, AIR_HOLD_PARTS.cap, 1);
          w.model(k, AIR_HOLD_PARTS.bar, 1);
        }
        w.band("airband", k, holdState === 3 ? 1 : holdState === 4 ? 2 : 0);
      },
    };
    return live;
  }

  function ladder(object: NoteObject): Live {
    const w = writers(object, state);
    const vectors = score.ladders?.get(object.record);
    const last = vectors?.joints[vectors.joints.length - 1];
    if (!vectors || !last) throw new RangeError(`AIR LADDER record ${object.record} has no joints`);
    const endFrames = f(last.getFloat32(8, true) * K);
    const times = vectors.samples.map((sample) => f(sample.getFloat32(8, true) * K));
    const windows = airWindows(config, LADDER_ROW, offset);
    const samples = options.surface
      ? times.map(() => airWindows(config, LADDER_ROW, offset))
      : null;
    const judged = times.map(() => false);
    let remaining = times.length;
    const live: Live = {
      object,
      done: false,
      build(step) {
        times.forEach((_t, part) => w.model(step, part, 0));
      },
      tick(s) {
        const { step: k, now } = s;
        times.forEach((time, e) => {
          if (judged[e]) return;
          const delta = f(now - time);
          // The hand was up at some point since the element's window opened.
          const raised = s.auto || s.airHeld || s.airReleased > f(time + windows.checker.early);
          let grade = -1;
          if (samples && !s.auto) {
            if (delta > windows.checker.early) s.airInUse = true;
            grade = samples[e].manual(delta, s.actions)?.grade ?? -1;
          } else if (raised && settles(windows.checker, delta)) grade = 4;
          else if (delta > windows.late) grade = 0;
          if (grade < 0) return;
          judged[e] = true;
          remaining--;
          w.judge(1, grade, null);
          if (grade > 0) w.sound(startSound(SOUND.ladderElement));
        });
        if (!remaining && !(endFrames > now)) {
          times.forEach((_t, part) => w.model(k, part, 0));
          w.band("airband", k, 3);
          live.done = true;
          return;
        }
        times.forEach((_t, part) => w.model(k, part, judged[part] ? 0 : 1));
        w.band("airband", k, 0);
      },
    };
    return live;
  }

  function build(object: NoteObject): Live {
    const index = object.record;
    const record = score.records[index];
    const joints = score.slideJoints?.get(index) ?? [];
    switch (object.className) {
      case "TapNote":
      case "CharaTapNote":
      case "MineNote":
        return tapLike(object, record, false);
      case "FlickNote":
        return tapLike(object, record, true);
      case "HoldNote":
        return hold(object, record, score.ticks?.get(index) ?? []);
      case "SlideNote":
        return slide(object, record, score.ticks?.get(index) ?? [], joints);
      case "AirNote":
        return air(object, record, joints);
      case "AirHoldNote":
        return airLong(
          object,
          record,
          {
            ticks: score.secondaryTicks?.get(index) ?? [],
            elements: score.airHolds?.get(index) ?? [],
            joints,
          },
          false,
        );
      case "AirSlideNote":
        return airLong(
          object,
          record,
          {
            ticks: score.secondaryTicks?.get(index) ?? [],
            elements: score.airSlides?.get(index) ?? [],
            joints,
          },
          true,
        );
      case "AirLadderNote":
        return ladder(object);
      default:
        throw new RangeError(
          `Record ${index} builds a ${object.className}, which has no lifecycle`,
        );
    }
  }

  type DeviceInput = SurfaceSample & { frames: number };
  const queue: (PlayInput | DeviceInput)[] = [];
  const arcade = !!options.surface;
  let surface = options.surface ?? { touch: 0, beams: 0 };
  let [front, rear] = laneRows(surface.touch);
  let sensor = createAirSensor(config);
  const owners = new Int32Array(LANE_COUNT);
  let lives: Live[] = [];
  let next = 0;
  let step = -1;
  let held = 0;
  let airHeld = false;
  const released = new Float64Array(LANE_COUNT).fill(-Infinity);
  let airReleased = -Infinity;

  const run = (k: number, auto: boolean) => {
    const now = stepFrames(k);
    const presses: Press[] = [];
    const airActions: number[] = [];
    let taken = 0;
    while (taken < queue.length && (auto || queue[taken].frames <= now)) {
      const event = queue[taken++];
      if (auto) continue;
      if ("touch" in event) {
        surface = event;
        continue;
      }
      if (event.air) {
        if (event.down) {
          airHeld = true;
          airActions.push(event.frames);
        } else {
          airHeld = false;
          airReleased = event.frames;
        }
        continue;
      }
      const lanes = event.lanes & ALL_LANES;
      if (event.down) {
        held |= lanes;
        presses.push({ frames: event.frames, lanes, used: 0 });
        continue;
      }
      held &= ~lanes;
      for (let lane = 0; lane < LANE_COUNT; lane++)
        if (lanes & (1 << lane)) released[lane] = event.frames;
    }
    queue.splice(0, taken);
    const previousFront = current?.usedFront ?? 0,
      previousRear = current?.usedRear ?? 0;
    let actions = 0;
    if (arcade && !auto) {
      const rows = laneRows(surface.touch);
      const pressed = (rows[0] & ~front) | (rows[1] & ~rear);
      [front, rear] = rows;
      held = front | rear;
      if (pressed) presses.push({ frames: now, lanes: pressed, used: 0 });
      actions = sensor(surface, current?.airInUse ?? false);
      if (airHeld && !(actions & 128)) airReleased = now;
      airHeld = !!(actions & 128);
    }
    current = {
      arcade,
      lights: arcade && !auto ? output.sliderLights : undefined,
      sustainedLights: 0,
      hiddenBeams: 0,
      owners,
      front,
      rear,
      previousFront,
      previousRear,
      usedFront: 0,
      usedRear: 0,
      airInUse: false,
      actions,
      step: k,
      now,
      auto,
      presses,
      airActions,
      held,
      airHeld,
      released,
      airReleased,
    };
    if (arcade && presses.length) {
      owners.fill(0x7fffffff);
      for (const live of lives) if (k >= live.object.spawn + ACTIVE_AFTER) live.nominate?.(current);
    }
    for (const live of lives) if (k >= live.object.spawn + ACTIVE_AFTER) live.tick(current);
    lives = lives.filter((live) => !live.done);
    while (next < objects.length && objects[next].spawn <= k) {
      const live = build(objects[next++]);
      output.spawn?.(live.object);
      live.build(k);
      lives.push(live);
    }
    current.lights?.step(k, held, current.sustainedLights);
    if (!auto) keyBeams?.update(k, held, current.hiddenBeams);
    output.endStep(k);
  };

  return {
    /** The last grid step played, or -1 before the first. */
    get step() {
      return step;
    },
    /** Whether every note has been played to its end. */
    get finished() {
      return next === objects.length && lives.length === 0;
    },
    /** Queues a change of the controls; changes must come in time order. */
    seedSurface(sample: SurfaceSample) {
      surface = sample;
      [front, rear] = laneRows(sample.touch);
      sensor = createAirSensor(config);
      queue.length = 0;
    },
    push(change: PlayInput | DeviceInput) {
      queue.push(change);
    },
    /**
     * Plays every step up to `target`. Steps before `skipUntil` are played as the automatic play
     * would, and their results are marked skipped.
     */
    advance(target: number, skipUntil = -1) {
      for (let k = step + 1; k <= target; k++) run(k, k < skipUntil);
      step = Math.max(step, target);
    },
    finishKeyBeams() {
      keyBeams?.update(step, 0, 0);
    },
    /** Lanes held and whether the AIR sensor is up, as of the last step played. */
    get controls() {
      return { held, airHeld };
    },
  };
}

export type Player = ReturnType<typeof createPlayer>;
