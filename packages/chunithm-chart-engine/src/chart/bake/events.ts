/** Judge phase: 0 head/single, 1 long-note tick, 2 tail/terminal result. */
export type JudgePhase = 0 | 1 | 2;

/** Result owner: 0 unattributed, 1 primary note, 2 attached AIR component. */
export type JudgePart = 0 | 1 | 2;

/** Record index used when an event has no originating bound note. */
export const NO_NOTE = 0xffffffff;

/** `band` event state meaning the HOLD no longer produces a band. */
export const BAND_ENDED = 3;

/** Part code of an ordinary AIR marker in `motion` events. */
export const PLAIN_AIR_PART = 0xfffa;

/** Part code of a MINE model in `motion` events. */
export const MINE_PART = 0xfff9;

/**
 * Part code, in `airmodel` events, of a ground note's main model: the TAP, CHR, FLICK or MINE model,
 * or the head of a HOLD or a SLIDE.
 */
export const GROUND_MAIN_PART = 0xfff8;

/** Part code of a HOLD tail model in `airmodel` events. */
export const GROUND_TAIL_PART = 0xfff7;

const SLIDE_JOINT_PARTS = 0xe000;
const SLIDE_JOINT_LIMIT = 0x1000;

/** Whether a part code names a ground model: a main model, a HOLD tail or a SLIDE joint. */
export function isGroundPart(part: number): boolean {
  return (
    part === GROUND_MAIN_PART ||
    part === GROUND_TAIL_PART ||
    (part >= SLIDE_JOINT_PARTS && part < SLIDE_JOINT_PARTS + SLIDE_JOINT_LIMIT)
  );
}

/** Part code of SLIDE joint `k` in `airmodel` events; the codes stay clear of every other part. */
export function slideJointPart(k: number): number {
  if (!Number.isInteger(k) || k < 0 || k >= SLIDE_JOINT_LIMIT)
    throw new RangeError(`SLIDE joint ${k} is outside 0..${SLIDE_JOINT_LIMIT - 1}`);
  return SLIDE_JOINT_PARTS + k;
}

export type BakeEvent =
  | {
      kind: "judge";
      /** Seconds of audio time at the 120Hz step that committed the result. */
      time: number;
      /** Bound record index. */
      note: number;
      /** Native grade 0..4. */
      result: number;
      phase: JudgePhase;
      /** Absent only in event lists captured without component attribution. */
      part?: JudgePart;
    }
  | {
      kind: "score";
      time: number;
      score: number;
      combo: number;
      gauge: number;
      /** justice critical, justice, attack, miss. */
      counts: [number, number, number, number];
    }
  | {
      kind: "effect";
      time: number;
      resource: number;
      /** Bound record index, or `NO_NOTE`. */
      note: number;
      lane: number;
      width: number;
      /** Effect node random state when the instance tree is created. */
      rngLow: number;
      rngHigh: number;
      /** Particle node random state when the instance tree is created. */
      crt: number;
    }
  | {
      kind: "band";
      time: number;
      /** Bound record index of a HOLD. */
      note: number;
      /**
       * Band state from the HOLD's head/tail judgement: 0 untouched, 1 and 2 as the band writer
       * defines them, or `BAND_ENDED`. Only changes are recorded; a record's state before its first
       * event is 0.
       */
      state: number;
    }
  | { kind: "slide"; time: number; note: number; mode: number }
  | { kind: "airband"; time: number; note: number; mode: number }
  | { kind: "motion"; time: number; note: number; part: number; model: number; frame: number }
  | { kind: "airmodel"; time: number; note: number; part: number; shown: number }
  | { kind: "cue"; time: number; cue: number; channel: number; gain: number }
  | {
      kind: "cuestop";
      time: number;
      /** Index of the stopped cue among the `cue` events, in event order. */
      row: number;
      /** 0 player stop, 42 script stop, 54 group limit. */
      reason: number;
    }
  | {
      kind: "rng";
      time: number;
      /** Effect node and particle random states after the step's effect update. */
      rngLow: number;
      rngHigh: number;
      crt: number;
    };

export type BakeEventKind = BakeEvent["kind"];
