import type { Consumption, EffectInstances, EffectMoves } from "../chart/sweep/effects";
import { EFFECT_GROUP, PLAYER_ORDER } from "./players";
import type { EffectResource } from "./afb";
import {
  animateInstance,
  buildInstance,
  collectInstanceDraws,
  createEffectInstance,
  createEffectPlayer,
  finishInstance,
  isInstanceLive,
  setInstanceDisplayState,
  setInstancePosition,
  type EffectCamera,
  type EffectDrawSink,
  type EffectInstance,
  type EffectPlayer,
  type EffectStreams,
} from "./instance";

export interface EffectSchedulerOptions {
  /** Effect resources by resource id. */
  resources: readonly (EffectResource | undefined)[];
  instances: EffectInstances;
  consumption: Consumption;
  moves: EffectMoves;
  /** Camera used when `advanceTo` is given none. */
  camera?: EffectCamera;
  /** Layer each resource's player publishes for ordering, by resource id. */
  layerParameters?: readonly (number | null | undefined)[];
  /** Time each grid step advances the effects by. */
  delta?: number;
  maximumParticles?: number;
  sceneMask?: number;
  /** Depth added to result-text requests; other effect groups keep their original positions. */
  judgePositionOffset?: number;
  /** The original critical display option row, for automatic CRITICAL results. */
  criticalDisplayRow?: number;
}

const PLAIN_CRITICAL_STATE = 0;
const NO_JUDGE_TEXT_STATE = 12;

export interface EffectScheduler {
  /**
   * Retains immutable instances with matching ids and catches up new ones to the current step.
   * Publishes only the additions; the caller merges them into any retained frame snapshots.
   * Returns false without changes when ids are absent or a live instance was removed.
   */
  update(
    effects: Pick<EffectSchedulerOptions, "instances" | "consumption" | "moves">,
    camera: EffectCamera,
    sinkAtStep: (step: number) => EffectDrawSink | null,
  ): boolean;
  /**
   * Brings the live effects to `step` and passes that step's draws to `sink`, player by player in
   * registry order and, within a player, in creation order. Steps forward from the last one
   * incrementally; any other jump rebuilds the live set from the instances' creation steps.
   */
  advanceTo(step: number, camera: EffectCamera | undefined, sink: EffectDrawSink): void;
  /** The step last advanced to, or -1 before the first. */
  readonly step: number;
  readonly liveCount: number;
}

interface Live {
  index: number;
  inst: EffectInstance;
  move: number;
  moveEnd: number;
  birth: number;
  birthEnd: number;
}

interface Groups {
  start: Int32Array;
  order: Uint32Array;
}

function groupByInstance(owner: Uint32Array, instanceCount: number): Groups {
  const start = new Int32Array(instanceCount + 1);
  for (let i = 0; i < owner.length; i++) start[owner[i] + 1]++;
  for (let i = 0; i < instanceCount; i++) start[i + 1] += start[i];
  const fill = start.slice(0, instanceCount);
  const order = new Uint32Array(owner.length);
  for (let i = 0; i < owner.length; i++) order[fill[owner[i]]++] = i;
  return { start, order };
}

export function createEffectScheduler(options: EffectSchedulerOptions): EffectScheduler {
  const { resources } = options;
  let { instances, consumption, moves } = options;
  const judgePositionOffset = options.judgePositionOffset ?? 0;
  if (!Number.isFinite(judgePositionOffset))
    throw new RangeError("Effect judge position must be finite");
  const criticalDisplayRow = options.criticalDisplayRow ?? 0;
  if (!Number.isInteger(criticalDisplayRow) || criticalDisplayRow < 0 || criticalDisplayRow > 3)
    throw new RangeError("Invalid critical display option");
  const delta = options.delta ?? 0.5;
  let count = instances.created.length;
  const playerCount = PLAYER_ORDER.length;
  const playerSlot = new Int32Array(Math.max(...PLAYER_ORDER) + 1).fill(-1);
  PLAYER_ORDER.forEach((id, slot) => (playerSlot[id] = slot));

  let moveGroups: Groups;
  let birthGroups: Groups;
  let creation: Uint32Array;
  let span = 1;
  const indexSource = () => {
    count = instances.created.length;
    moveGroups = groupByInstance(moves.instance, count);
    birthGroups = groupByInstance(consumption.instance, count);
    creation = Uint32Array.from({ length: count }, (_, i) => i).sort(
      (a, b) => instances.created[a] - instances.created[b] || a - b,
    );
    span = 1;
    for (let i = 0; i < count; i++)
      if (instances.reveal[i] === instances.created[i])
        span = Math.max(span, instances.end[i] - instances.created[i]);
  };
  indexSource();

  const players: (EffectPlayer | undefined)[] = [];
  const live: Live[][] = Array.from({ length: playerCount }, () => []);
  const streams: EffectStreams = { low: 0, high: 0, crt: 0 };
  const position: [number, number, number] = [0, 0, 0];
  let current = -1;
  let nextCreate = 0;
  let liveCount = 0;
  let camera: EffectCamera | undefined = options.camera;

  const slotOf = (index: number) => {
    const id = instances.resource[index];
    const slot = id < playerSlot.length ? playerSlot[id] : -1;
    if (slot < 0) throw new RangeError(`Effect resource ${id} has no place in the update order`);
    return slot;
  };

  const activate = (index: number): Live => {
    const id = instances.resource[index];
    let player = players[id];
    if (!player) {
      const resource = resources[id];
      if (!resource) throw new RangeError(`Effect resource ${id} is not loaded`);
      player = createEffectPlayer(resource, {
        layerParameter: options.layerParameters?.[id] ?? null,
        maximumParticles: options.maximumParticles,
        sceneMask: options.sceneMask,
      });
      players[id] = player;
    }
    const inst = createEffectInstance(player, {
      instanceId: instances.ids?.[index] ?? index + 1,
      displayState:
        instances.group[index] === EFFECT_GROUP.text &&
        instances.displayState[index] === PLAIN_CRITICAL_STATE &&
        criticalDisplayRow >= 2
          ? NO_JUDGE_TEXT_STATE
          : instances.displayState[index],
      animation: instances.animation[index],
      position: [
        instances.posX[index],
        instances.posY[index],
        instances.group[index] === EFFECT_GROUP.text
          ? Math.fround(instances.posZ[index] + judgePositionOffset)
          : instances.posZ[index],
      ],
      scale: [instances.scaleX[index], instances.scaleY[index], instances.scaleZ[index]],
      mirror: (instances.flags[index] & 1) !== 0,
    });
    return {
      index,
      inst,
      move: moveGroups.start[index],
      moveEnd: moveGroups.start[index + 1],
      birth: birthGroups.start[index],
      birthEnd: birthGroups.start[index + 1],
    };
  };

  const prepare = (entry: Live, step: number) => {
    const { index, inst } = entry;
    while (entry.move < entry.moveEnd) {
      const move = moveGroups.order[entry.move];
      if (moves.step[move] > step) break;
      position[0] = moves.x[move];
      position[1] = moves.y[move];
      position[2] = moves.z[move];
      setInstancePosition(inst, position);
      entry.move++;
    }
    const path = moves.paths?.[index];
    if (path && step >= instances.reveal[index]) {
      position[0] = path(step / 2);
      position[1] = instances.posY[index];
      position[2] = instances.posZ[index];
      setInstancePosition(inst, position);
    }
    const created = instances.created[index];
    const reveal = instances.reveal[index];
    inst.treeHidden = step > created && step < reveal;
    if (step === reveal && reveal > created) setInstanceDisplayState(inst, 0);
    while (entry.birth < entry.birthEnd && consumption.step[birthGroups.order[entry.birth]] < step)
      entry.birth++;
    if (entry.birth < entry.birthEnd) {
      const birth = birthGroups.order[entry.birth];
      if (consumption.step[birth] === step) {
        streams.low = consumption.low[birth];
        streams.high = consumption.high[birth];
        streams.crt = consumption.crt[birth];
      }
    }
    buildInstance(inst, streams, delta);
  };

  const settle = (entry: Live, step: number, sink: EffectDrawSink | null) => {
    animateInstance(entry.inst, streams, delta, camera!);
    if (sink) collectInstanceDraws(entry.inst, sink);
    finishInstance(entry.inst, delta);
    return instances.end[entry.index] > step + 1 && isInstanceLive(entry.inst);
  };

  const run = (step: number, sink: EffectDrawSink | null) => {
    while (nextCreate < count && instances.created[creation[nextCreate]] <= step) {
      const index = creation[nextCreate++];
      if (instances.end[index] > step) {
        live[slotOf(index)].push(activate(index));
        liveCount++;
      }
    }
    for (let p = 0; p < playerCount; p++) {
      const list = live[p];
      const n = list.length;
      if (n === 0) continue;
      for (let k = 0; k < n; k++) prepare(list[k], step);
      let kept = 0;
      for (let k = 0; k < n; k++) {
        const entry = list[k];
        if (instances.end[entry.index] <= step) continue;
        if (settle(entry, step, sink)) list[kept++] = entry;
      }
      list.length = kept;
      liveCount -= n - kept;
    }
  };

  const rebuild = (target: number) => {
    const last = target - 1;
    for (const list of live) list.length = 0;
    liveCount = 0;
    nextCreate = 0;
    while (nextCreate < count && instances.created[creation[nextCreate]] <= last) {
      const index = creation[nextCreate++];
      if (instances.end[index] <= last) continue;
      const entry = activate(index);
      let alive = true;
      for (let t = instances.created[index]; alive && t <= last; t++) {
        prepare(entry, t);
        alive = settle(entry, t, null);
      }
      if (alive) {
        live[slotOf(index)].push(entry);
        liveCount++;
      }
    }
    current = last;
  };

  return {
    update(effects, cameraOverride, sinkAtStep) {
      if (!instances.ids || !effects.instances.ids) return false;
      const indices = new Map(Array.from(effects.instances.ids, (id, i) => [id, i]));
      // The publishers already hold the current and preceding steps. Rebuild if a
      // newly reported eviction invalidates packets in either one.
      for (let i = 0; i < instances.ids.length; i++) {
        const next = indices.get(instances.ids[i]);
        if (next === undefined) continue;
        const end = effects.instances.end[next];
        if (end < instances.end[i] && end <= current && instances.end[i] > current - 1)
          return false;
      }
      for (const list of live)
        for (const entry of list) if (!indices.has(entry.inst.instanceId)) return false;
      const previousIds = new Set(instances.ids);
      const previousMoves = moveGroups;
      const previousBirths = birthGroups;
      ({ instances, consumption, moves } = effects);
      indexSource();
      camera = cameraOverride;
      for (const list of live) {
        for (const entry of list) {
          const index = indices.get(entry.inst.instanceId)!;
          entry.move += moveGroups.start[index] - previousMoves.start[entry.index];
          entry.birth += birthGroups.start[index] - previousBirths.start[entry.index];
          entry.moveEnd = moveGroups.start[index + 1];
          entry.birthEnd = birthGroups.start[index + 1];
          entry.index = index;
        }
      }
      nextCreate = 0;
      while (nextCreate < count && instances.created[creation[nextCreate]] <= current) {
        const index = creation[nextCreate++];
        if (previousIds.has(instances.ids![index])) continue;
        if (instances.end[index] <= instances.created[index]) continue;
        const entry = activate(index);
        let alive = true;
        for (let t = instances.created[index]; alive && t <= current; t++) {
          prepare(entry, t);
          alive = settle(entry, t, sinkAtStep(t));
        }
        if (alive) {
          live[slotOf(index)].push(entry);
          liveCount++;
        }
      }
      for (const list of live)
        list.sort(
          (a, b) => instances.created[a.index] - instances.created[b.index] || a.index - b.index,
        );
      return true;
    },
    advanceTo(step, cameraOverride, sink) {
      camera = cameraOverride ?? options.camera;
      if (!camera) throw new RangeError("No camera to advance the effects with");
      if (step <= current || step - current > span) rebuild(step);
      for (let t = current + 1; t <= step; t++) run(t, t === step ? sink : null);
      current = step;
    },
    get step() {
      return current;
    },
    get liveCount() {
      return liveCount;
    },
  };
}
