import type { BpmEvent, Chart, DivisorEvent } from "../../types";

interface BpmPoint {
  timing: number;
  bpm: number;
  cumulativeMs: number;
}

/**
 * 谱面 beat 与物理 ms 互转的权威原语。构造时把 BPM 变速事件积分成累积毫秒，
 * 之后 msFromBeat / beatFromMs 为 O(log n) 二分查询。
 * 应用层 timeConversion 与渲染器热路径都应复用本类，避免各自开码 BPM 扫描。
 */
export class TimingTimeline {
  private defaultBpm: number;
  private bpmPoints: BpmPoint[];
  private divisorEvents: readonly DivisorEvent[];

  constructor(
    defaultBpm: number,
    bpmEvents: readonly BpmEvent[] | null = null,
    divisorEvents: readonly DivisorEvent[] | null = null,
  ) {
    this.defaultBpm = defaultBpm;
    this.bpmPoints = this.createBpmPoints(defaultBpm, bpmEvents);
    this.divisorEvents = divisorEvents
      ? [...divisorEvents].sort((a, b) => a.timing - b.timing)
      : [];
  }

  static fromChart(chart: Chart): TimingTimeline {
    return new TimingTimeline(chart.bpm, chart.bpmEvents, chart.divisorEvents);
  }

  msFromBeat(beat: number): number {
    const pointIndex = this.findLastLe(this.bpmPoints, (p) => p.timing, beat);
    if (pointIndex < 0) {
      return (60000 * beat) / this.defaultBpm;
    }

    const point = this.bpmPoints[pointIndex];
    return point.cumulativeMs + ((beat - point.timing) * 60000) / point.bpm;
  }

  beatFromMs(ms: number): number {
    const pointIndex = this.findLastLe(this.bpmPoints, (p) => p.cumulativeMs, ms);
    if (pointIndex < 0) {
      return (ms * this.defaultBpm) / 60000;
    }

    const point = this.bpmPoints[pointIndex];
    return point.timing + ((ms - point.cumulativeMs) * point.bpm) / 60000;
  }

  bpmAtBeat(beat: number): number {
    const pointIndex = this.findLastLe(this.bpmPoints, (p) => p.timing, beat);
    return pointIndex < 0 ? this.defaultBpm : this.bpmPoints[pointIndex].bpm;
  }

  divisorAtBeat(beat: number): number {
    const index = this.findLastLe(this.divisorEvents, (e) => e.timing, beat);
    return index < 0 ? 4 : this.divisorEvents[index].divisor;
  }

  private createBpmPoints(defaultBpm: number, bpmEvents: readonly BpmEvent[] | null): BpmPoint[] {
    if (!bpmEvents || bpmEvents.length === 0) return [];

    const sortedEvents = [...bpmEvents].sort((a, b) => a.timing - b.timing);
    const points: BpmPoint[] = [];
    let currentBpm = defaultBpm;
    let lastBeat = 0;
    let cumulativeMs = 0;

    for (const event of sortedEvents) {
      cumulativeMs += ((event.timing - lastBeat) * 60000) / currentBpm;
      points.push({
        timing: event.timing,
        bpm: event.bpm,
        cumulativeMs,
      });
      lastBeat = event.timing;
      currentBpm = event.bpm;
    }

    return points;
  }

  /** 二分查找最后一个 value &lt;= target 的元素索引，不存在则返回 -1。 */
  private findLastLe<T>(arr: readonly T[], getValue: (item: T) => number, target: number): number {
    let lo = 0;
    let hi = arr.length - 1;
    let result = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (getValue(arr[mid]) <= target) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  }
}
