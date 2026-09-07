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
 *
 * 提供节拍与绝对时间戳之间的双向换算，以及查询指定时刻生效的 BPM 与节拍分频。
 */
export class TimingTimeline {
  private defaultBpm: number;
  private bpmPoints: BpmPoint[];
  private divisorEvents: readonly DivisorEvent[];

  /**
   * @param bpmEvents BPM 变速事件列表。内部会拷贝并按节拍升序排序；若未提供或为空，则全程按基准 BPM 线性换算。
   * @param divisorEvents 节拍分频事件列表。内部会拷贝并按节拍升序排序；若未提供则默认分频为 4。
   */
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

  /** 从谱面数据直接构建时间轴实例。 */
  static fromChart(chart: Chart): TimingTimeline {
    return new TimingTimeline(chart.bpm, chart.bpmEvents, chart.divisorEvents);
  }

  /**
   * 计算指定节拍对应的绝对时间（毫秒）。
   *
   * 若节拍位于首个变速事件之前（包括负数节拍），按默认 BPM 线性推算。
   */
  msFromBeat(beat: number): number {
    const pointIndex = this.findLastLe(this.bpmPoints, (p) => p.timing, beat);
    if (pointIndex < 0) {
      return (60000 * beat) / this.defaultBpm;
    }

    const point = this.bpmPoints[pointIndex];
    return point.cumulativeMs + ((beat - point.timing) * 60000) / point.bpm;
  }

  /**
   * 计算指定时间（毫秒）对应的节拍位置。
   *
   * 若时间位于首个变速事件之前（包括负数时间），按默认 BPM 线性推算。
   */
  beatFromMs(ms: number): number {
    const pointIndex = this.findLastLe(this.bpmPoints, (p) => p.cumulativeMs, ms);
    if (pointIndex < 0) {
      return (ms * this.defaultBpm) / 60000;
    }

    const point = this.bpmPoints[pointIndex];
    return point.timing + ((ms - point.cumulativeMs) * point.bpm) / 60000;
  }

  /**
   * 获取指定节拍处生效的 BPM。
   *
   * 若节拍位于首个变速事件之前，返回默认 BPM。
   */
  bpmAtBeat(beat: number): number {
    const pointIndex = this.findLastLe(this.bpmPoints, (p) => p.timing, beat);
    return pointIndex < 0 ? this.defaultBpm : this.bpmPoints[pointIndex].bpm;
  }

  /**
   * 获取指定节拍处生效的节拍分频数。
   *
   * 若节拍位于首个分频事件之前或未提供分频事件，默认返回 4。
   */
  divisorAtBeat(beat: number): number {
    const index = this.findLastLe(this.divisorEvents, (e) => e.timing, beat);
    return index < 0 ? 4 : this.divisorEvents[index].divisor;
  }

  /** 将变速事件按节拍升序排序并积分为累积时间点列表；若无有效事件则返回空数组。 */
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
        // 命中目标范围后记录当前解，并向右半区间继续收敛以查找满足条件的最后一个（最大）索引
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  }
}
