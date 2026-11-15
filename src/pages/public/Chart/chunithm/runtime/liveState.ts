import type { DensityNote } from "../../components/ChartDensityTimeline/ChartDensityTimeline";

type Listener = () => void;

function subscriptions() {
  const listeners = new Set<Listener>();
  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify() {
      for (const listener of listeners) listener();
    },
  };
}

/** 已提交画面的UI快照；无计时、节流或调度，订阅者仅接收自己显示的数据变化。 */
export function createPreviewLiveState() {
  let seconds = 0;
  const time = subscriptions();
  let chart: { notes: readonly DensityNote[]; measureTimesMs: readonly number[] } | null = null;
  const chartChanges = subscriptions();
  return {
    chart: { subscribe: chartChanges.subscribe, getSnapshot: () => chart },
    setChart(value: NonNullable<typeof chart>) {
      chart = value;
      chartChanges.notify();
    },
    time: { subscribe: time.subscribe, getSnapshot: () => seconds },
    setSeconds(next: number) {
      if (Object.is(seconds, next)) return;
      seconds = next;
      time.notify();
    },
  };
}

export type PreviewLiveState = ReturnType<typeof createPreviewLiveState>;
