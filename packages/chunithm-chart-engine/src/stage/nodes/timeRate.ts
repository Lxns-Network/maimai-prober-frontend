import { applyMotions, computeWorld, type NodeBehavior } from "../runtime";

const f = Math.fround;
const EPSILON = 1.1920928955078125e-7;

interface TimeRateKey {
  readonly duration: number;
  readonly rate: number;
  readonly integrated: boolean;
}

interface TimeRateState {
  readonly keys: readonly TimeRateKey[];
  readonly repeat: boolean;
  readonly period: number;
  savedDelta: number;
  accumulated: number;
  firstUpdate: boolean;
  readonly initialRate: number;
}

/** A time-rate curve; its multiplier applies to descendants only. */
export const timeRateNode: NodeBehavior = {
  type: 6001016,
  construct(node) {
    const graph = node.scene.graph;
    const settings = node.record!.settings;
    if (settings === null) throw new RangeError("Stage time rate node: missing settings");
    const count = graph.u32(settings + 4);
    const table = graph.pointer(settings + 8);
    if (count === 0 || table === null)
      throw new RangeError("Stage time rate node: unsupported curve");
    const keys: TimeRateKey[] = [];
    let period = 0;
    for (let i = 0; i < count; i++) {
      const entry = table + i * 12;
      const duration = graph.f32(entry);
      const rate = graph.f32(entry + 4);
      if (!Number.isFinite(duration) || duration < 0 || !Number.isFinite(rate))
        throw new RangeError("Stage time rate node: unsupported curve");
      keys.push({ duration, rate, integrated: graph.u32(entry + 8) !== 0 });
      period = f(period + duration);
    }
    if (!Number.isFinite(period)) throw new RangeError("Stage time rate node: unsupported curve");
    const last = keys[keys.length - 1];
    node.extension = {
      keys,
      repeat: graph.u32(settings) !== 0,
      period,
      savedDelta: 0,
      accumulated: 0,
      firstUpdate: true,
      initialRate: last.integrated ? 0 : last.rate,
    } satisfies TimeRateState;
  },
  update(node) {
    const state = node.extension as TimeRateState;
    state.savedDelta = node.delta;
    computeWorld(node);
    applyMotions(node);
    let time = node.controller!.age;
    if (state.repeat) time = f(time % (state.period <= EPSILON ? 2 * EPSILON : state.period));
    let previous = state.initialRate;
    let rate = 0;
    let index = 0;
    for (; index < state.keys.length; index++) {
      const key = state.keys[index];
      time = f(time - key.duration);
      rate = key.integrated ? 0 : key.rate;
      if (time < 0) {
        if (key.duration > EPSILON) {
          const position = f(f(key.duration + time) / key.duration);
          rate = f(f(f(rate - previous) * position) + previous);
        } else {
          // The native sampler falls through to its final key for a tiny segment.
          index = state.keys.length - 1;
          const last = state.keys[index];
          rate = last.integrated ? 0 : last.rate;
        }
        break;
      }
      previous = rate;
    }
    node.delta = f(node.delta * rate);
    index = Math.min(index, state.keys.length - 1);
    if (state.keys[index].integrated) {
      // Construction zeros integrated endpoints before the native area is accumulated.
      let area = 0;
      previous = 1;
      for (let i = 0; i <= index; i++) {
        const key = state.keys[i];
        const actualRate = key.integrated ? 0 : key.rate;
        const segment = f(f(f(previous + actualRate) * key.duration) * 0.5);
        area = f(area + segment);
        previous = actualRate;
      }
      node.delta = Math.min(Math.max(f(area - state.accumulated), 0), state.savedDelta);
    }
    if (state.firstUpdate) state.firstUpdate = false;
    else state.accumulated = f(state.accumulated + node.delta);
  },
  afterChildren(node) {
    node.delta = (node.extension as TimeRateState).savedDelta;
  },
};
