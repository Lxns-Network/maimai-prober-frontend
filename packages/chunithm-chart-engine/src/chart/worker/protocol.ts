import type { MotionTracks } from "../lifecycle/motion";
import type { ObjectLifetimes } from "../lifecycle/nativeChart";
import type { Consumption, EffectInstances, EffectMoves } from "../sweep/effects";
import type { NoteScore } from "../../notes/score";
import type { LivePlaybackData } from "../../notes/livePlayback";
import type { KeyBeamFrame } from "../play/keyBeams";

/** Effect instance columns, random-stream starts and position changes; instances are in effect row order. */
export interface ChartEffects {
  /** Identity of a live effect stream; instance ids are only unique within this stream. */
  sequence?: object;
  /** Ground input beams, updated independently of the chart's note effects. */
  keyBeams?: KeyBeamFrame;
  possibleResources?: readonly number[];
  instances: EffectInstances;
  consumption: Consumption;
  moves: EffectMoves;
}
export interface ChartRequest {
  id: number;
  /** Includes transferable render records and motion from the same binding as the timeline. */
  includeScore?: boolean;
  /** Also prepares the opposite lane layout for immediate mirror switching. */
  includeMirror?: boolean;
  /** The chart as c2s or lxchu bytes; omitted to reuse the chart a session handler bound last. */
  bytes?: ArrayBuffer;
  difficulty: number;
  mirror: boolean;
  /** Judge-window configuration, sent with `bytes`. */
  config?: ArrayBuffer;
  /** Song selecting the result reaction release. */
  musicId: number;
  /** Display speed row the lifecycles run at; row 0 when omitted. */
  speedRow?: number;
  /** Native B timing row; zero offset when omitted. */
  judgeTimingRow?: number;
}

export type ChartReply =
  | {
      id: number;
      ok: true;
      timeline: ArrayBuffer;
      score?: NoteScore;
      motion?: MotionTracks;
      lifetimes?: ObjectLifetimes;
      effects?: ChartEffects;
      livePlayback?: LivePlaybackData;
      mirrored?: { score: NoteScore; effects: ChartEffects };
    }
  | { id: number; ok: false; error: { name: string; message: string; line: number | null } };

export type ChartAnswer = { message: ChartReply; transfer: ArrayBuffer[] };
