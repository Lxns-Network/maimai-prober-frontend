import { EFFECT_END, type EffectSweep } from "../chart/sweep/effects";

type Effects = Pick<EffectSweep, "instances" | "consumption" | "moves">;

interface Segment {
  chart: number;
  animation: number;
  rate: number;
}

/** Maps chart events onto a normal-speed animation clock. Pauses hold both clocks; seeks rebuild it. */
export function createEffectPlayback() {
  let source: Effects | null = null;
  let mapped: Effects | null = null;
  let epoch = -1;
  let previous = -Infinity;
  let segments: Segment[] = [];

  const animationStep = (chart: number) => {
    let lo = 0;
    let hi = segments.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (segments[mid].chart <= chart) lo = mid;
      else hi = mid;
    }
    const segment = segments[lo];
    return segment.animation + (chart - segment.chart) / segment.rate;
  };
  const eventStep = (chart: number) =>
    chart === 0x7fffffff ? chart : Math.min(0x7fffffff, Math.ceil(animationStep(chart)));

  const remap = (effects: Effects): Effects => {
    const original = effects.instances;
    const created = Int32Array.from(original.created, eventStep);
    const reveal = Int32Array.from(original.reveal, (step, i) =>
      step === original.created[i] ? created[i] : eventStep(step),
    );
    const end = Int32Array.from(original.end, (step, i) => {
      if (original.endReason[i] !== EFFECT_END.natural) return eventStep(step);
      const hidden = Math.max(0, original.reveal[i] - original.created[i] - 1);
      const visibleLife = step - original.created[i] - hidden;
      return Math.min(0x7fffffff, reveal[i] + visibleLife);
    });
    return {
      instances: {
        ...original,
        created,
        reveal,
        start: Int32Array.from(original.start, (step) => (step < 0 ? step : eventStep(step))),
        end,
      },
      moves: { ...effects.moves, step: Int32Array.from(effects.moves.step, eventStep) },
      consumption: {
        ...effects.consumption,
        step: Int32Array.from(effects.consumption.step, (step, row) => {
          const i = effects.consumption.instance[row];
          if (step === original.created[i]) return created[i];
          const visible = Math.max(original.created[i], original.reveal[i]);
          return step >= visible
            ? reveal[i] + step - visible
            : created[i] + step - original.created[i];
        }),
      },
    };
  };

  return {
    update(effects: Effects, seconds: number, rate: number, nextEpoch: number) {
      const chart = Math.max(0, seconds * 120);
      let changed = false;
      if (source === null || epoch !== nextEpoch || chart < previous) {
        changed = source !== effects || segments.length !== 1 || segments[0].rate !== rate;
        segments = [{ chart: 0, animation: 0, rate }];
        source = effects;
        epoch = nextEpoch;
      } else if (segments[segments.length - 1].rate !== rate) {
        segments.push({ chart, animation: animationStep(chart), rate });
        changed = true;
      }
      if (effects !== source) {
        source = effects;
        changed = true;
      }
      previous = chart;
      if (changed) mapped = remap(effects);
      return { seconds: animationStep(chart) / 120, effects: mapped! };
    },
  };
}
