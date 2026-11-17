import type { DensityNote } from "../../components/ChartDensityTimeline/ChartDensityTimeline";
import type { PlayStats } from "./playSession";

type Listener = () => void;

export interface PreviewFrameStats {
  fps: number;
  callbacksPerSecond: number;
  /** Synchronous frame callback duration; excludes asynchronous GPU execution and input handlers. */
  averageWorkMs: number;
  maximumWorkMs: number;
  width: number;
  height: number;
}

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
  let playStats: PlayStats | null = null;
  const playChanges = subscriptions();
  let frameStats: PreviewFrameStats | null = null;
  const frameChanges = subscriptions();
  return {
    frameStats: { subscribe: frameChanges.subscribe, getSnapshot: () => frameStats },
    setFrameStats(next: PreviewFrameStats | null) {
      if (next === frameStats) return;
      frameStats = next;
      frameChanges.notify();
    },
    chart: { subscribe: chartChanges.subscribe, getSnapshot: () => chart },
    setChart(value: NonNullable<typeof chart>) {
      chart = value;
      chartChanges.notify();
    },
    time: { subscribe: time.subscribe, getSnapshot: () => seconds },
    /** Totals of the current play, or null while the automatic play shows. */
    play: { subscribe: playChanges.subscribe, getSnapshot: () => playStats },
    setPlayStats(next: PlayStats | null) {
      if (next === playStats) return;
      playStats = next;
      playChanges.notify();
    },
    setSeconds(next: number) {
      if (Object.is(seconds, next)) return;
      seconds = next;
      time.notify();
    },
  };
}

export type PreviewLiveState = ReturnType<typeof createPreviewLiveState>;
