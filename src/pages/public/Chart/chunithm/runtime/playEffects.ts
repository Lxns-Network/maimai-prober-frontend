import { AUTOPLAY_GRADE } from "@lxns-network/chunithm-chart-engine/chart/lifecycle/autoplayJudge";
import {
  PHASE,
  type JudgeEmission,
  type ObjectRun,
} from "@lxns-network/chunithm-chart-engine/chart/lifecycle/emissions";
import { effectSweep } from "@lxns-network/chunithm-chart-engine/chart/sweep/effects";
import type { ChartEffects } from "@lxns-network/chunithm-chart-engine/chart/worker/protocol";
import { EFFECT_GROUP } from "@lxns-network/chunithm-chart-engine/effects/players";
import type { NoteScore } from "@lxns-network/chunithm-chart-engine/notes/score";
import type { Judgment } from "./player";

/** Step a judgment is replayed at, with the object's earlier judgments one step before it. */
const AT = 4;
/** Steps an effect sweep of one judgment covers; result effects live a second. */
const SPAN = 240;
/** Instances kept before ended ones are dropped. */
const PRUNE_AFTER = 96;

interface Instance {
  id: number;
  resource: number;
  group: number;
  created: number;
  start: number;
  end: number;
  endReason: number;
  displayState: number;
  animation: number;
  flags: number;
  scaleX: number;
  reveal: number;
  posX: number;
  posY: number;
  posZ: number;
  kind: number;
  births: { entry: number; step: number; low: number; high: number; crt: number }[];
}

/** How the result text of a judgment shows: its display state, or null to show none. */
export type ResultText = (judgment: Judgment) => number | null;

/**
 * Result effects of a player's judgments as they happen. Each judgment runs the chart's effect
 * sweep for its note alone, so it gets the bursts, reactions and text the automatic play would.
 */
export function createPlayEffects(score: NoteScore, text: ResultText) {
  const earlier = new Map<number, JudgeEmission[]>();
  let instances: Instance[] = [];
  let built: ChartEffects | null = null;
  let nextId = 1;
  let sequence = {};

  const build = (): ChartEffects => {
    const count = instances.length;
    const births = instances.reduce((n, instance) => n + instance.births.length, 0);
    const out: ChartEffects = {
      sequence,
      instances: {
        ids: new Uint32Array(count),
        resource: new Uint16Array(count),
        group: new Uint8Array(count),
        created: new Int32Array(count),
        start: new Int32Array(count),
        end: new Int32Array(count),
        endReason: new Uint8Array(count),
        displayState: new Int8Array(count),
        animation: new Uint16Array(count),
        flags: new Uint8Array(count),
        scaleX: new Float32Array(count),
        scaleY: new Float32Array(count).fill(1),
        scaleZ: new Float32Array(count).fill(1),
        reveal: new Int32Array(count),
        posX: new Float32Array(count),
        posY: new Float32Array(count),
        posZ: new Float32Array(count),
        kind: new Uint8Array(count),
      },
      consumption: {
        instance: new Uint32Array(births),
        entry: new Uint8Array(births),
        step: new Int32Array(births),
        low: new Uint32Array(births),
        high: new Uint32Array(births),
        crt: new Uint32Array(births),
      },
      moves: {
        instance: new Uint32Array(0),
        step: new Int32Array(0),
        x: new Float32Array(0),
        y: new Float32Array(0),
        z: new Float32Array(0),
      },
    };
    let birth = 0;
    instances.forEach((instance, i) => {
      const columns = out.instances;
      columns.ids![i] = instance.id;
      columns.resource[i] = instance.resource;
      columns.group[i] = instance.group;
      columns.created[i] = instance.created;
      columns.start[i] = instance.start;
      columns.end[i] = instance.end;
      columns.endReason[i] = instance.endReason;
      columns.displayState[i] = instance.displayState;
      columns.animation[i] = instance.animation;
      columns.flags[i] = instance.flags;
      columns.scaleX[i] = instance.scaleX;
      columns.reveal[i] = instance.reveal;
      columns.posX[i] = instance.posX;
      columns.posY[i] = instance.posY;
      columns.posZ[i] = instance.posZ;
      columns.kind[i] = instance.kind;
      for (const entry of instance.births) {
        const rows = out.consumption;
        rows.instance[birth] = i;
        rows.entry[birth] = entry.entry;
        rows.step[birth] = entry.step;
        rows.low[birth] = entry.low;
        rows.high[birth] = entry.high;
        rows.crt[birth] = entry.crt;
        birth++;
      }
    });
    return out;
  };

  return {
    /** Effects of every judgment so far that may still show; a new object after each change. */
    get effects(): ChartEffects {
      return (built ??= build());
    },
    reset() {
      sequence = {};
      earlier.clear();
      instances = [];
      built = null;
    },
    add(judgment: Judgment) {
      const { object } = judgment;
      const prior = earlier.get(object.order) ?? [];
      const emission: JudgeEmission = {
        step: AT,
        phase: PHASE.tick,
        result: AUTOPLAY_GRADE,
        judgePhase: judgment.judgePhase,
        part: judgment.part,
        ...(judgment.element && { element: true }),
      };
      earlier.set(object.order, [...prior, { ...emission, step: AT - 1 }]);
      if (judgment.skipped) return;
      const run: ObjectRun = {
        object: { ...object, spawn: 0 },
        removal: AT + 1,
        judges: [...prior.map((judge) => ({ ...judge, step: AT - 1 })), emission],
        models: [],
      };
      const sweep = effectSweep({ score, runs: [run], events: [], steps: AT + SPAN });
      const shift = judgment.step - AT;
      const state = text(judgment);
      const columns = sweep.instances;
      const births = new Map<number, Instance["births"]>();
      for (let row = 0; row < sweep.consumption.instance.length; row++) {
        const at = sweep.consumption.instance[row];
        let list = births.get(at);
        if (!list) births.set(at, (list = []));
        list.push({
          entry: sweep.consumption.entry[row],
          step: sweep.consumption.step[row] + shift,
          low: sweep.consumption.low[row],
          high: sweep.consumption.high[row],
          crt: sweep.consumption.crt[row],
        });
      }
      for (let i = 0; i < columns.created.length; i++) {
        if (columns.created[i] !== AT || columns.start[i] < 0) continue;
        const group = columns.group[i];
        const isText = group === EFFECT_GROUP.text;
        if (isText ? state === null : judgment.grade === 0) continue;
        instances.push({
          id: nextId++,
          resource: columns.resource[i],
          group,
          created: judgment.step,
          start: columns.start[i] + shift,
          end: columns.end[i] + shift,
          endReason: columns.endReason[i],
          displayState: isText ? state! : columns.displayState[i],
          animation: columns.animation[i],
          flags: columns.flags[i],
          scaleX: columns.scaleX[i],
          reveal: columns.reveal[i] + shift,
          posX: columns.posX[i],
          posY: columns.posY[i],
          posZ: columns.posZ[i],
          kind: columns.kind[i],
          births: births.get(i) ?? [],
        });
      }
      if (instances.length > PRUNE_AFTER)
        instances = instances.filter((instance) => instance.end > judgment.step);
      built = null;
    },
  };
}
