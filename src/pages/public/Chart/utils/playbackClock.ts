interface PlaybackClockSegment {
  startTime: number;
  startOffset: number;
  playbackSpeed: number;
}

function findClockSegmentIndex(
  segments: readonly PlaybackClockSegment[],
  contextTime: number,
): number {
  let index = 0;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].startTime > contextTime) break;
    index = i;
  }
  return index;
}

export class PlaybackClock {
  private startTime = 0;
  private startOffset = 0;
  private segments: PlaybackClockSegment[] = [];

  get offset(): number {
    return this.startOffset;
  }

  setOffset(offset: number): void {
    this.startOffset = offset;
    this.segments = [];
  }

  clear(): void {
    this.segments = [];
  }

  set(startTime: number, startOffset: number, playbackSpeed: number): void {
    this.startTime = startTime;
    this.startOffset = startOffset;
    this.segments = [{ startTime, startOffset, playbackSpeed }];
  }

  positionAt(contextTime: number): number {
    if (this.segments.length === 0) return this.startOffset;

    const segment = this.segments[findClockSegmentIndex(this.segments, contextTime)];
    const elapsed = Math.max(0, contextTime - segment.startTime);
    return segment.startOffset + elapsed * segment.playbackSpeed;
  }

  /**
   * 返回排布未来音应使用的倍速：始终取最新生效段的速度（即最近一次倍速切换的目标值），
   * 与查询时刻无关。用于 AudioManager.schedule 排布 lookahead 窗口内的未来音——
   * 未来音以新倍速播放，必须取最新段，而非查询 outputTime（含 latency）落在的旧段。
   */
  schedulingSpeed(fallbackSpeed: number): number {
    if (this.segments.length === 0) return fallbackSpeed;

    return this.segments[this.segments.length - 1].playbackSpeed;
  }

  prune(contextTime: number): void {
    const index = findClockSegmentIndex(this.segments, contextTime);
    if (index > 0) {
      this.segments = this.segments.slice(index);
    }
  }

  appendSegment(startTime: number, playbackSpeed: number, visibleContextTime: number): void {
    const firstSegment = this.segments[0];
    if (!firstSegment) {
      this.set(startTime, this.startOffset, playbackSpeed);
      return;
    }

    if (startTime <= firstSegment.startTime) {
      this.startTime = firstSegment.startTime;
      this.startOffset = firstSegment.startOffset;
      this.segments = [{ ...firstSegment, playbackSpeed }];
      return;
    }

    const startOffset = this.positionAt(startTime);
    this.startTime = startTime;
    this.startOffset = startOffset;
    this.segments.push({ startTime, startOffset, playbackSpeed });
    this.prune(visibleContextTime);
  }

  isAudibleAt(contextTime: number): boolean {
    const firstSegment = this.segments[0];
    return firstSegment ? contextTime >= firstSegment.startTime : contextTime >= this.startTime;
  }
}
