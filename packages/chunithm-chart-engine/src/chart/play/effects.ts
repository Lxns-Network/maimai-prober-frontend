import { PHASE } from "../lifecycle/emissions";
import {
  EFFECT_DEPTH,
  ACTIVE_AFTER_BEGIN,
  advanceEffectRandom,
  liveEffectRequests,
  createEffectAdmission,
  EFFECT_END,
  EFFECT_LIFE_FRAMES,
  EFFECT_DRAWS,
  slideKeepPath,
  GROUP_CAPACITY,
} from "../sweep/effects";
import type { ChartEffects } from "../worker/protocol";
import { EFFECT_GROUP } from "../../effects/players";
import type { NoteScore } from "../../notes/score";
import type { Judgment } from "./player";
import { LANE_COUNT } from "./input";
import type { KeyBeamFrame } from "./keyBeams";
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
  path?: (now: number) => number;
  births: { entry: number; step: number; low: number; high: number; crt: number }[];
}

/** How the result text of a judgment shows: its display state, or null to show none. */
export type ResultText = (judgment: Judgment) => number | null;

/** Live effects use the same requests as autoplay, emitted directly at the input step. */
export function createPlayEffects(score: NoteScore, text: ResultText) {
  const cursors = new Map<number, { seq: number; part: number; tick: number; element: number }>();
  const slides = new Map<number, Instance>();
  const random = { low: 1, high: 0, crt: 1 };
  const admit = createEffectAdmission();
  const groups: Instance[][] = GROUP_CAPACITY.map(() => []);
  let instances: Instance[] = [];
  let built: ChartEffects | null = null;
  let nextId = 1;
  const sequence = {};
  const keyBeams: KeyBeamFrame = {
    active: 0,
    display: new Uint8Array(LANE_COUNT),
    started: new Int32Array(LANE_COUNT),
  };

  const build = (): ChartEffects => {
    const count = instances.length;
    const births = instances.reduce((n, instance) => n + instance.births.length, 0);
    const out: ChartEffects = {
      sequence,
      keyBeams,
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
        paths: instances.map((instance) => instance.path),
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

  let grade = 0;
  let resultState: number | null = null;
  const emit = liveEffectRequests(
    score,
    (step, group, resource, record, _lane, _width, extra = {}) => {
      const isText = group === EFFECT_GROUP.text;
      const slide = group === EFFECT_GROUP.slideKeep;
      if ((isText ? resultState === null : !slide && grade === 0) || !admit(group, step)) return;
      const live = groups[group];
      for (let i = live.length - 1; i >= 0; i--) if (live[i].end < step) live.splice(i, 1);
      if (live.length === GROUP_CAPACITY[group]) {
        const old = live.shift()!;
        old.end = step;
        old.endReason = EFFECT_END.evicted;
      }
      const start = slide ? step + ACTIVE_AFTER_BEGIN : step;
      const instance: Instance = {
        id: nextId++,
        resource,
        group,
        created: step,
        start,
        end: slide ? 0x7fffffff : step + 2 * EFFECT_LIFE_FRAMES.get(resource)! + 1,
        endReason: slide ? EFFECT_END.stopped : EFFECT_END.natural,
        displayState: isText ? resultState! : (extra.displayState ?? 0),
        animation: extra.animation ?? 100,
        flags: extra.flags ?? 0,
        scaleX: extra.scaleX ?? 1,
        reveal: slide ? start - 1 : step,
        posX: extra.x ?? 0,
        posY: extra.y ?? 0,
        posZ: extra.z ?? EFFECT_DEPTH,
        kind: extra.kind ?? 255,
        births: [],
      };
      for (const [entry, [dt, effect, particle]] of EFFECT_DRAWS.get(resource)!.entries()) {
        if (effect || particle) {
          instance.births.push({ entry, step: start + dt, ...random });
          advanceEffectRandom(random, effect, particle);
        }
      }
      if (slide) {
        instance.path = slideKeepPath(score, record);
        slides.set(record, instance);
      }
      live.push(instance);
      instances.push(instance);
      if (instances.length > PRUNE_AFTER) instances = instances.filter((item) => item.end > step);
      built = null;
    },
  );
  const initialCursor = () => ({ seq: 0, part: 0, tick: 0, element: 0 });
  return {
    get effects(): ChartEffects {
      return (built ??= build());
    },
    keyBeam(lane: number, displayState: number | null, step: number) {
      if (displayState === null) {
        keyBeams.active &= ~(1 << lane);
        return;
      }
      keyBeams.active |= 1 << lane;
      keyBeams.display[lane] = displayState;
      keyBeams.started[lane] = step;
    },
    spawn(object: Judgment["object"]) {
      if (object.className === "FlickNote")
        emit({ ...initialCursor(), object, step: object.spawn, judge: null }, true);
    },
    slide(object: Judgment["object"], step: number, mode: number) {
      const current = slides.get(object.record);
      if (mode === 3 && current) {
        current.end = Math.min(current.end, step);
        slides.delete(object.record);
        built = null;
      } else if (mode === 1 && !current)
        emit({ ...initialCursor(), object, step, judge: null }, true);
    },
    add(judgment: Judgment) {
      const { object, step, judgePhase, part, element } = judgment;
      const cursor = cursors.get(object.order) ?? initialCursor();
      if (!judgment.skipped) {
        grade = judgment.grade;
        resultState = text(judgment);
        emit(
          {
            ...cursor,
            object,
            step,
            judge: {
              step,
              phase: PHASE.tick,
              result: grade,
              judgePhase,
              part,
              ...(element && { element: true }),
            },
          },
          grade > 0,
        );
      }
      if (
        object.className === "SlideNote" ||
        object.className === "AirSlideNote" ||
        object.className === "AirLadderNote"
      ) {
        cursor.seq++;
        if (judgePhase > 0 || element) cursor.part++;
        if (element) cursor.element++;
        else if (judgePhase > 0) cursor.tick++;
        cursors.set(object.order, cursor);
      }
    },
  };
}
